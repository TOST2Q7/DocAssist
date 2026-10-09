import type { Step } from '@/core/base/tree';
import { ABBREVIATIONS, type Abbr } from './abbr';
import { matcher } from './blocks';
import type { CellKey, CellTemplate, KeyTag } from './template';

/*
 * Разбор ячейки по конструктору — без сложных алгоритмов:
 *   1. делим на блоки (по запятым; для шаблона «через пробел» — по припискам);
 *   2. блок дробим по пробелам и классифицируем слова: приписка / значение;
 *   3. по приписке (или формату значения) узнаём, какая это часть шаблона;
 *   4. проверяем порядок, обязательные части, формат значения;
 *   5. если всё поправимо — собираем правильную запись.
 */

export interface CellIssue {
  text: string;
  span?: [number, number];
  /** Исправляется автоматически (входит в правильную запись). */
  fixable: boolean;
}

export interface CellBlock {
  start: number;
  end: number;
  text: string;
  /** Индекс части в шаблоне. */
  key?: number;
  /** Приписка — как должна быть (уже исправленная). */
  tag?: KeyTag;
  /** Значение без приписки (уже исправленное, если исправление известно). */
  value: string;
  ok: boolean;
}

export interface ParsedCell {
  blocks: CellBlock[];
  issues: CellIssue[];
  /** Части по индексу ключа шаблона. */
  steps: (Step | null)[];
  /** Правильная запись, если все замечания исправимы. */
  canonical?: string;
}

interface Token {
  text: string;
  start: number;
  end: number;
}

interface TagRef {
  key: number;
  tag: KeyTag;
}

const low = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
const lowNoDot = (s: string) => low(s).replace(/\.$/, '');

interface Dict {
  exact: Map<string, TagRef[]>;
  /** Неправильное написание → правильная приписка. */
  variant: Map<string, string>;
  /** Сокращения из справочника, которых нет в шаблоне. */
  foreign: Map<string, Abbr>;
  maxWords: number;
}

function buildDict(t: CellTemplate): Dict {
  const exact = new Map<string, TagRef[]>();
  t.keys.forEach((k, key) => k.tags.forEach((tag) => exact.set(tag.abbr, [...(exact.get(tag.abbr) ?? []), { key, tag }])));
  const variant = new Map<string, string>();
  for (const k of t.keys) {
    for (const tag of k.tags) {
      for (const form of [tag.abbr, tag.title]) {
        const v = lowNoDot(form);
        if (v && !variant.has(v)) variant.set(v, tag.abbr);
      }
    }
  }
  const foreign = new Map<string, Abbr>();
  for (const a of ABBREVIATIONS) {
    const v = lowNoDot(a.abbr);
    if (!exact.has(a.abbr) && !variant.has(v) && !foreign.has(v)) foreign.set(v, a);
  }
  const words = [...exact.keys(), ...t.keys.flatMap((k) => k.tags.map((x) => x.title))].map((s) => s.split(' ').length);
  return { exact, variant, foreign, maxWords: Math.max(1, ...words) };
}

type TagHit =
  | { kind: 'exact'; abbr: string; words: number }
  | { kind: 'variant'; abbr: string; written: string; words: number }
  | { kind: 'foreign'; abbr: Abbr; written: string; words: number };

/** Приписка ли это (последовательность слов). */
function matchTag(dict: Dict, words: string[]): TagHit | null {
  const text = words.join(' ');
  if (dict.exact.has(text)) return { kind: 'exact', abbr: text, words: words.length };
  const v = dict.variant.get(lowNoDot(text));
  if (v) return { kind: 'variant', abbr: v, written: text, words: words.length };
  const f = dict.foreign.get(lowNoDot(text));
  if (f && words.length === 1) return { kind: 'foreign', abbr: f, written: text, words: 1 };
  return null;
}

function longestTag(dict: Dict, tokens: Token[], from: number, dir: 1 | -1, limit: number): TagHit | null {
  for (let n = Math.min(dict.maxWords, limit); n >= 1; n--) {
    const slice = dir === 1 ? tokens.slice(from, from + n) : tokens.slice(from - n + 1, from + 1);
    if (slice.length < n) continue;
    const hit = matchTag(
      dict,
      slice.map((t) => t.text),
    );
    if (hit) return hit;
  }
  return null;
}

const fits = (key: CellKey, value: string) => matcher(key.format).test(value);

const capitalize = (s: string) => s.replace(/^\p{Ll}/u, (c) => c.toUpperCase());

