import { defineDocType } from '@/core/schema/docType';

/*
 * Сеанс работы с таблицей: правки, отметки «просмотрено», подтверждения индивидуальных полей.
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
  edits: Record<string, Record<string, CellEdit>>;
  reviewed: number[];
  /**
   * Подтверждённые индивидуальные значения: строка → столбец → значение.
   * Подтверждение относится именно к этому значению: если оно изменится — подтверждение снимается.
   */
  confirmed: Record<string, Record<string, string>>;
}

export const sessionDocType = defineDocType<AnketaSession>({
  type: 'anketa/session',
  version: 3,
  migrations: {
    1: (v1: Record<string, unknown>) => {
      const { ignored: _ignored, ...rest } = v1;
      return { ...rest, accepted: {} };
    },
    // 0.2 → 0.3: «принято как есть» больше нет — подтверждения ставятся заново по новым правилам.
    2: (v2: Record<string, unknown>): AnketaSession => {
      const { accepted: _accepted, ...rest } = v2;
      return { ...(rest as Omit<AnketaSession, 'confirmed'>), confirmed: {} };
    },
  },
  empty: () => ({ source: { name: '', size: 0, lastModified: 0, sheet: '' }, edits: {}, reviewed: [], confirmed: {} }),
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
