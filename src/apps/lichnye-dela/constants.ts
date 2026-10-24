export const APP_ID = 'lichnye-dela';
export const APP_FOLDER = 'Личные дела';
/** Последние данные перевода (подставляются в следующий раз). Сведения бойцов — в их грамотках. */
export const TRANSFER_FILE = `${APP_FOLDER}/transfer.json`;
/** Связь с Google Диском: древо папок, правила оформления, какие файлы где лежат. */
export const DRIVE_FILE = `${APP_FOLDER}/drive.json`;
/** Тексты документов (заявление, ходатайство, характеристика) — то, что изменено. */
export const TEMPLATES_FILE = `${APP_FOLDER}/templates.json`;
/** Свои шаблоны Word (.docx с метками {ФИО}…). */
export const WORD_TEMPLATES_FOLDER = `${APP_FOLDER}/Шаблоны`;

/** Разделы личной папки — подпапки. */
export const SECTIONS = [
  { id: 'photos', folder: 'Фотографии', title: 'Фотографии', accept: 'image/*' },
  { id: 'scans', folder: 'Сканы', title: 'Сканы документов', accept: 'image/*,.pdf' },
  { id: 'achievements', folder: 'Достижения', title: 'Достижения', accept: 'image/*,.pdf,.doc,.docx' },
  { id: 'characteristic', folder: 'Характеристика', title: 'Характеристика', accept: 'image/*,.pdf,.doc,.docx' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<SectionId, (typeof SECTIONS)[number]>;

/** Что за скан — для подписи файла и имени в пакете перевода. Пакет документов кандидата — как в справке (src/content/help). */
export const SCAN_KINDS = [
  'Паспорт (разворот с фото)',
  'Паспорт (регистрация)',
  'СНИЛС',
  'ИНН',
  'Полис ОМС',
  'Приписное удостоверение',
  'Военный билет',
  'Членский билет',
  'Справка с места учёбы',
  'Заявление о вступлении',
  'Заявление на выход',
  'Согласие на обработку персональных данных',
  'Медицинская справка',
  'Другое',
];

/** Уровни достижений. */
export const ACHIEVEMENT_LEVELS = ['Отряд', 'Штаб', 'Региональное отделение', 'Окружной', 'Всероссийский', 'Международный'];

/** Частые причины перевода — в творительном падеже («в связи с …»). */
export const TRANSFER_REASONS = ['переездом', 'сменой места учёбы', 'окончанием учёбы', 'сменой направления', 'семейными обстоятельствами', 'личным желанием'];

/** Без этих сканов пакет перевода неполный — показываются как «не хватает». */
export const REQUIRED_SCANS = ['Паспорт (разворот с фото)', 'Паспорт (регистрация)', 'СНИЛС', 'ИНН'];

/** Угадать, что за скан, по имени файла. */
export function guessScanKind(fileName: string): string | undefined {
  const n = fileName.toLowerCase().replace(/ё/g, 'е');
  if (/паспорт|passport|пропис/.test(n)) return /пропис|регистр|reg/.test(n) ? 'Паспорт (регистрация)' : 'Паспорт (разворот с фото)';
  if (/снилс|snils/.test(n)) return 'СНИЛС';
  if (/инн|inn/.test(n)) return 'ИНН';
  if (/омс|oms|полис/.test(n)) return 'Полис ОМС';
  if (/припис/.test(n)) return 'Приписное удостоверение';
  if (/военн/.test(n)) return 'Военный билет';
  if (/билет/.test(n)) return 'Членский билет';
  if (/справк/.test(n)) return /мед/.test(n) ? 'Медицинская справка' : 'Справка с места учёбы';
  if (/соглас/.test(n)) return 'Согласие на обработку персональных данных';
  if (/заявлен/.test(n)) return /выход|исключ/.test(n) ? 'Заявление на выход' : 'Заявление о вступлении';
  return undefined;
}
