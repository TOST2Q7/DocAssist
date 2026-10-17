/*
 * Справка: методическое пособие «По работе с документами ЛСО» (ХРО МООО «РСО», Абакан, 2025).
 * Здесь — рисунки пособия, пакет документов кандидата и названия файлов. Текст разделов — на странице «Справка»
 * (src/pages/HelpPage.tsx), учебные заведения — в institutions.ts.
 *
 * Все данные на рисунках — примеры («Иванов Иван Иванович»), а не чьи-то настоящие.
 */

import candidatesSheet from './img/candidates-sheet.webp';
import cardGrid from './img/card-grid.webp';
import cardNames from './img/card-names.webp';
import gridCommand from './img/grid-command.webp';
import inn from './img/inn.webp';
import join1 from './img/join-1.webp';
import join2 from './img/join-2.webp';
import leave from './img/leave.webp';
import memberCard from './img/member-card.webp';
import military1 from './img/military-1.webp';
import military2 from './img/military-2.webp';
import omsCardBack from './img/oms-card-back.webp';
import omsCardFront from './img/oms-card-front.webp';
import omsPaper from './img/oms-paper.webp';
import passport from './img/passport.webp';
import registration from './img/registration.webp';
import sampleRow from './img/sample-row.webp';
import scanFolders from './img/scan-folders.webp';
import scanNames from './img/scan-names.webp';
import snils from './img/snils.webp';
import studyCertificate from './img/study-certificate.webp';

export interface Figure {
  src: string;
  caption: string;
  /** Размер картинки — чтобы страница не прыгала, пока картинки грузятся. */
  width: number;
  height: number;
}

const fig = (src: string, caption: string, width: number, height: number): Figure => ({ src, caption, width, height });

/** Рисунки пособия. */
export const FIG = {
  gridCommand: fig(gridCommand, 'Где находится команда «Отобразить сетку»', 1400, 636),
  scanFolders: fig(scanFolders, 'Пример оформления папок для сканов документов', 415, 200),
  scanNames: fig(scanNames, 'Пример оформления сканов документов', 508, 388),
  cardNames: fig(cardNames, 'Пример подписания учетных карточек членов организации', 589, 81),
  cardGrid: fig(cardGrid, 'Пример наличия неповрежденной сетки в учетной карточке члена организации', 1400, 861),
  candidatesSheet: fig(candidatesSheet, 'Где находятся персональные данные кандидата из анкеты — лист «Кандидаты»', 535, 193),
  sampleRow: fig(sampleRow, 'Где находится образец заполнения — в шапке таблицы', 1071, 296),
  join1: fig(join1, 'Образец заполнения заявления на вступление в ХРО МООО «РСО» (лицевая сторона)', 516, 795),
  join2: fig(join2, 'Образец заполнения заявления на вступление в ХРО МООО «РСО» (оборотная сторона)', 515, 341),
  leave: fig(leave, 'Образец заполнения заявления на выход из ХРО МООО «РСО»', 583, 835),
  passport: fig(passport, 'Пример скана паспорта', 437, 630),
  registration: fig(registration, 'Пример скана прописки', 626, 446),
  inn: fig(inn, 'Пример скана ИНН', 990, 1400),
  snils: fig(snils, 'Пример скана СНИЛС', 990, 1400),
  omsCardFront: fig(omsCardFront, 'Пример скана полиса ОМС — пластиковая карта, лицевая сторона', 295, 189),
  omsCardBack: fig(omsCardBack, 'Пример скана полиса ОМС — пластиковая карта, оборотная сторона', 293, 183),
  omsPaper: fig(omsPaper, 'Пример скана полиса ОМС — бумажный бланк', 857, 626),
  studyCertificate: fig(studyCertificate, 'Пример скана справки с места учебы', 1400, 990),
  military1: fig(military1, 'Пример скана приписного удостоверения', 580, 409),
  military2: fig(military2, 'Пример скана приписного удостоверения (страницы с записями)', 571, 405),
  memberCard: fig(memberCard, 'Образец заполнения учетной карточки члена организации', 527, 799),
} satisfies Record<string, Figure>;

export interface CandidateDocument {
  id: string;
  title: string;
  note?: string;
  /** Подпункты. */
  items?: string[];
  samples: Figure[];
}

