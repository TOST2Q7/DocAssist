import { defineDocType } from '@/core/schema/docType';

/*
 * Сеанс работы с таблицей: правки, отметки «проверено», значения, принятые «как есть».
 * Исходный файл не меняется — правки хранятся отдельно и применяются при экспорте.
 * Файл: «Проверка анкет/sessions/<имя таблицы>.json».
 */

export interface CellEdit {
  /** Исходное значение (чтобы заметить, если таблицу заменили). */
  orig: string;
  value: string;
}

export interface AcceptedValue {
  col: number;
  /** Принято именно это значение; если оно изменится — принятие снимается. */
  value: string;
  at: string;
}

export interface AnketaSession {
  source: { name: string; size: number; lastModified: number; sheet: string };
  edits: Record<string, Record<string, CellEdit>>;
  reviewed: number[];
  accepted: Record<string, AcceptedValue[]>;
}

export const sessionDocType = defineDocType<AnketaSession>({
  type: 'anketa/session',
  version: 2,
  migrations: {
    // 0.1 → строгая проверка: «скрытые предупреждения» больше не действуют — такие места нужно проверить заново.
    1: (v1: Omit<AnketaSession, 'accepted'> & { ignored?: unknown }): AnketaSession => {
      const { ignored: _ignored, ...rest } = v1;
      return { ...rest, accepted: {} };
    },
  },
  empty: () => ({ source: { name: '', size: 0, lastModified: 0, sheet: '' }, edits: {}, reviewed: [], accepted: {} }),
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
