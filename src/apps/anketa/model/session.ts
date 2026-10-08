import { defineDocType } from '@/core/schema/docType';

/*
 * Сеанс работы с таблицей: правки, отметки «проверено», скрытые замечания.
 * Исходный файл не меняется — правки хранятся отдельно и применяются при экспорте.
 * Файл: «Проверка анкет/sessions/<имя таблицы>.json».
 */

export interface CellEdit {
  /** Исходное значение (чтобы заметить, если таблицу заменили). */
  orig: string;
  value: string;
}

export interface AnketaSession {
  source: { name: string; size: number; lastModified: number; sheet: string };
  /** Правки: строка → столбец → значение. */
  edits: Record<string, Record<string, CellEdit>>;
  reviewed: number[];
  /** Скрытые замечания: строка → ['столбец:код'] */
  ignored: Record<string, string[]>;
}

export const sessionDocType = defineDocType<AnketaSession>({
  type: 'anketa/session',
  version: 1,
  migrations: {},
  empty: () => ({ source: { name: '', size: 0, lastModified: 0, sheet: '' }, edits: {}, reviewed: [], ignored: {} }),
});

export function sessionPath(folder: string, fileName: string): string {
  return `${folder}/sessions/${fileName.replace(/[\\/:*?"<>|]/g, '_')}.json`;
}

export function rowValues(original: string[], session: AnketaSession, row: number): string[] {
  const e = session.edits[row];
  if (!e) return original;
  return original.map((v, col) => e[col]?.value ?? v);
}

export function editCount(session: AnketaSession): number {
  return Object.values(session.edits).reduce((n, r) => n + Object.keys(r).length, 0);
}
