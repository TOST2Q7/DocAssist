import { BaseTree, chainText, stepText, type Step, type TreeNode } from '@/core/base/tree';
import { LuaStop, LuaUserError, LuaVM, type LuaScriptError, type LuaValue } from '@/core/lua/runtime';
import { textlib } from '@/core/lua/textlib';
import { FIELD_BY_ID, matchColumns, PERSON_FIELDS } from '@/core/schema/fields';
import { parseCell } from '@/shared/cell/parse';
import { builtinFits, PART_CHECK_BY_ID } from '@/shared/cell/partChecks';
import { parseOrder } from '@/shared/cell/template';
import { walk, type Level as WalkLevel } from '@/shared/cell/walk';
import { fieldLabel, type FieldCheck, type ResolvedChecks, type SettingValue } from '../model/checks';
import { statusOf, type FieldResult, type Issue, type Level, type PartView } from '../model/types';

/*
 * Проверка анкеты кодом на Lua. Для каждой ячейки: сначала общие проверки, потом код столбца.
 *
 * Что видит код: value (значение), field (столбец), confirmed (стоит ли галочка «Проверено»),
 * cell("…") — другие ячейки этой анкеты, setting.* — регулировки, base.* — база, lib.* — готовые функции.
 * Что отдаёт: problem / warning / notice / confirm / suggest / example / unique / remember.
 */

export type ControlKind = 'toggle' | 'number' | 'text' | 'list' | 'choice' | 'info';

/** Регулировка, объявленная в коде через setting.*. */
export interface ControlDecl {
  kind: ControlKind;
  label: string;
  value: SettingValue;
  default: SettingValue;
  options?: string[];
}

/** Где код берёт значения из базы — для ручного добавления на вкладке «База». */
export interface BaseUse {
  tree: string;
  key: string;
  title: string;
  inside?: { key: string; title: string };
}

export interface Discovery {
  controls: ControlDecl[];
  bases: BaseUse[];
  /** Код вызывает base.check_parts() — нужен конструктор ячейки. */
  parts: boolean;
  error?: LuaScriptError;
}

export interface RowInput {
  row: number;
  values: string[];
  columns: (string | null)[];
  /** Подтверждённые значения: столбец → значение, при котором поставлена галочка. */
  confirmed: Record<string, string>;
}

export interface CheckEnv {
  trees: Map<string, BaseTree>;
}

interface RowState {
  input: RowInput;
  env: CheckEnv;
  results: (FieldResult | undefined)[];
  running: Set<number>;
}

interface Call {
  fieldId: string | null;
  col: number;
  value: string;
  settings: Record<string, SettingValue>;
  check?: FieldCheck;
  r: FieldResult;
  vars: Record<string, LuaValue>;
  row: RowState | null;
  discovery: Discovery | null;
}

const EMPTY_TREE = new BaseTree();
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const COMMON = '\u0000common';

/** Столбец по названию («Группа»), номеру в анкете (31) или id. */
export function resolveField(name: unknown): string | null {
  if (typeof name === 'number') return PERSON_FIELDS[name - 1]?.id ?? null;
  const s = str(name).trim();
  if (!s) return null;
  if (FIELD_BY_ID.has(s)) return s;
  return matchColumns([s])[0];
}

export class AnketaChecker {
  readonly vm: LuaVM;
  private readonly compiled = new Map<string, { ok: true; ref: number } | { ok: false; error: LuaScriptError }>();
  readonly libraryFunctions: string[] = [];
  readonly libraryError?: LuaScriptError;
  private readonly stack: Call[] = [];

  constructor(readonly checks: ResolvedChecks) {
    this.vm = new LuaVM(this.api());
    const lib = this.vm.defineLibrary(checks.library);
    if (lib.ok) this.libraryFunctions = lib.functions;
    else this.libraryError = lib.error;
    this.compiled.set(COMMON, this.vm.compile(checks.common.script, 'Общие проверки'));
    for (const [id, f] of Object.entries(checks.fields)) this.compiled.set(id, this.vm.compile(f.script, fieldLabel(id)));
  }

