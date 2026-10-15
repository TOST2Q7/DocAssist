import type { Variable } from '@/core/variables/types';
import { uniqueFileName } from '@/core/workspace/workspace';
import { baseName, extName } from '@/core/storage/types';
import { safeName } from './cases';
import type { Gender } from './names';
import { fillText, makeResolver, withValues } from './placeholders';

/*
 * Имена файлов сканов по шаблону: «{Документ} — {ФИО:кратко}» → «Паспорт (разворот с фото) — Фамилия И. О.jpg».
 * В шаблоне — любые метки данных человека ({Фамилия}, {Дата рождения}, {Отряд}…) и метки самого скана.
 * Расширение файла сохраняется.
 */

export const DEFAULT_SCAN_NAME = '{Документ} — {ФИО:кратко}';

/** Метки, которые есть только у файла. */
export const SCAN_PLACEHOLDERS = [
  { key: 'Документ', hint: 'что это за скан: Паспорт (разворот с фото)' },
  { key: 'Имя файла', hint: 'как файл называется сейчас' },
  { key: '№', hint: 'номер по порядку: 01, 02…' },
];

/** Частые метки данных человека — для быстрых кнопок. */
export const SCAN_PERSON_KEYS = ['ФИО', 'ФИО:кратко', 'Фамилия', 'Имя', 'Отчество', 'Дата рождения', 'Отряд', 'Сегодня'];

export interface NameContext {
  values: Map<string, string>;
  gender: Gender | null;
  vars?: Variable[];
}

export interface ScanItem {
  /** Путь внутри личной папки: «Сканы/скан1.jpg». */
  rel: string;
  /** Что это за документ. */
  doc: string;
}

export interface PlannedName {
  rel: string;
  /** Имя сейчас. */
  from: string;
  /** Имя по шаблону (свободное). */
  to: string;
  /** Неизвестные метки — остались в имени как есть. */
  unknown: string[];
  /** Метки без значения. */
  empty: string[];
}

const stemOf = (name: string) => {
  const ext = extName(name);
  return ext ? name.slice(0, -(ext.length + 1)) : name;
};

/** Имя одного файла по шаблону (без проверки на занятость). */
export function scanName(template: string, item: ScanItem, index: number, ctx: NameContext): Omit<PlannedName, 'rel'> {
  const from = baseName(item.rel);
  const values = withValues(ctx.values, { Документ: item.doc, 'Имя файла': stemOf(from), '№': String(index + 1).padStart(2, '0') });
  const r = makeResolver(values, ctx.gender, ctx.vars);
  const stem = safeName(fillText(template, r.resolve), 150) || stemOf(from);
  const ext = extName(from);
  return { from, to: ext ? `${stem}.${ext}` : stem, unknown: [...r.unknown], empty: [...r.empty] };
}

/**
 * Новые имена для нескольких файлов: без повторов между собой и с занятыми именами папки, куда кладём.
 * inPlace — переименование в той же папке: старые имена файлов пачки освобождаются по мере переименования
 * (по порядку), а имя, совпавшее с нынешним, остаётся как есть.
 */
export function planNames(template: string, items: ScanItem[], taken: Iterable<string>, ctx: NameContext, inPlace = true): PlannedName[] {
  const pending = new Set(inPlace ? items.map((i) => baseName(i.rel).toLowerCase()) : []);
  const used = new Set([...taken].map((n) => n.toLowerCase()).filter((n) => !pending.has(n)));
  return items.map((item, i) => {
    const p = scanName(template, item, i, ctx);
    const self = p.from.toLowerCase();
    pending.delete(self);
    const to = inPlace && p.to.toLowerCase() === self ? p.from : uniqueFileName(p.to, new Set([...used, ...pending]));
    used.add(to.toLowerCase());
    return { rel: item.rel, ...p, to };
  });
}
