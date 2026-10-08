import { Eye, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TableModel } from './hooks';
import { Counters } from './Counters';

type Filter = 'all' | 'ready' | 'errors' | 'confirm' | 'todo';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'ready', label: 'Готовы' },
  { id: 'errors', label: 'С ошибками' },
  { id: 'confirm', label: 'Подтвердить' },
  { id: 'todo', label: 'Не просмотрены' },
];

export function PeopleList({ model, reviewed, onOpen }: { model: TableModel; reviewed: number[]; onOpen: (row: number) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const squadCol = model.columns.indexOf('rso.squad');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return model.results.filter((r) => {
      if (q && !model.names[r.row].toLowerCase().includes(q)) return false;
      switch (filter) {
        case 'ready':
          return r.ready;
        case 'errors':
          return r.counts.error + r.counts.glued > 0;
        case 'confirm':
          return r.counts.confirm > 0;
        case 'todo':
          return !reviewed.includes(r.row);
        default:
          return true;
      }
    });
  }, [model, query, filter, reviewed]);

  return (
    <div className="stack">
      <div className="row">
        <div className="search-box">
          <Search size={16} className="faint" />
          <input className="input" placeholder="Поиск по ФИО" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по ФИО" />
        </div>
        <div className="segmented" role="group" aria-label="Фильтр">
          {FILTERS.map((f) => (
            <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="list">
        {rows.map((r) => (
          <button key={r.row} className="list__item" onClick={() => onOpen(r.row)}>
            <span className="faint small" style={{ width: 28 }}>
              {r.row + 1}
            </span>
            <div className="list__main">
              <div className="list__title">{model.names[r.row] || `Строка ${r.row + 1}`}</div>
              {squadCol >= 0 && model.values[r.row][squadCol] && <div className="list__sub">{model.values[r.row][squadCol]}</div>}
            </div>
            {reviewed.includes(r.row) && <Eye size={18} className="faint" aria-label="Просмотрено" />}
            <Counters counts={r.counts} />
          </button>
        ))}
        {!rows.length && <div className="empty">Никого не найдено</div>}
      </div>
    </div>
  );
}
