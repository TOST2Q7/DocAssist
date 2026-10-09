import { plural } from '@/core/util/format';

/*
 * Мини-язык блоков для формата поля: значение собирается из блоков по порядку, блоки превращаются в regex.
 * Человек пишет не «^8\(\d{3}\)\d{3}-\d{2}-\d{2}$», а: Текст «8(» · Цифры 3 · Текст «)» · Цифры 3 · …
 */

/** Сколько раз: от min до max; max = null — без ограничения. */
export interface Count {
  min: number;
  max: number | null;
}

export type CaseMode = 'any' | 'lower' | 'upper' | 'cap';

export type Block =
  | { type: 'text'; text: string; optional?: boolean }
  | { type: 'digits'; count: Count; optional?: boolean }
  | { type: 'number'; from: number; to: number; optional?: boolean }
  | { type: 'chars'; ru: boolean; en: boolean; digits: boolean; extra: string; case: CaseMode; count: Count; optional?: boolean }
  | { type: 'oneof'; options: string[]; optional?: boolean }
  | { type: 'space'; optional?: boolean }
  | { type: 'anytext'; optional?: boolean };

export type BlockType = Block['type'];

export const BLOCK_TITLES: Record<BlockType, string> = {
  text: 'Текст',
  digits: 'Цифры',
  number: 'Число от … до …',
  chars: 'Символы',
  oneof: 'Одно из',
  space: 'Пробел',
  anytext: 'Любой текст',
};

export const BLOCK_HINTS: Record<BlockType, string> = {
  text: 'Точно такие символы: «8(», «-», «@», «https://vk.com/»',
  digits: 'Цифры 0–9: ровно столько или от … до …',
  number: 'Целое число в диапазоне, например курс от 1 до 11',
  chars: 'Буквы (русские, латинские), цифры и свои символы; регистр; сколько',
  oneof: 'Одно из перечисленных значений: «Да», «Нет»',
  space: 'Ровно один пробел',
  anytext: 'Любые слова через один пробел, без лишних пробелов',
};

export function newBlock(type: BlockType): Block {
  switch (type) {
    case 'text':
      return { type, text: '-' };
    case 'digits':
      return { type, count: { min: 3, max: 3 } };
    case 'number':
      return { type, from: 1, to: 6 };
    case 'chars':
      return { type, ru: true, en: false, digits: false, extra: '', case: 'cap', count: { min: 2, max: null } };
    case 'oneof':
      return { type, options: ['Да', 'Нет'] };
    case 'space':
      return { type };
    case 'anytext':
      return { type };
  }
}

const escapeText = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const escapeClass = (s: string) => s.replace(/[\\\]^[-]/g, '\\$&');

function quant(c: Count): string {
  const min = Math.max(0, Math.floor(c.min));
  const max = c.max === null ? null : Math.max(min, Math.floor(c.max));
  if (max === null) return min === 0 ? '*' : min === 1 ? '+' : `{${min},}`;
  if (min === max) return min === 1 ? '' : `{${min}}`;
  return `{${min},${max}}`;
}

function charClass(b: Extract<Block, { type: 'chars' }>, mode: 'lower' | 'upper' | 'any'): string {
  let s = '';
  if (b.ru) s += mode === 'lower' ? 'а-яё' : mode === 'upper' ? 'А-ЯЁ' : 'А-ЯЁа-яё';
  if (b.en) s += mode === 'lower' ? 'a-z' : mode === 'upper' ? 'A-Z' : 'A-Za-z';
  if (b.digits) s += '0-9';
  if (b.extra) s += escapeClass([...new Set(b.extra)].join(''));
  return s ? `[${s}]` : '';
}

/** Один блок — в regex (без ^ и $). */
export function blockRegex(b: Block): string {
  let r: string;
  let group = false;
  switch (b.type) {
    case 'text':
      r = escapeText(b.text);
      group = b.text.length > 1;
      break;
    case 'digits': {
      const q = quant(b.count);
      r = `\\d${q}`;
      group = q !== '';
      break;
    }
    case 'number': {
      const lo = Math.min(b.from, b.to);
      const hi = Math.max(b.from, b.to);
      const vals: string[] = [];
      for (let i = lo; i <= hi && vals.length <= 1000; i++) vals.push(String(i));
      r = vals.length === 1 ? vals[0] : `(?:${vals.join('|')})`;
      group = vals.length === 1 && vals[0].length > 1;
      break;
    }
    case 'chars': {
      if (b.case === 'cap') {
        // Первая заглавная, остальные строчные: «Иванов».
        const first = charClass(b, 'upper') || charClass(b, 'any');
        const rest = charClass(b, 'lower') || charClass(b, 'any');
        const min = Math.max(0, b.count.min - 1);
        const max = b.count.max === null ? null : Math.max(0, b.count.max - 1);
        r = `${first}${max === 0 ? '' : rest + quant({ min, max })}`;
        group = true;
      } else {
        const q = quant(b.count);
        r = `${charClass(b, b.case)}${q}`;
        group = q !== '';
      }
      break;
    }
    case 'oneof': {
      const opts = b.options.map((o) => o.trim()).filter(Boolean);
      r = opts.length === 1 ? escapeText(opts[0]) : `(?:${opts.map(escapeText).join('|')})`;
      group = opts.length === 1 && opts[0].length > 1;
      break;
    }
    case 'space':
      r = ' ';
      break;
    case 'anytext':
      r = '\\S+(?: \\S+)*';
      group = true;
      break;
  }
  if (b.optional) return group ? `(?:${r})?` : `${r}?`;
  return r;
}

