/*
 * Общие текстовые исправления: пробелы, латинские буквы-двойники, кавычки, регистр, опечатки.
 * Сами огрехи находит строгое сравнение с шаблоном (shared/check), здесь — только построение правильной формы.
 */

// ---------- Пробелы и невидимые символы ----------

export function fixSpaces(s: string): string {
  return s
    .replace(/[​‌‍﻿]/g, '')
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/ +([,.;:)»])/g, '$1')
    .replace(/([(«]) +/g, '$1')
    .trim();
}

// ---------- Латинские буквы в русских словах ----------

const LAT_TO_CYR: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', m: 'м', h: 'н', b: 'в', t: 'т',
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
};
const CYR_TO_LAT: Record<string, string> = {
  а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', к: 'k', м: 'm',
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y',
};

const CYR = /[а-яё]/i;
const LAT = /[a-z]/i;

export function fixMixedScript(s: string): string {
  return s.replace(/[\p{L}]+/gu, (w) => {
    if (!(CYR.test(w) && LAT.test(w))) return w;
    const cyrCount = [...w].filter((ch) => CYR.test(ch)).length;
    const latCount = [...w].filter((ch) => LAT.test(ch)).length;
    const map = cyrCount >= latCount ? LAT_TO_CYR : CYR_TO_LAT;
    return [...w].map((ch) => map[ch] ?? ch).join('');
  });
}

// ---------- Кавычки ----------

export type QuoteStyle = 'guillemets' | 'straight' | 'keep';
const QUOTE_CHARS = /["“”„«»]/g;

/** Привести кавычки к одному стилю, определяя открывающие и закрывающие по контексту. */
export function normalizeQuotes(s: string, style: QuoteStyle): string {
  if (style === 'keep') return s;
  const [open, close] = style === 'guillemets' ? ['«', '»'] : ['"', '"'];
  return s.replace(QUOTE_CHARS, (q, i: number) => {
    if (q === '«' || q === '„') return open;
    if (q === '»') return close;
    const prev = i > 0 ? s[i - 1] : '';
    const isOpen = prev === '' || /[\s(«„“\[]/.test(prev);
    return isOpen ? open : close;
  });
}

// ---------- Регистр ----------

const LOWER_WORDS = new Set(['и', 'на', 'в', 'де', 'лет', 'имени', 'им', 'им.', 'ла', 'фон', 'дер', 'ван', 'оглы', 'кызы', 'по']);

export function capitalizeWord(w: string): string {
  return w
    .split('-')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join('-');
}

const isAllLower = (w: string) => w === w.toLowerCase() && w !== w.toUpperCase();
const isAllUpper = (w: string) => w === w.toUpperCase() && w !== w.toLowerCase() && w.replace(/[^\p{L}]/gu, '').length > 1;

/** Поправить регистр названия, если оно написано целиком строчными или ПРОПИСНЫМИ. */
export function fixNameCase(s: string): string {
  return s.replace(/[\p{L}][\p{L}'’-]*/gu, (w, offset: number) => {
    if (!(isAllLower(w) || isAllUpper(w))) return w;
    if (offset > 0 && LOWER_WORDS.has(w.toLowerCase())) return w.toLowerCase();
    return capitalizeWord(w);
  });
}

/** Аббревиатуры организаций, которые пишутся прописными. */
const UPPER_ABBR = [
  'МВД', 'УМВД', 'ГУ', 'ОУФМС', 'УФМС', 'ФМС', 'ТП', 'ОВД', 'ОВМ', 'УВМ', 'ГУВМ', 'РОВД', 'МО', 'МП', 'РФ', 'РХ', 'РТ', 'РБ',
  'ГБПОУ', 'ГАПОУ', 'ГБОУ', 'МБОУ', 'МАОУ', 'ФГБОУ', 'ФГАОУ', 'ГОУ', 'АНО', 'ЧОУ', 'ВО', 'СПО', 'ДПО', 'НИУ', 'ХГУ', 'ХТИ', 'СФУ',
  'ООО', 'ПАО', 'АО', 'ИП', 'РО', 'СО', 'ЛСО', 'РСО', 'МЧС',
];
const UPPER_SET = new Set(UPPER_ABBR.map((a) => a.toLowerCase()));

export function fixAbbreviations(s: string): string {
  return s.replace(/[\p{L}]+/gu, (w) => (UPPER_SET.has(w.toLowerCase()) && w !== w.toUpperCase() && w.length > 1 ? w.toUpperCase() : w));
}

// ---------- Похожесть строк ----------

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[\s ]+/g, ' ').trim();
}

/** Найти ближайшее значение из списка (для опечаток). */
export function closest(value: string, options: string[], maxDistance = 2): string | null {
  const v = normalizeForCompare(value);
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = levenshtein(v, normalizeForCompare(o));
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  const limit = Math.min(maxDistance, Math.max(1, Math.floor(v.length / 4)));
  return bestD <= limit ? best : null;
}
