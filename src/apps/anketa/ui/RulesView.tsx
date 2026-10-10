import { BookOpen, ChevronDown, ChevronRight, ClipboardCopy, Code2, RotateCcw, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FIELD_BY_ID, PERSON_FIELDS } from '@/core/schema/fields';
import { ABBR_GROUPS, ABBREVIATIONS } from '@/shared/cell/abbr';
import { parseOrder } from '@/shared/cell/template';
import { Alert } from '@/ui/Alert';
import { copySettings } from '@/core/settings/settingsExport';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { useToast } from '@/ui/Toast';
import { AnketaChecker, type CheckEnv, type ControlDecl, type Discovery } from '../lua/checker';
import { API, API_GROUPS, SNIPPETS } from '../lua/docs';
import { DEFAULT_COMMON, DEFAULT_LIBRARY } from '../lua/defaults';
import { DEFAULT_EXAMPLES, defaultField, type CommonCheck, type FieldCheck, type ResolvedChecks, type SettingValue } from '../model/checks';
import type { FieldResult } from '../model/types';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { IssueIcon } from './FieldRow';
import { useCheckContext, useChecks, useTreeNames } from './hooks';
import { TemplateEditor } from './TemplateEditor';

/*
 * «Шаблоны и правила»: каждую ячейку проверяет короткий код на Lua.
 * Обычно хватает регулировок (переключатели, числа, списки) — их объявляет сам код через setting.*.
 * Код открывается отдельно, с подсказками и справкой.
 */

const label = (id: string) => FIELD_BY_ID.get(id)?.label ?? id;
const COLUMNS = PERSON_FIELDS.map((f) => f.label);

/** Первая строка-комментарий кода — краткое описание проверки. */
const scriptAbout = (script: string) => /^--\s*(.+)$/m.exec(script)?.[1] ?? '';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------- Регулировки ----------

