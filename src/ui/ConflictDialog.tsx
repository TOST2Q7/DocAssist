import { Cloud, Copy, MonitorSmartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatStamp, isThisDevice } from '@/core/device/device';
import type { Conflict, ConflictChoice, ConflictSide } from '@/core/device/sync';
import { Modal } from './Modal';

/*
 * Расхождения «устройство ↔ Google Диск»: у каждой версии — дата, время и устройство последнего изменения.
 * Человек выбирает, какая версия верная, и переписывать ли другую сторону.
 */

interface Props {
  conflicts: Conflict[];
  /** Как называть другую сторону: «на Google Диске» / «с Google Диска» (по умолчанию). */
  remote?: { in: string; from: string };
  onResolve: (choices: ConflictChoice[]) => void;
  onClose: () => void;
}

function Side({ side, icon, title, selected, onClick }: { side: ConflictSide; icon: ReactNode; title: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`choice ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={onClick}>
      <span className="choice__icon">{icon}</span>
      <span className="choice__text">
        <span className="choice__title">{title}</span>
        <span className="choice__hint">
          Изменено: {formatStamp(side.stamp)}
          {isThisDevice(side.stamp) ? ' (это устройство)' : ''}
        </span>
        {side.details && <span className="choice__hint">{side.details}</span>}
        {side.imageUrl && <img className="conflict__img" src={side.imageUrl} alt="" />}
      </span>
    </button>
  );
}

export function ConflictDialog({ conflicts, remote = { in: 'на Google Диске', from: 'с Google Диска' }, onResolve, onClose }: Props) {
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const get = (c: Conflict): ConflictChoice | undefined => choices[c.id];
  const set = (c: Conflict, patch: Partial<ConflictChoice>) =>
    setChoices((x) => {
      const cur: ConflictChoice = x[c.id] ?? { id: c.id, keep: 'local', overwrite: true };
      return { ...x, [c.id]: { ...cur, ...patch } };
    });
  const all = (keep: 'local' | 'remote') => setChoices(Object.fromEntries(conflicts.map((c) => [c.id, { id: c.id, keep, overwrite: true }])));
  const ready = conflicts.every((c) => get(c));

  return (
    <Modal
      title={conflicts.length === 1 ? 'Версии разошлись' : `Версии разошлись: ${conflicts.length}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Решить позже
          </button>
          <span className="spacer" />
          <button className="btn btn--primary" disabled={!ready} onClick={() => onResolve(conflicts.map((c) => get(c)!))}>
            Применить
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Это изменили и на этом устройстве, и {remote.in} — по-разному. Выберите, какая
          версия верная. Ничего не меняется, пока вы не нажмёте «Применить».
        </p>
        {conflicts.length > 1 && (
          <div className="row">
            <span className="small muted">Для всех:</span>
            <button className="btn btn--sm" onClick={() => all('local')}>
              <MonitorSmartphone size={14} /> С этого устройства
            </button>
            <button className="btn btn--sm" onClick={() => all('remote')}>
              <Cloud size={14} /> {remote.from[0].toUpperCase() + remote.from.slice(1)}
            </button>
          </div>
        )}
        {conflicts.map((c) => {
          const ch = get(c);
          return (
            <section key={c.id} className="card card--flat stack stack--s">
              <strong>{c.title}</strong>
              <div className="choice-grid">
                <Side side={c.local} icon={<MonitorSmartphone size={20} />} title="На этом устройстве" selected={ch?.keep === 'local'} onClick={() => set(c, { keep: 'local', ...(ch?.keep !== 'remote' && ch?.keep !== 'local' ? { overwrite: true } : {}) })} />
                <Side side={c.remote} icon={<Cloud size={20} />} title={remote.in[0].toUpperCase() + remote.in.slice(1)} selected={ch?.keep === 'remote'} onClick={() => set(c, { keep: 'remote', ...(ch?.keep !== 'remote' && ch?.keep !== 'local' ? { overwrite: true } : {}) })} />
                {c.allowBoth && (
                  <button type="button" className={`choice ${ch?.keep === 'both' ? 'is-selected' : ''}`} aria-pressed={ch?.keep === 'both'} onClick={() => set(c, { keep: 'both', overwrite: false })}>
                    <Copy size={20} className="choice__icon" />
                    <span className="choice__text">
                      <span className="choice__title">Оставить обе</span>
                      <span className="choice__hint">Версия {remote.from} сохранится рядом отдельным файлом</span>
                    </span>
                  </button>
                )}
              </div>
              {ch && ch.keep !== 'both' && (
                <label className="check small">
                  <input type="checkbox" checked={ch.overwrite} onChange={(e) => set(c, { overwrite: e.target.checked })} />
                  {ch.keep === 'local'
                    ? `Перезаписать ${remote.in} версией с этого устройства`
                    : `Заменить на этом устройстве версией ${remote.from}`}
                </label>
              )}
              {ch && ch.keep !== 'both' && !ch.overwrite && <div className="small muted">Другая сторона останется как есть; расхождение покажется снова, только если что-то изменится.</div>}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
