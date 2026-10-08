import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PersonResult } from '../model/types';
import { Counters } from './Counters';

interface Props {
  names: string[];
  results: PersonResult[];
  reviewed: number[];
  current: number;
  onSelect: (row: number) => void;
}

/** Выпадающий выбор человека с поиском — всегда сверху, чтобы быстро переключаться. */
export function PersonPicker({ names, results, reviewed, current, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return names.map((n, row) => ({ n: n || `Строка ${row + 1}`, row })).filter((x) => !q || x.n.toLowerCase().includes(q));
  }, [names, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setActive(Math.max(0, list.findIndex((x) => x.row === current)));
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (row: number) => {
    onSelect(row);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="picker" ref={ref}>
      <button className="picker__btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="picker__name">{names[current] || `Строка ${current + 1}`}</span>
        <span className="faint small nowrap">
          {current + 1} из {names.length}
        </span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="picker__pop">
          <div className="picker__search">
            <Search size={16} className="faint" />
            <input
              ref={inputRef}
              className="input"
              placeholder="Поиск по ФИО"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(list.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === 'Enter' && list[active]) choose(list[active].row);
                else if (e.key === 'Escape') setOpen(false);
              }}
              aria-label="Поиск по ФИО"
            />
          </div>
          <div className="picker__list" role="listbox">
            {list.map((x, i) => (
              <button
                key={x.row}
                role="option"
                aria-selected={x.row === current}
                className={`picker__opt ${i === active ? 'is-active' : ''} ${x.row === current ? 'is-current' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(x.row)}
              >
                <span className="faint small picker__num">{x.row + 1}</span>
                <span className="spacer picker__opt-name">{x.n}</span>
                {reviewed.includes(x.row) && <span className="badge badge--updated">✓</span>}
                <Counters counts={results[x.row].counts} compact />
              </button>
            ))}
            {!list.length && <div className="empty small">Никого не найдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}
