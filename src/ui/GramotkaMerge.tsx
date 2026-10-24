import { diffKey, type DiffItem, type MergeChoice } from '@/core/gramotka/compare';
import { APPS } from '@/core/registry/apps';
import { fieldLabel } from '@/core/schema/fields';
import { formatBytes, formatDateTime } from '@/core/util/format';

/*
 * Две копии одной грамотки разошлись (правили и здесь, и там): что оставить. По каждому различию — «у вас» или
 * «в пришедшей». Ничего не выбрано — остаётся ваше.
 */

function title(d: DiffItem): string {
  if (d.kind === 'field') return fieldLabel(d.id);
  if (d.kind === 'section') return `${APPS.find((a) => a.id === d.id)?.title ?? d.id}: сведения`;
  return `Файл «${d.id}»`;
}

function value(d: DiffItem, side: 'mine' | 'theirs'): string {
  const v = d[side];
  if (v === undefined || v === '') return 'нет';
  if (d.kind === 'field') return String(v);
  if (d.kind === 'section') return 'другие сведения';
  const f = v as { size: number; modified: number };
  return `${formatBytes(f.size)}, ${formatDateTime(f.modified)}`;
}

export function GramotkaMerge({ diff, choice, onChoice }: { diff: DiffItem[]; choice: MergeChoice; onChoice: (c: MergeChoice) => void }) {
  const set = (d: DiffItem, side: 'mine' | 'theirs') => onChoice({ ...choice, [diffKey(d)]: side });
  return (
    <div className="stack stack--s">
      <div className="row small">
        <span className="spacer muted">Копии разошлись — выберите, что оставить.</span>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChoice(Object.fromEntries(diff.map((d) => [diffKey(d), 'mine'])))}>
          Всё моё
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChoice(Object.fromEntries(diff.map((d) => [diffKey(d), 'theirs'])))}>
          Всё из пришедшей
        </button>
      </div>
      <div className="list">
        {diff.map((d) => {
          const k = diffKey(d);
          const side = choice[k] ?? 'mine';
          return (
            <div key={k} className="list__item merge-row">
              <div className="list__main">
                <div className="list__title small">{title(d)}</div>
                <div className="row row--nowrap merge-row__sides">
                  <label className={`check small ${side === 'mine' ? 'is-selected' : ''}`}>
                    <input type="radio" name={k} checked={side === 'mine'} onChange={() => set(d, 'mine')} /> У вас: {value(d, 'mine')}
                  </label>
                  <label className={`check small ${side === 'theirs' ? 'is-selected' : ''}`}>
                    <input type="radio" name={k} checked={side === 'theirs'} onChange={() => set(d, 'theirs')} /> В пришедшей: {value(d, 'theirs')}
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