/** Все блоки — в regex целиком: ^…$. */
export function blocksToRegex(blocks: Block[]): string {
  if (!blocks.length) return '';
  return `^${blocks.map(blockRegex).join('')}$`;
}

const countText = (c: Count, forms: [string, string, string]) => {
  if (c.max === null) return c.min <= 1 ? `${forms[2]} (сколько угодно)` : `от ${c.min} ${forms[1]}`;
  if (c.min === c.max) return `${c.min} ${plural(c.min, forms)}`;
  return `${c.min}–${c.max} ${forms[1]}`;
};
const DIGITS: [string, string, string] = ['цифра', 'цифр', 'цифр'];
const CHARS: [string, string, string] = ['символ', 'символа', 'символов'];

/** Описание блока для человека: «3 цифры», «число от 1 до 11», «текст «8(»». */
export function describeBlock(b: Block): string {
  let d: string;
  switch (b.type) {
    case 'text':
      d = `«${b.text}»`;
      break;
    case 'digits':
      d = countText(b.count, [DIGITS[0], 'цифры', DIGITS[2]]);
      break;
    case 'number':
      d = `число от ${Math.min(b.from, b.to)} до ${Math.max(b.from, b.to)}`;
      break;
    case 'chars': {
      const kinds = [b.ru && 'русские', b.en && 'латинские', b.digits && 'цифры', b.extra && `«${b.extra}»`].filter(Boolean).join(', ');
      const cs = b.case === 'cap' ? ', с заглавной' : b.case === 'upper' ? ', заглавные' : b.case === 'lower' ? ', строчные' : '';
      d = `${countText(b.count, CHARS)} (${kinds}${cs})`;
      break;
    }
    case 'oneof':
      d = b.options.filter((o) => o.trim()).map((o) => `«${o.trim()}»`).join(' или ');
      break;
    case 'space':
      d = 'пробел';
      break;
    case 'anytext':
      d = 'любой текст';
      break;
  }
  return b.optional ? `[${d}]` : d;
}

export function describeBlocks(blocks: Block[]): string {
  return blocks.map(describeBlock).join(' + ');
}

/** Проблемы в блоках — чтобы не собрать формат, который ничему не соответствует. */
export function checkBlocks(blocks: Block[]): string[] {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    const n = `Блок ${i + 1}`;
    if (b.type === 'text' && !b.text) out.push(`${n}: пустой текст`);
    if (b.type === 'chars' && !b.ru && !b.en && !b.digits && !b.extra) out.push(`${n}: не выбрано, какие символы`);
    if (b.type === 'oneof' && !b.options.some((o) => o.trim())) out.push(`${n}: нет вариантов`);
    if ((b.type === 'digits' || b.type === 'chars') && b.count.max !== null && b.count.max < b.count.min) out.push(`${n}: «до» меньше «от»`);
    if (b.type === 'number' && Math.abs(b.to - b.from) > 1000) out.push(`${n}: слишком большой диапазон (до 1000 чисел)`);
  });
  return out;
}

/** Маска для исправления из блоков — если формат состоит только из текста, пробелов и точного числа цифр. */
export function blocksMask(blocks: Block[]): string | undefined {
  let mask = '';
  for (const b of blocks) {
    if (b.optional) return undefined;
    if (b.type === 'text' && !b.text.includes('9')) mask += b.text;
    else if (b.type === 'space') mask += ' ';
    else if (b.type === 'digits' && b.count.max === b.count.min && b.count.min > 0) mask += '9'.repeat(b.count.min);
    else return undefined;
  }
  return mask.includes('9') ? mask : undefined;
}

// ---------- Блоки для готовых форматов ----------

const T = (text: string): Block => ({ type: 'text', text });
const D = (n: number): Block => ({ type: 'digits', count: { min: n, max: n } });

/** Готовые форматы, которые можно показать блоками (остальные — только regex). */
export const PRESET_BLOCKS: Record<string, Block[]> = {
  phone: [T('8('), D(3), T(')'), D(3), T('-'), D(2), T('-'), D(2)],
  snils: [D(3), T('-'), D(3), T('-'), D(3), { type: 'space' }, D(2)],
  inn: [D(12)],
  series: [D(4)],
  number: [D(6)],
  code: [D(3), T('-'), D(3)],
  card: [D(2), T('-'), D(2), { type: 'space' }, D(3)],
  course: [{ type: 'number', from: 1, to: 6 }],
  group: [{ type: 'chars', ru: true, en: true, digits: true, extra: '-./', case: 'any', count: { min: 1, max: null } }],
  gender: [{ type: 'oneof', options: ['Мужской', 'Женский'] }],
  form: [{ type: 'oneof', options: ['очная', 'заочная', 'очно-заочная'] }],
  yesno: [{ type: 'oneof', options: ['Да', 'Нет'] }],
  vk: [
    { type: 'oneof', options: ['https://vk.com/', 'https://vk.ru/'] },
    { type: 'chars', ru: false, en: true, digits: true, extra: '_.', case: 'any', count: { min: 1, max: null } },
  ],
  text: [{ type: 'anytext' }],
};