  /** Ошибка компиляции кода столбца (или общих проверок). */
  compileError(fieldId: string | 'common'): LuaScriptError | undefined {
    const c = this.compiled.get(fieldId === 'common' ? COMMON : fieldId);
    return c && !c.ok ? c.error : undefined;
  }

  private get call(): Call {
    const c = this.stack[this.stack.length - 1];
    if (!c) throw new LuaUserError('эта функция работает только внутри проверки ячейки');
    return c;
  }

  // ---------- Что код отдаёт ----------

  private add(level: Level, text: unknown, opts?: unknown, extra: Partial<Issue> = {}) {
    const c = this.call;
    if (c.discovery) return;
    const o = (opts && typeof opts === 'object' ? opts : {}) as { fix?: unknown; part?: unknown };
    const issue: Issue = { level, text: str(text) || (level === 'error' ? 'Ошибка' : 'Предупреждение'), ...extra };
    if (o.fix !== undefined && o.fix !== null && o.fix !== false) {
      issue.fix = str(o.fix);
      if (c.r.fix === undefined && issue.fix !== c.value) c.r.fix = issue.fix;
    }
    const part = str(o.part);
    const at = part ? c.value.indexOf(part) : -1;
    if (at >= 0) issue.span = [at, at + part.length];
    if (level === 'warn' && !extra.base) c.r.confirm = { person: true, base: c.r.confirm?.base };
    c.r.issues.push(issue);
  }

  // ---------- Регулировки ----------

  private setting(kind: ControlKind, label: unknown, def: unknown, options?: unknown): SettingValue | undefined {
    const c = this.call;
    const name = str(label);
    const opts = Array.isArray(options) ? options.map(str) : undefined;
    let fallback: SettingValue;
    switch (kind) {
      case 'toggle':
        fallback = def !== null && def !== undefined && def !== false;
        break;
      case 'number':
        fallback = Number.isFinite(Number(def)) ? Number(def) : 0;
        break;
      case 'list':
        fallback = Array.isArray(def) ? def.map(str) : [];
        break;
      case 'choice':
        fallback = opts?.includes(str(def)) ? str(def) : (opts?.[0] ?? '');
        break;
      default:
        fallback = str(def);
    }
    const stored = c.settings[name];
    const valid =
      (kind === 'toggle' && typeof stored === 'boolean') ||
      (kind === 'number' && typeof stored === 'number' && Number.isFinite(stored)) ||
      (kind === 'text' && typeof stored === 'string') ||
      (kind === 'list' && Array.isArray(stored)) ||
      (kind === 'choice' && typeof stored === 'string' && !!opts?.includes(stored));
    const value = valid ? stored : fallback;
    if (c.discovery && !c.discovery.controls.some((x) => x.label === name)) c.discovery.controls.push({ kind, label: name, value, default: fallback, options: opts });
    return kind === 'info' ? undefined : value;
  }

  // ---------- Другие ячейки ----------

  private cellOf(id: string): Record<string, LuaValue> | null {
    const c = this.call;
    const name = fieldLabel(id);
    if (c.discovery || !c.row) {
      const v = this.checks.fields[id]?.example ?? '';
      return { name, id, value: v, empty: v === '', confirmed: false, status: 'ok', ok: true, vars: {} };
    }
    const col = c.row.input.columns.indexOf(id);
    if (col < 0) return null;
    const value = c.row.input.values[col] ?? '';
    let res = c.row.results[col];
    if (!res && !c.row.running.has(col)) res = this.evalCell(c.row, col);
    return {
      name,
      id,
      value,
      empty: value === '',
      confirmed: c.row.input.confirmed[col] === value,
      status: res?.status ?? null,
      ok: res ? res.status === 'ok' : null,
      vars: (res?.vars ?? {}) as Record<string, LuaValue>,
    };
  }

