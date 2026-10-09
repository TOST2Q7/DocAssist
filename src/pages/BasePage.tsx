import { Loader2, Search, Trash2 } from 'lucide-react';
import { Suspense, useMemo, useState } from 'react';
import { fioText, usePeople } from '@/core/people/people';
import { APPS } from '@/core/registry/apps';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { formatDateTime } from '@/core/util/format';
import { ABBR_GROUPS, ABBREVIATIONS } from '@/shared/cell/abbr';
import { useToast } from '@/ui/Toast';
import { WorkspaceGate } from '@/ui/WorkspaceGate';

function PeopleBase() {
  const people = usePeople();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.records.filter((r) => !q || fioText(r.fields).toLowerCase().includes(q));
  }, [people.records, query]);

  return (
    <section className="stack">
      <div className="section-title">
        <h2>База людей</h2>
        <span className="muted small">записей: {people.records.length}</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Проверенные («актуальные») данные людей. По ним работает кнопка «Проверить с актуальной информацией» и проверка
        уникальности: значение, которое уже есть у другого человека, — ошибка. Пополняется из «Проверки анкет» (готовые анкеты) и
        будущим приложением ручного ввода. Это персональные данные — в «Предложения в базу» они не попадают.
      </p>
      {people.records.length > 5 && (
        <div className="search-box">
          <Search size={16} className="faint" />
          <input className="input" placeholder="Поиск по ФИО" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по ФИО" />
        </div>
      )}
      {people.records.length === 0 ? (
        <div className="card empty small">Пока пусто.</div>
      ) : (
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="list__item list__item--col">
              <div className="row row--nowrap" style={{ width: '100%' }}>
                <button className="list__main link-btn" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                  <span className="list__title">{fioText(r.fields) || '(без ФИО)'}</span>
                  <span className="list__sub">
                    {r.fields['person.birthDate'] ? `${r.fields['person.birthDate']} · ` : ''}сохранено {formatDateTime(r.savedAt)}
                  </span>
                </button>
                <button
                  className="icon-btn"
                  onClick={() => {
                    if (confirm(`Удалить «${fioText(r.fields)}» из базы людей?`)) {
                      people.remove(r.id);
                      toast('Удалено');
                    }
                  }}
                  aria-label={`Удалить ${fioText(r.fields)}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              {open === r.id && (
                <table className="table small">
                  <tbody>
                    {Object.entries(r.fields).map(([id, v]) => (
                      <tr key={id}>
                        <td className="muted">{FIELD_BY_ID.get(id)?.label ?? id}</td>
                        <td>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function BasePage() {
  const views = APPS.filter((a) => a.baseView);
  return (
    <div className="page">
      <div className="page-head">
        <h1>База данных</h1>
        <p>
          База сначала пустая. Значения попадают в неё, когда вы подтверждаете их при проверке или добавляете вручную. Хранится в
          рабочей папке (<code>.docassist/base</code>), всё добавленное уходит в «Предложения в базу».
        </p>
      </div>
      <WorkspaceGate>
        <div className="stack stack--l">
          {views.map((a) => {
            const View = a.baseView!;
            return (
              <section key={a.id} className="stack">
                <h2>{a.title}</h2>
                <Suspense
                  fallback={
                    <div className="loading">
                      <Loader2 className="spin" size={20} /> Загрузка…
                    </div>
                  }
                >
                  <View />
                </Suspense>
              </section>
            );
          })}
          <PeopleBase />
          <details className="card card--flat">
            <summary>Сокращения — встроены все ({ABBREVIATIONS.length})</summary>
            <div className="abbr-grid">
              {Object.entries(ABBR_GROUPS).map(([g, title]) => {
                const list = ABBREVIATIONS.filter((a) => a.group === g);
                if (!list.length) return null;
                return (
                  <div key={g}>
                    <strong className="small">{title}</strong>
                    <div className="small">
                      {list.map((a) => (
                        <div key={a.abbr + a.title}>
                          <span className="mono">{a.after ? `… ${a.abbr}` : `${a.abbr} …`}</span> <span className="muted">{a.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      </WorkspaceGate>
    </div>
  );
}
