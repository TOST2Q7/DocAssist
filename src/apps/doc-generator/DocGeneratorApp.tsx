import { BookOpen, FileText, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MASTER_EMAIL } from '@/content/help/manual';
import { usePeople } from '@/core/people/people';
import { Alert } from '@/ui/Alert';
import { CARD_FIELDS, cardValues } from './member-card/fields';
import { loadCardTemplate, type CardTemplate } from './member-card/template';
import { CardEditor, type CardDraft } from './ui/CardEditor';
import { PeopleList } from './ui/PeopleList';
import './doc-generator.css';

/*
 * «Генератор документов». Первый документ — учётная карточка члена организации.
 * Человек выбирается из базы людей; чего не хватает — вписывается в форме и дописывается в базу.
 * Выбранный человек хранится в адресе (?person=…), поэтому работает кнопка «Назад».
 */

const NEW = 'new';
const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export default function DocGeneratorApp() {
  const [params, setParams] = useSearchParams();
  const person = params.get('person');
  const people = usePeople();
  const [drafts, setDrafts] = useState<Record<string, CardDraft>>({});
  const [template, setTemplate] = useState<CardTemplate | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    loadCardTemplate().then(setTemplate, (e: unknown) => setTemplateError(e instanceof Error ? e.message : String(e)));
  }, []);

  const open = (id: string | null, replace = false) => {
    const next = new URLSearchParams(params);
    if (id) next.set('person', id);
    else next.delete('person');
    setParams(next, { replace });
    window.scrollTo({ top: 0 });
  };

  const record = person && person !== NEW ? (people.records.find((r) => r.id === person) ?? null) : null;

  // У кого вписано то, чего нет в базе (или отличается от базы).
  const edited = useMemo(() => {
    const out = new Set<string>();
    for (const [id, d] of Object.entries(drafts)) {
      const base = cardValues(people.records.find((r) => r.id === id)?.fields);
      if (CARD_FIELDS.some((f) => clean(d.values[f.id]) !== base[f.id])) out.add(id);
    }
    return out;
  }, [drafts, people.records]);

  const setDraft = (key: string, d: CardDraft | null) =>
    setDrafts((prev) => {
      const next = { ...prev };
      if (d) next[key] = d;
      else delete next[key];
      return next;
    });

  return (
    <div className="page dg">
      <div className="dg__head">
        <h1>Генератор документов</h1>
      </div>

      <div className="stack">
        <div className="card dg-doc">
          <FileText size={22} className="brand-icon" />
          <div className="spacer">
            <strong>Учётная карточка члена организации</strong>
            <div className="small muted">Бланк с 01.01.2026 · заполняется по образцу из методического пособия по работе с документами ЛСО</div>
          </div>
        </div>

        <details className="card card--flat dg-rules">
          <summary>Как заполнять — по методичке</summary>
          <ul className="small">
            <li>Карточка заполняется в электронном виде на каждого кандидата.</li>
            <li>Шрифт — Times New Roman, 12. Программа ставит его сама.</li>
            <li>Сетка таблицы должна быть целой: программа только вписывает текст в ячейки бланка, таблицу не меняет.</li>
            <li>
              Файл называется «Фамилия И.О. - Учетная карточка члена организации» — имя ставится само. Методичка просит формат doc: если нужен
              именно он, откройте файл в Word → «Сохранить как» → «Документ Word 97–2003».
            </li>
            <li>Место учёбы — сокращённое наименование, как в приложениях 1–5 (его можно выбрать из списка).</li>
            <li>Длинный адрес продолжается на следующей строке карточки — перенос после запятой, как в образце.</li>
            <li>Вы заполняете верхнюю часть. Членский билет, постановку на учёт, взносы и поощрения заполняет штаб — в образце там пусто.</li>
            <li>
              Готовую карточку отправьте мастеру ХРО МООО «РСО» на почту <a href={`mailto:${MASTER_EMAIL}`}>{MASTER_EMAIL}</a>, в теме письма
              укажите название отряда.
            </li>
          </ul>
          <Link to="/help#candidate" className="btn btn--sm dg-rules__link">
            <BookOpen size={14} /> Пособие и образец заполнения — в «Справке»
          </Link>
        </details>

        {templateError && <Alert kind="error">Не удалось открыть бланк карточки: {templateError}</Alert>}

        {!person ? (
          <PeopleList records={people.records} loaded={people.loaded} drafts={edited} onOpen={(id) => open(id)} onNew={() => open(NEW)} />
        ) : person !== NEW && !record ? (
          people.loaded ? (
            <div className="card stack">
              <p style={{ margin: 0 }}>Этого человека нет в базе людей — возможно, запись удалили.</p>
              <div>
                <button className="btn" onClick={() => open(null)}>
                  К списку
                </button>
              </div>
            </div>
          ) : (
            <div className="loading">
              <Loader2 className="spin" size={20} /> Читаем базу людей…
            </div>
          )
        ) : (
          <CardEditor
            key={person}
            record={record}
            draft={drafts[person]}
            onDraft={(d) => setDraft(person, d)}
            template={template}
            onBack={() => open(null)}
            onAdded={(id) => {
              // Вписанное переезжает к новой записи базы.
              setDrafts((prev) => {
                const { [NEW]: moved, ...rest } = prev;
                return moved ? { ...rest, [id]: moved } : rest;
              });
              open(id, true);
            }}
          />
        )}
      </div>
    </div>
  );
}
