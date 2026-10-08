import type { Issue } from '../model/types';

export interface SimpleDate {
  y: number;
  m: number;
  d: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const formatDate = (d: SimpleDate) => `${pad(d.d)}.${pad(d.m)}.${d.y}`;

export function isValidDate({ y, m, d }: SimpleDate): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function compareDates(a: SimpleDate, b: SimpleDate): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

export function addYears(d: SimpleDate, years: number): SimpleDate {
  const y = d.y + years;
  // 29 февраля → 28 февраля в невисокосный год
  const max = new Date(Date.UTC(y, d.m, 0)).getUTCDate();
  return { y, m: d.m, d: Math.min(d.d, max) };
}

export function addDays(d: SimpleDate, days: number): SimpleDate {
  const t = new Date(Date.UTC(d.y, d.m - 1, d.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function ageAt(birth: SimpleDate, at: SimpleDate): number {
  let age = at.y - birth.y;
  if (at.m < birth.m || (at.m === birth.m && at.d < birth.d)) age--;
  return age;
}

export function toSimple(d: Date): SimpleDate {
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

export interface ParsedDate {
  date: SimpleDate;
  time?: string;
  twoDigitYear?: boolean;
}

export function parseDate(raw: string, now: SimpleDate = toSimple(new Date())): ParsedDate | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\s?[./\-\s]\s?(\d{1,2})\s?[./\-\s]\s?(\d{4}|\d{2})(?:\s*г\.?)?(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let y = Number(m[3]);
    const two = m[3].length === 2;
    if (two) y += y <= now.y % 100 ? 2000 : 1900;
    const time = m[4] ? `${pad(Number(m[4]))}:${m[5]}:${m[6] ?? '00'}` : undefined;
    return { date: { d: Number(m[1]), m: Number(m[2]), y }, time, twoDigitYear: two };
  }
  m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const time = m[4] ? `${pad(Number(m[4]))}:${m[5]}:${m[6] ?? '00'}` : undefined;
    return { date: { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }, time };
  }
  m = s.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})(?:\s*г\.?)?$/i);
  if (m) {
    const mi = MONTHS.findIndex((p) => m![2].toLowerCase().startsWith(p));
    if (mi >= 0) return { date: { d: Number(m[1]), m: mi + 1, y: Number(m[3]) } };
  }
  // Число из Excel (дни от 30.12.1899), если ячейка потеряла формат даты.
  m = s.match(/^(\d{5})$/);
  if (m) {
    const n = Number(m[1]);
    if (n > 10000 && n < 80000) {
      const t = new Date(Date.UTC(1899, 11, 30 + n));
      return { date: { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() } };
    }
  }
  return null;
}

/** Распознать дату и вернуть её, только если такая дата существует. */
export function parseValidDate(raw: string, now?: SimpleDate): SimpleDate | null {
  const p = parseDate(raw, now);
  return p && isValidDate(p.date) ? p.date : null;
}

export interface DateCheck {
  issues: Issue[];
  suggestion?: string;
  date: SimpleDate | null;
  isPlaceholder: boolean;
}

export interface DateOptions {
  required: boolean;
  withTime?: boolean;
  /** Значения, означающие «нет даты» (например, «00.00.0000»). */
  placeholders?: string[];
  canonicalPlaceholder?: string;
  allowFuture?: boolean;
  now: SimpleDate;
}

export function checkDate(value: string, opts: DateOptions): DateCheck {
  const v = value.trim();
  const issues: Issue[] = [];
  const placeholders = (opts.placeholders ?? []).map((p) => p.trim().toLowerCase());
  const isPlaceholder = !v || placeholders.includes(v.toLowerCase()) || /^0{1,2}[./]0{1,2}[./]0{2,4}$/.test(v) || /^(-|—|нет|не исключ[её]н)$/i.test(v);
  if (isPlaceholder) {
    if (opts.required) {
      issues.push({ code: 'empty', severity: 'error', category: 'missing', message: 'Дата не заполнена' });
      return { issues, date: null, isPlaceholder: true };
    }
    const canon = opts.canonicalPlaceholder;
    if (canon !== undefined && v !== canon) {
      issues.push({ code: 'placeholder', severity: 'info', category: 'format', message: `Пустая дата пишется как «${canon || 'пусто'}»`, fix: canon });
      return { issues, suggestion: canon, date: null, isPlaceholder: true };
    }
    return { issues, date: null, isPlaceholder: true };
  }

  const p = parseDate(v, opts.now);
  if (!p) {
    issues.push({ code: 'date-format', severity: 'error', category: 'format', message: 'Не удалось распознать дату. Нужно ДД.ММ.ГГГГ, например 01.01.2000' });
    return { issues, date: null, isPlaceholder: false };
  }
  if (!isValidDate(p.date)) {
    issues.push({ code: 'date-invalid', severity: 'error', category: 'typo', message: `Такой даты не существует: ${formatDate(p.date)}` });
    return { issues, date: null, isPlaceholder: false };
  }
  let normalized = formatDate(p.date);
  if (opts.withTime) normalized += ` ${p.time ?? '00:00:00'}`;
  if (p.twoDigitYear) {
    issues.push({ code: 'date-two-digit-year', severity: 'warning', category: 'format', message: `Год из двух цифр — понят как ${p.date.y}. Проверьте`, fix: normalized });
  } else if (normalized !== v) {
    issues.push({ code: 'date-format', severity: 'warning', category: 'format', message: `Формат даты: «${v}» → «${normalized}»`, fix: normalized });
  }
  if (!opts.allowFuture && compareDates(p.date, opts.now) > 0) {
    issues.push({ code: 'date-future', severity: 'error', category: 'consistency', message: 'Дата в будущем' });
  }
  return { issues, suggestion: normalized !== v ? normalized : undefined, date: p.date, isPlaceholder: false };
}
