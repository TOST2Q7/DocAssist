import { useState } from 'react';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { Modal } from '@/ui/Modal';
import { Diff } from './Marks';

export interface Change {
  row: number;
  col: number;
  from: string;
  to: string;
  orig: string;
  who?: string;
  fieldId: string | null;
  header: string;
}

/** Подтверждение пакетных исправлений: видно каждое изменение, можно снять галочку. */
export function FixAllDialog({ changes, onApply, onClose }: { changes: Change[]; onApply: (c: Change[]) => void; onClose: () => void }) {
  const [off, setOff] = useState<Set<number>>(new Set());
  const chosen = changes.filter((_, i) => !off.has(i));
  const toggle = (i: number) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  return (
    <Modal
      title={`Исправления: ${changes.length}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" disabled={!chosen.length} onClick={() => onApply(chosen)}>
            Применить ({chosen.length})
          </button>
        </>
      }
    >
      {changes.length === 0 ? (
        <p className="muted">Автоматических исправлений нет — остальное нужно поправить вручную.</p>
      ) : (
        <div className="stack stack--s">
          <div className="row small">
            <button className="btn btn--sm btn--ghost" onClick={() => setOff(new Set())}>
              Выбрать всё
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => setOff(new Set(changes.map((_, i) => i)))}>
              Снять всё
            </button>
          </div>
          {changes.map((c, i) => (
            <label key={`${c.row}:${c.col}`} className="fix-item">
              <input type="checkbox" checked={!off.has(i)} onChange={() => toggle(i)} />
              <div className="fix-item__body">
                <div className="small muted">
                  {c.who ? `${c.who} · ` : ''}
                  {(c.fieldId && FIELD_BY_ID.get(c.fieldId)?.label) || c.header}
                </div>
                <Diff from={c.from} to={c.to} />
              </div>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
