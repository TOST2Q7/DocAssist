import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { uid } from '@/core/util/id';
import { ABBR_GROUPS, ABBREVIATIONS, FULL_WORDS } from '@/shared/cell/abbr';
import { compileRegex } from '@/shared/cell/format';
import { parseCell } from '@/shared/cell/parse';
import { parseOrder, type CellKey, type CellTemplate, type KeyTag } from '@/shared/cell/template';

/*
 * Конструктор ячейки-древа — настройка в два пункта:
 *   1. порядок сохранения в древо: «2, 1, 3, *»;
 *   2. части (ключи) по порядку записи в ячейке: описание, приписки как в таблице, формат.
 */

const CATALOG = [...ABBREVIATIONS, ...FULL_WORDS];

function TagChips({ tags, onChange }: { tags: KeyTag[]; onChange: (tags: KeyTag[]) => void }) {
  const [custom, setCustom] = useState('');
  const add = (t: KeyTag) => {
    if (!t.abbr.trim() || tags.some((x) => x.abbr === t.abbr)) return;
    onChange([...tags, t]);
  };
  return (
    <div className="tagchips">
      {tags.length === 0 && <span className="small faint">без приписки</span>}
      {tags.map((t, i) => (
        <span key={t.abbr} className="chip chip--tag" title={`${t.title}. Нажмите, чтобы писать ${t.after ? 'перед' : 'после'} названием`}>
          <button type="button" className="chip__text" onClick={() => onChange(tags.map((x, j) => (j === i ? { ...x, after: !x.after || undefined } : x)))}>
            {t.after ? `… ${t.abbr}` : `${t.abbr} …`}
          </button>
          <button type="button" className="icon-btn icon-btn--sm chip__x" onClick={() => onChange(tags.filter((_, j) => j !== i))} aria-label={`Убрать приписку ${t.abbr}`}>
            <X size={12} />
          </button>
        </span>
      ))}
      <select
        className="select select--sm"
        value=""
        aria-label="Добавить приписку"
        onChange={(e) => {
          const a = CATALOG.find((x) => `${x.group}|${x.abbr}|${x.title}` === e.target.value);
          if (a) add({ abbr: a.abbr, title: a.title, ...(a.after ? { after: true } : {}) });
        }}
      >
        <option value="">+ приписка…</option>
        {Object.entries(ABBR_GROUPS).map(([g, title]) => (
          <optgroup key={g} label={title}>
            {CATALOG.filter((a) => a.group === g).map((a) => (
              <option key={`${a.abbr}|${a.title}`} value={`${a.group}|${a.abbr}|${a.title}`}>
                {a.abbr} — {a.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <form
        className="row row--nowrap"
        onSubmit={(e) => {
          e.preventDefault();
          add({ abbr: custom.trim(), title: custom.trim() });
          setCustom('');
        }}
      >
        <input className="input input--sm" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="своя" aria-label="Своя приписка" style={{ width: 70 }} />
      </form>
    </div>
  );
}

export function TemplateEditor({ value, onChange, treeNames, example }: { value: CellTemplate; onChange: (t: CellTemplate) => void; treeNames: string[]; example?: string }) {
  const [sample, setSample] = useState('');
  const t = value;
  const set = (patch: Partial<CellTemplate>) => onChange({ ...t, ...patch });
  const setKey = (i: number, patch: Partial<CellKey>) => set({ keys: t.keys.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const move = (i: number, d: -1 | 1) => {
    const keys = [...t.keys];
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    set({ keys });
  };

  const order = parseOrder(t.order, t.keys.length);
  const inTree = new Set(order.order);
  const parsed = useMemo(() => (sample.trim() ? parseCell(sample, t) : null), [sample, t]);

  return (
    <div className="stack constructor">
      <div className="grid-2">
        <label className="field">
          <span className="field__label">Древо в базе</span>
          <input className="input" value={t.tree} list="tree-names" onChange={(e) => set({ tree: e.target.value })} />
          <datalist id="tree-names">
            {treeNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <span className="field__hint">Ячейки с одним древом делят базу: регистрация и проживание — «Адреса».</span>
        </label>
        <div className="field">
          <span className="field__label">Части в ячейке разделяются</span>
          <div className="segmented" role="group">
            <button type="button" aria-pressed={t.separator === ', '} onClick={() => set({ separator: ', ' })}>
              запятой: «А, Б»
            </button>
            <button type="button" aria-pressed={t.separator === ' '} onClick={() => set({ separator: ' ' })}>
              пробелом: «А Б»
            </button>
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field__label">1. Порядок записи в древо</span>
        <input className={`input mono ${order.error ? 'input--error' : ''}`} value={t.order} onChange={(e) => set({ order: e.target.value })} placeholder="2, 1, 3, *" />
        {order.error ? (
          <span className="field__error">{order.error}</span>
        ) : (
          <span className="field__hint">
            Номера частей из списка ниже. «*» — все оставшиеся после предыдущего числа. В древе:{' '}
            <strong>{order.order.map((i) => t.keys[i]?.title).join(' → ')}</strong>
            {t.keys.some((_, i) => !inTree.has(i)) && <> · только формат, в древо не сохраняются: {t.keys.filter((_, i) => !inTree.has(i)).map((k) => k.title).join(', ')}</>}
          </span>
        )}
      </div>

      <div className="field">
        <span className="field__label">2. Части ячейки по порядку записи</span>
        <div className="keys">
          {t.keys.map((k, i) => {
            const re = compileRegex(k.regex);
            const level = order.order.indexOf(i);
            return (
              <div key={k.id} className="key-row card card--flat">
                <div className="key-row__num" title={level >= 0 ? `В древе: уровень ${level + 1}` : 'В древо не сохраняется'}>
                  <strong>{i + 1}</strong>
                  <span className="small faint">{level >= 0 ? `ур. ${level + 1}` : '—'}</span>
                </div>
                <div className="key-row__body">
                  <div className="row row--nowrap">
                    <input className="input" value={k.title} onChange={(e) => setKey(i, { title: e.target.value })} aria-label={`Описание части ${i + 1}`} placeholder="Описание" />
                    <button type="button" className="icon-btn icon-btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Выше">
                      <ArrowUp size={16} />
                    </button>
                    <button type="button" className="icon-btn icon-btn--sm" onClick={() => move(i, 1)} disabled={i === t.keys.length - 1} aria-label="Ниже">
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      onClick={() => confirm(`Удалить часть «${k.title}»?`) && set({ keys: t.keys.filter((_, j) => j !== i) })}
                      aria-label={`Удалить часть ${k.title}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="key-row__line">
                    <span className="small muted key-row__cap">В таблице:</span>
                    <TagChips tags={k.tags} onChange={(tags) => setKey(i, { tags })} />
                  </div>
                  <div className="key-row__line">
                    <span className="small muted key-row__cap">Формат:</span>
                    <input className={`input input--sm mono ${re.error ? 'input--error' : ''}`} value={k.regex} onChange={(e) => setKey(i, { regex: e.target.value })} aria-label={`Формат части ${k.title}`} placeholder="regex, пусто — любое" />
                  </div>
                  <div className="row small">
                    <label className="check">
                      <input type="checkbox" checked={k.required} onChange={(e) => setKey(i, { required: e.target.checked })} /> обязательно
                    </label>
                    <label className="check" title="Такое же значение в другой ветке верхнего уровня (например, в другом регионе) — ошибка">
                      <input type="checkbox" checked={!!k.single} onChange={(e) => setKey(i, { single: e.target.checked || undefined })} /> только в одной ветке «{t.keys[order.order[0]]?.title ?? '—'}»
                    </label>
                    <span className="faint">ключ: {k.id}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ keys: [...t.keys, { id: uid('k_'), title: 'Новая часть', tags: [], regex: '', required: false }] })}>
          <Plus size={14} /> Добавить часть
        </button>
      </div>

      <div className="field">
        <span className="field__label">Проверить на примере</span>
        <div className="row row--nowrap">
          <input className="input" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Вставьте значение из таблицы" />
          {example && (
            <button type="button" className="btn btn--sm nowrap" onClick={() => setSample(example)}>
              Подставить пример
            </button>
          )}
        </div>
        {parsed && (
          <div className="stack stack--s" style={{ marginTop: 6 }}>
            <div className="parts">
              {parsed.blocks.map((b, i) => (
                <span key={i} className={`part part--${b.ok ? 'known' : 'error'}`}>
                  <span className="part__level">{b.key !== undefined ? t.keys[b.key]?.title : '?'}</span>
                  <span className="part__text">{b.text}</span>
                </span>
              ))}
            </div>
            {parsed.issues.length ? (
              <ul className="issues small">
                {parsed.issues.map((i, k) => (
                  <li key={k} className="issue issue--error">
                    {i.text}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="small" style={{ color: 'var(--success)' }}>
                Формат верный. Дальше значение сверяется с базой.
              </span>
            )}
            {parsed.canonical !== undefined && parsed.canonical !== sample && (
              <div className="small">
                Правильно: <span className="mono">{parsed.canonical}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