/** Слова блока с позициями. Заодно отмечает лишние пробелы и слипшиеся приписки («ул.Ленина»). */
function tokenize(text: string, offset: number, dict: Dict, issues: CellIssue[], dropCommas = false): Token[] {
  const tokens: Token[] = [];
  const re = dropCommas ? /[^\s,]+/g : /\S+/g;
  let m: RegExpExecArray | null;
  let last = -1;
  while ((m = re.exec(text))) {
    const start = offset + m.index;
    if (last >= 0) {
      const gap = text.slice(last - offset, m.index).replace(dropCommas ? /,/g : /$^/, '');
      if (gap !== ' ' && gap !== '') issues.push({ text: gap.includes('\t') || /[^ ]/.test(gap) ? 'Лишний или нестандартный пробел' : 'Лишний пробел', span: [last, start], fixable: true });
    }
    // Слиплось: «ул.Примерная», «д.1».
    const glued = /^([^\s.]{1,6}\.)(?=[\p{L}\p{N}])/u.exec(m[0]);
    if (glued && (dict.exact.has(glued[1]) || dict.variant.has(lowNoDot(glued[1])) || dict.foreign.has(lowNoDot(glued[1])))) {
      const cut = glued[1].length;
      issues.push({ text: `Слиплось: после «${glued[1]}» нужен пробел`, span: [start, start + m[0].length], fixable: true });
      tokens.push({ text: glued[1], start, end: start + cut });
      tokens.push({ text: m[0].slice(cut), start: start + cut, end: start + m[0].length });
    } else {
      tokens.push({ text: m[0], start, end: start + m[0].length });
    }
    last = start + m[0].length;
  }
  return tokens;
}

interface RawBlock {
  tokens: Token[];
  hit: TagHit | null;
  /** Приписка стоит после значения. */
  tagAfter: boolean;
  tagTokens: Token[];
  valueTokens: Token[];
}

function splitTag(dict: Dict, tokens: Token[]): RawBlock {
  const n = tokens.length;
  const head = n > 1 ? longestTag(dict, tokens, 0, 1, n - 1) : null;
  const tail = n > 1 ? longestTag(dict, tokens, n - 1, -1, n - 1) : null;
  const afterOf = (h: TagHit) => h.kind === 'foreign' ? !!h.abbr.after : !!dict.exact.get(h.abbr)?.[0]?.tag.after;
  let useHead = !!head;
  if (head && tail) useHead = !afterOf(head) || afterOf(tail) === false;
  else if (!head && tail) useHead = false;
  if (useHead && head) return { tokens, hit: head, tagAfter: false, tagTokens: tokens.slice(0, head.words), valueTokens: tokens.slice(head.words) };
  if (tail) return { tokens, hit: tail, tagAfter: true, tagTokens: tokens.slice(n - tail.words), valueTokens: tokens.slice(0, n - tail.words) };
  return { tokens, hit: null, tagAfter: false, tagTokens: [], valueTokens: tokens };
}

/** Деление «через пробел»: приписка до значения забирает слова до следующей приписки, приписка после — одно слово перед собой. */
function segmentBySpaces(t: CellTemplate, dict: Dict, tokens: Token[]): RawBlock[] {
  interface Anchor {
    at: number;
    hit: TagHit;
    after: boolean;
  }
  const anchors: Anchor[] = [];
  for (let i = 0; i < tokens.length; ) {
    const hit = longestTag(dict, tokens, i, 1, tokens.length - i);
    if (hit) {
      const after = hit.kind === 'foreign' ? !!hit.abbr.after : !!dict.exact.get(hit.abbr)?.[0]?.tag.after;
      anchors.push({ at: i, hit, after });
      i += hit.words;
    } else i++;
  }
  const tagless = t.keys.filter((k) => !k.tags.length);
  const blocks: { pos: number; raw: RawBlock }[] = [];
  const free: Token[][] = [];
  const pushFree = (list: Token[]) => {
    if (list.length) free.push(list);
  };

  let cursor = 0;
  for (let a = 0; a <= anchors.length; a++) {
    const right = anchors[a];
    const left = anchors[a - 1];
    const runEnd = right ? right.at : tokens.length;
    let run = tokens.slice(cursor, runEnd);
    let rightValue: Token[] = [];
    if (right?.after && run.length) {
      rightValue = run.slice(-1);
      run = run.slice(0, -1);
    }
    if (left && !left.after) {
      // Хвост, похожий на часть без приписки («Россия»), — отдельно.
      const tail: Token[] = [];
      while (run.length > 1 && tagless.some((k) => fits(k, run[run.length - 1].text))) tail.unshift(run.pop()!);
      const tagTokens = tokens.slice(left.at, left.at + left.hit.words);
      blocks.push({ pos: left.at, raw: { tokens: [...tagTokens, ...run], hit: left.hit, tagAfter: false, tagTokens, valueTokens: run } });
      pushFree(tail);
    } else pushFree(run);
    if (right) {
      const tagTokens = tokens.slice(right.at, right.at + right.hit.words);
      if (right.after) blocks.push({ pos: right.at, raw: { tokens: [...rightValue, ...tagTokens], hit: right.hit, tagAfter: true, tagTokens, valueTokens: rightValue } });
      cursor = right.at + right.hit.words;
    }
  }
  for (const f of free) blocks.push({ pos: tokens.indexOf(f[0]), raw: { tokens: f, hit: null, tagAfter: false, tagTokens: [], valueTokens: f } });
  return blocks.sort((x, y) => x.pos - y.pos).map((b) => b.raw);
}

