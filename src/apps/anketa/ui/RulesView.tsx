import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FIELD_BY_ID, PERSON_FIELDS } from '@/core/schema/fields';
import { ABBR_GROUPS, ABBREVIATIONS } from '@/shared/cell/abbr';
import { compileRegex, PRESETS, suggestFix } from '@/shared/cell/format';
import { parseOrder, registrationTemplate } from '@/shared/cell/template';
import { Alert } from '@/ui/Alert';
import { allTreeNames, DEFAULT_EXAMPLES, defaultRules, KIND_LABELS, treeNameOf, type FieldKind, type FieldRule } from '../model/rules';
import { useRules } from './hooks';
import { TemplateEditor } from './TemplateEditor';

const label = (id: string) => FIELD_BY_ID.get(id)?.label ?? id;

function Summary({ id, rule, rules }: { id: string; rule: FieldRule; rules: Record<string, FieldRule> }) {
  const tree = treeNameOf(id, rules);
  return (
    <span className="rule-sum">
      <span className={`badge badge--kind-${rule.kind}`}>{KIND_LABELS[rule.kind]}</span>
      {rule.kind === 'tree' && rule.template && (
        <span className="small muted">
          {parseOrder(rule.template.order, rule.template.keys.length)
            .order.map((i) => rule.template!.keys[i]?.title)
            .join(' → ')}
        </span>
      )}
      {rule.kind !== 'tree' && rule.example && <span className="small muted mono">{rule.example}</span>}
      {rule.kind === 'list' && tree && <span className="small faint">база «{tree}»</span>}
      {rule.within && <span className="chip small">внутри «{label(rule.within)}»</span>}
      {!rule.required && <span className="chip small">можно пусто</span>}
      {(rule.confirm || rule.unique) && <span className="chip chip--confirm small">галочка у каждого</span>}
      {rule.unique && <span className="chip chip--unique small">уникальное{rule.uniqueWith?.length ? ` (с: ${rule.uniqueWith.map(label).join(', ')})` : ''}</span>}
    </span>
  );
}

function RegexTester({ rule }: { rule: FieldRule }) {
  const [v, setV] = useState('');
  const { re, error } = compileRegex(rule.regex);
  if (error) return <span className="field__error">Ошибка в regex: {error}</span>;
  if (!v) return <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="Проверить значение…" />;
  const ok = !re || re.test(v);
  const fix = !ok && re ? suggestFix(v, re, rule.mask) : null;
  return (
    <div className="stack stack--s">
      <input className={`input ${ok ? '' : 'input--error'}`} value={v} onChange={(e) => setV(e.target.value)} placeholder="Проверить значение…" />
      <span className="small" style={{ color: ok ? 'var(--success)' : 'var(--error)' }}>
        {ok ? 'Подходит' : 'Не подходит'}
        {fix && (
          <span className="muted">
            {' '}
            · исправление: <span className="mono">{fix}</span>
          </span>
        )}
      </span>
    </div>
  );
}

