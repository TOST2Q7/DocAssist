import { Search, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fioText, type PersonRecord } from '@/core/people/people';
import { cardValues, missingFields } from '../member-card/fields';

interface Props {
  records: PersonRecord[];
  loaded: boolean;
  /** Люди, для которых в этом сеансе уже что-то вписано. */
  drafts: Set<string>;
  onOpen: (id: string) => void;
  onNew: () => void;
}

/** Кого оформить: люди из базы и сколько данных для карточки не хватает. */
export function PeopleList({ records, loaded, drafts, onOpen, onNew }: Props) {
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/ё/g, 'е');
    return records
      .map((r) => ({ r, name: fioText(r.fields), missing: missingFields(cardValues(r.fields)).length }))
      .filter((x) => !q || x.name.toLowerCase().replace(/ё/g, 'е').includes(q))
      .filter((x) => !onlyMissing || x.missing > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [records, query, onlyMissing]);
  const incomplete = useMemo(() => records.filter((r) => missingFields(cardValues(r.fields)).length > 0).length, [records]);

  return (
    <div className="stack">
      <div className="row">
        <div className="spacer">
          <h2 style={{ margin: 0 }}>Кого оформить</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Данные берутся из базы людей. Если чего-то не хватает — впишете в карточке и допишете в базу.
          </p>
        </div>
        <button className="btn btn--primary" onClick={onNew}>
          <UserPlus size={16} /> Ввести вручную
        </button>
      </div>

      {!loaded ? (
        <div className="loading">Читаем базу людей…</div>
      ) : records.length === 0 ? (
        <div className="card empty stack">
          <Users size={32} className="faint" style={{ margin: '0 auto' }} />
          <div>В базе людей пока никого нет.</div>
          <div className="small">
            Сохраните проверенные анкеты в «Проверке анкет» (кнопка «В базу людей») или нажмите «Ввести вручную» — данные можно будет
            сохранить в базу прямо из карточки.
          </div>
        </div>
      ) : (
        <>
          <div className="row">
            <div className="dg-search">
              <Search size={16} className="faint" />
              <input className="input" placeholder="Поиск по ФИО" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по ФИО" />
            </div>
            {incomplete > 0 && (
              <label className="check small">
                <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
                Только с недостающими ({incomplete})
              </label>
            )}
          </div>
          <div className="list">
            {rows.map(({ r, name, missing }) => (
              <button key={r.id} className="list__item" onClick={() => onOpen(r.id)}>
                <div className="list__main">
                  <div className="list__title">{name || '(без ФИО)'}</div>
                  {r.fields['person.birthDate'] && <div className="list__sub">{r.fields['person.birthDate']}</div>}
                </div>
                {drafts.has(r.id) && <span className="badge badge--beta">есть правки</span>}
                {missing > 0 ? <span className="badge badge--warning">не хватает: {missing}</span> : <span className="badge badge--updated">всё есть</span>}
              </button>
            ))}
            {!rows.length && <div className="empty small">Никого не найдено</div>}
          </div>
        </>
      )}
    </div>
  );
}