const formatPart = (tag: KeyTag | undefined, value: string) => (!tag ? value : tag.after ? `${value} ${tag.abbr}` : `${tag.abbr} ${value}`);

export function parseCell(value: string, t: CellTemplate): ParsedCell {
  const dict = buildDict(t);
  const issues: CellIssue[] = [];
  const raws: RawBlock[] = [];

  if (value !== value.trim()) issues.push({ text: 'Лишний пробел в начале или в конце', span: value.startsWith(' ') ? [0, value.length - value.trimStart().length] : [value.trimEnd().length, value.length], fixable: true });

  if (t.separator === ', ') {
    let pos = 0;
    const pieces = value.split(',');
    pieces.forEach((piece, i) => {
      const start = pos;
      pos += piece.length + 1;
      if (!piece.trim()) {
        if (pieces.length > 1) issues.push({ text: i === pieces.length - 1 ? 'Лишняя запятая в конце' : 'Пустая часть между запятыми', span: [Math.max(0, start - 1), start + piece.length], fixable: true });
        return;
      }
      if (i > 0 && !piece.startsWith(' ')) issues.push({ text: 'После запятой нужен пробел', span: [start - 1, start + 1], fixable: true });
      else if (i > 0 && piece.startsWith('  ')) issues.push({ text: 'Лишний пробел после запятой', span: [start, start + piece.length - piece.trimStart().length], fixable: true });
      if (i < pieces.length - 1 && piece.endsWith(' ')) issues.push({ text: 'Лишний пробел перед запятой', span: [start + piece.trimEnd().length, start + piece.length], fixable: true });
      const lead = piece.length - piece.trimStart().length;
      const tokens = tokenize(piece.trim(), start + lead, dict, issues);
      raws.push(splitTag(dict, tokens));
    });
  } else {
    const lead = value.length - value.trimStart().length;
    if (value.includes(',')) {
      const at = value.indexOf(',');
      issues.push({ text: 'Части пишутся через пробел, без запятых', span: [at, at + 1], fixable: true });
    }
    const tokens = tokenize(value.trim(), lead, dict, issues, true);
    raws.push(...segmentBySpaces(t, dict, tokens));
  }

  // Точка в конце ячейки («д. 18.»), если это не приписка.
  const lastRaw = raws[raws.length - 1];
  const lastValue = lastRaw?.valueTokens[lastRaw.valueTokens.length - 1];
  if (lastRaw && lastValue && !lastRaw.tagAfter && /[^.]\.$/.test(lastValue.text) && !matchTag(dict, [lastValue.text])) {
    issues.push({ text: 'Точка в конце не нужна', span: [lastValue.end - 1, lastValue.end], fixable: true });
    lastRaw.valueTokens[lastRaw.valueTokens.length - 1] = { ...lastValue, text: lastValue.text.slice(0, -1), end: lastValue.end - 1 };
  }

  const blocks: CellBlock[] = [];
  const used = new Map<number, number>();
  let pos = 0;

  for (const raw of raws) {
    const start = raw.tokens[0]?.start ?? 0;
    const end = raw.tokens[raw.tokens.length - 1]?.end ?? start;
    const span: [number, number] = [start, end];
    const text = value.slice(start, end);
    const block: CellBlock = { start, end, text, value: raw.valueTokens.map((x) => x.text).join(' '), ok: true };
    blocks.push(block);
    const fail = (msg: string, fixable = false) => {
      issues.push({ text: msg, span, fixable });
      if (!fixable) block.ok = false;
    };

    if (!raw.valueTokens.length) {
      fail(raw.hit ? `После «${raw.tagTokens.map((x) => x.text).join(' ')}» нет названия` : 'Пустая часть');
      continue;
    }

    // Лишние приписки внутри значения: «р-н Районный р-н».
    const extra = raw.valueTokens.filter((tok) => dict.exact.has(tok.text) || dict.variant.has(lowNoDot(tok.text)));
    if (extra.length && raw.hit) {
      for (const tok of extra) issues.push({ text: `Лишнее слово «${tok.text}»`, span: [tok.start, tok.end], fixable: true });
      block.value = raw.valueTokens.filter((tok) => !extra.includes(tok)).map((x) => x.text).join(' ');
      if (!block.value) {
        block.ok = false;
        continue;
      }
    }

    let key: number | undefined;
    if (raw.hit?.kind === 'foreign') {
      const names = t.keys.filter((k) => k.tags.length).map((k) => k.title.toLowerCase());
      fail(`Приписка «${raw.hit.written}» (${raw.hit.abbr.title.toLowerCase()}) не предусмотрена шаблоном. Части: ${names.join(', ')}`);
      continue;
    }
    if (raw.hit) {
      const abbr = raw.hit.abbr;
      const refs = dict.exact.get(abbr) ?? [];
      const ahead = refs.filter((r) => r.key >= pos);
      const pick = ahead.find((r) => fits(t.keys[r.key], block.value)) ?? ahead[0] ?? refs.find((r) => !used.has(r.key)) ?? refs[0];
      key = pick.key;
      block.tag = pick.tag;
      if (raw.hit.kind === 'variant') issues.push({ text: `Нужно «${abbr}» вместо «${raw.hit.written}»`, span: [raw.tagTokens[0].start, raw.tagTokens[raw.tagTokens.length - 1].end], fixable: true });
      if (raw.tagAfter !== !!pick.tag.after) issues.push({ text: `«${abbr}» пишется ${pick.tag.after ? 'после' : 'перед'} названием`, span, fixable: true });
    } else {
      const ahead = t.keys.map((k, i) => ({ k, i })).filter((x) => x.i >= pos);
      const plain = ahead.find((x) => !x.k.tags.length && fits(x.k, block.value));
      if (plain) key = plain.i;
      else {
        const tagged = ahead.find((x) => x.k.tags.length && fits(x.k, block.value));
        const earlier = t.keys.map((k, i) => ({ k, i })).find((x) => x.i < pos && !x.k.tags.length && fits(x.k, block.value));
        if (earlier) key = earlier.i;
        else if (tagged) {
          block.key = tagged.i;
          if (!used.has(tagged.i)) used.set(tagged.i, blocks.length - 1);
          pos = Math.max(pos, tagged.i + 1);
          fail(`Нет приписки у «${block.value}» (${tagged.k.title.toLowerCase()}): ${tagged.k.tags.map((x) => `«${x.abbr}»`).join(', ')}`);
          continue;
        } else {
          fail(`Не удалось понять «${text}» — нет такой части в шаблоне`);
          continue;
        }
      }
    }

    const k = t.keys[key];
    block.key = key;
    if (used.has(key)) {
      fail(`Часть «${k.title}» повторяется`);
      continue;
    }
    if (key < pos) issues.push({ text: `«${k.title}» стоит не на своём месте`, span, fixable: true });
    used.set(key, blocks.length - 1);
    pos = Math.max(pos, key + 1);

    if (!fits(k, block.value)) {
      const fixed = capitalize(block.value);
      if (fixed !== block.value && fits(k, fixed)) {
        issues.push({ text: `«${block.value}» — с заглавной буквы: «${fixed}»`, span, fixable: true });
        block.value = fixed;
      } else fail(`«${block.value}» — не по формату части «${k.title}»`);
    }
  }

  t.keys.forEach((k, i) => {
    if (k.required && !used.has(i)) issues.push({ text: `Нет части «${k.title}»`, fixable: false });
  });

  const steps: (Step | null)[] = t.keys.map((_, i) => {
    const b = used.has(i) ? blocks[used.get(i)!] : undefined;
    return b && b.ok ? { k: t.keys[i].id, v: b.value, ...(b.tag ? { t: b.tag.abbr } : {}), ...(b.tag?.after ? { a: true } : {}) } : null;
  });

  const canonical = issues.every((i) => i.fixable)
    ? t.keys
        .map((_, i) => (used.has(i) ? formatPart(blocks[used.get(i)!].tag, blocks[used.get(i)!].value) : null))
        .filter((x): x is string => x !== null)
        .join(t.separator)
    : undefined;

  return { blocks, issues, steps, canonical };
}
