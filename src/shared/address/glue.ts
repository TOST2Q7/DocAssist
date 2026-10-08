import { isTypeWord, normWord } from './addrTypes';

/*
 * Поиск «слипшихся» слов — отдельный этап до разбора адреса.
 * Слипшиеся слова — не ошибка данных, а ошибка набора: «д.1», «ул.Ленина»,
 * «РеспубликаХакасия», «Ленина1», «Хакасия,с.». Мы находим их по известным ключам
 * (типы адресов и названия из базы) и предлагаем разделить.
 */

export interface Glue {
  /** Участок исходной строки [start, end). */
  start: number;
  end: number;
  original: string;
  fixed: string;
  reason: string;
}

/** Составные сокращения с точками внутри — их нельзя разрывать («г.о.», «м.р-н»). */
const DOTTED_COMPOUNDS = ['г.о.', 'м.р-н', 'р.п.', 'п.г.т.', 'а.о.', 'с.п.', 'им.', 'т.е.', 'т.д.'];

export interface GlueOptions {
  /** Проверка, есть ли слово в базе (названия населённых пунктов и т.п.). */
  isKnownName?: (word: string) => boolean;
}

export function findGlues(text: string, opts: GlueOptions = {}): Glue[] {
  const found: Glue[] = [];
  const isKnown = (w: string) => w.length >= 3 && (isTypeWord(w) || !!opts.isKnownName?.(w));
  const push = (g: Glue) => {
    if (!found.some((f) => g.start < f.end && f.start < g.end)) found.push(g);
  };

  // 1. Сокращение с точкой вплотную к следующему слову или числу: «ул.Ленина», «д.1».
  for (const m of text.matchAll(/(^|[\s,;(])([\p{L}]{1,6}(?:-[\p{L}]{1,4})?)\.(?=[\p{L}\d])/gu)) {
    const abbrStart = m.index! + m[1].length;
    const abbr = m[2];
    const rest = text.slice(abbrStart).toLowerCase();
    if (DOTTED_COMPOUNDS.some((c) => rest.startsWith(c))) continue;
    if (!isTypeWord(abbr)) continue;
    const dotEnd = abbrStart + abbr.length + 1;
    const wordEnd = dotEnd + (text.slice(dotEnd).match(/^[\p{L}\d-]+/u)?.[0].length ?? 0);
    const original = text.slice(abbrStart, wordEnd);
    push({
      start: abbrStart,
      end: wordEnd,
      original,
      fixed: `${abbr}. ${text.slice(dotEnd, wordEnd)}`,
      reason: `«${original}» — сокращение слиплось со словом`,
    });
  }

  // 2. Сокращение без точки вплотную к числу: «д1», «кв5», «корп2».
  for (const m of text.matchAll(/(^|[\s,;])(д|дом|кв|корп|к|стр|оф|пом|ком|лит)(\d[\p{L}\d/-]*)/giu)) {
    const start = m.index! + m[1].length;
    const original = m[2] + m[3];
    push({ start, end: start + original.length, original, fixed: `${m[2]} ${m[3]}`, reason: `«${original}» — тип и номер слиплись` });
  }

  // 3. Слово с заглавной буквой внутри: «РеспубликаХакасия», «сАскиз».
  for (const m of text.matchAll(/[\p{L}]*[а-яё][А-ЯЁ][\p{L}]*/gu)) {
    const w = m[0];
    const fixed = w.replace(/([а-яё])([А-ЯЁ])/gu, '$1 $2');
    push({ start: m.index!, end: m.index! + w.length, original: w, fixed, reason: `«${w}» — два слова слиплись` });
  }

  // 4. Слово вплотную к числу: «Ленина1» (короткие «д1» обработаны выше).
  for (const m of text.matchAll(/([\p{L}]{3,})(\d+[\p{L}]?)(?![\p{L}\d])/gu)) {
    const original = m[0];
    if (/^(д|дом|кв|корп|стр|оф|пом|ком|лит)$/i.test(m[1])) continue;
    push({ start: m.index!, end: m.index! + original.length, original, fixed: `${m[1]} ${m[2]}`, reason: `«${original}» — слово и номер слиплись` });
  }

  // 5. Число вплотную к слову: «1ул», «5Ленина» (но «1а», «2-я» — нормально).
  for (const m of text.matchAll(/(\d+)([\p{L}]{2,})/gu)) {
    const original = m[0];
    push({ start: m.index!, end: m.index! + original.length, original, fixed: `${m[1]} ${m[2]}`, reason: `«${original}» — номер и слово слиплись` });
  }

  // 6. Нет пробела после запятой: «Хакасия,с. Аскиз».
  for (const m of text.matchAll(/([\p{L}\d.])([,;])(?=[\p{L}\d])/gu)) {
    const i = m.index! + m[1].length;
    push({ start: i, end: i + 1, original: m[2], fixed: `${m[2]} `, reason: 'Нет пробела после запятой' });
  }

  // 7. Два известных слова слиплись без признаков: «республикахакасия», «селоаскиз».
  for (const m of text.matchAll(/[\p{L}]{6,}/gu)) {
    const w = m[0];
    if (isKnown(w)) continue;
    if (found.some((f) => m.index! < f.end && f.start < m.index! + w.length)) continue;
    for (let i = 2; i <= w.length - 2; i++) {
      const left = w.slice(0, i);
      const right = w.slice(i);
      const leftOk = isTypeWord(left) ? left.length >= 1 : isKnown(left);
      if (leftOk && isKnown(right) && (left.length >= 3 || isTypeWord(left))) {
        if (left.length < 3 && !/^[А-ЯЁ]/.test(right)) continue; // «с»+«аскиз» без заглавной — слишком рискованно
        push({ start: m.index!, end: m.index! + w.length, original: w, fixed: `${left} ${right}`, reason: `«${w}» — слова слиплись` });
        break;
      }
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Применить исправления слипшихся слов. */
export function applyGlues(text: string, glues: Glue[]): string {
  let out = text;
  for (const g of [...glues].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, g.start) + g.fixed + out.slice(g.end);
  }
  return out;
}

export { normWord };
