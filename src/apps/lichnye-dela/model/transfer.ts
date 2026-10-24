import { fillDocx } from '@/core/docx/fill';
import { imageType } from '@/core/docx/image';
import { buildDocx } from '@/core/docx/write';
import { parseDate, todayText } from '@/core/lua/textlib';
import { fioText, type PersonRecord } from '@/core/people/people';
import { PERSON_FIELDS } from '@/core/schema/fields';
import { baseName, extName, joinPath } from '@/core/storage/types';
import { writeXlsxBook, type SheetData } from '@/core/tables/tables';
import { writeZip } from '@/core/util/zip';
import type { Variable } from '@/core/variables/types';
import type { Workspace } from '@/core/workspace/workspace';
import { SECTION_BY_ID, WORD_TEMPLATES_FOLDER, type SectionId } from '../constants';
import { cardDocx } from './card';
import { casePath, safeName, type PersonCase, type TransferRecord, type TransferSide } from './cases';
import { shortFio } from './names';
import { makeResolver, personGender, placeholderValues, TRANSFER_KEYS, type TransferValues } from './placeholders';
import { templateDocx, type TextTemplate } from './templates';

/*
 * Перевод бойца (или нескольких сразу): пакет документов, таблица со всеми данными, фото и сканы.
 * Пакет — один архив: скачивается и кладётся в «Для выдачи». Грамотка бойца передаётся новому мастеру отдельно
 * (файл и временный ключ, src/core/gramotka).
 */

export type TransferForm = TransferValues;

export function emptyTransferForm(now = new Date()): TransferForm {
  return { date: todayText(now), reason: '', toSquad: '', toBranch: '', toDirection: '', toPosition: '', commanderFrom: '', commanderTo: '' };
}

export interface PackageOptions {
  /** Тексты документов (id шаблонов). */
  templates: string[];
  /** Свои шаблоны Word (имена файлов в «Личные дела/Шаблоны»). */
  word: string[];
  card: boolean;
  table: boolean;
  inventory: boolean;
  photo: boolean;
  /** Фото 3×4: обрезать по центру. */
  crop34: boolean;
  scans: boolean;
  achievementFiles: boolean;
  characteristicFiles: boolean;
  /** Картинки — в JPEG, не больше 2000 px по большей стороне. */
  compress: boolean;
}

export const DEFAULT_OPTIONS: Omit<PackageOptions, 'templates' | 'word'> = {
  card: true,
  table: true,
  inventory: true,
  photo: true,
  crop34: true,
  scans: true,
  achievementFiles: true,
  characteristicFiles: true,
  compress: true,
};

/**
 * Подготовка картинки (в браузере — через canvas): JPEG, не больше maxSide, при crop34 — обрезка 3:4 по центру.
 * null — картинку не удалось прочитать (например, HEIC в Chrome): тогда берётся исходный файл.
 */
export type ImagePrep = (data: Uint8Array, opts: { maxSide: number; crop34?: boolean }) => Promise<Uint8Array | null>;

export interface TransferPerson {
  record: PersonRecord;
  case?: PersonCase;
}

export interface PackageFile {
  /** Путь внутри пакета. */
  path: string;
  data: Uint8Array;
  /** Что это — для описи. */
  title: string;
  /** Чей документ (кратко). */
  person?: string;
}

export interface PackageResult {
  /** Имя пакета: папка и архив. */
  name: string;
  files: PackageFile[];
  warnings: string[];
}

export interface PackageInput {
  ws: Workspace;
  people: TransferPerson[];
  form: TransferForm;
  options: PackageOptions;
  templates: TextTemplate[];
  vars?: Variable[];
  prepareImage?: ImagePrep;
  now?: Date;
  onProgress?: (text: string) => void;
}

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif']);
export const isImageName = (name: string) => IMAGE_EXT.has(extName(name));