  // ---------- База ----------

  private tree(name: string): BaseTree {
    return this.call.row?.env.trees.get(name) ?? EMPTY_TREE;
  }

  /** Узлы по пути из значений: каждое следующее — где-то внутри предыдущего. */
  private nodesAt(tree: BaseTree, values: string[]): TreeNode[] {
    let layer: TreeNode[] = [tree.root];
    for (const v of values) {
      const next: TreeNode[] = [];
      const seen = new Set<TreeNode>();
      const visit = (n: TreeNode) => {
        for (const ch of n.children) {
          if (ch.v === v && !seen.has(ch)) {
            seen.add(ch);
            next.push(ch);
          }
          visit(ch);
        }
      };
      layer.forEach(visit);
      if (!next.length) return [];
      layer = next;
    }
    return layer;
  }

  private baseCheck(opts: unknown): boolean {
    const c = this.call;
    if (!c.fieldId) return true;
    const o = (opts && typeof opts === 'object' ? opts : {}) as { tree?: unknown; inside?: unknown; value?: unknown };
    const insideId = o.inside ? resolveField(o.inside) : null;
    if (o.inside && !insideId) throw new LuaUserError(`base.check: нет столбца «${str(o.inside)}»`);
    const treeName = str(o.tree) || fieldLabel(insideId ?? c.fieldId);
    const value = o.value !== undefined && o.value !== null ? str(o.value) : c.value;
    if (c.discovery) {
      if (!c.discovery.bases.some((b) => b.tree === treeName && b.key === c.fieldId))
        c.discovery.bases.push({ tree: treeName, key: c.fieldId, title: fieldLabel(c.fieldId), ...(insideId ? { inside: { key: insideId, title: fieldLabel(insideId) } } : {}) });
      return true;
    }
    const tree = this.tree(treeName);
    const levels: WalkLevel[] = [];
    let parentNote = '';
    if (insideId) {
      const parent = this.cellOf(insideId);
      const ok = !!parent && parent.value !== '' && parent.status !== 'error';
      levels.push({ k: insideId, step: ok ? { k: insideId, v: str(parent!.value) } : null });
      if (ok) parentNote = ` для «${fieldLabel(insideId)}: ${str(parent!.value)}»`;
    }
    levels.push({ k: c.fieldId, step: { k: c.fieldId, v: value } });
    const w = walk(tree, levels);
    if (!w.addPath.length) return true;
    const elsewhere = insideId ? tree.all(c.fieldId, value).map((n) => n.parent?.v).filter(Boolean) : [];
    this.add('warn', `Нет в базе «${treeName}»${parentNote}. Проверьте и подтвердите${elsewhere.length ? ` (это значение есть в базе для: ${elsewhere.slice(0, 3).join(', ')})` : ''}`, null, { base: true });
    c.r.confirm = { person: !!c.r.confirm?.person, base: { tree: treeName, path: w.addPath, label: chainText(w.addPath), known: w.knownPath.length } };
    return false;
  }

  /** Подходит ли значение части ячейки под проверку (встроенную или функцию из «Моей библиотеки»). */
  partFits = (check: string, value: string): boolean => {
    if (!check || PART_CHECK_BY_ID.has(check)) return builtinFits(check, value);
    const r = this.vm.callLibrary(check, value);
    return r.ok ? r.value !== null && r.value !== false : false;
  };