function Controls({ controls, settings, onChange, readOnly }: { controls: ControlDecl[]; settings: Record<string, SettingValue>; onChange: (s: Record<string, SettingValue>) => void; readOnly?: boolean }) {
  const set = (c: ControlDecl, v: SettingValue) => {
    const next = { ...settings };
    if (JSON.stringify(v) === JSON.stringify(c.default)) delete next[c.label];
    else next[c.label] = v;
    onChange(next);
  };
  if (!controls.length) return <p className="small muted" style={{ margin: 0 }}>У этой проверки нет регулировок — всё задано в коде.</p>;
  return (
    <div className="controls">
      {controls.map((c) => {
        const id = `ctl-${c.label}`;
        switch (c.kind) {
          case 'info':
            return (
              <p key={c.label} className="small muted controls__info">
                {c.label}
              </p>
            );
          case 'toggle':
            return (
              <label key={c.label} className="check">
                <input type="checkbox" checked={c.value === true} disabled={readOnly} onChange={(e) => set(c, e.target.checked)} /> {c.label}
              </label>
            );
          case 'number':
            return (
              <label key={c.label} className="controls__row" htmlFor={id}>
                <span>{c.label}</span>
                <input id={id} className="input input--sm controls__num" type="number" value={Number(c.value)} disabled={readOnly} onChange={(e) => e.target.value !== '' && set(c, Number(e.target.value))} />
              </label>
            );
          case 'text':
            return (
              <label key={c.label} className="controls__row" htmlFor={id}>
                <span>{c.label}</span>
                <input id={id} className="input input--sm mono" value={String(c.value)} disabled={readOnly} onChange={(e) => set(c, e.target.value)} />
              </label>
            );
          case 'list':
            return (
              <label key={c.label} className="controls__row controls__row--top" htmlFor={id}>
                <span>
                  {c.label}
                  <span className="faint small"> — каждое с новой строки</span>
                </span>
                <textarea
                  id={id}
                  className="input input--sm"
                  rows={Math.min(8, Math.max(2, (c.value as string[]).length))}
                  value={(c.value as string[]).join('\n')}
                  disabled={readOnly}
                  onChange={(e) => set(c, e.target.value.split('\n'))}
                />
              </label>
            );
          case 'choice':
            return (
              <label key={c.label} className="controls__row" htmlFor={id}>
                <span>{c.label}</span>
                <select id={id} className="select select--sm" value={String(c.value)} disabled={readOnly} onChange={(e) => set(c, e.target.value)}>
                  {(c.options ?? []).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
            );
        }
      })}
    </div>
  );
}

// ---------- Проверить значение ----------

function Preview({ result, printed }: { result: FieldResult; printed: string[] }) {
  const visible = result.issues;
  return (
    <div className="preview stack stack--s small">
      <div className={`preview__status preview__status--${result.status}`}>
        {result.status === 'ok' ? 'Верно' : result.status === 'error' ? 'Ошибка' : 'Нужна галочка «Проверено»'}
        {result.confirm?.base && <span className="faint"> · можно добавить в базу «{result.confirm.base.tree}»</span>}
      </div>
      {visible.length > 0 && (
        <ul className="issues">
          {visible.map((i, k) => (
            <li key={k} className={`issue issue--${i.level} ${i.resolved ? 'issue--resolved' : ''}`}>
              <IssueIcon issue={i} />
              <span className="issue__msg">
                {i.text}
                {i.resolved && <span className="faint"> — снято галочкой</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result.fix !== undefined && result.fix !== result.value && (
        <div>
          <Wand2 size={13} /> Исправление: <span className="mono">{result.fix === '' ? '(пусто)' : result.fix}</span>
        </div>
      )}
      {result.example && result.status === 'error' && (
        <div className="muted">
          Пример: <span className="mono">{result.example}</span>
        </div>
      )}
      {result.parts && (
        <div className="parts">
          {result.parts.map((p, i) => (
            <span key={i} className={`part part--${p.state}`}>
              <span className="part__level">{p.title}</span>
              <span className="part__text">{p.text}</span>
            </span>
          ))}
        </div>
      )}
      {result.unique && <div className="faint">Уникальность проверяется по всей таблице{result.unique.people ? ' и по базе людей' : ''}.</div>}
      {result.vars && Object.keys(result.vars).length > 0 && <div className="faint mono">remember: {JSON.stringify(result.vars)}</div>}
      {printed.length > 0 && (
        <pre className="preview__print" aria-label="Вывод print">
          {printed.join('\n')}
        </pre>
      )}
    </div>
  );
}

function Tester({ checker, fieldId, example, env }: { checker: AnketaChecker; fieldId: string; example: string; env: CheckEnv }) {
  const [v, setV] = useState(example);
  const [confirmed, setConfirmed] = useState(false);
  const out = useMemo(() => checker.test(fieldId, v, env, {}, confirmed), [checker, fieldId, v, env, confirmed]);
  return (
    <div className="stack stack--s">
      <div className="row row--nowrap">
        <input className={`input ${out.result.status === 'error' ? 'input--error' : ''}`} value={v} onChange={(e) => setV(e.target.value)} placeholder="Значение…" aria-label="Проверить значение" data-novars />
        <button type="button" className="btn btn--sm nowrap" onClick={() => setV(example)} disabled={!example}>
          Пример
        </button>
      </div>
      <label className="check small">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> галочка «Проверено» стоит
      </label>
      <Preview result={out.result} printed={out.printed} />
      <span className="small faint">Другие ячейки анкеты — из примеров («Примеры значений» выше).</span>
    </div>
  );
}

// ---------- Код ----------

function ApiHelp({ onInsert }: { onInsert: (text: string) => void }) {
  const [group, setGroup] = useState(API_GROUPS[0].id);
  const [q, setQ] = useState('');
  const list = API.filter((e) => (q ? `${e.name} ${e.about}`.toLowerCase().includes(q.toLowerCase()) : e.group === group));
  return (
    <div className="api-help">
      <input className="input input--sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти: дата, латиница, база…" aria-label="Поиск в справке" data-novars />
      {!q && (
        <div className="api-help__tabs" role="tablist">
          {API_GROUPS.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={g.id === group} className={g.id === group ? 'is-on' : ''} onClick={() => setGroup(g.id)} title={g.about}>
              {g.title}
            </button>
          ))}
        </div>
      )}
      {!q && <p className="small muted api-help__about">{API_GROUPS.find((g) => g.id === group)?.about}</p>}
      <div className="api-help__list">
        {list.map((e) => (
          <div key={e.name} className="api-help__item">
            <button type="button" className="api-help__sig mono" onClick={() => onInsert(e.insert)} title="Вставить в код">
              {e.signature}
            </button>
            <div className="small">{e.about}</div>
            {e.example && <pre className="api-help__ex">{e.example}</pre>}
          </div>
        ))}
        {!list.length && <div className="small muted">Ничего не найдено.</div>}
      </div>
    </div>
  );
}

function CodeSection({
  script,
  onChange,
  defaultScript,
  error,
  functions,
  trees,
  readOnly,
  title,
}: {
  script: string;
  onChange: (s: string) => void;
  defaultScript: string;
  error?: { line?: number; message: string };
  functions: string[];
  trees: string[];
  readOnly?: boolean;
  title: string;
}) {
  const editor = useRef<CodeEditorHandle>(null);
  const [help, setHelp] = useState(true);
  return (
    <div className="code-section stack stack--s">
      <div className="row small">
        <select
          className="select select--sm"
          value=""
          aria-label="Вставить шаблон кода"
          disabled={readOnly}
          onChange={(e) => {
            const s = SNIPPETS.find((x) => x.title === e.target.value);
            if (s) editor.current?.insert(s.code);
          }}
        >
          <option value="">+ Вставить шаблон…</option>
          {SNIPPETS.map((s) => (
            <option key={s.title}>{s.title}</option>
          ))}
        </select>
        <button type="button" className={`btn btn--sm ${help ? 'btn--on' : ''}`} onClick={() => setHelp(!help)} aria-pressed={help}>
          <BookOpen size={14} /> Подсказки
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn--sm btn--ghost" disabled={readOnly || script === defaultScript} onClick={() => confirm('Вернуть код по умолчанию? Ваши изменения кода пропадут.') && onChange(defaultScript)}>
          <RotateCcw size={14} /> Код по умолчанию
        </button>
      </div>
      <div className={`code-wrap ${help ? 'code-wrap--help' : ''}`}>
        <div className="stack stack--s code-wrap__main">
          <CodeEditor ref={editor} value={script} onChange={onChange} errorLine={error?.line} columns={COLUMNS} functions={functions} trees={trees} readOnly={readOnly} label={`Код: ${title}`} />
          {error ? (
            <span className="field__error">
              {error.line ? `Строка ${error.line}: ` : ''}
              {error.message}
            </span>
          ) : (
            <span className="field__hint">Ctrl+Пробел — подсказки: функции, названия столбцов в cell("…"). Код проверяется сразу — ниже видно результат.</span>
          )}
        </div>
        {help && <ApiHelp onInsert={(t) => editor.current?.insert(t)} />}
      </div>
    </div>
  );
}

// ---------- Проверка столбца ----------

function summaryChips(d: Discovery, settings: Record<string, SettingValue>, f: FieldCheck): string[] {
  const value = (labelText: string) => {
    const c = d.controls.find((x) => x.label === labelText);
    return c ? settings[labelText] ?? c.value : undefined;
  };
  const out: string[] = [];
  if (value('Обязательное — пустое будет ошибкой') === false) out.push('можно пусто');
  if (d.controls.some((c) => c.label.startsWith('Галочка') && (settings[c.label] ?? c.value) === true)) out.push('галочка у каждого');
  if (d.controls.some((c) => c.label.startsWith('Уникальное') && (settings[c.label] ?? c.value) === true)) out.push('уникальное');
  for (const b of d.bases) out.push(`база «${b.tree}»${b.inside ? ` внутри «${b.inside.title}»` : ''}`);
  if (d.parts && f.template) out.push(`древо «${f.template.tree}»`);
  return out;
}

function FieldEditor({
  id,
  checks,
  initial,
  env,
  trees,
  custom,
  readOnly,
  onSave,
  onReset,
  onClose,
}: {
  id: string;
  checks: ResolvedChecks;
  initial: FieldCheck;
  env: CheckEnv;
  trees: string[];
  custom: boolean;
  readOnly: boolean;
  onSave: (f: FieldCheck) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<FieldCheck>(() => structuredClone(initial));
  const set = (patch: Partial<FieldCheck>) => setF((x) => ({ ...x, ...patch }));
  const debounced = useDebounced(f, 350);
  const checker = useMemo(() => new AnketaChecker({ ...checks, fields: { ...checks.fields, [id]: debounced } }), [checks, id, debounced]);
  const discovery = useMemo(() => checker.discover(id), [checker, id]);
  const compileError = checker.compileError(id) ?? discovery.error;
  const [codeOpen, setCodeOpen] = useState(false);
  const def = defaultField(id);
  const orderError = f.template ? parseOrder(f.template.order, f.template.keys.length).error : undefined;
  // Регулировки показываем по коду, который сейчас в окне (после паузы в наборе).
  const controls = discovery.controls.map((c) => ({ ...c, value: (f.settings[c.label] ?? c.value) as SettingValue }));

  return (
    <div className="rule-editor stack">
      {scriptAbout(f.script) && <p className="small muted" style={{ margin: 0 }}>{scriptAbout(f.script)}</p>}
      <div className="field">
        <span className="field__label">Настройки</span>
        <Controls controls={controls} settings={f.settings} onChange={(settings) => set({ settings })} readOnly={readOnly} />
      </div>

      <div className="grid-2">
        <label className="field">
          <span className="field__label">Пример правильного значения</span>
          <input className="input" value={f.example} onChange={(e) => set({ example: e.target.value })} data-novars />
          <span className="field__hint">Показывается у ошибки: «Пример: …».</span>
        </label>
        <div className="field">
          <span className="field__label">Проверить значение</span>
          <Tester checker={checker} fieldId={id} example={f.example} env={env} />
        </div>
      </div>

      {discovery.parts && f.template && (
        <div className="field">
          <span className="field__label">Конструктор ячейки (для base.check_parts)</span>
          <TemplateEditor value={f.template} onChange={(template) => set({ template })} treeNames={trees} example={f.example} functions={checker.libraryFunctions} fits={checker.partFits} />
        </div>
      )}

      <div className="field">
        <button type="button" className="btn btn--sm code-toggle" onClick={() => setCodeOpen(!codeOpen)} aria-expanded={codeOpen}>
          {codeOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Code2 size={16} /> Код проверки (Lua){f.script !== def.script ? ' — изменён' : ''}
          {compileError && <span className="badge badge--error">ошибка в коде</span>}
        </button>
        {!codeOpen && compileError && (
          <span className="field__error">
            {compileError.line ? `Строка ${compileError.line}: ` : ''}
            {compileError.message}
          </span>
        )}
        {codeOpen && <CodeSection script={f.script} onChange={(script) => set({ script })} defaultScript={def.script} error={compileError} functions={checker.libraryFunctions} trees={trees} readOnly={readOnly} title={label(id)} />}
      </div>

      <div className="row">
        <button className="btn btn--primary" onClick={() => onSave(f)} disabled={readOnly || !!orderError}>
          Сохранить
        </button>
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
        <span className="spacer" />
        {custom && (
          <button className="btn btn--ghost" onClick={onReset} disabled={readOnly}>
            <RotateCcw size={16} /> Всё по умолчанию
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Общие проверки и библиотека ----------

function CommonEditor({ checks, env, trees, custom, readOnly, onSave }: { checks: ResolvedChecks; env: CheckEnv; trees: string[]; custom: boolean; readOnly: boolean; onSave: (c: CommonCheck | undefined) => void }) {
  const [c, setC] = useState<CommonCheck>(() => structuredClone(checks.common));
  const debounced = useDebounced(c, 350);
  const checker = useMemo(() => new AnketaChecker({ ...checks, common: debounced }), [checks, debounced]);
  const discovery = useMemo(() => checker.discover('common'), [checker]);
  const error = checker.compileError('common') ?? discovery.error;
  const [codeOpen, setCodeOpen] = useState(false);
  const controls = discovery.controls.map((x) => ({ ...x, value: (c.settings[x.label] ?? x.value) as SettingValue }));
  const dirty = JSON.stringify(c) !== JSON.stringify(checks.common);
  return (
    <div className="rule-editor stack">
      <p className="small muted" style={{ margin: 0 }}>
        Выполняются для каждой ячейки перед проверкой столбца: только пробелы, «й» из двух символов, латинские буквы в русских словах.
      </p>
      <Controls controls={controls} settings={c.settings} onChange={(settings) => setC({ ...c, settings })} readOnly={readOnly} />
      <div className="field">
        <span className="field__label">Проверить значение (как ячейку «Фамилия»)</span>
        <Tester checker={checker} fieldId="person.lastName" example="Иванов" env={env} />
      </div>
      <button type="button" className="btn btn--sm code-toggle" onClick={() => setCodeOpen(!codeOpen)} aria-expanded={codeOpen}>
        {codeOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Code2 size={16} /> Код общих проверок (Lua){error && <span className="badge badge--error">ошибка в коде</span>}
      </button>
      {codeOpen && <CodeSection script={c.script} onChange={(script) => setC({ ...c, script })} defaultScript={DEFAULT_COMMON} error={error} functions={checker.libraryFunctions} trees={trees} readOnly={readOnly} title="Общие проверки" />}
      <div className="row">
        <button className="btn btn--primary" disabled={readOnly || !dirty} onClick={() => onSave(c)}>
          Сохранить
        </button>
        <span className="spacer" />
        {custom && (
          <button className="btn btn--ghost" disabled={readOnly} onClick={() => confirm('Вернуть общие проверки по умолчанию?') && onSave(undefined)}>
            <RotateCcw size={16} /> По умолчанию
          </button>
        )}
      </div>
    </div>
  );
}

function LibraryEditor({ checks, trees, custom, readOnly, onSave }: { checks: ResolvedChecks; trees: string[]; custom: boolean; readOnly: boolean; onSave: (code: string | undefined) => void }) {
  const [code, setCode] = useState(checks.library);
  const debounced = useDebounced(code, 350);
  const checker = useMemo(() => new AnketaChecker({ ...checks, library: debounced }), [checks, debounced]);
  return (
    <div className="rule-editor stack">
      <p className="small muted" style={{ margin: 0 }}>
        Свои функции на Lua — их видят все проверки. Функция, которая принимает текст и возвращает true/false, появится в
        конструкторе ячейки как проверка части.
      </p>
      <CodeSection script={code} onChange={setCode} defaultScript={DEFAULT_LIBRARY} error={checker.libraryError} functions={checker.libraryFunctions} trees={trees} readOnly={readOnly} title="Моя библиотека" />
      {checker.libraryFunctions.length > 0 && <div className="small muted">Функции: {checker.libraryFunctions.map((f) => `${f}()`).join(', ')}</div>}
      <div className="row">
        <button className="btn btn--primary" disabled={readOnly || code === checks.library || !!checker.libraryError} onClick={() => onSave(code)}>
          Сохранить
        </button>
        <span className="spacer" />
        {custom && (
          <button className="btn btn--ghost" disabled={readOnly} onClick={() => confirm('Вернуть библиотеку по умолчанию? Свои функции пропадут.') && onSave(undefined)}>
            <RotateCcw size={16} /> По умолчанию
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Примеры ----------

function ExamplesEditor({ checks, checker, readOnly, setField, resetField }: { checks: ResolvedChecks; checker: AnketaChecker; readOnly: boolean; setField: (id: string, f: FieldCheck) => void; resetField: (id: string) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const value = (id: string) => draft[id] ?? checks.fields[id].example;
  const save = (id: string, example: string) => {
    const next = { ...checks.fields[id], example };
    if (JSON.stringify(next) === JSON.stringify(defaultField(id))) resetField(id);
    else setField(id, next);
  };
  const commit = (id: string) => {
    const v = draft[id];
    if (v === undefined || v === checks.fields[id].example) return;
    save(id, v);
    setDraft((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
  };
  const changed = PERSON_FIELDS.filter((f) => checks.fields[f.id].example !== DEFAULT_EXAMPLES[f.id]);
  const bad = (id: string, v: string) => !!v && checker.test(id, v, { trees: new Map() }).result.issues.some((i) => i.level === 'error' && !i.base);
  return (
    <details className="card card--flat examples">
      <summary>
        Примеры значений{changed.length ? ` · изменено: ${changed.length}` : ''} — показываются в подсказках «Пример: …»
      </summary>
      <p className="small muted">По умолчанию — нейтральные заготовки, а не чьи-то данные. Пример, который не проходит проверку столбца, подсвечен.</p>
      <div className="examples__grid">
        {PERSON_FIELDS.map((f, i) => {
          const v = value(f.id);
          return (
            <label key={f.id} className="examples__row">
              <span className="small">
                <span className="faint">{i + 1}.</span> {f.label}
              </span>
              <input
                className={`input input--sm ${bad(f.id, v) ? 'input--error' : ''}`}
                value={v}
                disabled={readOnly}
                data-novars
                onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                onBlur={() => commit(f.id)}
                onKeyDown={(e) => e.key === 'Enter' && commit(f.id)}
              />
            </label>
          );
        })}
      </div>
      {changed.length > 0 && (
        <button
          className="btn btn--sm btn--ghost"
          disabled={readOnly}
          style={{ marginTop: 8 }}
          onClick={() => {
            if (!confirm('Вернуть все примеры по умолчанию?')) return;
            for (const f of changed) save(f.id, DEFAULT_EXAMPLES[f.id]);
            setDraft({});
          }}
        >
          <RotateCcw size={14} /> Вернуть примеры по умолчанию
        </button>
      )}
    </details>
  );
}

// ---------- Экран ----------

export function RulesView({ onHelp }: { onHelp?: () => void }) {
  const store = useChecks();
  const { checks, loaded, readOnly, error, setField, resetField, isCustom } = store;
  const ctx = useCheckContext();
  const trees = useTreeNames(ctx.checker);
  const env = useMemo(() => ({ trees: ctx.trees }), [ctx.trees]);
  const toast = useToast();
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState<string | null>(null);

  if (!loaded) return <div className="loading">Загрузка правил…</div>;

  return (
    <div className="stack">
      {error && <Alert kind="error">{error}</Alert>}
      {readOnly && <Alert kind="warning">Правила сохранены более новой версией DocAssist — сейчас только просмотр.</Alert>}
      <div className="row">
        <p className="muted spacer" style={{ margin: 0 }}>
          Каждую ячейку проверяет короткий код на Lua. Обычно хватает <strong>настроек</strong> столбца — переключателей и полей; код
          открывается отдельно, с подсказками. База сначала пустая — значения попадают в неё, когда вы их подтверждаете.
        </p>
        {onHelp && (
          <button className="btn" onClick={onHelp}>
            <BookOpen size={16} /> Справка по проверкам
          </button>
        )}
        <button
          className="btn"
          onClick={() =>
            workspace &&
            void copySettings(workspace).then(
              (how) => toast(how === 'clipboard' ? 'Настройки скопированы — вставьте их в сообщение разработчику' : 'Буфер недоступен — настройки скачаны файлом'),
              () => toast('Не удалось скопировать настройки'),
            )
          }
          data-tip="Проверки, регулировки, примеры, конструктор — без переменных, словаря, базы и людей"
        >
          <ClipboardCopy size={16} /> Скопировать настройки
        </button>
      </div>

      <ExamplesEditor checks={checks} checker={ctx.checker} readOnly={readOnly} setField={setField} resetField={resetField} />

      <div className="rules-list">
        <section className={`card rule ${open === 'common' ? 'rule--open' : ''}`}>
          <button className="rule__head" onClick={() => setOpen(open === 'common' ? null : 'common')} aria-expanded={open === 'common'}>
            {open === 'common' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span className="rule__title">Общие проверки — для всех ячеек</span>
            {store.stored?.common && <span className="badge badge--updated">изменено</span>}
          </button>
          {open === 'common' && (
            <CommonEditor
              key={JSON.stringify(checks.common)}
              checks={checks}
              env={env}
              trees={trees}
              custom={!!store.stored?.common}
              readOnly={readOnly}
              onSave={(c) => {
                store.setCommon(c);
                setOpen(null);
              }}
            />
          )}
        </section>

        {PERSON_FIELDS.map((f, i) => {
          const field = checks.fields[f.id];
          const isOpen = open === f.id;
          const d = ctx.checker.usage(f.id);
          const scriptError = ctx.checker.compileError(f.id) ?? d.error;
          return (
            <section key={f.id} className={`card rule ${isOpen ? 'rule--open' : ''}`}>
              <button className="rule__head" onClick={() => setOpen(isOpen ? null : f.id)} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span className="rule__num faint">{i + 1}.</span>
                <span className="rule__title">{f.label}</span>
                {isCustom(f.id) && <span className="badge badge--updated">изменено</span>}
                {scriptError && <span className="badge badge--error">ошибка в коде</span>}
                <span className="rule-sum">
                  {field.example && <span className="small muted mono">{field.example}</span>}
                  {summaryChips(d, field.settings, field).map((c) => (
                    <span key={c} className="chip small">
                      {c}
                    </span>
                  ))}
                </span>
              </button>
              {isOpen && (
                <FieldEditor
                  key={JSON.stringify(field)}
                  id={f.id}
                  checks={checks}
                  initial={field}
                  env={env}
                  trees={trees}
                  custom={isCustom(f.id)}
                  readOnly={readOnly}
                  onSave={(next) => {
                    if (JSON.stringify(next) === JSON.stringify(defaultField(f.id))) resetField(f.id);
                    else setField(f.id, next);
                    setOpen(null);
                  }}
                  onReset={() => {
                    if (confirm(`Вернуть проверку «${f.label}» по умолчанию — код, настройки и пример?`)) {
                      resetField(f.id);
                      setOpen(null);
                    }
                  }}
                  onClose={() => setOpen(null)}
                />
              )}
            </section>
          );
        })}

        <section className={`card rule ${open === 'library' ? 'rule--open' : ''}`}>
          <button className="rule__head" onClick={() => setOpen(open === 'library' ? null : 'library')} aria-expanded={open === 'library'}>
            {open === 'library' ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span className="rule__title">Моя библиотека — свои функции на Lua</span>
            {store.stored?.library !== undefined && <span className="badge badge--updated">изменено</span>}
            {ctx.checker.libraryError && <span className="badge badge--error">ошибка в коде</span>}
          </button>
          {open === 'library' && (
            <LibraryEditor
              key={checks.library}
              checks={checks}
              trees={trees}
              custom={store.stored?.library !== undefined}
              readOnly={readOnly}
              onSave={(code) => {
                store.setLibrary(code === DEFAULT_LIBRARY ? undefined : code);
                setOpen(null);
              }}
            />
          )}
        </section>
      </div>

      <details className="card card--flat">
        <summary>
          Сокращения — встроены все ({ABBREVIATIONS.length}) · по ним ячейка дробится на части
        </summary>
        <div className="abbr-grid">
          {Object.entries(ABBR_GROUPS).map(([g, title]) => {
            const list = ABBREVIATIONS.filter((a) => a.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <strong className="small">{title}</strong>
                <div className="small">
                  {list.map((a) => (
                    <div key={a.abbr + a.title}>
                      <span className="mono">{a.after ? `… ${a.abbr}` : `${a.abbr} …`}</span> <span className="muted">{a.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </details>
      <p className="small faint" style={{ margin: 0 }}>
        Хранится в рабочей папке: «Проверка анкет/checks.json» — только то, что изменено.
      </p>
    </div>
  );
}
