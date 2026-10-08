import { confirm, err } from './finalize';
import type { FieldCheck } from './types';

/* Даты: правильная форма — ДД.ММ.ГГГГ (и чч:мм:сс для отметки времени). */

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
}

/** Распознать дату в любом распространённом виде (только чтобы предложить исправление). */
export function parseDate(raw: string, now: SimpleDate = toSimple(new Date())): ParsedDate | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const time = (h?: string, mi?: string, se?: string) => (h ? `${pad(Number(h))}:${pad(Number(mi))}:${pad(Number(se ?? 0))}` : undefined);
  let m = s.match(/^(\d{1,2})\s?[./\-\s,]\s?(\d{1,2})\s?[./\-\s,]\s?(\d{4}|\d{2})(?:\s*г\.?)?(?:[ ,T]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?$/);
  if (m) {
    let y = Number(m[3]);
    if (m[3].length === 2) y += y <= now.y % 100 ? 2000 : 1900;
    return { date: { d: Number(m[1]), m: Number(m[2]), y }, time: time(m[4], m[5], m[6]) };
  }
  m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return { date: { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }, time: time(m[4], m[5], m[6]) };
  m = s.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})(?:\s*г\.?)?$/i);
  if (m) {
    const mi = MONTHS.findIndex((p) => m![2].toLowerCase().startsWith(p));
    if (mi >= 0) return { date: { d: Number(m[1]), m: mi + 1, y: Number(m[3]) } };
  }
  m = s.match(/^(\d{5})$/); // число из Excel (дни от 30.12.1899)
  if (m) {
    const n = Number(m[1]);
    if (n > 10000 && n < 80000) {
      const t = new Date(Date.UTC(1899, 11, 30 + n));
      return { date: { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() } };
    }
  }
  return null;
}

export function parseValidDate(raw: string, now?: SimpleDate): SimpleDate | null {
  const p = parseDate(raw, now);
  return p && isValidDate(p.date) ? p.date : null;
}

export interface DateOptions {
  required: boolean;
  withTime?: boolean;
  /** Как пишется «даты нет» (например, «00.00.0000»). Если задано — пустое значение недопустимо. */
  placeholder?: string;
  /** Дата в будущем: ошибка, требует подтверждения или допустима. */
  future: 'error' | 'confirm' | 'allow';
  now: SimpleDate;
}

export function checkDate(value: string, o: DateOptions): FieldCheck & { date: SimpleDate | null } {
  const v = value.trim();
  const isPlaceholderLike = !v || /^0{1,2}[./-]0{1,2}[./-]0{1,4}$/.test(v) || /^(-|—|нет|не исключ[её]н[а]?)$/i.test(v);
  if (isPlaceholderLike) {
    if (o.required) return { canonical: undefined, issues: [err('empty', 'missing', 'Не заполнено. Нужна дата ДД.ММ.ГГГГ')], date: null };
    if (o.placeholder !== undefined) {
      const issues = v ? [] : [err('empty', 'missing', `Не заполнено. Если даты нет, пишется «${o.placeholder}»`, { fix: o.placeholder })];
      return { canonical: o.placeholder, issues, date: null };
    }
    return { canonical: '', issues: [], date: null };
  }
  const p = parseDate(v, o.now);
  const shape = o.withTime ? 'ДД.ММ.ГГГГ чч:мм:сс' : 'ДД.ММ.ГГГГ';
  if (!p) return { issues: [err('date-format', 'format', `Не похоже на дату. Нужно ${shape}`)], date: null };
  if (!isValidDate(p.date)) return { issues: [err('date-invalid', 'format', `Такой даты не существует: ${formatDate(p.date)}`)], date: null };
  let canonical = formatDate(p.date);
  if (o.withTime) canonical += ` ${p.time ?? '00:00:00'}`;
  const issues = [];
  if (compareDates(p.date, o.now) > 0 && o.future !== 'allow') {
    issues.push(o.future === 'error' ? err('date-future', 'consistency', 'Дата в будущем') : confirm('date-future', 'consistency', 'Дата в будущем — проверьте'));
  }
  return { canonical, issues, date: p.date, collapse: { maxHunks: 2, message: `Не по шаблону ${shape}` } };
}