  private checkParts(): boolean {
    const c = this.call;
    const t = c.check?.template;
    if (c.discovery) {
      c.discovery.parts = true;
      return true;
    }
    if (!t || !t.keys.length) {
      this.add('error', 'В правилах не настроен конструктор ячейки', null, { script: true });
      return false;
    }
    const r = c.r;
    const parsed = parseCell(c.value, t, this.partFits);
    for (const i of parsed.issues) r.issues.push({ level: 'error', text: i.text, span: i.span });
    if (parsed.canonical !== undefined && parsed.canonical !== c.value && r.fix === undefined) r.fix = parsed.canonical;

    const { order, error } = parseOrder(t.order, t.keys.length);
    const levelOfKey = new Map(order.map((k, i) => [k, i]));
    const view = (state: (k: number | undefined) => PartView['state']): PartView[] =>
      parsed.blocks.map((b) => ({ title: b.key !== undefined ? t.keys[b.key].title : '?', text: b.text, state: !b.ok ? 'error' : state(b.key) }));
    if (parsed.issues.length) {
      r.parts = view(() => 'plain');
      return false;
    }
    if (error) {
      this.add('error', `В правилах: порядок древа — ${error}`, null, { script: true });
      r.parts = view(() => 'plain');
      return false;
    }
    const tree = this.tree(t.tree);
    const levels: WalkLevel[] = order.map((k) => ({ k: t.keys[k].id, step: parsed.steps[k], single: t.keys[k].single }));
    const w = walk(tree, levels);
    const blockOfKey = (k: number) => parsed.blocks.find((b) => b.key === k);
    const formatPart = (v: string, tag?: string, after?: boolean) => (!tag ? v : after ? `${v} ${tag}` : `${tag} ${v}`);
    for (const wi of w.issues) {
      const b = blockOfKey(order[wi.at]);
      const fix = wi.fix && b ? c.value.slice(0, b.start) + formatPart(wi.fix.v, wi.fix.t, wi.fix.a) + c.value.slice(b.end) : undefined;
      r.issues.push({ level: wi.level, text: wi.text, span: b ? [b.start, b.end] : undefined, fix, confirmable: wi.confirmable, ...(wi.level === 'warn' ? { base: true } : {}) });
    }
    r.parts = view((k) => {
      if (k === undefined) return 'error';
      const li = levelOfKey.get(k);
      if (li === undefined) return 'off';
      return w.status[li] === 'new' ? 'new' : 'known';
    });
    if (w.addPath.length) {
      const fresh = w.addPath.slice(w.knownPath.length);
      const first = blockOfKey(order[w.status.indexOf('new')]);
      r.issues.push({
        level: 'warn',
        base: true,
        text: `Нет в базе «${t.tree}»: ${fresh.map(stepText).join(' → ')}${w.knownPath.length ? ` (внутри: ${chainText(w.knownPath)})` : ''}. Проверьте и подтвердите`,
        span: first ? [first.start, first.end] : undefined,
      });
      r.confirm = { person: !!r.confirm?.person, base: { tree: t.tree, path: w.addPath, label: chainText(w.addPath), known: w.knownPath.length } };
      return false;
    }
    return !w.issues.length;
  }

  // ---------- API для Lua ----------

