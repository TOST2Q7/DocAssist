import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  BASIC_BLOCKS,
  BLOCK_HINTS,
  BLOCK_TITLES,
  blocksMask,
  checkBlocks,
  describeBlock,
  describeBlocks,
  describeFormat,
  findPreset,
  FORMAT_PRESETS,
  matcher,
  newBlock,
  READY_BLOCKS,
  sampleOf,
  type Block,
  type BlockType,
  type CaseMode,
  type Count,
  type FormatPreset,
  type QuotesMode,
} from '@/shared/cell/blocks';
import { suggestFix } from '@/shared/cell/format';

/*
 * Формат значения — мини-язык блоков. Значение собирается из блоков по порядку:
 * «Текст 8(» · «Цифры 3» · «Текст )» … Под блоками — что получилось словами и пример.
 */

const num = (v: string, fallback: number) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : fallback);

function CountInput({ count, onChange, unit }: { count: Count; onChange: (c: Count) => void; unit: string }) {
  return (
    <span className="blk__count">
      <span className="muted">{unit}: от</span>
      <input className="input input--sm" inputMode="numeric" value={count.min} onChange={(e) => onChange({ ...count, min: num(e.target.value, 0) })} aria-label="от" />
      <span className="muted">до</span>
      <input
        className="input input--sm"
        inputMode="numeric"
        value={count.max ?? ''}
        placeholder="∞"
        onChange={(e) => onChange({ ...count, max: e.target.value.trim() === '' ? null : num(e.target.value, count.min) })}
        aria-label="до"
        title="Пусто — без ограничения"
      />
    </span>
  );
}

function Check({ checked, onChange, children, title }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <label className="check" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children}
    </label>
  );
}

function BlockBody({ b, set }: { b: Block; set: (patch: Partial<Block>) => void }) {
  switch (b.type) {
    case 'text':
      return <input className="input input--sm mono blk__text" value={b.text} onChange={(e) => set({ text: e.target.value })} placeholder="например: 8(" aria-label="Текст" />;
    case 'digits':
      return <CountInput count={b.count} unit="сколько" onChange={(count) => set({ count })} />;
    case 'number':
      return (
        <span className="blk__count">
          <span className="muted">от</span>
          <input className="input input--sm" inputMode="numeric" value={b.from} onChange={(e) => set({ from: num(e.target.value, 0) })} aria-label="Число от" />
          <span className="muted">до</span>
          <input className="input input--sm" inputMode="numeric" value={b.to} onChange={(e) => set({ to: num(e.target.value, b.from) })} aria-label="Число до" />
          <span className="small faint">все цифры подряд — одно число: «15» — это 15, а не 1 и 5; без нулей впереди</span>
        </span>
      );
    case 'chars':
      return (
        <span className="blk__chars">
          <Check checked={b.ru} onChange={(ru) => set({ ru })}>
            русские
          </Check>
          <Check checked={b.en} onChange={(en) => set({ en })}>
            латинские
          </Check>
          <Check checked={b.digits} onChange={(digits) => set({ digits })}>
            цифры
          </Check>
          <input className="input input--sm mono blk__extra" value={b.extra} onChange={(e) => set({ extra: e.target.value })} placeholder="свои: -._" aria-label="Свои символы" />
          <select className="select select--sm" value={b.case} onChange={(e) => set({ case: e.target.value as CaseMode })} aria-label="Регистр">
            <option value="any">любой регистр</option>
            <option value="cap">первая заглавная</option>
            <option value="lower">строчные</option>
            <option value="upper">заглавные</option>
          </select>
          <CountInput count={b.count} unit="сколько" onChange={(count) => set({ count })} />
        </span>
      );
    case 'oneof':
      return (
        <textarea
          className="input input--sm blk__options"
          rows={Math.min(5, Math.max(2, b.options.length))}
          value={b.options.join('\n')}
          onChange={(e) => set({ options: e.target.value.split('\n') })}
          placeholder={'Каждый вариант — с новой строки'}
          aria-label="Варианты"
        />
      );
    case 'anytext':
      return (
        <span className="blk__chars">
          <Check checked={!!b.cap} onChange={(cap) => set({ cap: cap || undefined })} title="Первая буква заглавная (или цифра)">
            с заглавной
          </Check>
          <Check checked={!!b.ru} onChange={(ru) => set({ ru: ru || undefined })} title="Только русские буквы, цифры и дефис — без точек, кавычек и латиницы">
            только русские буквы, цифры, дефис
          </Check>
          {!b.ru && (
            <select className="select select--sm" value={b.quotes ?? 'any'} onChange={(e) => set({ quotes: e.target.value === 'any' ? undefined : (e.target.value as QuotesMode) })} aria-label="Кавычки">
              <option value="any">кавычки любые</option>
              <option value="guillemets">кавычки только «ёлочки»</option>
              <option value="none">без кавычек</option>
            </select>
          )}
          <span className="small faint">слова через один пробел</span>
        </span>
      );
    case 'word':
      return (
        <span className="blk__chars">
          <Check checked={b.hyphen} onChange={(hyphen) => set({ hyphen })}>
            можно двойное через дефис: «Петрова-Водкина»
          </Check>
        </span>
      );
    case 'house':
      return (
        <span className="blk__chars">
          <Check checked={b.slash} onChange={(slash) => set({ slash })}>
            можно через дробь: «12/3», «12а/1б»
          </Check>
          <span className="small faint">{b.slash ? '1, 12а, 12/3' : '1, 12а'}</span>
        </span>
      );
    case 'date':
      return (
        <span className="blk__count">
          <span className="muted">ДД.ММ.ГГГГ, годы от</span>
          <input className="input input--sm" inputMode="numeric" value={b.yearFrom} onChange={(e) => set({ yearFrom: num(e.target.value, b.yearFrom) })} aria-label="Год от" />
          <span className="muted">до</span>
          <input className="input input--sm" inputMode="numeric" value={b.yearTo} onChange={(e) => set({ yearTo: num(e.target.value, b.yearTo) })} aria-label="Год до" />
          <span className="small faint">несуществующие даты (31.04, 30.02) не пройдут</span>
        </span>
      );
    case 'time':
      return (
        <span className="blk__chars">
          <Check checked={b.seconds} onChange={(seconds) => set({ seconds })}>
            с секундами: ЧЧ:ММ:СС
          </Check>
        </span>
      );
    case 'space':
    case 'email':
      return <span className="small faint">{BLOCK_HINTS[b.type]}</span>;
  }
}

