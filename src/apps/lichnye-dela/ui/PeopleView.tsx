import { ArrowRightLeft, FolderOpen, RotateCcw, Search, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fioText, usePeople } from '@/core/people/people';
import { plural } from '@/core/util/format';
import { Alert } from '@/ui/Alert';
import { useToast } from '@/ui/Toast';
import { APP_ID } from '../constants';
import type { CasesApi } from '../model/cases';
import { countNotes, splitFio } from '../model/validate';

interface Props {
  cases: CasesApi;
  onOpen: (personId: string) => void;
  onNew: () => void;
  onTransfer: (personIds: string[]) => void;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

export function PeopleView({ cases, onOpen, onNew, onTransfer }: Props) {
  const people = usePeople();
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
  const orphans = cases.cases.filter((c) => !ids.has(c.personId));

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
        <button className="btn btn--primary" onClick={onNew} disabled={people.readOnly}>
          <UserPlus size={16} /> Добавить бойца
        </button>
      </div>
      {people.readOnly && <Alert kind="warning">База людей открыта только для чтения (создана более новой версией DocAssist или повреждена).</Alert>}

      {!people.loaded ? (
        <div className="loading">Загрузка…</div>
      ) : people.records.length === 0 ? (
        <div className="card empty stack">
          <FolderOpen size={32} className="faint" style={{ margin: '0 auto' }} />
          <div>В базе людей пока никого.</div>
          <div className="small">Нажмите «Добавить бойца» и заполните данные вручную — или сохраните готовые анкеты кнопкой «В базу людей» в «Проверке анкет».</div>
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
                {c ? (
                  <FolderOpen size={18} className="brand-icon" aria-label="Есть личная папка" data-tip="Есть личная папка" />
                ) : (
                  <span className="badge" data-tip="Личная папка создастся при первом открытии раздела «Личная папка»">без папки</span>
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

      {orphans.length > 0 && (
        <section className="card stack stack--s">
          <strong>Личные дела без записи в базе людей</strong>
          <span className="small muted">Запись удалили из базы людей, а личная папка осталась. Можно вернуть запись (только ФИО — остальное заполнить заново) или удалить дело.</span>
          {orphans.map((c) => (
            <div key={c.personId} className="row row--nowrap">
              <span className="spacer">
                {c.fio} <span className="faint small">· {c.folder}</span>
              </span>
              <button
                className="btn btn--sm"
                onClick={() => {
                  people.put(splitFio(c.fio), APP_ID, c.personId);
                  toast(`Запись «${c.fio}» восстановлена`);
                }}
              >
                <RotateCcw size={14} /> Вернуть запись
              </button>
              <button
                className="btn btn--sm btn--danger"
                onClick={() => {
                  if (!confirm(`Удалить личное дело «${c.fio}»?\n\nПапка «${c.folder}» со всеми файлами тоже будет удалена.`)) return;
                  void cases.remove(c.personId, true).then(() => toast('Личное дело удалено'));
                }}
              >
                <Trash2 size={14} /> Удалить
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