  private api(): Record<string, unknown> {
    const values = (args: unknown[]) => args.map(str);
    return {
      problem: (text: unknown, opts: unknown) => this.add('error', text, opts),
      warning: (text: unknown, opts: unknown) => this.add('warn', text, opts),
      notice: (text: unknown, opts: unknown) => this.add('info', text, opts),
      confirm: (text: unknown) => this.add('warn', str(text) || 'Индивидуальное значение — проверьте и поставьте галочку', null, { person: true }),
      suggest: (fix: unknown, text: unknown) => {
        const c = this.call;
        if (c.discovery || fix === null || fix === undefined) return;
        c.r.fix = str(fix);
        if (text) this.add('info', text, { fix });
      },
      example: (text: unknown) => {
        if (!this.call.discovery) this.call.r.example = str(text);
      },
      unique: (opts: unknown) => {
        const c = this.call;
        const o = (opts && typeof opts === 'object' ? opts : {}) as { with?: unknown; people?: unknown };
        const list = Array.isArray(o.with) ? o.with : o.with ? [o.with] : [];
        const ids = list.map((n) => {
          const id = resolveField(n);
          if (!id) throw new LuaUserError(`unique: нет столбца «${str(n)}»`);
          return id;
        });
        if (!c.discovery) c.r.unique = { with: ids, people: o.people !== false };
      },
      remember: (name: unknown, value: LuaValue) => {
        this.call.vars[str(name)] = value;
      },
      stop: () => {
        throw new LuaStop();
      },
      is_empty: (required: unknown) => {
        const need = this.setting('toggle', 'Обязательное — пустое будет ошибкой', required !== false);
        if (this.call.value !== '') return false;
        if (need) this.add('error', 'Пусто — поле обязательно');
        return true;
      },
      cell: (name: unknown) => {
        const id = resolveField(name);
        if (!id) throw new LuaUserError(`cell: нет столбца «${str(name)}» — проверьте название (подсказки: Ctrl+Пробел)`);
        return this.cellOf(id);
      },
      setting: {
        toggle: (label: unknown, def: unknown) => this.setting('toggle', label, def),
        number: (label: unknown, def: unknown) => this.setting('number', label, def),
        text: (label: unknown, def: unknown) => this.setting('text', label, def),
        list: (label: unknown, def: unknown) => this.setting('list', label, def),
        choice: (label: unknown, options: unknown, def: unknown) => this.setting('choice', label, def, options),
        info: (text: unknown) => this.setting('info', text, ''),
      },
      base: {
        check: (opts: unknown) => this.baseCheck(opts),
        check_parts: () => this.checkParts(),
        has: (tree: unknown, ...path: unknown[]) => this.nodesAt(this.tree(str(tree)), values(path)).length > 0,
        list: (tree: unknown, ...path: unknown[]) => {
          const t = this.tree(str(tree));
          const nodes = path.length ? this.nodesAt(t, values(path)) : [t.root];
          return [...new Set(nodes.flatMap((n) => n.children.map((ch) => ch.v)))];
        },
        find: (tree: unknown, value: unknown) => {
          const t = this.tree(str(tree));
          return t
            .nodes()
            .filter((n) => n.v === str(value))
            .map((n) => t.pathOf(n).map((s: Step) => s.v));
        },
        trees: () => [...(this.call.row?.env.trees.keys() ?? [])],
      },
      lib: textlib,
    };
  }

  // ---------- Запуск ----------

  private run(key: string, call: Call, label: string): { stopped: boolean } {
    const c = this.compiled.get(key);
    if (!c) return { stopped: false };
    if (!c.ok) {
      if (!call.discovery) call.r.issues.push({ level: 'error', script: true, text: `Ошибка в коде проверки «${label}»${c.error.line ? `, строка ${c.error.line}` : ''}: ${c.error.message}` });
      else call.discovery.error = c.error;
      return { stopped: false };
    }
    this.stack.push(call);
    const field = call.fieldId ? FIELD_BY_ID.get(call.fieldId) : undefined;
    const res = this.vm.run(c.ref, {
      value: call.value,
      field: { name: field?.label ?? '', id: call.fieldId ?? '', number: field ? PERSON_FIELDS.indexOf(field) + 1 : 0, column: call.col + 1 },
      confirmed: call.r.confirmed,
      row: (call.row?.input.row ?? 0) + 1,
    });
    this.stack.pop();
    if (!res.ok) {
      if (call.discovery) call.discovery.error ??= res.error;
      else call.r.issues.push({ level: 'error', script: true, text: `Ошибка в коде проверки «${label}»${res.error.line ? `, строка ${res.error.line}` : ''}: ${res.error.message}` });
      return { stopped: false };
    }
    return { stopped: res.stopped };
  }

