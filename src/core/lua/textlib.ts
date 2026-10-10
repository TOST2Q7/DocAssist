import { fillMask, fixQuotes, suggestFix } from '@/shared/cell/format';

/*
 * Готовые функции для проверок (в Lua — lib.имя). Всё понимает русские буквы (обычные строковые
 * функции Lua работают с байтами и путаются в кириллице). Пустое значение (nil) считается пустой строкой.
 */

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const truthy = (v: unknown) => v !== null && v !== undefined && v !== false;

const LATIN = /[A-Za-z]/;
const CYR = /[А-Яа-яЁё]/;
const LETTER = /\p{L}/u;

/** Латинские буквы, похожие на русские, и наоборот. */
const LAT_TO_CYR: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у' };
const CYR_TO_LAT: Record<string, string> = Object.fromEntries(Object.entries(LAT_TO_CYR).map(([l, c]) => [c, l]));

export const fixSpaces = (v: string) => v.replace(/[\s ]+/g, ' ').trim();

export function realDate(d: number, m: number, y: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function parseDate(v: unknown): { day: number; month: number; year: number } | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(str(v));
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return realDate(day, month, year) ? { day, month, year } : null;
}

const dateNum = (v: unknown) => {
  const d = parseDate(v);
  return d ? d.year * 10000 + d.month * 100 + d.day : null;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const todayText = (now = new Date()) => `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;

/** Слово, в котором смешаны русские и латинские буквы: «Ивaнов» (латинская «a»). */
const isMixed = (w: string) => LATIN.test(w) && CYR.test(w);

function fixLetters(v: string): string {
  return v.normalize('NFC').replace(/[\p{L}\p{M}]+/gu, (w) => {
    if (!isMixed(w)) return w;
    const cyr = [...w].filter((c) => CYR.test(c)).length;
    const lat = [...w].filter((c) => LATIN.test(c)).length;
    const map = cyr >= lat ? LAT_TO_CYR : CYR_TO_LAT;
    return [...w].map((c) => map[c] ?? c).join('');
  });
}

function maskRegex(mask: string): RegExp {
  return new RegExp(`^${[...mask].map((c) => (c === '9' ? '\\d' : c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))).join('')}$`, 'u');
}

const SNILS_W = [9, 8, 7, 6, 5, 4, 3, 2, 1];
function snilsOk(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (d.length !== 11) return false;
  const num = Number(d.slice(0, 9));
  if (num <= 1001998) return true; // контрольное число проверяется только для номеров больше 001-001-998
  let sum = SNILS_W.reduce((s, w, i) => s + w * Number(d[i]), 0);
  if (sum > 101) sum %= 101;
  const control = sum < 100 ? sum : 0;
  return control === Number(d.slice(9));
}

function innOk(v: string): boolean {
  const d = v.replace(/\D/g, '');
  const n = (ws: number[]) => (ws.reduce((s, w, i) => s + w * Number(d[i]), 0) % 11) % 10;
  if (d.length === 10) return n([2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(d[9]);
  if (d.length === 12) return n([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(d[10]) && n([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(d[11]);
  return false;
}

const isEmailAny = (v: string) => /^[A-Za-z0-9._-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(v);
const isDateTime = (v: string) => {
  const m = /^(\S+) ((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)$/.exec(v);
  return !!m && !!parseDate(m[1]);
};

/** Подстрока по символам, как string.sub в Lua (с 1, включительно, отрицательные — с конца). */
function sub(v: string, i = 1, j = -1): string {
  const chars = [...v];
  const n = chars.length;
  const from = i < 0 ? Math.max(n + i, 0) : Math.max(i - 1, 0);
  const to = j < 0 ? n + j + 1 : Math.min(j, n);
  return from < to ? chars.slice(from, to).join('') : '';
}

/** Функции lib.* — описание каждой в справке (apps/anketa/lua/docs.ts). */
export const textlib = {
  // Текст
  trim: (v: unknown) => str(v).trim(),
  lower: (v: unknown) => str(v).toLowerCase(),
  upper: (v: unknown) => str(v).toUpperCase(),
  capitalize: (v: unknown) => str(v).toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase()),
  cap_first: (v: unknown) => str(v).replace(/^\p{L}/u, (c) => c.toUpperCase()),
  len: (v: unknown) => [...str(v)].length,
  sub: (v: unknown, i?: number, j?: number) => sub(str(v), i ?? 1, j ?? -1),
  words: (v: unknown) => fixSpaces(str(v)).split(' ').filter(Boolean),
  split: (v: unknown, sep: unknown) => str(v).split(str(sep) || ' '),
  join: (list: unknown, sep: unknown) => (Array.isArray(list) ? list.map(str).join(sep === null || sep === undefined ? ', ' : str(sep)) : str(list)),
  starts: (v: unknown, p: unknown) => str(v).startsWith(str(p)),
  ends: (v: unknown, p: unknown) => str(v).endsWith(str(p)),
  contains: (v: unknown, p: unknown) => str(v).includes(str(p)),
  replace: (v: unknown, from: unknown, to: unknown) => (str(from) ? str(v).split(str(from)).join(str(to)) : str(v)),

  // Буквы, пробелы, кавычки
  is_empty: (v: unknown) => str(v).trim() === '',
  has_latin: (v: unknown) => LATIN.test(str(v)),
  has_cyrillic: (v: unknown) => CYR.test(str(v)),
  only_cyrillic: (v: unknown) => {
    const letters = [...str(v)].filter((c) => LETTER.test(c));
    return letters.length > 0 && letters.every((c) => CYR.test(c));
  },
  only_latin: (v: unknown) => {
    const letters = [...str(v)].filter((c) => LETTER.test(c));
    return letters.length > 0 && letters.every((c) => LATIN.test(c));
  },
  has_digits: (v: unknown) => /\d/.test(str(v)),
  only_digits: (v: unknown) => /^\d+$/.test(str(v)),
  extra_spaces: (v: unknown) => str(v) !== fixSpaces(str(v)),
  fix_spaces: (v: unknown) => fixSpaces(str(v)),
  odd_letters: (v: unknown) => str(v) !== str(v).normalize('NFC'),
  mixed_words: (v: unknown) => [...new Set(str(v).normalize('NFC').split(/[^\p{L}\p{M}]+/u).filter((w) => isMixed(w)))],
  fix_letters: (v: unknown) => fixLetters(str(v)),
  is_capitalized: (v: unknown) => /^\p{Lu}/u.test(str(v)),
  is_name: (v: unknown) => /^[А-ЯЁ][а-яё]+(-[А-ЯЁ][а-яё]+)*$/.test(str(v)),
  has_bad_quotes: (v: unknown) => /["“”„']/.test(str(v)),
  fix_quotes: (v: unknown) => fixQuotes(fixSpaces(str(v))),
  in_guillemets: (v: unknown) => /^«[^«»"“”„'\s]+(?: [^«»"“”„'\s]+)*»$/.test(str(v)),

  // Числа и списки
  is_number: (v: unknown) => /^-?\d+(?:[.,]\d+)?$/.test(str(v)),
  number: (v: unknown) => (/^-?\d+(?:[.,]\d+)?$/.test(str(v).trim()) ? Number(str(v).trim().replace(',', '.')) : null),
  in_range: (n: unknown, a: unknown, b: unknown) => typeof n === 'number' && n >= Number(a) && n <= Number(b),
  one_of: (v: unknown, list: unknown) => Array.isArray(list) && list.map(str).includes(str(v)),

  // Форматы
  mask: (v: unknown, mask: unknown) => maskRegex(str(mask)).test(str(v)),
  fix_mask: (v: unknown, mask: unknown) => fillMask(str(v), str(mask)),
  mask_example: (mask: unknown) => str(mask).replace(/9/g, '0'),
  is_date: (v: unknown, from?: number, to?: number) => {
    const d = parseDate(v);
    return !!d && d.year >= (from ?? 1900) && d.year <= (to ?? 2099);
  },
  date: (v: unknown) => parseDate(v),
  fix_date: (v: unknown) => {
    const s = fixSpaces(str(v)).replace(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/, (_m, d: string, m: string, y: string) => `${pad(Number(d))}.${pad(Number(m))}.${y.length === 2 ? (Number(y) > 40 ? '19' : '20') + y : y}`);
    return parseDate(s) ? s : null;
  },
  today: () => todayText(),
  age: (birth: unknown, on?: unknown) => {
    const b = parseDate(birth);
    const now = on ? parseDate(on) : (() => {
      const d = new Date();
      return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
    })();
    if (!b || !now) return null;
    let years = now.year - b.year;
    if (now.month < b.month || (now.month === b.month && now.day < b.day)) years--;
    return years;
  },
  before: (a: unknown, b: unknown) => {
    const [x, y] = [dateNum(a), dateNum(b)];
    return x !== null && y !== null && x < y;
  },
  after: (a: unknown, b: unknown) => {
    const [x, y] = [dateNum(a), dateNum(b)];
    return x !== null && y !== null && x > y;
  },
  is_time: (v: unknown) => /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(str(v)),
  is_datetime: (v: unknown) => isDateTime(str(v)),
  is_email: (v: unknown) => /^[a-z0-9._-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(str(v)),
  is_email_any: (v: unknown) => isEmailAny(str(v)),
  is_phone: (v: unknown) => /^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/.test(str(v)),
  fix_phone: (v: unknown) => fillMask(str(v), '8(999)999-99-99'),
  is_vk: (v: unknown) => /^https:\/\/vk\.(com|ru)\/[A-Za-z0-9_.]+$/.test(str(v)),
  fix_vk: (v: unknown) => {
    const f = fixSpaces(str(v)).replace(/^http:\/\//, 'https://').replace(/^(?:https?:\/\/)?(?:www\.|m\.)?vk\.(ru|com)\//, 'https://vk.$1/');
    return /^https:\/\/vk\.(com|ru)\/[A-Za-z0-9_.]+$/.test(f) ? f : null;
  },
  is_url: (v: unknown) => /^https?:\/\/\S+$/.test(str(v)),
  snils_ok: (v: unknown) => snilsOk(str(v)),
  inn_ok: (v: unknown) => innOk(str(v)),

  // Исправления
  try_fix: (v: unknown, check: unknown, mask?: unknown) => {
    if (typeof check !== 'function') return null;
    return suggestFix(str(v), (x) => truthy(check(x)), mask ? str(mask) : undefined);
  },
};

export type TextLib = typeof textlib;
