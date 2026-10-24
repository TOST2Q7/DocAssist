import { GRAMOTKA_EXT } from '@/core/gramotka/store';
import { extName } from '@/core/storage/types';
import { TABLE_EXTENSIONS } from '@/core/tables/formats';
import { guessScanKind, SECTION_BY_ID, type SectionId } from '../constants';
import { isImageName } from './transfer';

/*
 * Файл, перетащенный в окно сайта: что это и куда его положить.
 * Разделы личной папки — как на вкладке «Личная папка»; таблица с анкетами — в рабочую папку
 * (её откроет «Проверка анкет»); «Другое» — в личную папку человека или просто в рабочую папку.
 * Грамотка — боец целиком (от другого мастера по временному ключу или своя копия).
 */

export type IncomingKind = SectionId | 'table' | 'gramotka' | 'other';

export const INCOMING_KINDS: { id: IncomingKind; title: string; hint: string }[] = [
  { id: 'scans', title: 'Скан документа', hint: 'Паспорт, СНИЛС, ИНН, справка — в личную папку человека' },
  { id: 'photos', title: 'Фотография человека', hint: 'Фото на документы — для карточки и перевода' },
  { id: 'achievements', title: 'Грамота, диплом', hint: 'В достижения человека' },
  { id: 'characteristic', title: 'Характеристика', hint: 'Подписанная характеристика или её файл' },
  { id: 'table', title: 'Таблица с анкетами', hint: 'Сохранится в рабочую папку и откроется в «Проверке анкет»' },
  { id: 'gramotka', title: 'Грамотка', hint: 'Боец целиком — от другого мастера (нужен временный ключ) или своя копия' },
  { id: 'other', title: 'Другое', hint: 'В личную папку человека или просто в рабочую папку' },
];

export const INCOMING_KIND_BY_ID = Object.fromEntries(INCOMING_KINDS.map((k) => [k.id, k])) as Record<IncomingKind, (typeof INCOMING_KINDS)[number]>;

/** Раздел личной папки, куда ляжет файл: «Сканы»… «Другое» — в саму личную папку. */
export function sectionFolder(kind: IncomingKind): string {
  return kind === 'table' || kind === 'other' || kind === 'gramotka' ? '' : SECTION_BY_ID[kind].folder;
}

/** Что за файл — если это видно по расширению таблицы или словам в имени («паспорт», «грамота», «фото»). */
export function strongGuess(name: string, mime = ''): IncomingKind | null {
  const n = name.toLowerCase().replace(/ё/g, 'е');
  if (extName(name) === GRAMOTKA_EXT) return 'gramotka';
  if (TABLE_EXTENSIONS.includes(extName(name))) return 'table';
  if (/характеристик/.test(n)) return 'characteristic';
  if (/грамот|диплом|благодарност|сертификат/.test(n)) return 'achievements';
  if (guessScanKind(name)) return 'scans';
  if ((mime.startsWith('image/') || isImageName(name)) && /фото|photo|3[xх]4|портрет/.test(n)) return 'photos';
  return null;
}

/** Что за файл — по имени и типу. Это только догадка: окно предлагает её первой, решает человек. */
export function guessIncomingKind(name: string, mime = ''): IncomingKind {
  const strong = strongGuess(name, mime);
  if (strong) return strong;
  // Картинка или PDF без подсказок в имени — чаще всего скан документа.
  return mime.startsWith('image/') || isImageName(name) || extName(name) === 'pdf' ? 'scans' : 'other';
}

/** Набранное ФИО в порядок: лишние пробелы, заглавные буквы у слов, набранных строчными. */
export function tidyFio(fio: string): string {
  return fio
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w === w.toLowerCase() ? w.replace(/(^|-)(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase()) : w))
    .join(' ');
}

/** «Фамилия Имя Отчество» → поля базы людей. Без фамилии и имени — null. */
export function fioFields(fio: string): Record<string, string> | null {
  const [last, first, ...rest] = tidyFio(fio).split(' ').filter(Boolean);
  if (!last || !first) return null;
  return { 'person.lastName': last, 'person.firstName': first, ...(rest.length ? { 'person.middleName': rest.join(' ') } : {}) };
}

/** Имя файла без расширения. */
export function fileStem(name: string): string {
  const ext = extName(name);
  return ext ? name.slice(0, -(ext.length + 1)) : name;
}