  private evalCell(row: RowState, col: number): FieldResult {
    const fieldId = row.input.columns[col];
    const value = row.input.values[col] ?? '';
    const check = fieldId ? this.checks.fields[fieldId] : undefined;
    const r: FieldResult = { col, fieldId, value, status: 'ok', issues: [], confirmed: row.input.confirmed[col] === value };
    row.running.add(col);
    const vars: Record<string, LuaValue> = {};
    const common = this.run(COMMON, { fieldId, col, value, settings: this.checks.common.settings, check, r, vars, row, discovery: null }, 'Общие проверки');
    if (!common.stopped && check?.script) this.run(fieldId!, { fieldId, col, value, settings: check.settings, check, r, vars, row, discovery: null }, fieldLabel(fieldId!));
    this.finish(r, check);
    r.vars = vars;
    row.results[col] = r;
    row.running.delete(col);
    return r;
  }

  private finish(r: FieldResult, check?: FieldCheck) {
    const blocking = r.issues.some((i) => i.level === 'error');
    // При ошибке напоминание «поставьте галочку» не нужно — сначала исправить.
    if (blocking) r.issues = r.issues.filter((i) => !i.person);
    if (r.confirmed) for (const i of r.issues) if (i.level === 'warn' && !i.base) i.resolved = true;
    if (blocking && r.example === undefined && check?.example) r.example = check.example;
    r.status = statusOf(r.issues);
  }

  /** Проверить строку таблицы. */
  checkRow(input: RowInput, env: CheckEnv): FieldResult[] {
    const row: RowState = { input, env, results: [], running: new Set() };
    return input.columns.map((_, col) => row.results[col] ?? this.evalCell(row, col));
  }

  /** Проверить одно значение — для «Проверить значение» в правилах. Остальные ячейки — примеры. */
  test(fieldId: string, value: string, env: CheckEnv, others: Record<string, string> = {}, confirmed = false): { result: FieldResult; printed: string[] } {
    const columns = PERSON_FIELDS.map((f) => f.id);
    const values = columns.map((id) => (id === fieldId ? value : (others[id] ?? this.checks.fields[id]?.example ?? '')));
    const col = columns.indexOf(fieldId);
    this.vm.printed = [];
    const row: RowState = { input: { row: 0, values, columns, confirmed: confirmed ? { [col]: value } : {} }, env, results: [], running: new Set() };
    const result = this.evalCell(row, col);
    return { result, printed: [...this.vm.printed] };
  }

  /** Какие регулировки и базы объявляет код столбца (пробный запуск на примере и на пустом значении). */
  discover(fieldId: string | 'common'): Discovery {
    const d: Discovery = { controls: [], bases: [], parts: false };
    const isCommon = fieldId === 'common';
    const check = isCommon ? undefined : this.checks.fields[fieldId];
    const settings = isCommon ? this.checks.common.settings : (check?.settings ?? {});
    const key = isCommon ? COMMON : fieldId;
    for (const value of [check?.example || 'Пример', '']) {
      const r: FieldResult = { col: 0, fieldId: isCommon ? null : fieldId, value, status: 'ok', issues: [], confirmed: false };
      this.run(key, { fieldId: isCommon ? null : fieldId, col: 0, value, settings, check, r, vars: {}, row: null, discovery: d }, isCommon ? 'Общие проверки' : fieldLabel(fieldId));
      if (d.error) break;
    }
    return d;
  }

  private readonly discovered = new Map<string, Discovery>();

  /** То же, что discover, но запоминается (проверки не меняются, пока жив этот объект). */
  usage(fieldId: string): Discovery {
    let d = this.discovered.get(fieldId);
    if (!d) {
      d = this.discover(fieldId);
      this.discovered.set(fieldId, d);
    }
    return d;
  }

  /** Все древа, которые нужны проверкам. */
  treeNames(): string[] {
    const names = new Set<string>();
    for (const [id, f] of Object.entries(this.checks.fields)) {
      const d = this.usage(id);
      if (d.parts && f.template) names.add(f.template.tree);
      for (const b of d.bases) names.add(b.tree);
    }
    return [...names];
  }
}
