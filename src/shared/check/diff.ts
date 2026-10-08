/*
 * Пословная разница между значением и шаблоном — основа строгой проверки.
 * Каждое отличие превращается в понятное замечание с подсветкой:
 * «Лишнее: «Привет»», «Не хватает запятой», «Регистр: «хакасия» → «Хакасия»»…
 */

const LAT = 'aceopxykmhbtACEHKMOPTXYB';
const CYR = 'асеорхукмнвтАСЕНКМОРТХУВ';
const toCyr = (s: string) => [...s].map((c) => (LAT.includes(c) ? CYR[LAT.indexOf(c)] : c)).join('');
const toLat = (s: string) => [...s].map((c) => (CYR.includes(c) ? LAT[CYR.indexOf(c)] : c)).join('');

export interface Tok {
  text: string;
  start: number;
  end: number;
}

export function diffTokens(s: string): Tok[] {
  const out: Tok[] = [];
  for (const m of s.matchAll(/[\p{L}\p{N}]+|\s+|[^\p{L}\p{N}\s]/gu)) {
    out.push({ text: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

export interface Hunk {
  /** Что убрать из значения. */
  del: string;
  /** Что вставить. */
  ins: string;
  /** Участок исходного значения; для вставки start === end (место вставки). */
  start: number;
  end: number;
}

function lcsPairs<T>(x: T[], y: T[], eq: (a: T, b: T) => boolean): [number, number][] {
  const n = x.length;
  const m = y.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(x[i], y[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(x[i], y[j])) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** «Мягкий» ключ: без учёта регистра, латинских двойников, вида пробелов и кавычек. */
function softKey(t: string): string {
  if (/^\s+$/u.test(t)) return ' ';
  if (/^["«»“”„']$/.test(t)) return '"';
  return toCyr(t).toLowerCase().replace(/ё/g, 'е');
}

export function diffHunks(a: string, b: string): Hunk[] {
  const x = diffTokens(a);
  const y = diffTokens(b);
  const hunks: Hunk[] = [];
  const all = lcsPairs(x, y, (p, q) => p.text === q.text);
  // Пробел, совпавший «посередине» между двумя правками, — случайная опора: убираем её,
  // иначе «дом 1» → «д. 1» распадётся на «Лишнее: дом» и «Не хватает: д.».
  const exact = all.filter(([ei, ej], k) => {
    if (!/^\s+$/u.test(x[ei].text)) return true;
    const [pi0, pj0] = k > 0 ? all[k - 1] : [-1, -1];
    const [ni, nj] = k < all.length - 1 ? all[k + 1] : [x.length, y.length];
    const gapBefore = ei - pi0 > 1 || ej - pj0 > 1;
    const gapAfter = ni - ei > 1 || nj - ej > 1;
    return !(gapBefore && gapAfter);
  });
  // Участки между точными совпадениями — изменения. Внутри каждого ищем «мягкие» пары,
  // чтобы соседние правки дали отдельные сообщения («хакасия» → «Хакасия» и «Не хватает запятой»).
  let pi = 0;
  let pj = 0;
  const regions: { dels: Tok[]; inss: Tok[]; pos: number }[] = [];
  for (const [ei, ej] of [...exact, [x.length, y.length] as [number, number]]) {
    if (ei > pi || ej > pj) regions.push({ dels: x.slice(pi, ei), inss: y.slice(pj, ej), pos: pi < x.length ? x[pi].start : a.length });
    pi = ei + 1;
    pj = ej + 1;
  }
  for (const { dels, inss, pos } of regions) {
    const soft = lcsPairs(dels, inss, (p, q) => softKey(p.text) === softKey(q.text));
    let cur: Hunk | null = null;
    let cursor = pos;
    let di = 0;
    let ii = 0;
    const flush = () => {
      if (cur && (cur.del || cur.ins)) hunks.push(cur);
      cur = null;
    };
    const take = (toD: number, toI: number) => {
      while (di < toD) {
        const t = dels[di++];
        cur ??= { del: '', ins: '', start: t.start, end: t.start };
        cur.del += t.text;
        cur.end = t.end;
        cursor = t.end;
      }
      while (ii < toI) {
        cur ??= { del: '', ins: '', start: cursor, end: cursor };
        cur.ins += inss[ii++].text;
      }
    };
    for (const [sd, si] of soft) {
      take(sd, si);
      flush();
      const d = dels[di++];
      const i = inss[ii++];
      cursor = d.end;
      if (d.text !== i.text) hunks.push({ del: d.text, ins: i.text, start: d.start, end: d.end });
    }
    take(dels.length, inss.length);
    flush();
  }
  return hunks;
}

const SPECIAL_SPACES: [RegExp, string][] = [
  [/ /, 'неразрывный пробел'],
  [/\t/, 'табуляция'],
  [/[\r\n]/, 'перенос строки'],
  [/[​‌‍﻿]/, 'невидимый символ'],
];


const QUOTES = /^["«»“”„']+$/;

export interface HunkText {
  message: string;
  category: 'format' | 'chars';
}

export function describeHunk(h: Hunk): HunkText {
  const del = h.del;
  const ins = h.ins;
  const isWs = (s: string) => /^\s+$/u.test(s);
  if (del && isWs(del) && (!ins || isWs(ins))) {
    for (const [re, name] of SPECIAL_SPACES) if (re.test(del)) return { message: `Лишний символ: ${name}`, category: 'chars' };
    const extra = del.length - (ins ? ins.length : 0);
    return { message: extra > 1 || (!ins && del.length > 1) ? 'Лишние пробелы' : 'Лишний пробел', category: 'chars' };
  }
  if (del && !ins) {
    if (/^\s*[.,;:!?)(\-–—/\\]\s*$/.test(del)) return { message: `Лишний знак «${del.trim()}»`, category: 'format' };
    if (QUOTES.test(del.trim())) return { message: `Лишняя кавычка ${del.trim()}`, category: 'format' };
    return { message: `Лишнее: «${del.trim()}»`, category: 'format' };
  }
  if (!del && ins) {
    if (ins === ' ') return { message: 'Не хватает пробела', category: 'chars' };
    if (/^,\s?$/.test(ins)) return { message: 'Не хватает запятой', category: 'format' };
    if (ins === '.' || ins === '. ') return { message: 'Не хватает точки', category: 'format' };
    if (ins.trim() === '«') return { message: 'Не хватает открывающей кавычки «', category: 'format' };
    if (ins.trim() === '»') return { message: 'Не хватает закрывающей кавычки »', category: 'format' };
    if (QUOTES.test(ins.trim())) return { message: `Не хватает кавычки ${ins.trim()}`, category: 'format' };
    return { message: `Не хватает: «${ins.trim()}»`, category: 'format' };
  }
  // Замена
  if (del.toLowerCase() === ins.toLowerCase()) return { message: `Регистр: «${del}» → «${ins}»`, category: 'format' };
  if (toCyr(del) === ins) return { message: `Латинские буквы вместо русских в «${del}»`, category: 'chars' };
  if (toLat(del) === ins) return { message: `Русские буквы вместо латинских в «${del}»`, category: 'chars' };
  if (QUOTES.test(del.trim()) && QUOTES.test(ins.trim())) return { message: `Кавычки: ${del.trim()} → ${ins.trim()}`, category: 'format' };
  if (isWs(del) && !isWs(ins)) return { message: `Вместо пробела нужно «${ins.trim()}»`, category: 'format' };
  return { message: `«${del.trim()}» → «${ins.trim()}»`, category: 'format' };
}
