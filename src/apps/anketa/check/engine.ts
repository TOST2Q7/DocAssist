import { FIELD_BY_ID } from '@/core/schema/fields';
import { err, confirm, finalize } from '@/shared/check/finalize';
import type { Issue } from '@/shared/check/types';
import { countIssues, isReady, type FieldResult, type PersonResult } from '../model/types';
import type { AcceptedValue } from '../model/session';
import type { CheckContext } from './context';
import { crossChecks, type Slot } from './cross';
import { freeText, VALIDATORS } from './fields';

/*
 * Движок строгой проверки анкеты:
 *  1. каждое поле проверяется по своему шаблону;
 *  2. поля сверяются друг с другом;
 *  3. вердикт по каждому полю — точное совпадение с правильной формой (finalize);
 *  4. на уровне таблицы — дубли и значения, принятые «как есть».
 */

export function checkPerson(row: number, values: string[], columns: (string | null)[], ctx: CheckContext): PersonResult {
  const slots: Slot[] = values.map((raw, col) => {
    const value = raw ?? '';
    const id = columns[col];
    const validator = (id && VALIDATORS[id]) || freeText;
    return { value, check: validator(value, ctx) };
  });
  const byId = new Map<string, Slot>();
  columns.forEach((id, col) => id && byId.set(id, slots[col]));
  crossChecks((id) => byId.get(id), ctx);
  const fields: FieldResult[] = slots.map((s, col) => ({ ...finalize(s.value, s.check), fieldId: columns[col], col, value: s.value }));
  const counts = countIssues(fields);
  return { row, fields, counts, ready: isReady(counts) };
}

const DUP: { id: string; level: 'error' | 'confirm' }[] = [
  { id: 'person.snils', level: 'error' },
  { id: 'person.inn', level: 'error' },
  { id: 'person.phone', level: 'confirm' },
  { id: 'person.email', level: 'confirm' },
];

/** Дубли между строками: СНИЛС, ИНН и паспорт — ошибка; телефон и почта — проверить. */
export function findDuplicates(rows: string[][], columns: (string | null)[], names: string[]): Map<number, Map<number, Issue>> {
  const out = new Map<number, Map<number, Issue>>();
  const put = (row: number, col: number, issue: Issue) => {
    if (!out.has(row)) out.set(row, new Map());
    out.get(row)!.set(col, issue);
  };
  const scan = (col: number, key: (r: string[]) => string, label: string, level: 'error' | 'confirm') => {
    const seen = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const k = key(r);
      if (k) seen.set(k, [...(seen.get(k) ?? []), i]);
    });
    for (const list of seen.values()) {
      if (list.length < 2) continue;
      for (const i of list) {
        const others = list.filter((j) => j !== i).map((j) => names[j] || `строка ${j + 1}`).join(', ');
        const msg = `${label} совпадает: ${others}`;
        put(i, col, level === 'error' ? err('duplicate', 'duplicate', msg) : confirm('duplicate', 'duplicate', `${msg} — проверьте`));
      }
    }
  };
  for (const { id, level } of DUP) {
    const col = columns.indexOf(id);
    if (col >= 0) scan(col, (r) => (id === 'person.email' ? (r[col] ?? '').trim().toLowerCase() : (r[col] ?? '').replace(/\D/g, '').slice(-10)), FIELD_BY_ID.get(id)!.label, level);
  }
  const s = columns.indexOf('passport.series');
  const n = columns.indexOf('passport.number');
  if (s >= 0 && n >= 0) {
    scan(n, (r) => {
      const v = (r[s] ?? '').replace(/\D/g, '') + (r[n] ?? '').replace(/\D/g, '');
      return v.length >= 9 ? v : '';
    }, 'Паспорт', 'error');
  }
  return out;
}

/** Добавить дубли и отметки «принято как есть», пересчитать итог. */
export function applyTableLevel(base: PersonResult, dupes: Map<number, Issue> | undefined, accepted: AcceptedValue[] | undefined): PersonResult {
  if (!dupes && !accepted?.length) return base;
  const fields = base.fields.map((f) => {
    const dup = dupes?.get(f.col);
    const acc = accepted?.some((a) => a.col === f.col && a.value === f.value) ?? false;
    if (!dup && !acc) return f;
    return { ...f, issues: dup ? [...f.issues, dup] : f.issues, accepted: acc || undefined };
  });
  const counts = countIssues(fields);
  return { ...base, fields, counts, ready: isReady(counts) };
}
