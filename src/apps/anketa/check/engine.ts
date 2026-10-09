import { BaseTree, chainText, stepText, type Step } from '@/core/base/tree';
import { FIO_FIELDS, fioKey, fioText, type PersonRecord } from '@/core/people/people';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { compileRegex, suggestFix } from '@/shared/cell/format';
import { parseCell } from '@/shared/cell/parse';
import { parseOrder } from '@/shared/cell/template';
import { walk, type Level as WalkLevel } from '@/shared/cell/walk';
import { OTHER_RULE, treeNameOf, type FieldRule } from '../model/rules';
import { countIssues, isReady, type FieldResult, type Issue, type PartView, type PersonResult } from '../model/types';

/*
 * Проверка анкеты — только regex, списки «ключ:значение» и древо:
 *   - формат: значение должно проходить regex поля (или конструктор ячейки-древа);
 *   - список и древо: значение должно быть в базе (внутри своего родителя); нового нет — предупреждение и «Подтвердить»;
 *   - индивидуальное (паспорт, СНИЛС, телефон…): всегда предупреждение и отдельная галочка у каждого человека;
 *   - уникальное: повтор у другого человека (в таблице или в базе людей) — ошибка.
 */

export interface CheckContext {
  rules: Record<string, FieldRule>;
  trees: Map<string, BaseTree>;
  people: PersonRecord[];
}

const EMPTY_TREE = new BaseTree();

const labelOf = (fieldId: string) => FIELD_BY_ID.get(fieldId)?.label ?? fieldId;

function finish(r: FieldResult): FieldResult {
  const hasError = r.issues.some((i) => i.level === 'error');
  const needs = !!r.confirm && ((r.confirm.person && !r.confirmed) || !!r.confirm.base);
  r.status = hasError ? 'error' : needs ? 'warn' : 'ok';
  return r;
}

/** Заменить в значении часть [start, end) — для исправления одной части ячейки. */
const splice = (value: string, start: number, end: number, text: string) => value.slice(0, start) + text + value.slice(end);
const formatPart = (v: string, t?: string, a?: boolean) => (!t ? v : a ? `${v} ${t}` : `${t} ${v}`);

function checkTree(r: FieldResult, rule: FieldRule, fieldId: string, ctx: CheckContext) {
  const t = rule.template;
  if (!t || !t.keys.length) {
    r.issues.push({ level: 'error', text: 'В правилах не настроен конструктор ячейки' });
    return;
  }
  const parsed = parseCell(r.value, t);
  for (const i of parsed.issues) r.issues.push({ level: 'error', text: i.text, span: i.span });
  if (parsed.canonical !== undefined && parsed.canonical !== r.value) r.fix = parsed.canonical;

  const { order, error } = parseOrder(t.order, t.keys.length);
  const levelOfKey = new Map(order.map((k, i) => [k, i]));
  const view = (state: (k: number | undefined) => PartView['state']): PartView[] =>
    parsed.blocks.map((b) => ({ title: b.key !== undefined ? t.keys[b.key].title : '?', text: b.text, state: !b.ok ? 'error' : state(b.key) }));

  if (parsed.issues.length) {
    r.parts = view(() => 'plain');
    return;
  }
  if (error) {
    r.issues.push({ level: 'error', text: `В правилах: порядок древа — ${error}` });
    r.parts = view(() => 'plain');
    return;
  }

  const treeName = treeNameOf(fieldId, ctx.rules) ?? t.tree;
  const tree = ctx.trees.get(treeName) ?? EMPTY_TREE;
  const levels: WalkLevel[] = order.map((k) => ({ k: t.keys[k].id, step: parsed.steps[k], single: t.keys[k].single }));
  const w = walk(tree, levels);
  const blockOfKey = (k: number) => parsed.blocks.find((b) => b.key === k);

  for (const wi of w.issues) {
    const key = order[wi.at];
    const b = blockOfKey(key);
    const fix = wi.fix && b ? splice(r.value, b.start, b.end, formatPart(wi.fix.v, wi.fix.t, wi.fix.a)) : undefined;
    r.issues.push({ level: wi.level, text: wi.text, span: b ? [b.start, b.end] : undefined, fix, confirmable: wi.confirmable });
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
      text: `Нет в базе «${treeName}»: ${fresh.map(stepText).join(' → ')}${w.knownPath.length ? ` (внутри: ${chainText(w.knownPath)})` : ''}. Проверьте и подтвердите`,
      span: first ? [first.start, first.end] : undefined,
    });
    r.confirm = { person: !!r.confirm?.person, base: { tree: treeName, path: w.addPath, label: chainText(w.addPath), known: w.knownPath.length } };
  }
}