/** Как исправляется по цифрам: «8(999)999-99-99» → «8(___)___-__-__». */
const maskView = (mask: string) => mask.replace(/9/g, '_');

export function BlocksEditor({ blocks, onChange }: { blocks: Block[]; onChange: (blocks: Block[]) => void }) {
  const setAt = (i: number, patch: Partial<Block>) => onChange(blocks.map((b, j) => (j === i ? ({ ...b, ...patch } as Block) : b)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const problems = checkBlocks(blocks);
  const sample = sampleOf(blocks);
  const mask = blocksMask(blocks);
  const addRow = (title: string, types: BlockType[]) => (
    <div className="row small blk__add">
      <span className="faint blk__add-cap">
        <Plus size={14} /> {title}
      </span>
      {types.map((t) => (
        <button key={t} type="button" className="btn btn--sm" onClick={() => onChange([...blocks, newBlock(t)])} title={BLOCK_HINTS[t]}>
          {BLOCK_TITLES[t]}
        </button>
      ))}
    </div>
  );

  return (
    <div className="blocks stack stack--s">
      {blocks.length === 0 && <div className="small muted">Блоков нет — подходит любое значение. Добавьте первый блок или выберите готовый формат.</div>}
      {blocks.map((b, i) => (
        <div key={i} className="blk card card--flat">
          <div className="blk__head">
            <span className="blk__num">{i + 1}</span>
            <strong className="small nowrap" title={BLOCK_HINTS[b.type]}>
              {BLOCK_TITLES[b.type]}
            </strong>
            <span className="blk__ctrl">
              <label className="check small" title="Блока может не быть">
                <input type="checkbox" checked={!!b.optional} onChange={(e) => setAt(i, { optional: e.target.checked || undefined })} /> необязательно
              </label>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Выше">
                <ArrowUp size={14} />
              </button>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Ниже">
                <ArrowDown size={14} />
              </button>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => onChange(blocks.filter((_, j) => j !== i))} aria-label={`Удалить блок ${i + 1}`}>
                <X size={14} />
              </button>
            </span>
          </div>
          <div className="blk__body">
            <BlockBody b={b} set={(patch) => setAt(i, patch)} />
          </div>
        </div>
      ))}
      {addRow('Основные:', BASIC_BLOCKS)}
      {addRow('Готовые:', READY_BLOCKS)}
      {problems.map((p) => (
        <span key={p} className="field__warn">
          {p}
        </span>
      ))}
      {blocks.length > 0 && (
        <div className="small blk__result">
          <div>
            <span className="muted">Значение: </span>
            {describeBlocks(blocks)}
          </div>
          {sample && (
            <div>
              <span className="muted">Например: </span>
              <span className="mono">{sample}</span>
            </div>
          )}
          {mask && (
            <div>
              <span className="muted">Исправление по цифрам: </span>
              <span className="mono">{maskView(mask)}</span>
              <span className="faint"> — цифры из неправильного значения раскладываются по местам «_»</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Проверить значение по формату: подходит или нет, и какое исправление будет предложено. */
export function FormatTester({ blocks }: { blocks: Block[] }) {
  const [v, setV] = useState('');
  const m = matcher(blocks);
  const ok = m.test(v);
  const why = v && !ok ? m.explain(v) : null;
  const split = v && ok && blocks.length > 1 ? m.split(v) : null;
  const fix = v && !ok ? suggestFix(v, m.test, blocksMask(blocks)) : null;
  // Поле ввода всегда одно и то же — иначе при первом символе оно пересоздаётся и теряет курсор.
  return (
    <div className="stack stack--s">
      <input className={`input ${v && !ok ? 'input--error' : ''}`} value={v} onChange={(e) => setV(e.target.value)} placeholder="Проверить значение…" aria-label="Проверить значение" />
      {v && (
        <span className="small tester__verdict" style={{ color: ok ? 'var(--success)' : 'var(--error)' }}>
          {ok ? 'Подходит' : `Не подходит${why ? `: ${why.text}` : ''}`}
        </span>
      )}
      {fix && (
        <span className="small muted">
          Исправление: <span className="mono">{fix}</span>
        </span>
      )}
      {split && (
        <div className="tester__split small" aria-label="Разбор по блокам">
          {split.map((part, i) =>
            part ? (
              <span key={i} className="tester__part" title={describeBlock(blocks[i])}>
                <span className="faint">{i + 1}</span> <span className="mono">{part === ' ' ? '␣' : part}</span>
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Формат: готовый (выпадающий список) или свой из блоков.
 * compact — для частей конструктора: одна строка с готовым форматом, блоки раскрываются по кнопке.
 */
export function FormatEditor({
  value,
  onChange,
  presets = FORMAT_PRESETS,
  onPreset,
  compact,
  label = 'Готовый формат',
}: {
  value: Block[];
  onChange: (blocks: Block[]) => void;
  presets?: FormatPreset[];
  onPreset?: (p: FormatPreset) => void;
  compact?: boolean;
  label?: string;
}) {
  const preset = findPreset(value, presets);
  const current = preset?.id ?? (value.length ? 'custom' : 'any');
  const [open, setOpen] = useState(!compact);
  const select = (
    <select
      className={`select fmt__select ${compact ? 'select--sm' : ''}`}
      value={current}
      aria-label={label}
      onChange={(e) => {
        const id = e.target.value;
        if (id === 'any') onChange([]);
        if (id === 'custom') setOpen(true);
        const p = presets.find((x) => x.id === id);
        if (p) {
          onChange(structuredClone(p.blocks));
          onPreset?.(p);
        }
      }}
    >
      <option value="any">Любое значение</option>
      {presets.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
          {p.example ? ` — ${p.example}` : ''}
        </option>
      ))}
      <option value="custom">{current === 'custom' ? 'Свой — из блоков ниже' : 'Свой — собрать из блоков…'}</option>
    </select>
  );

  if (!compact) {
    return (
      <div className="fmt stack stack--s">
        <label className="field">
          <span className="field__label">{label}</span>
          {select}
          <span className="field__hint">Готовый формат подставляет блоки — их можно поправить. Или соберите свой из блоков.</span>
        </label>
        <BlocksEditor blocks={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="fmt stack stack--s">
      <div className="fmt__line">
        <span className="small muted key-row__cap">Формат:</span>
        {select}
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Блоки{value.length ? ` (${value.length})` : ''}
        </button>
      </div>
      {!open && current === 'custom' && <span className="small muted">{describeFormat(value)}</span>}
      {open && <BlocksEditor blocks={value} onChange={onChange} />}
    </div>
  );
}
