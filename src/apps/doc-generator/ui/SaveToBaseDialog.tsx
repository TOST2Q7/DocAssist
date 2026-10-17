import { DatabaseZap } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/ui/Modal';

export interface BaseChange {
  id: string;
  label: string;
  /** Что сейчас в базе ('' — нет). */
  from: string;
  to: string;
}

interface Props {
  name: string;
  /** Человека ещё нет в базе — будет добавлен. */
  isNew: boolean;
  changes: BaseChange[];
  onClose: () => void;
  onSave: (changes: BaseChange[]) => void;
}

/** Что дописать в базу людей: недостающее отмечено сразу, изменённое — по выбору. */
export function SaveToBaseDialog({ name, isNew, changes, onClose, onSave }: Props) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(changes.filter((c) => isNew || !c.from).map((c) => c.id)));
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chosen = changes.filter((c) => picked.has(c.id));

  return (
    <Modal
      title={isNew ? 'Добавить в базу людей' : 'Дописать в базу людей'}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={() => onSave(chosen)} disabled={!chosen.length}>
            <DatabaseZap size={16} /> {isNew ? 'Добавить' : 'Дописать'} ({chosen.length})
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          {isNew
            ? `«${name}» ещё нет в базе людей. Отмеченные данные сохранятся новой записью — в следующий раз их не придётся вписывать.`
            : `Отмеченное запишется в базу людей у «${name}». Чего не было — отмечено сразу; изменённые значения заменят прежние, только если их отметить.`}
        </p>
        <div className="list">
          {changes.map((c) => (
            <label key={c.id} className="list__item" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="list__main stack stack--s">
                <span className="list__title">{c.label}</span>
                <span className="list__sub dg-change">
                  {c.from ? (
                    <>
                      <del>{c.from}</del> → <ins>{c.to}</ins>
                    </>
                  ) : (
                    <ins>{c.to}</ins>
                  )}
                </span>
              </span>
              {!isNew && <span className={`badge ${c.from ? 'badge--beta' : 'badge--updated'}`}>{c.from ? 'изменено' : 'не было'}</span>}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