function checkList(r: FieldResult, rule: FieldRule, fieldId: string, row: Map<string, string>, ctx: CheckContext) {
  const treeName = treeNameOf(fieldId, ctx.rules) ?? labelOf(fieldId);
  const tree = ctx.trees.get(treeName) ?? EMPTY_TREE;
  const step: Step = { k: fieldId, v: r.value };
  const levels: WalkLevel[] = [];
  let parentNote = '';
  if (rule.within) {
    const pv = row.get(rule.within)?.trim() ?? '';
    const prule = ctx.rules[rule.within];
    const pre = prule ? compileRegex(prule.regex).re : null;
    const ok = pv !== '' && (!pre || pre.test(pv));
    levels.push({ k: rule.within, step: ok ? { k: rule.within, v: pv } : null });
    if (ok) parentNote = ` для «${labelOf(rule.within)}: ${pv}»`;
  }
  levels.push({ k: fieldId, step });
  const w = walk(tree, levels);
  if (w.addPath.length) {
    const elsewhere = rule.within ? tree.all(fieldId, r.value).map((n) => n.parent?.v).filter(Boolean) : [];
    r.issues.push({
      level: 'warn',
      text: `Нет в базе${parentNote}. Проверьте и подтвердите${elsewhere.length ? ` (это значение есть в базе для: ${elsewhere.slice(0, 3).join(', ')})` : ''}`,
    });
    r.confirm = { person: !!r.confirm?.person, base: { tree: treeName, path: w.addPath, label: chainText(w.addPath), known: w.knownPath.length } };
  }
}

export function checkField(fieldId: string | null, col: number, value: string, row: Map<string, string>, ctx: CheckContext, confirmedValue?: string): FieldResult {
  const rule = (fieldId && ctx.rules[fieldId]) || OTHER_RULE;
  const r: FieldResult = { col, fieldId, value, status: 'ok', issues: [], confirmed: false };

  if (value === '') {
    if (rule.required) r.issues.push({ level: 'error', text: 'Пусто — поле обязательно' });
    return finish(r);
  }
  if (value.trim() === '') {
    r.issues.push({ level: 'error', text: 'Только пробелы', span: [0, value.length], fix: rule.required ? undefined : '' });
    return finish(r);
  }

  const person = rule.confirm || rule.unique;
  if (person) {
    r.confirm = { person: true };
    r.confirmed = confirmedValue === value;
  }

  if (rule.kind === 'tree' && fieldId) {
    checkTree(r, rule, fieldId, ctx);
  } else {
    const { re, error } = compileRegex(rule.regex);
    if (error) r.issues.push({ level: 'error', text: `В правилах ошибка в формате (regex): ${error}` });
    else if (re && !re.test(value)) {
      const fix = suggestFix(value, re, rule.mask);
      r.issues.push({ level: 'error', text: `Не по формату${rule.example ? `. Пример: ${rule.example}` : ''}`, span: [0, value.length], fix: fix ?? undefined });
      if (fix) r.fix = fix;
    } else if (rule.kind === 'list' && fieldId) {
      checkList(r, rule, fieldId, row, ctx);
    }
  }

  if (person && !r.confirmed && !r.issues.some((i) => i.level === 'error' && !i.confirmable)) {
    r.issues.push({ level: 'warn', person: true, text: rule.unique ? 'Уникальное значение — проверьте и поставьте галочку' : 'Индивидуальное значение — проверьте и поставьте галочку' });
  }
  return finish(r);
}

