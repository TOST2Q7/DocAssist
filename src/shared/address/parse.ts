import { COUNTRY_WORDS, findTypes, MAX_TYPE_WORDS, normWord, TYPE_BY_ID } from './addrTypes';
import type { Gazetteer } from './gazetteer';
import type { AddrType, Level } from './types';

/*
 * Разбор адреса на части.
 *
 *   «655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1»
 *     → [индекс 655700] [регион Хакасия] [село Аскиз] [улица Ленина] [дом 1]
 *
 * Работает и без запятых («с. Аскиз Аскизский р-н Республика Хакасия Россия»),
 * и при обратном порядке. Тип части берётся из сокращения («ул.», «р-н»), а если его нет —
 * из базы населённых пунктов («Хакасия» → регион).
 */

export type TokenKind = 'word' | 'number' | 'sep' | 'dash';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  // Номер: «1», «1а», «5/1», «12-14», «1/а/б» (последние два — ошибка формата, но одним куском).
  const re = /(\d+(?:[/-][\d\p{L}]+)*(?:[\p{L}](?![\p{L}]))?)|([\p{L}(][\p{L}()'’.-]*)|([,;])|(\s[-–—]\s|^[-–—]\s)/gu;
  for (const m of text.matchAll(re)) {
    const [whole, num, word, sep, dash] = m;
    const start = m.index!;
    if (num) out.push({ kind: 'number', text: num, start, end: start + num.length });
    else if (word) {
      // «Хакасия.» в конце или «р-н.» — точка в конце слова допустима; «ул.» — сокращение.
      out.push({ kind: 'word', text: word, start, end: start + word.length });
    } else if (sep) out.push({ kind: 'sep', text: sep, start, end: start + 1 });
    else if (dash) out.push({ kind: 'dash', text: whole.trim(), start, end: start + whole.length });
  }
  return out;
}

export interface Component {
  level: Level | null;
  /** Тип из addrTypes (если указан в тексте или выведен). */
  type: AddrType | null;
  /** Как тип был написан в тексте («село», «ул», «Респ.»). */
  typeText: string | null;
  name: string;
  /** Тип стоял не на своём месте («Ленина ул.»). */
  typeMisplaced?: boolean;
  /** Тип не был указан и выведен из базы. */
  typeInferred?: boolean;
  /** Номер дома без «д.» — тип подставлен. */
  typeImplicit?: boolean;
  /** Тип угадан по соседям (слово перед номером дома — скорее всего улица). */
  typeGuessed?: boolean;
  /** «5-12» понято как дом 5, квартира 12. */
  shorthand?: boolean;
  /** Индекс компонента среди «сегментов» (частей между запятыми). */
  segment: number;
  start: number;
  end: number;
}

export interface ParseResult {
  components: Component[];
  /** Сколько частей оказалось в одном сегменте без запятых между ними. */
  segments: number;
}

const isCountryAt = (tokens: Token[], i: number): number => {
  for (const len of [2, 1]) {
    const slice = tokens.slice(i, i + len);
    if (slice.length < len || slice.some((t) => t.kind !== 'word')) continue;
    if (COUNTRY_WORDS.includes(normWord(slice.map((t) => t.text).join(' ')))) return len;
  }
  return 0;
};

/** Попробовать распознать тип, начинающийся с токена i (до MAX_TYPE_WORDS слов). */
function matchType(tokens: Token[], i: number): { types: AddrType[]; len: number; text: string } | null {
  for (let len = MAX_TYPE_WORDS; len >= 1; len--) {
    const slice = tokens.slice(i, i + len);
    if (slice.length < len || slice.some((t) => t.kind !== 'word')) continue;
    const text = slice.map((t) => t.text).join(' ');
    const types = findTypes(text);
    if (types.length) return { types, len, text };
  }
  return null;
}

const COMPATIBLE_LEVEL = (node: { level: Level }, t: AddrType | null) =>
  !t ||
  node.level === t.level ||
  // населённый пункт и город — взаимозаменяемы при поиске (поймаем несоответствие типа отдельно)
  ((node.level === 'city' || node.level === 'settlement') && (t.level === 'city' || t.level === 'settlement'));

export function parseAddress(text: string, gaz: Gazetteer): ParseResult {
  const tokens = tokenize(text);
  const comps: Component[] = [];
  let pending: Token[] = [];
  let segment = 0;

  const flushPending = () => {
    if (!pending.length) return;
    const name = pending.map((t) => t.text).join(' ').replace(/\.$/, '');
    comps.push({ level: null, type: null, typeText: null, name, segment, start: pending[0].start, end: pending[pending.length - 1].end });
    pending = [];
  };

  /**
   * Если в имени несколько слов, начало совпадает с базой, а остаток — тоже известное название
   * («Аскиз Аскизский» перед «р-н»), отделяем остаток в отдельную часть.
   * Неизвестный остаток («Ленина Привет») не отделяем: это лишние слова, о них скажет проверка.
   */
  const splitKnownPrefix = (words: Token[], t: AddrType | null): Token[] => {
    if (words.length < 2) return words;
    for (let k = words.length; k >= 1; k--) {
      const name = words.slice(0, k).map((w) => w.text).join(' ');
      if (!gaz.find(name).some((n) => COMPATIBLE_LEVEL(n, t))) continue;
      if (k === words.length) return words;
      const rest = words.slice(k).map((w) => w.text);
      const restKnown = rest.some((_, i) => gaz.hasName(rest.slice(0, rest.length - i).join(' ')));
      return restKnown ? words.slice(0, k) : words;
    }
    return words;
  };

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok.kind === 'sep') {
      flushPending();
      segment++;
      i++;
      continue;
    }

    if (tok.kind === 'dash') {
      // «Северная Осетия - Алания», «Ханты-Мансийский АО - Югра»: продолжение названия.
      const next = tokens[i + 1];
      const last = comps[comps.length - 1];
      if (next?.kind === 'word' && !pending.length && last && last.segment === segment && !matchType(tokens, i + 1)) {
        last.name += ` - ${next.text.replace(/\.$/, '')}`;
        last.end = next.end;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Индекс: 6 цифр.
    if (tok.kind === 'number' && /^\d{6}$/.test(tok.text)) {
      flushPending();
      comps.push({ level: 'index', type: null, typeText: null, name: tok.text, segment, start: tok.start, end: tok.end });
      i++;
      continue;
    }

    if (tok.kind === 'word') {
      const countryLen = isCountryAt(tokens, i);
      if (countryLen) {
        flushPending();
        const slice = tokens.slice(i, i + countryLen);
        comps.push({ level: 'country', type: null, typeText: null, name: slice.map((t) => t.text).join(' '), segment, start: slice[0].start, end: slice[slice.length - 1].end });
        i += countryLen;
        continue;
      }

      const m = matchType(tokens, i);
      if (m) {
        let types = m.types;
        const after = tokens[i + m.len];
        // «д.» — дом или деревня; «к» — корпус только перед числом.
        if (types.some((t) => t.id === 'dom') && after?.kind === 'word') types = [TYPE_BY_ID.get('der')!];
        if (types.some((t) => t.id === 'korp') && normWord(m.text) === 'к' && after?.kind !== 'number') types = [];
        const t = types[0];
        if (t) {
          const typeTokens = tokens.slice(i, i + m.len);
          const typeStart = typeTokens[0].start;
          const typeEnd = typeTokens[typeTokens.length - 1].end;

          // Тип после названия: «Аскизский р-н», «Красноярский край», а также «Ленина ул.».
          const nextIsEnd =
            !after || after.kind === 'sep' || after.kind === 'dash' || (after.kind === 'word' && (!!matchType(tokens, i + m.len) || !!isCountryAt(tokens, i + m.len)));
          if (pending.length && (t.placement === 'after' || nextIsEnd)) {
            // «Хакасия Аскизский р-н»: известное начало («Хакасия») — отдельная часть.
            while (pending.length > 1) {
              let k = pending.length - 1;
              for (; k >= 1; k--) if (gaz.find(pending.slice(0, k).map((w) => w.text).join(' ')).length) break;
              if (k < 1) break;
              const head = pending.slice(0, k);
              comps.push({ level: null, type: null, typeText: null, name: head.map((w) => w.text).join(' ').replace(/\.$/, ''), segment, start: head[0].start, end: head[head.length - 1].end });
              pending = pending.slice(k);
            }
            const words = pending;
            pending = [];
            comps.push({
              level: t.level,
              type: t,
              typeText: m.text,
              name: words.map((w) => w.text).join(' ').replace(/\.$/, ''),
              typeMisplaced: t.placement === 'before',
              segment,
              start: words[0].start,
              end: typeEnd,
            });
            i += m.len;
            continue;
          }

          // «Аскиз Аскизский р-н»: слово для типа-после «прилипло» к предыдущей части — забираем его.
          if (t.placement === 'after' && !pending.length) {
            const prev = comps[comps.length - 1];
            if (prev && prev.segment === segment && prev.type && prev.name.includes(' ')) {
              const words = prev.name.split(' ');
              let take = 1;
              for (let k = Math.min(3, words.length - 1); k >= 1; k--) {
                if (gaz.find(words.slice(-k).join(' ')).some((n) => n.level === t.level)) {
                  take = k;
                  break;
                }
              }
              const stolen = words.slice(-take).join(' ');
              prev.name = words.slice(0, -take).join(' ');
              comps.push({ level: t.level, type: t, typeText: m.text, name: stolen, segment, start: typeStart, end: typeEnd });
              i += m.len;
              continue;
            }
          }

          flushPending();
          // Тип перед названием: собираем название.
          let j = i + m.len;
          const nameTokens: Token[] = [];
          if (t.numbered) {
            if (tokens[j]?.kind === 'number') nameTokens.push(tokens[j++]);
            // «д. 1 а» → буква отдельно
            if (tokens[j]?.kind === 'word' && /^[\p{L}]$/u.test(tokens[j].text) && !matchType(tokens, j)) nameTokens.push(tokens[j++]);
          } else {
            while (j < tokens.length) {
              const tk = tokens[j];
              if (tk.kind === 'sep' || tk.kind === 'dash') break;
              if (tk.kind === 'word' && (matchType(tokens, j) || isCountryAt(tokens, j))) break;
              if (tk.kind === 'number') {
                // Номер в названии улицы («ул. 8 Марта») — только если за ним идёт слово.
                const nx = tokens[j + 1];
                const isNamePart = (t.level === 'street' || t.level === 'area') && nx?.kind === 'word' && !matchType(tokens, j + 1);
                if (!isNamePart) break;
              }
              nameTokens.push(tk);
              j++;
            }
          }
          if (!t.numbered && nameTokens.length > 1) {
            const kept = splitKnownPrefix(nameTokens, t);
            j -= nameTokens.length - kept.length;
            nameTokens.length = kept.length;
          }
          comps.push({
            level: t.level,
            type: t,
            typeText: m.text,
            name: nameTokens.map((x) => x.text).join(' ').replace(/\.$/, ''),
            segment,
            start: typeStart,
            end: nameTokens.length ? nameTokens[nameTokens.length - 1].end : typeEnd,
          });
          i = j;
          continue;
        }
      }
      pending.push(tok);
      i++;
      continue;
    }

    if (tok.kind === 'number') {
      flushPending();
      let last = comps[comps.length - 1];
      const hasHouse = comps.some((c) => c.level === 'house');
      // «Ленина 5»: слово без типа перед номером — скорее всего улица.
      if (last && last.level === null && !hasHouse && /^[\p{L}]/u.test(last.name) && !gaz.find(last.name).length) {
        last.level = 'street';
        last.type = TYPE_BY_ID.get('ul')!;
        last.typeGuessed = true;
      }
      last = comps[comps.length - 1];
      // «5-12» после улицы — дом 5, квартира 12.
      const short = tok.text.match(/^(\d+[\p{L}]?)-(\d+)$/u);
      if (short && last && (last.level === 'street' || last.level === 'area') && !hasHouse) {
        comps.push({ level: 'house', type: TYPE_BY_ID.get('dom')!, typeText: null, name: short[1], typeImplicit: true, shorthand: true, segment, start: tok.start, end: tok.end });
        comps.push({ level: 'flat', type: TYPE_BY_ID.get('kv')!, typeText: null, name: short[2], typeImplicit: true, shorthand: true, segment, start: tok.start, end: tok.end });
        i++;
        continue;
      }
      if (last && (last.level === 'street' || last.level === 'area' || last.level === 'settlement' || last.level === 'city') && !hasHouse) {
        comps.push({ level: 'house', type: TYPE_BY_ID.get('dom')!, typeText: null, name: tok.text, typeImplicit: true, segment, start: tok.start, end: tok.end });
      } else if (hasHouse && !comps.some((c) => c.level === 'flat') && last?.level === 'house') {
        comps.push({ level: 'flat', type: TYPE_BY_ID.get('kv')!, typeText: null, name: tok.text, typeImplicit: true, segment, start: tok.start, end: tok.end });
      } else {
        comps.push({ level: null, type: null, typeText: null, name: tok.text, segment, start: tok.start, end: tok.end });
      }
      i++;
      continue;
    }
    i++;
  }
  flushPending();

  // Части без типа: определяем по базе.
  for (const c of comps) {
    if (c.level !== null) continue;
    if (/^\d/.test(c.name)) continue;
    const nodes = gaz.find(c.name);
    if (nodes.length) {
      const node = nodes[0];
      c.level = node.level;
      c.type = node.type === 'country' ? null : (TYPE_BY_ID.get(node.type) ?? null);
      c.typeInferred = true;
    }
  }

  return { components: comps, segments: segment + 1 };
}
