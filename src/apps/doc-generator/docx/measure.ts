/*
 * Ширина текста в Times New Roman — чтобы понять, поместится ли значение в ячейку бланка,
 * и перенести длинный адрес во вторую строку, как в образце методички.
 * Ширины знаков — из метрик шрифта, в тысячных долях кегля.
 */

const GROUPS: [number, string][] = [
  [180, "'"],
  [200, '|'],
  [250, ' .,'],
  [278, ':;/\\ijlt'],
  [333, '!-()[]frI'],
  [389, 'sJ'],
  [395, 'з'],
  [408, '"'],
  [410, 'г'],
  [429, 'э'],
  [437, 'т'],
  [444, '?acezаеёс'],
  [456, 'ь'],
  [460, 'я'],
  [472, 'в'],
  [486, 'к'],
  [499, 'л'],
  [500, '–«»#*0123456789_bdghknopquvxyорух'],
  [501, 'З'],
  [503, 'ч'],
  [509, 'бд'],
  [517, 'ъ'],
  [535, 'ийнпц'],
  [556, 'FPSР'],
  [564, '+=<>'],
  [574, 'БЬ'],
  [578, 'Г'],
  [611, 'ELTZЕЁТ'],
  [633, 'м'],
  [648, 'ф'],
  [650, 'Ч'],
  [660, 'Э'],
  [667, 'BCRВКСЯ'],
  [672, 'ы'],
  [678, 'Л'],
  [682, 'Д'],
  [691, 'ж'],
  [706, 'Ъ'],
  [708, 'У'],
  [722, 'wADGHKNOQUVXYАИЙНОПХЦ'],
  [747, 'ю'],
  [770, 'шщ'],
  [778, '&m'],
  [790, 'Ф'],
  [833, '%'],
  [872, 'Ы'],
  [889, 'MМ'],
  [896, 'Ж'],
  [921, '@'],
  [944, 'W'],
  [954, '№'],
  [1000, '—'],
  [1009, 'ШЩ'],
  [1028, 'Ю'],
];
const W = new Map<string, number>(GROUPS.flatMap(([w, chars]) => [...chars].map((c) => [c, w] as [string, number])));

/** Ширина текста в тысячных долях кегля. Незнакомые знаки считаются широкими. */
export function textWidth(text: string): number {
  let w = 0;
  for (const c of text) w += W.get(c) ?? 600;
  return w;
}

/**
 * Сколько тысячных долей кегля помещается в ячейку шириной twips (1/20 пункта) при кегле sizePt.
 * Справа вычитается поле ячейки (0,19 см), слева текст в бланке сдвинут на поле — его не вычитаем.
 * 2 % — запас на мелкие расхождения при отрисовке.
 */
export function cellCapacity(twips: number, sizePt = 12): number {
  const pt = Math.max(0, twips - 108) / 20;
  return Math.floor((pt / sizePt) * 1000 * 0.98);
}

export function fits(text: string, capacity: number): boolean {
  return textWidth(text) <= capacity;
}

export interface Lines {
  lines: string[];
  /** Текст не поместился во все строки целиком. */
  overflow: boolean;
}

/**
 * Разбить текст по строкам заданной вместимости. Перенос — после запятой (как в образце:
 * «…, ул. Ярыгина,» / «д. 20, кв. 1»), а если так не выходит — по пробелу.
 * Всё, что не поместилось, остаётся в последней строке (overflow = true).
 */
export function splitLines(text: string, capacities: number[]): Lines {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  for (let n = 0; n < capacities.length; n++) {
    const rest = words.slice(i);
    if (!rest.length) break;
    const last = n === capacities.length - 1;
    if (last || fits(rest.join(' '), capacities[n])) {
      lines.push(rest.join(' '));
      i = words.length;
      break;
    }
    // Сколько слов помещается в строку.
    let take = 0;
    while (take < rest.length && fits(rest.slice(0, take + 1).join(' '), capacities[n])) take++;
    // Перенос после запятой, если такой есть в поместившейся части и строка не останется полупустой.
    let cut = take;
    for (let k = take; k > 0; k--) {
      if (rest[k - 1].endsWith(',') && textWidth(rest.slice(0, k).join(' ')) * 2 >= capacities[n]) {
        cut = k;
        break;
      }
    }
    if (cut === 0) cut = Math.max(1, take);
    lines.push(rest.slice(0, cut).join(' '));
    i += cut;
  }
  const overflow = lines.length > 0 && !fits(lines[lines.length - 1], capacities[lines.length - 1] ?? 0);
  return { lines, overflow };
}
