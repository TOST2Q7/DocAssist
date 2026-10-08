/*
 * Общие текстовые проверки и исправления.
 * Каждая функция возвращает найденные проблемы с позициями (для подсветки) и исправленный текст.
 */

export interface TextProblem {
  code: string;
  message: string;
  /** Позиция в исходной строке [start, end). */
  span?: [number, number];
}

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

export function spaceProblems(s: string): TextProblem[] {
  const out: TextProblem[] = [];
  if (/^\s/.test(s) || /\s$/.test(s)) out.push({ code: 'trim', message: 'Лишние пробелы в начале или в конце' });
  for (const m of s.matchAll(/ {2,}/g)) out.push({ code: 'double-space', message: 'Двойной пробел', span: [m.index!, m.index! + m[0].length] });
  for (const m of s.matchAll(/[ \t\r\n​‌‍﻿]/g)) {
    out.push({ code: 'invisible', message: 'Невидимый или служебный символ (перенос строки, табуляция, неразрывный пробел)', span: [m.index!, m.index! + 1] });
  }
  for (const m of s.matchAll(/ +[,;)]/g)) out.push({ code: 'space-before-punct', message: 'Пробел перед знаком препинания', span: [m.index!, m.index! + m[0].length] });
  return out;
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

/** Найти слова, где смешаны кириллица и латиница (типичная ошибка: «Иванoв» с латинской «o»). */
export function mixedScriptProblems(s: string): TextProblem[] {
  const out: TextProblem[] = [];
  for (const m of s.matchAll(/[\p{L}]+/gu)) {
    const w = m[0];
    if (CYR.test(w) && LAT.test(w)) {
      const cyrCount = [...w].filter((ch) => CYR.test(ch)).length;
      const latCount = [...w].filter((ch) => LAT.test(ch)).length;
      const toCyr = cyrCount >= latCount;
      const bad = [...w].filter((ch) => (toCyr ? LAT.test(ch) : CYR.test(ch)));
      out.push({
        code: 'mixed-script',
        message: `В слове «${w}» смешаны русские и латинские буквы (${toCyr ? 'латинские' : 'русские'}: ${[...new Set(bad)].join(', ')})`,
        span: [m.index!, m.index! + w.length],
      });
    }
  }
  return out;
}

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

export function quoteProblems(s: string, style: QuoteStyle): TextProblem[] {
  const out: TextProblem[] = [];
  const quotes = [...s.matchAll(QUOTE_CHARS)];
  if (!quotes.length) return out;
  const normalized = normalizeQuotes(s, 'guillemets');
  let depth = 0;
  let unbalanced = false;
  for (const ch of normalized) {
    if (ch === '«') depth++;
    if (ch === '»') depth--;
    if (depth < 0) unbalanced = true;
  }
  if (depth !== 0 || unbalanced) out.push({ code: 'quotes-unbalanced', message: 'Непарные кавычки: открывающих и закрывающих разное количество' });
  const kinds = new Set(quotes.map((q) => (q[0] === '«' || q[0] === '»' ? 'g' : q[0] === '"' ? 's' : 'c')));
  if (kinds.size > 1) {
    out.push({ code: 'quotes-mixed', message: 'Кавычки разного вида (например, "…» )' });
  } else if (style !== 'keep') {
    const want = style === 'guillemets' ? 'g' : 's';
    if (!kinds.has(want)) out.push({ code: 'quotes-style', message: style === 'guillemets' ? 'Рекомендуются кавычки-ёлочки «…»' : 'Рекомендуются прямые кавычки "…"' });
  }
  return out;
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
export const UPPER_ABBR = [
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