/** Дата перевода для имени папки: «2026-09-01». */
export function dateStamp(date: string, now = new Date()): string {
  const d = parseDate(date) ?? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.year}-${p(d.month)}-${p(d.day)}`;
}

/** Имя файла: «Заявление о переводе — Фамилия И. О.docx» (без точки перед расширением). */
export function fileName(title: string, who: string, ext: string): string {
  return `${safeName(who ? `${title} — ${who}` : title, 120)}.${ext}`;
}

/** Заголовки таблицы: 35 полей анкеты (её можно открыть в «Проверке анкет») и столбцы перевода. */
export const TABLE_HEADERS = [...PERSON_FIELDS.map((f) => f.label), 'Перевод: из отряда', 'Перевод: из РО', ...Object.values(TRANSFER_KEYS).filter((k) => !k.startsWith('Командир'))];

export function tableRow(record: Pick<PersonRecord, 'fields'>, form: TransferForm): string[] {
  const f = record.fields;
  // Пустые РО, направление и должность — без изменений.
  const keep = (v: string, id: string) => v.trim() || (f[id] ?? '');
  return [
    ...PERSON_FIELDS.map((d) => f[d.id] ?? ''),
    f['rso.squad'] ?? '',
    f['rso.branch'] ?? '',
    form.toSquad,
    keep(form.toBranch, 'rso.branch'),
    keep(form.toDirection, 'rso.direction'),
    keep(form.toPosition, 'rso.position'),
    form.date,
    form.reason,
  ];
}

export function transferSides(fields: Record<string, string>, form: TransferForm): { from: TransferSide; to: TransferSide } {
  return {
    from: { squad: fields['rso.squad'] ?? '', branch: fields['rso.branch'] ?? '', direction: fields['rso.direction'] ?? '', position: fields['rso.position'] ?? '' },
    to: { squad: form.toSquad, branch: form.toBranch, direction: form.toDirection, position: form.toPosition },
  };
}

/** Перевод состоялся: новый отряд (и РО, направление, должность — если указаны) в данных бойца. */
export function applyTransfer(fields: Record<string, string>, to: TransferSide): Record<string, string> {
  const out = { ...fields };
  if (to.squad.trim()) out['rso.squad'] = to.squad.trim();
  if (to.branch.trim()) out['rso.branch'] = to.branch.trim();
  if (to.direction.trim()) out['rso.direction'] = to.direction.trim();
  if (to.position.trim()) out['rso.position'] = to.position.trim();
  return out;
}

/** Файлы раздела личной папки (пути внутри папки). */
async function sectionFiles(ws: Workspace, c: PersonCase, section: SectionId): Promise<string[]> {
  const dir = SECTION_BY_ID[section].folder;
  const list = await ws.list(casePath(c, dir));
  return list.filter((e) => e.kind === 'file').map((e) => joinPath(dir, e.name));
}

/** Основное фото: выбранное или первое из «Фотографий». */
export async function mainPhoto(ws: Workspace, c: PersonCase | undefined): Promise<string | null> {
  if (!c) return null;
  if (c.photo && (await ws.stat(casePath(c, c.photo)))) return c.photo;
  return (await sectionFiles(ws, c, 'photos')).find(isImageName) ?? null;
}

/** Подпись файла: «Паспорт (разворот с фото)» или имя файла без расширения. */
export function fileTitle(c: PersonCase, rel: string): string {
  const note = c.files[rel];
  const own = baseName(rel).replace(/\.[^.]+$/, '');
  if (!note) return own;
  if (note.kind && note.kind !== 'Другое') return note.title ? `${note.kind}, ${note.title}` : note.kind;
  return note.title || own;
}

export async function buildTransferPackage(input: PackageInput): Promise<PackageResult> {
  const { ws, people, form, options, prepareImage } = input;
  const now = input.now ?? new Date();
  const files: PackageFile[] = [];
  const warnings: string[] = [];
  const single = people.length === 1;
  const stamp = dateStamp(form.date, now);
  const shorts = people.map((p) => shortFio(fioText(p.record.fields)) || 'Без имени');
  const name = single ? `Перевод ${stamp}` : `Перевод ${stamp} — ${people.length} чел`;

  const image = async (data: Uint8Array, maxSide: number, crop34 = false): Promise<{ data: Uint8Array; ext: string } | null> => {
    if (!prepareImage) return null;
    const out = await prepareImage(data, { maxSide, crop34 }).catch(() => null);
    return out ? { data: out, ext: 'jpg' } : null;
  };

  for (const [i, p] of people.entries()) {
    const who = shorts[i];
    const c = p.case;
    const dir = single ? '' : `${safeName(who)}/`;
    const add = (path: string, data: Uint8Array, title: string) => files.push({ path: dir + path, data, title, person: who });
    input.onProgress?.(`${who}: документы`);

    const values = placeholderValues(p.record, c, form, now);
    const gender = personGender(p.record.fields);
    const note = (doc: string, r: ReturnType<typeof makeResolver>) => {
      if (r.unknown.size) warnings.push(`${who}, «${doc}»: неизвестные метки ${[...r.unknown].map((k) => `{${k}}`).join(', ')} — остались как есть`);
      if (r.empty.size) warnings.push(`${who}, «${doc}»: пусто — ${[...r.empty].map((k) => `{${k}}`).join(', ')}`);
    };

    let n = 0;
    const num = () => String(++n).padStart(2, '0');
    for (const t of input.templates.filter((x) => options.templates.includes(x.id))) {
      const r = makeResolver(values, gender, input.vars);
      add(fileName(`${num()} ${t.title}`, who, 'docx'), templateDocx(t, r.resolve), t.title);
      note(t.title, r);
    }
    for (const w of options.word) {
      const bytes = await ws.readBytes(joinPath(WORD_TEMPLATES_FOLDER, w));
      const title = w.replace(/\.docx$/i, '');
      if (!bytes) {
        warnings.push(`Шаблон «${w}» не найден в «${WORD_TEMPLATES_FOLDER}»`);
        continue;
      }
      const r = makeResolver(values, gender, input.vars);
      try {
        const filled = await fillDocx(bytes, r.resolve);
        add(fileName(`${num()} ${title}`, who, 'docx'), filled.data, title);
        note(title, r);
      } catch (e) {
        warnings.push(`Шаблон «${w}»: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const photoRel = await mainPhoto(ws, c);
    const photoRaw = photoRel && c ? await ws.readBytes(casePath(c, photoRel)) : null;
    if (options.card) {
      const small = photoRaw ? ((await image(photoRaw, 800, true))?.data ?? (imageType(photoRaw) ? photoRaw : undefined)) : undefined;
      add(fileName(`${num()} Личная карточка`, who, 'docx'), cardDocx(p.record, c, small), 'Личная карточка');
    }
    if (options.templates.includes('characteristic') && !c?.characteristic.trim()) warnings.push(`${who}: характеристика не написана (личная папка → «Характеристика»)`);

    if (!c) {
      if (options.photo || options.scans) warnings.push(`${who}: личной папки нет — фото и сканов в пакете не будет`);
      continue;
    }
    input.onProgress?.(`${who}: фото и сканы`);
    if (options.photo) {
      if (!photoRaw || !photoRel) warnings.push(`${who}: нет фотографии`);
      else {
        const prepared = await image(photoRaw, 1200, options.crop34);
        const ext = prepared?.ext ?? (extName(photoRel) || 'jpg');
        add(fileName(options.crop34 && prepared ? 'Фото 3×4' : 'Фото', who, ext), prepared?.data ?? photoRaw, options.crop34 && prepared ? 'Фотография 3×4' : 'Фотография');
      }
    }
    const copySection = async (section: SectionId, folder: string, label: string) => {
      const rels = await sectionFiles(ws, c, section);
      let k = 0;
      for (const rel of rels) {
        const data = await ws.readBytes(casePath(c, rel));
        if (!data) continue;
        const title = fileTitle(c, rel);
        const prepared = options.compress && isImageName(rel) ? await image(data, 2000) : null;
        const ext = prepared?.ext ?? (extName(rel) || 'bin');
        add(`${folder}/${fileName(`${String(++k).padStart(2, '0')} ${title}`, who, ext)}`, prepared?.data ?? data, `${label}: ${title}`);
      }
      return rels.length;
    };
    if (options.scans && !(await copySection('scans', 'Сканы', 'Скан'))) warnings.push(`${who}: в личной папке нет сканов`);
    if (options.achievementFiles) await copySection('achievements', 'Достижения', 'Достижение');
    if (options.characteristicFiles) await copySection('characteristic', 'Характеристика', 'Характеристика');
  }

  input.onProgress?.('Таблица и опись');
  const tableName = single ? fileName('Данные', shorts[0], 'xlsx') : 'Данные бойцов.xlsx';
  if (options.table) {
    const sheets: SheetData[] = [{ name: 'Бойцы', headers: TABLE_HEADERS, rows: people.map((p) => tableRow(p.record, form)) }];
    if (single) {
      const f = people[0].record.fields;
      sheets.push({ name: 'Карточка', headers: ['Поле', 'Значение'], rows: PERSON_FIELDS.map((d) => [d.label, f[d.id] ?? '']) });
    }
    const ach = people.flatMap((p, i) => (p.case?.achievements ?? []).map((a) => [shorts[i], a.date, a.title, a.level ?? '']));
    if (ach.length) sheets.push({ name: 'Достижения', headers: ['Боец', 'Дата', 'Достижение', 'Уровень'], rows: ach });
    sheets.push({ name: 'Документы', headers: ['№', 'Документ', 'Боец', 'Файл'], rows: files.map((f, i) => [String(i + 1), f.title, f.person ?? '', f.path]) });
    files.push({ path: tableName, data: writeXlsxBook(sheets), title: single ? 'Таблица данных' : 'Таблица данных бойцов' });
  }
  if (options.inventory) {
    const rows = files.map((f, i) => (single ? [String(i + 1), f.title, f.path] : [String(i + 1), f.title, f.person ?? '', f.path]));
    const docx = buildDocx([
      { type: 'p', text: 'Опись документов', align: 'center', bold: true },
      { type: 'p', text: single ? `к переводу ${shorts[0]}` : `к переводу ${people.length} чел.`, align: 'center' },
      { type: 'p', text: [form.toSquad && `в отряд ${form.toSquad}`, form.date && `с ${form.date}`].filter(Boolean).join(' '), align: 'center' },
      { type: 'p' },
      { type: 'table', header: true, size: 12, widths: single ? [1, 6, 8] : [1, 5, 3, 7], rows: [single ? ['№', 'Документ', 'Файл'] : ['№', 'Документ', 'Боец', 'Файл'], ...rows] },
    ]);
    files.push({ path: 'Опись документов.docx', data: docx, title: 'Опись документов' });
  }
  return { name, files, warnings };
}

export function zipPackage(files: PackageFile[]): Uint8Array {
  return writeZip(files.map((f) => ({ path: f.path, data: f.data })));
}

export function transferRecord(fields: Record<string, string>, form: TransferForm, id: string, folder: string, group: number): TransferRecord {
  return { id, createdAt: new Date().toISOString(), date: form.date, reason: form.reason, ...transferSides(fields, form), status: 'prepared', folder, ...(group > 1 ? { group } : {}) };
}