function FieldEditor({ id, initial, rules, custom, onSave, onReset, onClose }: { id: string; initial: FieldRule; rules: Record<string, FieldRule>; custom: boolean; onSave: (r: FieldRule) => void; onReset: () => void; onClose: () => void }) {
  const [r, setR] = useState<FieldRule>(() => structuredClone(initial));
  const set = (patch: Partial<FieldRule>) => setR((x) => ({ ...x, ...patch }));
  const { error } = compileRegex(r.regex);
  const preset = PRESETS.find((p) => p.regex === r.regex);
  const listFields = PERSON_FIELDS.filter((f) => f.id !== id && rules[f.id]?.kind === 'list');
  const treeNames = allTreeNames(rules);
  const orderError = r.kind === 'tree' && r.template ? parseOrder(r.template.order, r.template.keys.length).error : undefined;

  const setKind = (kind: FieldKind) => {
    if (kind === 'tree' && !r.template) set({ kind, template: { ...registrationTemplate(), tree: label(id) } });
    else set({ kind });
  };

  return (
    <div className="rule-editor stack">
      <div className="field">
        <span className="field__label">Как проверять</span>
        <div className="segmented" role="group">
          {(Object.keys(KIND_LABELS) as FieldKind[]).map((k) => (
            <button type="button" key={k} aria-pressed={r.kind === k} onClick={() => setKind(k)}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <span className="field__hint">
          {r.kind === 'text' && 'Значение должно проходить формат (regex). В базе не хранится.'}
          {r.kind === 'list' && 'Формат (regex) + значение должно быть в базе («ключ:значение»). Новое — предупреждение и «Подтвердить».'}
          {r.kind === 'tree' && 'Ячейка дробится на части по конструктору, части сверяются с древом — каждая внутри предыдущей.'}
        </span>
      </div>

      {r.kind !== 'tree' && (
        <>
          <div className="grid-2">
            <label className="field">
              <span className="field__label">Готовый формат</span>
              <select
                className="select"
                value={preset?.id ?? ''}
                onChange={(e) => {
                  const p = PRESETS.find((x) => x.id === e.target.value);
                  if (p) set({ regex: p.regex, example: p.example, mask: p.mask });
                }}
              >
                <option value="">— свой —</option>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.example ? ` — ${p.example}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Пример правильного значения</span>
              <input className="input" value={r.example} onChange={(e) => set({ example: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span className="field__label">Формат (regex)</span>
            <input className={`input mono ${error ? 'input--error' : ''}`} value={r.regex} onChange={(e) => set({ regex: e.target.value })} placeholder="пусто — любое значение" />
            {error ? <span className="field__error">{error}</span> : <span className="field__hint">Регулярное выражение JavaScript. ^ и $ — начало и конец значения.</span>}
          </label>
          <div className="grid-2">
            <label className="field">
              <span className="field__label">Маска для исправления</span>
              <input className="input mono" value={r.mask ?? ''} onChange={(e) => set({ mask: e.target.value || undefined })} placeholder="8(999)999-99-99" />
              <span className="field__hint">9 — цифра. По маске предлагается исправление: «80000000000» → «8(000)000-00-00».</span>
            </label>
            <div className="field">
              <span className="field__label">Проверка</span>
              <RegexTester rule={r} />
            </div>
          </div>
        </>
      )}

      {r.kind === 'list' && (
        <label className="field">
          <span className="field__label">Хранить внутри значения другого поля</span>
          <select className="select" value={r.within ?? ''} onChange={(e) => set({ within: e.target.value || undefined })}>
            <option value="">— нет, просто список —</option>
            {listFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="field__hint">Например, «Кем выдан паспорт» внутри «Код подразделения»: для кода 190-000 верно только то, что подтверждено для него.</span>
        </label>
      )}

      {r.kind === 'tree' && (
        <label className="field">
          <span className="field__label">Пример правильного значения</span>
          <input className="input" value={r.example} onChange={(e) => set({ example: e.target.value })} />
        </label>
      )}

      {r.kind === 'tree' && r.template && <TemplateEditor value={r.template} onChange={(template) => set({ template })} treeNames={treeNames} example={r.example} />}

      <div className="field">
        <span className="field__label">Подтверждение</span>
        <label className="check">
          <input type="checkbox" checked={r.required} onChange={(e) => set({ required: e.target.checked })} /> Обязательное — пустое значение будет ошибкой
        </label>
        <label className="check">
          <input type="checkbox" checked={r.confirm || r.unique} disabled={r.unique} onChange={(e) => set({ confirm: e.target.checked })} /> Индивидуальное — всегда предупреждение и
          отдельная галочка у каждого человека
        </label>
        <label className="check">
          <input type="checkbox" checked={r.unique} onChange={(e) => set({ unique: e.target.checked })} /> Уникальное — то же значение у другого человека (в таблице или в базе
          людей) будет ошибкой
        </label>
        {r.unique && r.uniqueWith?.length ? <span className="field__hint">Сравнивается вместе с: {r.uniqueWith.map(label).join(', ')}.</span> : null}
      </div>

      <div className="row">
        <button className="btn btn--primary" onClick={() => onSave(r)} disabled={!!error || !!orderError}>
          Сохранить
        </button>
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
        <span className="spacer" />
        {custom && (
          <button className="btn btn--ghost" onClick={onReset}>
            <RotateCcw size={16} /> По умолчанию
          </button>
        )}
      </div>
    </div>
  );
}

/** Все примеры в одном месте: что показывать в подсказках «Пример: …». */
function ExamplesEditor({ rules, readOnly, setField, resetField, defaults }: { rules: Record<string, FieldRule>; readOnly: boolean; setField: (id: string, r: FieldRule) => void; resetField: (id: string) => void; defaults: Record<string, FieldRule> }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const value = (id: string) => draft[id] ?? rules[id].example;
  const commit = (id: string) => {
    const v = draft[id];
    if (v === undefined || v === rules[id].example) return;
    const next = { ...rules[id], example: v };
    // Если правило после правки совпадает с умолчанием — храним как «не менялось».
    if (JSON.stringify(next) === JSON.stringify(defaults[id])) resetField(id);
    else setField(id, next);
    setDraft((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
  };
  const changed = PERSON_FIELDS.filter((f) => rules[f.id].example !== DEFAULT_EXAMPLES[f.id]);
  const resetAll = () => {
    if (!confirm('Вернуть все примеры по умолчанию?')) return;
    for (const f of changed) {
      const next = { ...rules[f.id], example: DEFAULT_EXAMPLES[f.id] };
      if (JSON.stringify(next) === JSON.stringify(defaults[f.id])) resetField(f.id);
      else setField(f.id, next);
    }
    setDraft({});
  };
  const check = (id: string, v: string) => {
    const r = rules[id];
    if (!v || r.kind === 'tree') return true;
    const { re } = compileRegex(r.regex);
    return !re || re.test(v);
  };
  return (
    <details className="card card--flat examples">
      <summary>
        Примеры значений{changed.length ? ` · изменено: ${changed.length}` : ''} — показываются в подсказках «Пример: …»
      </summary>
      <p className="small muted">
        По умолчанию — нейтральные заготовки, а не чьи-то данные. Перепишите, если нужно: например, свой формат названия отряда.
        Пример, который не проходит правило столбца, подсвечен.
      </p>
      <div className="examples__grid">
        {PERSON_FIELDS.map((f, i) => {
          const v = value(f.id);
          return (
            <label key={f.id} className="examples__row">
              <span className="small">
                <span className="faint">{i + 1}.</span> {f.label}
              </span>
              <input
                className={`input input--sm ${check(f.id, v) ? '' : 'input--error'}`}
                value={v}
                disabled={readOnly}
                onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                onBlur={() => commit(f.id)}
                onKeyDown={(e) => e.key === 'Enter' && commit(f.id)}
              />
            </label>
          );
        })}
      </div>
      {changed.length > 0 && (
        <button className="btn btn--sm btn--ghost" onClick={resetAll} disabled={readOnly} style={{ marginTop: 8 }}>
          <RotateCcw size={14} /> Вернуть примеры по умолчанию
        </button>
      )}
    </details>
  );
}

export function RulesView() {
  const { rules, loaded, readOnly, error, setField, resetField, isCustom } = useRules();
  const [open, setOpen] = useState<string | null>(null);
  const defaults = useMemo(() => defaultRules(), []);

  if (!loaded) return <div className="loading">Загрузка правил…</div>;

  return (
    <div className="stack">
      {error && <Alert kind="error">{error}</Alert>}
      {readOnly && <Alert kind="warning">Правила сохранены более новой версией DocAssist — сейчас только просмотр.</Alert>}
      <p className="muted" style={{ margin: 0 }}>
        У каждого столбца анкеты своё правило: формат (regex), список значений из базы («ключ:значение») или древо с
        конструктором. База сначала пустая — значения попадают в неё, когда вы их подтверждаете. Индивидуальное (паспорт, СНИЛС,
        телефон…) всегда подтверждается галочкой у каждого человека.
      </p>

      <ExamplesEditor rules={rules} readOnly={readOnly} setField={setField} resetField={resetField} defaults={defaults} />

      <div className="rules-list">
        {PERSON_FIELDS.map((f, i) => {
          const rule = rules[f.id];
          const isOpen = open === f.id;
          return (
            <section key={f.id} className={`card rule ${isOpen ? 'rule--open' : ''}`}>
              <button className="rule__head" onClick={() => setOpen(isOpen ? null : f.id)} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span className="rule__num faint">{i + 1}.</span>
                <span className="rule__title">{f.label}</span>
                {isCustom(f.id) && <span className="badge badge--updated">изменено</span>}
                <Summary id={f.id} rule={rule} rules={rules} />
              </button>
              {isOpen && (
                <FieldEditor
                  key={JSON.stringify(rule)}
                  id={f.id}
                  initial={rule}
                  rules={rules}
                  custom={isCustom(f.id)}
                  onSave={(r) => {
                    if (readOnly) return;
                    setField(f.id, r);
                    setOpen(null);
                  }}
                  onReset={() => {
                    if (readOnly) return;
                    if (confirm(`Вернуть правило «${f.label}» по умолчанию?`)) {
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
        Правила по умолчанию: {Object.keys(defaults).length} столбцов. Хранятся в рабочей папке: «Проверка анкет/rules.json».
      </p>
    </div>
  );
}
