import { ArrowRightLeft, FolderOpen, PackageCheck, Search, Trash2, Upload, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useGramotki } from '@/core/gramotka/react';
import { fioText, usePeople } from '@/core/people/people';
import { pickFiles } from '@/core/util/download';
import { formatDateTime, plural } from '@/core/util/format';
import { openIncomingFiles } from '@/ui/FileDrop';
import { GramotkiGate } from '@/ui/GramotkiGate';
import { useToast } from '@/ui/Toast';
import type { CasesApi } from '../model/cases';
import { countNotes } from '../model/validate';

interface Props {
  cases: CasesApi;
  onOpen: (personId: string) => void;
  onNew: () => void;
  onTransfer: (personIds: string[]) => void;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export function PeopleView({ cases, onOpen, onNew, onTransfer }: Props) {
  const people = usePeople();
  const { store, snap } = useGramotki();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [squad, setSquad] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const squads = useMemo(() => [...new Set(people.records.map((r) => r.fields['rso.squad'] ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')), [people.records]);
  const list = useMemo(() => {
    const q = norm(query.trim());
    return people.records
      .filter((r) => (!q || norm(fioText(r.fields)).includes(q)) && (!squad || r.fields['rso.squad'] === squad))
      .sort((a, b) => fioText(a.fields).localeCompare(fioText(b.fields), 'ru'));
  }, [people.records, query, squad]);
  const errors = useMemo(() => new Map(people.records.map((r) => [r.id, countNotes(r.fields).error])), [people.records]);
  const ids = new Set(people.records.map((r) => r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chosen = [...selected].filter((id) => ids.has(id));
  const allShown = list.length > 0 && list.every((r) => selected.has(r.id));

  return (
    <div className="stack">
      <div className="row">
        <div className="search-box">
          <Search size={16} className="faint" />
          <input className="input" placeholder="Поиск по ФИО" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по ФИО" />
        </div>
        {squads.length > 1 && (
          <select className="select dela-squad" value={squad} onChange={(e) => setSquad(e.target.value)} aria-label="Отряд">
            <option value="">Все отряды</option>
            {squads.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <button className="btn" onClick={() => onTransfer(chosen)} disabled={!chosen.length} data-tip="Отметьте бойцов галочками — пакет перевода для всех сразу">
          <ArrowRightLeft size={16} /> Перевод{chosen.length ? ` (${chosen.length})` : ''}
        </button>
        <button
          className="btn"
          onClick={async () => openIncomingFiles(await pickFiles('', true))}
          data-tip="Сканы, фото, грамоты — спросим, что это и на чьё имя. На компьютере файлы можно просто перетащить в окно."
        >
          <Upload size={16} /> Добавить файлы
        </button>
        <button className="btn btn--primary" onClick={onNew} disabled={snap.status === 'opening'}>
          <UserPlus size={16} /> Добавить бойца
        </button>
      </div>

      <GramotkiGate>
        {people.records.length === 0 ? (
          <div className="card empty stack">
            <FolderOpen size={32} className="faint" style={{ margin: '0 auto' }} />
            <div>В базе людей пока никого.</div>
            <div className="small">
              Нажмите «Добавить бойца» и заполните данные вручную — или сохраните готовые анкеты кнопкой «В базу людей» в «Проверке анкет». Грамотку бойца от другого мастера просто перетащите в окно.
            </div>
          </div>
        ) : (
          <div className="list">
            <label className="list__item dela-list-head small muted">
              <input type="checkbox" checked={allShown} onChange={() => setSelected(allShown ? new Set() : new Set(list.map((r) => r.id)))} aria-label="Отметить всех" />
              <span className="spacer">
                {list.length} {plural(list.length, ['человек', 'человека', 'человек'])}
                {chosen.length ? ` · отмечено ${chosen.length}` : ''}
              </span>
            </label>
            {list.map((r) => {
              const c = cases.get(r.id);
              const errorCount = errors.get(r.id) ?? 0;
              const last = c?.transfers[c.transfers.length - 1];
              return (
                <div key={r.id} className="list__item dela-row">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Отметить ${fioText(r.fields)}`} />
                  <button className="list__main link-btn" onClick={() => onOpen(r.id)}>
                    <div className="list__title">{fioText(r.fields) || '(без ФИО)'}</div>
                    <div className="list__sub">{[r.fields['rso.squad'], r.fields['rso.position'], r.fields['person.birthDate']].filter(Boolean).join(' · ') || 'данных пока мало'}</div>
                  </button>
                  {last && last.status === 'prepared' && <span className="badge badge--beta">перевод готовится</span>}
                  {snap.brokenJournal.includes(r.id) && (
                    <span className="badge dela-badge--error" data-tip="Журнал грамотки не сходится — его стёрли или подменили. Данные в порядке.">
                      журнал
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="badge dela-badge--error" data-tip="Ошибки в данных — откройте, чтобы исправить">
                      {errorCount}
                    </span>
                  )}
                </div>
              );
            })}
            {!list.length && <div className="empty">Никого не найдено</div>}
          </div>
        )}
      </GramotkiGate>

      {snap.status === 'open' && snap.sealed.length > 0 && (
        <details className="card stack stack--s sealed-list">
          <summary>
            <strong>Переданы другим мастерам ({snap.sealed.length})</strong>
          </summary>
          <span className="small muted">
            Грамотки этих бойцов переданы по временному ключу. Здесь остались запечатанные копии: открыть их нельзя — только разработчик может их прочитать, если понадобится.
          </span>
          <div className="list">
            {[...snap.sealed]
              .sort((a, b) => b.label.at.localeCompare(a.label.at))
              .map((s) => (
                <div key={s.id} className="list__item">
                  <PackageCheck size={18} className="faint" />
                  <div className="list__main">
                    <div className="list__title">{s.label.fio || 'Без имени'}</div>
                    <div className="list__sub">
                      Передан {formatDateTime(s.label.at)}
                      {s.label.until && Date.parse(s.label.until) > Date.now() ? ` · временный ключ действует до ${formatDateTime(s.label.until)}` : ''}
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      if (!confirm(`Удалить запечатанную копию «${s.label.fio}»?\n\nЕё не прочитает уже никто, даже разработчик.`)) return;
                      void store?.remove(s.id).then(() => toast('Запечатанная копия удалена'));
                    }}
                    aria-label="Удалить запечатанную копию"
                    data-tip="Удалить запечатанную копию"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
