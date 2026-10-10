import { defineDocType } from '@/core/schema/docType';
import { countIssues, isReady, statusOf, type PersonResult } from './types';

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
  /** Проигнорированные замечания: строка → столбец → при каком значении и какие тексты. */
  ignored?: Record<string, Record<string, { value: string; texts: string[] }>>;
  /** Анкеты, у которых проигнорированы все замечания. */
  ignoredRows?: number[];
  /** Проигнорированы все замечания таблицы. */
  ignoreAll?: boolean;
}

export const sessionDocType = defineDocType<AnketaSession>({
  type: 'anketa/session',
  version: 3,
  migrations: {},
  empty: () => ({ source: { name: '', size: 0, lastModified: 0, sheet: '' }, edits: {}, reviewed: [], confirmed: {} }),
});

/** Отметить проигнорированные замечания и пересчитать статусы. Ошибки в коде проверки не игнорируются. */
export function applyIgnores(results: PersonResult[], s: Pick<AnketaSession, 'ignored' | 'ignoredRows' | 'ignoreAll'>): PersonResult[] {
  const rows = new Set(s.ignoredRows ?? []);
  if (!s.ignoreAll && !rows.size && !Object.keys(s.ignored ?? {}).length) return results;
  return results.map((res) => {
    const all = s.ignoreAll || rows.has(res.row);
    const byCol = s.ignored?.[res.row];
    if (!all && !byCol) return res;
    const fields = res.fields.map((f) => {
      const one = byCol?.[f.col];
      const texts = one && one.value === f.value ? one.texts : [];
      if (!all && !texts.length) return f;
      const issues = f.issues.map((i) => (i.level !== 'info' && !i.script && (all || texts.includes(i.text)) ? { ...i, ignored: true } : i));
      // Исправление предлагаем, только пока есть неигнорированное замечание (иначе «Исправить по шаблону» изменит то, что решили оставить).
      const active = issues.some((i) => !i.ignored && !i.resolved && !i.person && !(i.level === 'warn' && i.base));
      return { ...f, issues, status: statusOf(issues), fix: active ? f.fix : undefined };
    });
    const counts = countIssues(fields);
    return { ...res, fields, counts, ready: isReady(counts) };
  });
}

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
