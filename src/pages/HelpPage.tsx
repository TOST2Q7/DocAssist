import { ClipboardCheck, Copy, Database, Image as ImageIcon, Mail, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { markSeen } from '@/core/registry/badges';
import { ALL_INSTITUTIONS, INSTITUTIONS, type Institution } from '@/content/help/institutions';
import {
  CANDIDATE_DOCUMENTS,
  candidateFileNames,
  FIG,
  FOLDER_COLORS,
  MASTER_EMAIL,
  MEMBERSHIP_RULES_URL,
  PAPER_ORDER,
  type Figure,
} from '@/content/help/manual';
import { Alert } from '@/ui/Alert';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import './help.css';

/*
 * Справка: методическое пособие «По работе с документами ЛСО» (ХРО МООО «РСО», Абакан, 2025).
 * Рисунки, пакет документов и учебные заведения — в src/content/help.
 */

const TOC = [
  { id: 'candidate', title: '1. Оформление кандидата' },
  { id: 'samples', title: 'Образцы документов' },
  { id: 'journal', title: '2. Журнал учета членов ЛСО' },
  { id: 'appendix', title: 'Приложения 1–5: учебные заведения' },
];

function useCopy() {
  const toast = useToast();
  return (text: string) =>
    navigator.clipboard?.writeText(text).then(
      () => toast('Скопировано'),
      () => toast('Не удалось скопировать'),
    );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const copy = useCopy();
  return (
    <button className="icon-btn icon-btn--sm" onClick={() => void copy(text)} data-tip="Скопировать" aria-label={`Скопировать ${label ?? text}`}>
      <Copy size={15} />
    </button>
  );
}

/** Рисунок пособия: по нажатию открывается крупно. */
function Fig({ fig, onOpen, small }: { fig: Figure; onOpen: (f: Figure) => void; small?: boolean }) {
  return (
    <figure className={`help-fig ${small ? 'help-fig--small' : ''}`}>
      <button className="help-fig__img" onClick={() => onOpen(fig)} aria-label={`Открыть крупно: ${fig.caption}`}>
        <img src={fig.src} alt={fig.caption} width={fig.width} height={fig.height} loading="lazy" decoding="async" />
      </button>
      <figcaption>{fig.caption}</figcaption>
    </figure>
  );
}

function Step({ n, title, children }: { n: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="help-step">
      <div className="help-step__n">{n}</div>
      <div className="help-step__body">
        <div className="help-step__title">{title}</div>
        {children}
      </div>
    </div>
  );
}

function Lead({ deadline, goals }: { deadline: string; goals: string[] }) {
  return (
    <div className="card card--flat stack stack--s">
      <div>
        <strong>Сроки:</strong> {deadline}
      </div>
      <div>
        <strong>Цели:</strong>
        <ol className="help-list">
          {goals.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Названия папки, сканов и учетной карточки для конкретного кандидата. */
function FileNames() {
  const [fio, setFio] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const names = candidateFileNames(fio, year);
  return (
    <div className="card stack stack--s help-names">
      <strong>Названия для кандидата</strong>
      <div className="row">
        <input className="input spacer" value={fio} onChange={(e) => setFio(e.target.value)} placeholder="Фамилия Имя Отчество" aria-label="ФИО кандидата" />
        <label className="row small muted" style={{ gap: 6 }}>
          Год справки
          <input className="input help-names__year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} aria-label="Год справки с места учебы" />
        </label>
      </div>
      {names.length > 0 ? (
        <ul className="help-names__list small">
          {names.map((n) => (
            <li key={n.what}>
              <span className="muted">{n.what}</span>
              <span className="mono">{n.name}</span>
              <CopyButton text={n.name} label={n.what} />
            </li>
          ))}
        </ul>
      ) : (
        <span className="muted small">Введите ФИО — появятся готовые названия папки, сканов и учетной карточки, их можно скопировать.</span>
      )}
    </div>
  );
}

function CandidateSection({ onOpen }: { onOpen: (f: Figure) => void }) {
  return (
    <section className="stack" id="candidate">
      <h2>1. Оформление кандидата в члены ХРО МООО «РСО»</h2>
      <Lead
        deadline="по 15.05.2025 года."
        goals={[
          'Папка с личными делами членов ЛСО, состоящих на учете в ХРО МООО «РСО», на бумажном носителе.',
          'Папка с личными делами членов ЛСО, состоящих на учете в ХРО МООО «РСО», на электронном носителе.',
          'Журнал учета членов ЛСО, состоящих на учете в ХРО МООО «РСО» (Google таблица).',
        ]}
      />
      <h3>Задачи</h3>

      <Step
        n="1"
        title={
          <>
            Ознакомить кандидата с{' '}
            <a href={MEMBERSHIP_RULES_URL} target="_blank" rel="noreferrer">
              положением об учете членов и уплате взносов МООО «РСО»
            </a>
            .
          </>
        }
      />

      <Step n="2" title="Запросить у кандидата пакет документов">
        <ul className="help-docs">
          {CANDIDATE_DOCUMENTS.map((d) => (
            <li key={d.id}>
              <div className="row row--nowrap help-docs__row">
                <span className="spacer">
                  {d.title}
                  {d.note && <span className="muted"> ({d.note})</span>}
                </span>
                {d.samples.map((s, i) => (
                  <button key={s.src} className="btn btn--sm" onClick={() => onOpen(s)} data-tip={s.caption}>
                    <ImageIcon size={14} /> {d.samples.length > 1 ? `Образец ${i + 1}` : 'Образец'}
                  </button>
                ))}
              </div>
              {d.items && (
                <ul className="help-list muted small">
                  {d.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <Alert kind="warning">
          Готовые сканы документов можно принимать, только если они соответствуют представленным примерам. В остальных случаях рекомендуется
          самостоятельно в присутствии кандидата сделать скан оригинала документа.
        </Alert>
      </Step>

      <Step n="3" title="Проконтролировать заполнение заявлений на вступление в ХРО МООО «РСО» и выход из организации">
        <p>Не забывайте выдавать образцы заполнения.</p>
        <p>
          Чистые бланки для скачивания закреплены в чате «Мастера ЛСО ХРО МООО «РСО»» в социальной сети «ВКонтакте».
        </p>
        <p>
          Заполнять заявления рекомендуется в электронном варианте. Перед заполнением электронной формы обязательно выберите команду
          «Отобразить сетку». Подпись в распечатанных заявлениях ставится исключительно личная рукописная.
        </p>
        <Fig fig={FIG.gridCommand} onOpen={onOpen} />
        <p>Заявление на вступление в ХРО МООО «РСО» распечатывается на одном листе с двух сторон.</p>
      </Step>

      <Step n="4" title="Обработать собранные документы">
        <p>
          <strong>4.1.</strong> Разложить документы кандидата в одном файле по порядку (на бумажном носителе):
        </p>
        <ol className="help-list">
          {PAPER_ORDER.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ol>
        <p>Файлы кандидатов в отрядной папке должны храниться за титульным листом «Кандидаты» в алфавитном порядке по фамилии.</p>
        <p>
          <strong>4.2.</strong> Создать в папке «Кандидаты ЛСО», которая находится в папке для сбора сканов ЛСО, на каждого кандидата
          отдельную папку и назвать её «Фамилия Имя Отчество».
        </p>
        <Fig fig={FIG.scanFolders} onOpen={onOpen} small />
        <p>Каждый цвет папки со сканами документов имеет свое обозначение:</p>
        <ul className="help-colors">
          {FOLDER_COLORS.map((c) => (
            <li key={c.color}>
              <span className={`help-dot help-dot--${c.color}`} aria-hidden="true" /> <strong>{c.title}</strong> — {c.text}
            </li>
          ))}
        </ul>
        <p>Назовите каждый скан документа «Фамилия И.О. - Название документа».</p>
        <Fig fig={FIG.scanNames} onOpen={onOpen} small />
        <FileNames />
      </Step>

      <Step n="5" title="Заполнить учетную карточку члена организации на каждого кандидата">
        <div className="row">
          <button className="btn btn--sm" onClick={() => onOpen(FIG.memberCard)}>
            <ImageIcon size={14} /> Образец заполнения
          </button>
        </div>
        <p>
          Карточка заполняется в электронном виде, формат файла doc, подписывается «Фамилия И.О. - Учетная карточка члена организации» и
          отправляется мастеру ХРО МООО «РСО» на электронную почту{' '}
          <a href={`mailto:${MASTER_EMAIL}`}>
            <Mail size={14} style={{ verticalAlign: '-2px' }} /> {MASTER_EMAIL}
          </a>{' '}
          <CopyButton text={MASTER_EMAIL} label="почту" />. Обязательно в теме письма укажите название отряда.
        </p>
        <Fig fig={FIG.cardNames} onOpen={onOpen} />
        <p>
          При заполнении карточки используется 12 шрифт «Times New Roman». Убедитесь, что в учетной карточке члена организации есть сетка и
          она не повреждена.
        </p>
        <Fig fig={FIG.cardGrid} onOpen={onOpen} />
      </Step>

      <Step n="6" title="Подготовить лист «Кандидаты» в журнале учета членов ЛСО, состоящих на учете в ХРО МООО «РСО» (Google таблица)">
        <p>
          <strong>6.1.</strong> Предоставить кандидату личным сообщением ссылку на анкету для сбора персональных данных.
        </p>
        <p>
          <strong>6.2.</strong> Проверить персональные данные кандидата на корректность заполнения, сравнив со сканами стандартного пакета
          документов. Информация из анкеты для кандидатов ЛСО по сбору персональных данных автоматически выгружается в журнал учета членов
          вашего отряда в лист «Кандидаты».
        </p>
        <Fig fig={FIG.candidatesSheet} onOpen={onOpen} small />
        <Alert kind="info">
          Проверить строки листа «Кандидаты» поможет приложение{' '}
          <Link to="/apps/anketa">
            <ClipboardCheck size={14} style={{ verticalAlign: '-2px' }} /> «Проверка анкет»
          </Link>
          : выделите строки в таблице, нажмите Ctrl+C, откройте приложение и нажмите Ctrl+V. Оно проверит формат каждого столбца и подскажет
          исправления.
        </Alert>
        <p>
          <strong>6.3.</strong> Убедиться, что заполненные данные оформлены согласно образцу, который закреплен в шапке таблицы.
        </p>
        <Fig fig={FIG.sampleRow} onOpen={onOpen} />
        <p>
          <strong>6.4.</strong> После проверки персональных данных кандидата в ячейке «Отметка проверки перс. данных кандидата командным
          составом отряда» укажите дату, когда была проведена проверка. Наличие даты означает, что данные достоверны и их можно
          использовать для заполнения отчетов в центральный штаб и справок работодателю.
        </p>
      </Step>
    </section>
  );
}

const SAMPLE_GROUPS: { title: string; figs: Figure[] }[] = [
  { title: 'Заявления и учетная карточка', figs: [FIG.join1, FIG.join2, FIG.leave, FIG.memberCard] },
  { title: 'Паспорт', figs: [FIG.passport, FIG.registration] },
  { title: 'ИНН и СНИЛС', figs: [FIG.inn, FIG.snils] },
  { title: 'Полис ОМС', figs: [FIG.omsCardFront, FIG.omsCardBack, FIG.omsPaper] },
  { title: 'Справка с места учебы', figs: [FIG.studyCertificate] },
  { title: 'Приписное удостоверение', figs: [FIG.military1, FIG.military2] },
];

function SamplesSection({ onOpen }: { onOpen: (f: Figure) => void }) {
  return (
    <section className="stack" id="samples">
      <h2>Образцы документов</h2>
      <p className="muted" style={{ margin: 0 }}>
        Все данные на образцах — примеры. Нажмите на картинку, чтобы открыть крупно.
      </p>
      {SAMPLE_GROUPS.map((g) => (
        <div key={g.title} className="stack stack--s">
          <h3>{g.title}</h3>
          <div className="help-gallery">
            {g.figs.map((f) => (
              <Fig key={f.src} fig={f} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function JournalSection() {
  return (
    <section className="stack" id="journal">
      <h2>2. Работа в журнале учета членов ЛСО, состоящих на учете в ХРО МООО «РСО»</h2>
      <Lead
        deadline="проверка актуальности персональных данных не реже одного раза в месяц."
        goals={[
          'Журнал учета членов ЛСО, состоящих на учете в ХРО МООО «РСО» (Google таблица).',
          'Системный контроль за актуальностью данных в журнале учета членов ЛСО, состоящих на учете в ХРО МООО «РСО».',
        ]}
      />
      <h3>Задачи</h3>
      <p className="muted" style={{ margin: 0 }}>
        В пособии задачи этого раздела пока не расписаны — раздел будет дополнен.
      </p>
      <Alert kind="info">
        Сверить данные журнала с проверенными поможет <Link to="/apps/anketa">«Проверка анкет»</Link>: кнопка «Проверить с актуальной
        информацией» ищет человека в базе людей по ФИО и показывает, какие поля не совпадают.
      </Alert>
    </section>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

function InstitutionCard({ inst, query, city }: { inst: Institution; query: string; city?: string }) {
  const q = norm(query.trim());
  const nameHit = !q || norm(inst.name).includes(q) || norm(inst.short).includes(q);
  const specialties = nameHit ? inst.specialties : inst.specialties.filter((s) => norm(s).includes(q));
  return (
    <details className="card card--flat help-inst" open={!!q}>
      <summary>
        <span className="spacer">
          <strong>{inst.short}</strong>
          {city && <span className="faint small"> · {city}</span>}
          <span className="faint small"> · {specialties.length}</span>
        </span>
      </summary>
      <div className="stack stack--s help-inst__body">
        <div className="row row--nowrap">
          <span className="spacer small">
            <span className="muted">Полное наименование: </span>
            {inst.name}
          </span>
        </div>
        <div className="row row--nowrap">
          <span className="spacer small">
            <span className="muted">Место учебы в анкете: </span>
            <strong>{inst.short}</strong>
          </span>
          <CopyButton text={inst.short} label={inst.short} />
        </div>
        <ul className="help-specs">
          {specialties.map((s) => (
            <li key={s}>
              <span className="spacer">{s}</span>
              <CopyButton text={s} label={s} />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function AppendixSection() {
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const q = norm(query.trim());
  const shown = useMemo(() => {
    const list = city ? INSTITUTIONS.filter((c) => c.city === city) : INSTITUTIONS;
    return list
      .map((c) => ({
        ...c,
        institutions: c.institutions.filter((i) => !q || [i.name, i.short, ...i.specialties].some((s) => norm(s).includes(q))),
      }))
      .filter((c) => c.institutions.length);
  }, [city, q]);
  const specialties = ALL_INSTITUTIONS.reduce((n, i) => n + i.specialties.length, 0);

  return (
    <section className="stack" id="appendix">
      <h2>Приложения 1–5. Наименования учебных заведений с кодами специальностей</h2>
      <p className="muted" style={{ margin: 0 }}>
        {ALL_INSTITUTIONS.length} учебных заведений, {specialties} направлений обучения. В анкете «Место учебы» пишется сокращённым
        наименованием, «Направление обучения» — кодом и названием, как в списке.
      </p>
      <Alert kind="info">
        Чтобы «Проверка анкет» принимала эти значения без подтверждения, добавьте их в базу:{' '}
        <Link to="/base">
          <Database size={14} style={{ verticalAlign: '-2px' }} /> База данных
        </Link>{' '}
        → «Учебные заведения из справки».
      </Alert>
      <div className="segmented help-cities" role="group" aria-label="Город">
        <button aria-pressed={city === ''} onClick={() => setCity('')}>
          Все
        </button>
        {INSTITUTIONS.map((c) => (
          <button key={c.city} aria-pressed={city === c.city} onClick={() => setCity(c.city)}>
            {c.city}
          </button>
        ))}
      </div>
      <div className="search-box">
        <Search size={16} className="faint" />
        <input className="input" placeholder="Поиск: учебное заведение, код или название специальности" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по учебным заведениям" />
      </div>
      {shown.length === 0 && <div className="card empty small">Ничего не найдено</div>}
      {shown.map((c) => (
        <div key={c.city} className="stack stack--s">
          <h3>
            Приложение {c.appendix}. {c.city}
          </h3>
          {c.institutions.map((i) => (
            <InstitutionCard key={i.short} inst={i} query={query} />
          ))}
        </div>
      ))}
    </section>
  );
}

export default function HelpPage() {
  const { hash, key } = useLocation();
  const [open, setOpen] = useState<Figure | null>(null);

  useEffect(() => {
    markSeen('menu:help');
    document.title = 'Справка — DocAssist';
    return () => {
      document.title = 'DocAssist — документы РСО';
    };
  }, []);

  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [hash, key]);

  return (
    <div className="page page--narrow help">
      <div className="page-head">
        <h1>Справка</h1>
        <p>
          Методическое пособие по работе с документами ЛСО — Хакасское региональное отделение МООО «Российские студенческие отряды»,
          Абакан, 2025.
        </p>
      </div>
      <nav className="help-toc" aria-label="Содержание">
        {TOC.map((t) => (
          <Link key={t.id} to={{ hash: t.id }} className="chip">
            {t.title}
          </Link>
        ))}
      </nav>
      <div className="stack stack--l">
        <CandidateSection onOpen={setOpen} />
        <SamplesSection onOpen={setOpen} />
        <JournalSection />
        <AppendixSection />
      </div>
      {open && (
        <Modal title={open.caption} onClose={() => setOpen(null)} wide>
          <img className="help-lightbox" src={open.src} alt={open.caption} width={open.width} height={open.height} />
        </Modal>
      )}
    </div>
  );
}
