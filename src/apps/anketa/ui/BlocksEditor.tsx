import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { BLOCK_HINTS, BLOCK_TITLES, blocksToRegex, checkBlocks, describeBlocks, newBlock, type Block, type BlockType, type CaseMode, type Count } from '@/shared/cell/blocks';

/*
 * Конструктор формата — мини-язык блоков. Значение собирается из блоков по порядку:
 * «Текст 8(» · «Цифры 3» · «Текст )» … — и превращается в regex автоматически.
 */

const TYPES = Object.keys(BLOCK_TITLES) as BlockType[];

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
        </span>
      );
    case 'chars':
      return (
        <span className="blk__chars">
          <label className="check">
            <input type="checkbox" checked={b.ru} onChange={(e) => set({ ru: e.target.checked })} /> русские
          </label>
          <label className="check">
            <input type="checkbox" checked={b.en} onChange={(e) => set({ en: e.target.checked })} /> латинские
          </label>
          <label className="check">
            <input type="checkbox" checked={b.digits} onChange={(e) => set({ digits: e.target.checked })} /> цифры
          </label>
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
    case 'space':
    case 'anytext':
      return <span className="small faint">{BLOCK_HINTS[b.type]}</span>;
  }
}

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

  return (
    <div className="blocks stack stack--s">
      {blocks.length === 0 && <div className="small muted">Блоков нет — подходит любое значение. Добавьте первый блок.</div>}
      {blocks.map((b, i) => (
        <div key={i} className="blk card card--flat">
          <div className="blk__head">
            <span className="blk__num">{i + 1}</span>
            <strong className="small nowrap">{BLOCK_TITLES[b.type]}</strong>
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
      <div className="row small">
        <Plus size={14} className="faint" />
        {TYPES.map((t) => (
          <button key={t} type="button" className="btn btn--sm" onClick={() => onChange([...blocks, newBlock(t)])} title={BLOCK_HINTS[t]}>
            {BLOCK_TITLES[t]}
          </button>
        ))}
      </div>
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
          <div>
            <span className="muted">Regex: </span>
            <span className="mono">{blocksToRegex(blocks)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
