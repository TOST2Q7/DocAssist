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
  /** Когда исправлено (ISO) — для меток при расхождении с Google Таблицей. */
  at?: string;
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
  /** Пометки к ячейкам: строка → столбец → текст. Только в приложении, в таблицу не пишутся. */
  notes?: Record<string, Record<string, string>>;
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

/**
 * Перенести правки и отметки на новые номера строк (таблицу обновили, и строки сдвинулись).
 * map: старая строка → новая; строки без пары (человека удалили из таблицы) отбрасываются.
 */
export function remapSession(s: AnketaSession, map: Map<number, number>): AnketaSession {
  const byRow = <T,>(rec: Record<string, T> | undefined): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(rec ?? {})) {
      const to = map.get(Number(k));
      if (to !== undefined) out[to] = v;
    }
    return out;
  };
  const list = (xs: number[] | undefined) => (xs ?? []).map((r) => map.get(r)).filter((r): r is number => r !== undefined);
  return {
    ...s,
    edits: byRow(s.edits),
    confirmed: byRow(s.confirmed),
    ignored: byRow(s.ignored),
    notes: byRow(s.notes),
    reviewed: list(s.reviewed),
    ignoredRows: list(s.ignoredRows),
  };
}
