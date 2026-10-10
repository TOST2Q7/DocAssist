import type { BaseTree } from '@/core/base/tree';
import { FIO_FIELDS, fioKey, fioText, type PersonRecord } from '@/core/people/people';
import { FIELD_BY_ID } from '@/core/schema/fields';
import type { AnketaChecker } from '../lua/checker';
import { countIssues, isReady, statusOf, type FieldResult, type Issue, type PersonResult } from '../model/types';

/*
 * Проверка анкеты: каждую ячейку проверяет код на Lua (см. lua/checker.ts) — формат, база, древо,
 * галочки «Проверено». Здесь — то, что касается всей таблицы: уникальность значений и база людей.
 */

export interface CheckContext {
  checker: AnketaChecker;
  trees: Map<string, BaseTree>;
  people: PersonRecord[];
}

const labelOf = (fieldId: string) => FIELD_BY_ID.get(fieldId)?.label ?? fieldId;

function finish(r: FieldResult): FieldResult {
  r.status = statusOf(r.issues);
  return r;
}

export function checkPerson(rowIndex: number, values: string[], columns: (string | null)[], ctx: CheckContext, confirmed: Record<string, string> = {}): PersonResult {
  const fields = ctx.checker.checkRow({ row: rowIndex, values: values.map((v) => v ?? ''), columns, confirmed }, { trees: ctx.trees });
  const counts = countIssues(fields);
  return { row: rowIndex, fields, counts, ready: isReady(counts) };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

/**
 * Уникальность: одинаковое значение у разных людей — ошибка.
 * Сравнивается внутри таблицы и с базой людей (запись с другим ФИО).
 */
export function applyUniqueness(results: PersonResult[], values: string[][], columns: (string | null)[], names: string[], ctx: CheckContext): PersonResult[] {
  const extra = new Map<number, Map<number, Issue[]>>();
  const add = (row: number, col: number, issue: Issue) => {
    const m = extra.get(row) ?? new Map<number, Issue[]>();
    m.set(col, [...(m.get(col) ?? []), issue]);
    extra.set(row, m);
  };
  const fio = new Set<string>(FIO_FIELDS);
  const who = (r: number) => `строка ${r + 1}${names[r] ? ` (${names[r]})` : ''}`;

  columns.forEach((fieldId, col) => {
    // Уникальность просит код столбца: unique(). Берём из первой строки, где просили.
    const req = results.map((res) => res.fields[col]?.unique).find(Boolean);
    if (!fieldId || !req) return;
    const withCols = req.with.map((id) => ({ id, col: columns.indexOf(id) })).filter((x) => x.col >= 0);
    const keyOf = (r: number) => [values[r][col], ...withCols.map((w) => values[r][w.col] ?? '')].map(norm).join('\u0001');
    const groups = new Map<string, number[]>();
    results.forEach((res, r) => {
      const f = res.fields[col];
      if (!f?.unique || !f.value.trim() || f.issues.some((i) => i.level === 'error' && !i.confirmable)) return;
      const k = keyOf(r);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    });
    const what = withCols.length ? [labelOf(fieldId), ...withCols.map((w) => labelOf(w.id))].join(' + ') : '';
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      for (const r of rows) {
        add(r, col, { level: 'error', text: `Повторяется${what ? ` (${what})` : ''}: ${rows.filter((x) => x !== r).map(who).join(', ')}` });
      }
    }
    // База людей: значение уже есть у другого человека.
    if (!req.people || fio.has(fieldId) || withCols.some((w) => fio.has(w.id))) return;
    for (const [k, rows] of groups) {
      for (const rec of ctx.people) {
        const recKey = [rec.fields[fieldId] ?? '', ...withCols.map((w) => rec.fields[w.id] ?? '')].map(norm).join('\u0001');
        if (recKey !== k) continue;
        for (const r of rows) {
          const mine: Record<string, string> = {};
          FIO_FIELDS.forEach((id) => (mine[id] = values[r][columns.indexOf(id)] ?? ''));
          if (fioKey(rec.fields) !== fioKey(mine)) add(r, col, { level: 'error', text: `Уже было: в базе людей это значение у «${fioText(rec.fields)}»` });
        }
      }
    }
  });

  if (!extra.size) return results;
  return results.map((res) => {
    const m = extra.get(res.row);
    if (!m) return res;
    const fields = res.fields.map((f) => {
      const issues = m.get(f.col);
      if (!issues) return f;
      return finish({ ...f, issues: [...f.issues.filter((i) => !i.person), ...issues] });
    });
    const counts = countIssues(fields);
    return { ...res, fields, counts, ready: isReady(counts) };
  });
}

export interface RecordMatch {
  record: PersonRecord;
  /** Столбцы, значения которых совпали с базой. */
  matched: number[];
  /** Не совпало: столбец и значение в базе. */
  differ: { col: number; base: string }[];
  /** Сколько всего записей с таким ФИО. */
  total: number;
}

/** «Проверить с актуальной информацией»: найти человека в базе людей по ФИО и сравнить поля. */
export function matchWithPeople(values: string[], columns: (string | null)[], people: PersonRecord[]): RecordMatch | null {
  const mine: Record<string, string> = {};
  columns.forEach((id, i) => id && (mine[id] = values[i] ?? ''));
  const key = fioKey(mine);
  if (!key) return null;
  const found = people.filter((p) => fioKey(p.fields) === key);
  if (!found.length) return null;
  const compare = (rec: PersonRecord) => {
    const matched: number[] = [];
    const differ: { col: number; base: string }[] = [];
    columns.forEach((id, col) => {
      if (!id || rec.fields[id] === undefined) return;
      if (rec.fields[id] === (values[col] ?? '')) matched.push(col);
      else differ.push({ col, base: rec.fields[id] });
    });
    return { record: rec, matched, differ, total: found.length };
  };
  return found.map(compare).sort((a, b) => b.matched.length - a.matched.length)[0];
}