export function checkPerson(rowIndex: number, values: string[], columns: (string | null)[], ctx: CheckContext, confirmed: Record<string, string> = {}): PersonResult {
  const row = new Map<string, string>();
  columns.forEach((id, i) => id && row.set(id, values[i] ?? ''));
  const fields = values.map((v, col) => checkField(columns[col], col, v ?? '', row, ctx, confirmed[col]));
  const counts = countIssues(fields);
  return { row: rowIndex, fields, counts, ready: isReady(counts) };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

/**
 * Уникальность: одинаковое значение у разных людей — ошибка.
 * Сравнивается внутри таблицы и с базой людей (запись с другим ФИО).
 */
export function applyUniqueness(results: PersonResult[], values: string[][], columns: (string | null)[], names: string[], ctx: CheckContext): PersonResult[] {
  const extra = new Map<number, Map<number, Issue[]>>();
  const add = (row: number, col: number, issue: Issue) => {
    const m = extra.get(row) ?? new Map<number, Issue[]>();
    m.set(col, [...(m.get(col) ?? []), issue]);
    extra.set(row, m);
  };
  const fio = new Set<string>(FIO_FIELDS);
  const who = (r: number) => `строка ${r + 1}${names[r] ? ` (${names[r]})` : ''}`;

  columns.forEach((fieldId, col) => {
    const rule = fieldId ? ctx.rules[fieldId] : undefined;
    if (!fieldId || !rule?.unique) return;
    const withCols = (rule.uniqueWith ?? []).map((id) => ({ id, col: columns.indexOf(id) })).filter((x) => x.col >= 0);
    const keyOf = (r: number) => [values[r][col], ...withCols.map((w) => values[r][w.col] ?? '')].map(norm).join('\u0001');
    const groups = new Map<string, number[]>();
    results.forEach((res, r) => {
      const f = res.fields[col];
      if (!f || !f.value.trim() || f.issues.some((i) => i.level === 'error' && !i.confirmable)) return;
      const k = keyOf(r);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    });
    const what = withCols.length ? [labelOf(fieldId), ...withCols.map((w) => labelOf(w.id))].join(' + ') : '';
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      for (const r of rows) {
        add(r, col, { level: 'error', text: `Повторяется${what ? ` (${what})` : ''}: ${rows.filter((x) => x !== r).map(who).join(', ')}` });
      }
    }
    // База людей: значение уже есть у другого человека.
    if (fio.has(fieldId) || withCols.some((w) => fio.has(w.id))) return;
    for (const [k, rows] of groups) {
      for (const rec of ctx.people) {
        const recKey = [rec.fields[fieldId] ?? '', ...withCols.map((w) => rec.fields[w.id] ?? '')].map(norm).join('\u0001');
        if (recKey !== k) continue;
        for (const r of rows) {
          const mine: Record<string, string> = {};
          FIO_FIELDS.forEach((id) => (mine[id] = values[r][columns.indexOf(id)] ?? ''));
          if (fioKey(rec.fields) !== fioKey(mine)) add(r, col, { level: 'error', text: `Уже было: в базе людей это значение у «${fioText(rec.fields)}»` });
        }
      }
    }
  });

  if (!extra.size) return results;
  return results.map((res) => {
    const m = extra.get(res.row);
    if (!m) return res;
    const fields = res.fields.map((f) => {
      const issues = m.get(f.col);
      if (!issues) return f;
      return finish({ ...f, issues: [...f.issues.filter((i) => !i.person), ...issues] });
    });
    const counts = countIssues(fields);
    return { ...res, fields, counts, ready: isReady(counts) };
  });
}

export interface RecordMatch {
  record: PersonRecord;
  /** Столбцы, значения которых совпали с базой. */
  matched: number[];
  /** Не совпало: столбец и значение в базе. */
  differ: { col: number; base: string }[];
  /** Сколько всего записей с таким ФИО. */
  total: number;
}

/** «Проверить с актуальной информацией»: найти человека в базе людей по ФИО и сравнить поля. */
export function matchWithPeople(values: string[], columns: (string | null)[], people: PersonRecord[]): RecordMatch | null {
  const mine: Record<string, string> = {};
  columns.forEach((id, i) => id && (mine[id] = values[i] ?? ''));
  const key = fioKey(mine);
  if (!key) return null;
  const found = people.filter((p) => fioKey(p.fields) === key);
  if (!found.length) return null;
  const compare = (rec: PersonRecord) => {
    const matched: number[] = [];
    const differ: { col: number; base: string }[] = [];
    columns.forEach((id, col) => {
      if (!id || rec.fields[id] === undefined) return;
      if (rec.fields[id] === (values[col] ?? '')) matched.push(col);
      else differ.push({ col, base: rec.fields[id] });
    });
    return { record: rec, matched, differ, total: found.length };
  };
  return found.map(compare).sort((a, b) => b.matched.length - a.matched.length)[0];
}