/** Пакет документов, который запрашивают у кандидата. */
export const CANDIDATE_DOCUMENTS: CandidateDocument[] = [
  {
    id: 'join',
    title: 'Заявление на вступление в ХРО МООО «РСО»',
    note: 'распечатывается с двух сторон на одном листе',
    samples: [FIG.join1, FIG.join2],
  },
  { id: 'leave', title: 'Заявление на выход из ХРО МООО «РСО»', samples: [FIG.leave] },
  { id: 'photo', title: 'Фотографии без уголка, цветные, от 3 шт. (размером 3×4)', samples: [] },
  { id: 'passport', title: 'Скан паспорта с пропиской', samples: [FIG.passport, FIG.registration] },
  { id: 'inn', title: 'Скан ИНН', samples: [FIG.inn] },
  { id: 'snils', title: 'Скан СНИЛС', samples: [FIG.snils] },
  {
    id: 'oms',
    title: 'Скан полиса обязательного медицинского страхования',
    samples: [FIG.omsCardFront, FIG.omsCardBack, FIG.omsPaper],
  },
  {
    id: 'study',
    title: 'Справка с места учебы (2 шт.) полного образца',
    items: ['первая справка — для работодателя;', 'вторая справка — для ХРО МООО «РСО»;', 'скан справки с места учебы.'],
    samples: [FIG.studyCertificate],
  },
  {
    id: 'military',
    title: 'Скан военного билета или приписного удостоверения',
    note: 'сканируются страницы, где есть запись',
    samples: [FIG.military1, FIG.military2],
  },
];

/** Порядок документов кандидата в файле (на бумажном носителе). */
export const PAPER_ORDER = [
  'Фотографии без уголка, цветные, от 3 шт. (размером 3×4)',
  'Заявление на вступление в ХРО МООО «РСО»',
  'Заявление на выход из ХРО МООО «РСО»',
  'Справка с места учебы (2 шт.) полного образца',
];

/** Цвета папок со сканами. */
export const FOLDER_COLORS = [
  { color: 'red', title: 'Красный', text: 'папка пустая' },
  { color: 'green', title: 'Зеленый', text: 'полный пакет документов' },
  { color: 'yellow', title: 'Желтый', text: 'не хватает какого-то документа' },
] as const;

/** Почта мастера ХРО МООО «РСО» — для учетных карточек. */
export const MASTER_EMAIL = 'masterhrorso@gmail.com';

/** Положение об учете членов и уплате взносов МООО «РСО». */
export const MEMBERSHIP_RULES_URL = 'https://xn--d1amqcgedd.xn--p1ai/doc/Polozhenie_ob_uchete_chlenov_i_uplate_vznosov_N4_ot_22.03.2024.pdf';

// ---------- Названия файлов ----------

const words = (fio: string) => fio.trim().split(/\s+/).filter(Boolean);
const capFirst = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** «Иванов Иван Иванович» — для папки кандидата. */
export function fullFio(fio: string): string {
  return words(fio).map(capFirst).join(' ');
}

/** «Иванов И.И.» — для названий сканов и учетной карточки. */
export function shortFio(fio: string): string {
  const [last, ...rest] = words(fio);
  if (!last) return '';
  const initials = rest
    .slice(0, 2)
    .map((w) => `${w.charAt(0).toUpperCase()}.`)
    .join('');
  return initials ? `${capFirst(last)} ${initials}` : capFirst(last);
}

export interface FileName {
  what: string;
  name: string;
}

/** Названия папки, сканов и учетной карточки кандидата — как на рисунках пособия. */
export function candidateFileNames(fio: string, year: number): FileName[] {
  const short = shortFio(fio);
  if (!short) return [];
  const scan = (n: string, title: string) => `${n} ${short} - ${title}`;
  return [
    { what: 'Папка со сканами', name: fullFio(fio) },
    { what: 'Паспорт', name: scan('1.1.', 'Паспорт') },
    { what: 'Прописка', name: scan('1.2.', 'Прописка') },
    { what: 'ИНН', name: scan('2.', 'ИНН') },
    { what: 'СНИЛС', name: scan('3.', 'СНИЛС') },
    { what: 'Полис ОМС (лицевая сторона)', name: scan('4.1.', 'Полис ОМС') },
    { what: 'Полис ОМС (оборотная сторона)', name: scan('4.2.', 'Полис ОМС') },
    { what: 'Справка с места учебы', name: scan('5.', `Справка с места учебы ${year}`) },
    { what: 'Приписное удостоверение', name: scan('6.', 'Приписное удостоверение') },
    { what: 'Учетная карточка (файл doc)', name: `${short} - Учетная карточка члена организации` },
  ];
}
