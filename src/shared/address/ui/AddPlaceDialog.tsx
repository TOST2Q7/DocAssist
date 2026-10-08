import { useMemo, useState } from 'react';
import { ADDR_TYPES } from '../addrTypes';
import type { Gazetteer, GeoNode, UserGeoEntry } from '../gazetteer';
import { LEVEL_LABELS, levelRank } from '../types';
import { Modal } from '@/ui/Modal';

/*
 * Добавление населённого пункта / улицы / района в дерево.
 * Родителя выбираем поиском по базе, тип — из списка сокращений.
 */

interface Props {
  gaz: Gazetteer;
  initial: { name: string; type: string | null; parentPath: string[] | null };
  onSave: (entry: UserGeoEntry, label: string) => void;
  onClose: () => void;
}

export function AddPlaceDialog({ gaz, initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type ?? 's');
  const [parent, setParent] = useState<GeoNode | null>(() => (initial.parentPath ? gaz.byPath(initial.parentPath) : null));
  const [query, setQuery] = useState('');

  const typeDef = ADDR_TYPES.find((t) => t.id === type)!;
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return [...gaz.nodes.values()]
      .filter((n) => n.level !== 'country' && levelRank(n.level) < levelRank(typeDef.level))
      .filter((n) => n.name.toLowerCase().includes(q) || gaz.label(n).toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, gaz, typeDef.level]);

  const parentOk = parent && levelRank(parent.level) < levelRank(typeDef.level);
  const exists = parent && gaz.childrenOf(parent.id).some((c) => c.name.toLowerCase() === name.trim().toLowerCase() && c.type === type);
  const label = parent ? `${typeDef.short} ${name.trim()} → ${gaz.chain(parent)}` : '';

  const save = () => {
    if (!parent || !parentOk || !name.trim() || exists) return;
    onSave({ name: name.trim(), type, parentPath: gaz.pathOf(parent) }, label);
  };

  return (
    <Modal
      title="Добавить в справочник адресов"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" disabled={!parentOk || !name.trim() || !!exists} onClick={save}>
            Добавить
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-2">
          <label className="field">
            <span className="field__label">Тип</span>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {ADDR_TYPES.filter((t) => t.level !== 'region' && t.level !== 'house' && t.level !== 'building' && t.level !== 'flat').map((t) => (
                <option key={t.id} value={t.id}>
                  {t.short} — {t.full} ({LEVEL_LABELS[t.level].toLowerCase()})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Название</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Аскиз" />
          </label>
        </div>
        <div className="field">
          <span className="field__label">Где находится (родитель)</span>
          {parent ? (
            <div className="row">
              <span className={`chip ${parentOk ? '' : 'chip--error'}`}>{gaz.chain(parent)}</span>
              <button className="btn btn--sm btn--ghost" onClick={() => setParent(null)}>
                Изменить
              </button>
            </div>
          ) : (
            <>
              <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Начните вводить: Аскизский, Хакасия…" autoFocus />
              {candidates.length > 0 && (
                <div className="list" style={{ marginTop: 6 }}>
                  {candidates.map((n) => (
                    <button key={n.id} className="list__item" onClick={() => setParent(n)}>
                      <div className="list__main">
                        <div className="list__title">{gaz.label(n)}</div>
                        <div className="list__sub">{gaz.chain(n)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {parent && !parentOk && <span className="field__error">Родитель должен быть крупнее: например, улица — внутри населённого пункта.</span>}
        </div>
        {exists && <p className="field__error">Такой объект уже есть в справочнике.</p>}
        {parent && parentOk && name.trim() && !exists && (
          <p className="small muted" style={{ margin: 0 }}>
            Будет добавлено: <strong>{label}</strong>. Запись также попадёт в «Предложения в базу», чтобы её получили все.
          </p>
        )}
      </div>
    </Modal>
  );
}
