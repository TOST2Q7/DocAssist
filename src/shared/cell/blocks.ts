import { plural } from '@/core/util/format';

/*
 * Формат значения — мини-язык блоков. Значение собирается из блоков по порядку:
 *   телефон  = Текст «8(» · Цифры 3 · Текст «)» · Цифры 3 · Текст «-» · Цифры 2 · Текст «-» · Цифры 2
 *   курс     = Число от 1 до 6
 *   дата     = Дата (настоящая дата календаря, годы 1900–2099)
 *
 * Человек видит и правит только блоки. Внутри блоки собираются в регулярное выражение, но оно нигде
 * не показывается и не редактируется: в regex легко ошибиться незаметно («[1-11]» — это одна цифра «1»).
 */

/** Сколько раз: от min до max; max = null — без ограничения. */
export interface Count {
  min: number;
  max: number | null;
}

export type CaseMode = 'any' | 'lower' | 'upper' | 'cap';
/** Кавычки в тексте: любые; только «ёлочки»; без кавычек. */
export type QuotesMode = 'any' | 'guillemets' | 'none';

interface Opt {
  /** Блока может не быть. */
  optional?: boolean;
}

export type Block = Opt &
  (
    | { type: 'text'; text: string }
    | { type: 'digits'; count: Count }
    | { type: 'number'; from: number; to: number }
    | { type: 'chars'; ru: boolean; en: boolean; digits: boolean; extra: string; case: CaseMode; count: Count }
    | { type: 'oneof'; options: string[] }
    | { type: 'space' }
    | { type: 'anytext'; cap?: boolean; ru?: boolean; quotes?: QuotesMode }
    | { type: 'word'; hyphen: boolean }
    | { type: 'house'; slash: boolean }
    | { type: 'date'; yearFrom: number; yearTo: number }
    | { type: 'time'; seconds: boolean }
    | { type: 'email' }
  );

export type BlockType = Block['type'];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

export const BLOCK_TITLES: Record<BlockType, string> = {
  text: 'Текст',
  space: 'Пробел',
  digits: 'Цифры',
  number: 'Число от … до …',
  oneof: 'Одно из',
  chars: 'Символы',
  anytext: 'Любой текст',
  word: 'Слово с заглавной',
  date: 'Дата',
  time: 'Время',
  house: 'Номер дома',
  email: 'Почта',
};

export const BLOCK_HINTS: Record<BlockType, string> = {
  text: 'Точно такие символы: «8(», «-», «@», «https://vk.com/»',
  space: 'Ровно один пробел',
  digits: 'Цифры 0–9: ровно столько или от … до …',
  number: 'Целое число в диапазоне, например курс от 1 до 11',
  oneof: 'Одно из перечисленных значений: «Да», «Нет»',
  chars: 'Буквы (русские, латинские), цифры и свои символы; регистр; сколько',
  anytext: 'Слова через один пробел, без пробелов в начале и в конце',
  word: 'Русское слово с заглавной буквы: «Иван», «Петрова-Водкина»',
  date: 'ДД.ММ.ГГГГ — только настоящие даты: 31.04 или 29.02 не в високосный год не пройдут',
  time: 'ЧЧ:ММ или ЧЧ:ММ:СС, часы 00–23',
  house: '1, 12а, 12/3, 12а/1б',
  email: 'name@example.com — строчными буквами',
};

/** Основные блоки и готовые части — две группы кнопок «Добавить». */
export const BASIC_BLOCKS: BlockType[] = ['text', 'space', 'digits', 'number', 'oneof', 'chars'];
export const READY_BLOCKS: BlockType[] = ['anytext', 'word', 'date', 'time', 'house', 'email'];

export const YEAR_FROM = 1900;
export const YEAR_TO = 2099;

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
    case 'word':
      return { type, hyphen: true };
    case 'house':
      return { type, slash: true };
    case 'date':
      return { type, yearFrom: YEAR_FROM, yearTo: YEAR_TO };
    case 'time':
      return { type, seconds: true };
    case 'email':
      return { type };
  }
}

// ---------- Блоки → проверка значения ----------

const escapeText = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const escapeClass = (s: string) => s.replace(/[\\\]^[-]/g, '\\$&');
const NEVER = '(?!)';

function quant(c: Count): string {
  const min = Math.max(0, Math.floor(c.min));
  const max = c.max === null ? null : Math.max(min, Math.floor(c.max));
  if (max === null) return min === 0 ? '*' : min === 1 ? '+' : `{${min},}`;
  if (min === max) return min === 1 ? '' : `{${min}}`;
  return `{${min},${max}}`;
}

function charClass(b: BlockOf<'chars'>, mode: 'lower' | 'upper' | 'any'): string {
  let s = '';
  if (b.ru) s += mode === 'lower' ? 'а-яё' : mode === 'upper' ? 'А-ЯЁ' : 'А-ЯЁа-яё';
  if (b.en) s += mode === 'lower' ? 'a-z' : mode === 'upper' ? 'A-Z' : 'A-Za-z';
  if (b.digits) s += '0-9';
  if (b.extra) s += escapeClass([...new Set(b.extra)].join(''));
  return s ? `[${s}]` : '';
}

const numberRange = (b: BlockOf<'number'>): [number, number] => [Math.min(b.from, b.to), Math.max(b.from, b.to)];
const MAX_NUMBERS = 1000;

/** Один блок — во внутреннее выражение. Дата — единственный блок с группами (день, месяц, год проверяются отдельно). */
function source(b: Block): string {
  switch (b.type) {
    case 'text':
      return escapeText(b.text);
    case 'space':
      return ' ';
    case 'digits':
      return `\\d${quant(b.count)}`;
    case 'number': {
      const [lo, hi] = numberRange(b);
      if (hi - lo >= MAX_NUMBERS) return NEVER;
      const vals: string[] = [];
      for (let i = lo; i <= hi; i++) vals.push(String(i));
      return vals.join('|');
    }
    case 'chars': {
      const any = charClass(b, 'any');
      if (!any) return NEVER;
      if (b.case !== 'cap') return `${charClass(b, b.case)}${quant(b.count)}`;
      // Первая заглавная, остальные строчные: «Иванов». Если заглавных нет (только цифры) — любой символ.
      const first = charClass(b, 'upper') || any;
      const rest = charClass(b, 'lower') || any;
      const max = b.count.max === null ? null : Math.max(0, b.count.max - 1);
      if (b.count.max !== null && b.count.max < 1) return '';
      return `${first}${max === 0 ? '' : rest + quant({ min: Math.max(0, b.count.min - 1), max })}`;
    }
    case 'oneof': {
      const opts = b.options.map((o) => o.trim()).filter(Boolean);
      return opts.length ? opts.map(escapeText).join('|') : NEVER;
    }
    case 'anytext': {
      const word = b.ru ? '[А-Яа-яЁё0-9-]' : b.quotes === 'none' ? '[^\\s"“”„\'«»]' : b.quotes === 'guillemets' ? '[^\\s"“”„\']' : '\\S';
      if (!b.cap) return `${word}+(?: ${word}+)*`;
      const first = b.ru ? '[А-ЯЁ0-9]' : '[А-ЯЁA-Z0-9]';
      return `${first}${word}*(?: ${word}+)*`;
    }
    case 'word':
      return b.hyphen ? '[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)*' : '[А-ЯЁ][а-яё]+';
    case 'house':
      return b.slash ? '\\d+[а-я]?(?:\\/\\d+[а-я]?)?' : '\\d+[а-я]?';
    case 'date':
      return '(\\d{2})\\.(\\d{2})\\.(\\d{4})';
    case 'time':
      return `(?:[01]\\d|2[0-3]):[0-5]\\d${b.seconds ? ':[0-5]\\d' : ''}`;
    case 'email':
      return '[a-z0-9._-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.[a-z]{2,}';
  }
}

/** Настоящая ли дата: 31.04 и 29.02 невисокосного года — нет. */
export function realDate(d: number, m: number, y: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export interface Matcher {
  /** Подходит ли значение. */
  test: (value: string) => boolean;
  /** Формат пуст — подходит любое значение. */
  any: boolean;
}

const ANY: Matcher = { test: () => true, any: true };

function build(blocks: Block[]): Matcher {
  const dates: { group: number; from: number; to: number }[] = [];
  let groups = 0;
  const parts = blocks.map((b) => {
    if (b.type === 'date') {
      dates.push({ group: groups + 1, from: Math.min(b.yearFrom, b.yearTo), to: Math.max(b.yearFrom, b.yearTo) });
      groups += 3;
    }
    return `(?:${source(b)})${b.optional ? '?' : ''}`;
  });
  let re: RegExp;
  try {
    re = new RegExp(`^${parts.join('')}$`, 'u');
  } catch {
    return { test: () => false, any: false };
  }
  return {
    any: false,
    test(value: string) {
      const m = re.exec(value);
      if (!m) return false;
      return dates.every(({ group, from, to }) => {
        if (m[group] === undefined) return true; // необязательной даты нет
        const [d, mo, y] = [m[group], m[group + 1], m[group + 2]].map(Number);
        return y >= from && y <= to && realDate(d, mo, y);
      });
    },
  };
}

/** Блоки одной строкой — для сравнения: порядок свойств и пустые флаги не важны. */
export function blocksKey(blocks: Block[]): string {
  return JSON.stringify(
    blocks.map((b) =>
      Object.fromEntries(
        Object.entries(b)
          .filter(([k, v]) => v !== undefined && !(k === 'optional' && !v))
          .sort(([a], [b2]) => a.localeCompare(b2)),
      ),
    ),
  );
}

const cache = new Map<string, Matcher>();

/** Проверка значения по блокам. Пустой список блоков — подходит любое значение. */
export function matcher(blocks: Block[] | undefined): Matcher {
  if (!blocks?.length) return ANY;
  const key = blocksKey(blocks);
  let m = cache.get(key);
  if (!m) {
    if (cache.size > 300) cache.clear();
    m = build(blocks);
    cache.set(key, m);
  }
  return m;
}

export const matches = (blocks: Block[] | undefined, value: string) => matcher(blocks).test(value);

// ---------- Описание для человека ----------

const countText = (c: Count, forms: [string, string, string]) => {
  if (c.max === null) return c.min <= 1 ? `${forms[2]} (сколько угодно)` : `от ${c.min} ${forms[1]}`;
  if (c.min === c.max) return `${c.min} ${plural(c.min, forms)}`;
  return `${c.min}–${c.max} ${forms[1]}`;
};

/** Описание блока: «3 цифры», «число от 1 до 11», «"8("». */
export function describeBlock(b: Block): string {
  let d: string;
  switch (b.type) {
    case 'text':
      d = `«${b.text}»`;
      break;
    case 'space':
      d = 'пробел';
      break;
    case 'digits':
      d = countText(b.count, ['цифра', 'цифры', 'цифр']);
      break;
    case 'number': {
      const [lo, hi] = numberRange(b);
      d = `число от ${lo} до ${hi}`;
      break;
    }
    case 'chars': {
      const kinds = [b.ru && 'русские', b.en && 'латинские', b.digits && 'цифры', b.extra && `«${b.extra}»`].filter(Boolean).join(', ');
      const cs = b.case === 'cap' ? ', с заглавной' : b.case === 'upper' ? ', заглавные' : b.case === 'lower' ? ', строчные' : '';
      d = `${countText(b.count, ['символ', 'символа', 'символов'])} (${kinds}${cs})`;
      break;
    }
    case 'oneof':
      d = b.options
        .filter((o) => o.trim())
        .map((o) => `«${o.trim()}»`)
        .join(' или ');
      break;
    case 'anytext': {
      const opts = [b.cap && 'с заглавной', b.ru && 'русские буквы, цифры и дефис', !b.ru && b.quotes === 'guillemets' && 'кавычки только «ёлочки»', !b.ru && b.quotes === 'none' && 'без кавычек'].filter(Boolean);
      d = `текст${opts.length ? ` (${opts.join(', ')})` : ''}`;
      break;
    }
    case 'word':
      d = b.hyphen ? 'слово с заглавной (двойное — через дефис)' : 'слово с заглавной';
      break;
    case 'house':
      d = b.slash ? 'номер дома (1, 1а, 1/2)' : 'номер (1, 1а)';
      break;
    case 'date': {
      const years = b.yearFrom === YEAR_FROM && b.yearTo === YEAR_TO ? '' : `, годы ${Math.min(b.yearFrom, b.yearTo)}–${Math.max(b.yearFrom, b.yearTo)}`;
      d = `дата ДД.ММ.ГГГГ${years}`;
      break;
    }
    case 'time':
      d = b.seconds ? 'время ЧЧ:ММ:СС' : 'время ЧЧ:ММ';
      break;
    case 'email':
      d = 'почта строчными: имя@сайт.ru';
      break;
  }
  return b.optional ? `[${d}, необязательно]` : d;
}

export function describeBlocks(blocks: Block[]): string {
  return blocks.map(describeBlock).join(' + ');
}

/** Что ожидается — для сообщения об ошибке: название готового формата или описание блоков. */
export function describeFormat(blocks: Block[] | undefined): string {
  if (!blocks?.length) return 'любое значение';
  const p = findPreset(blocks);
  if (p) return p.title.toLowerCase();
  const d = describeBlocks(blocks);
  return d.length <= 160 ? d : 'свой формат (см. «Шаблоны и правила»)';
}

/** Блоки-слова: два таких подряд без пробела между ними — почти всегда ошибка в формате. */
const WORDY = new Set<BlockType>(['anytext', 'word', 'date', 'time', 'email', 'house', 'number']);

/** Проблемы в блоках — чтобы не собрать формат, который ничему не соответствует. */
export function checkBlocks(blocks: Block[]): string[] {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    const n = `Блок ${i + 1}`;
    if (b.type === 'text' && !b.text) out.push(`${n}: пустой текст`);
    if (b.type === 'chars' && !b.ru && !b.en && !b.digits && !b.extra) out.push(`${n}: не выбрано, какие символы`);
    if (b.type === 'oneof' && !b.options.some((o) => o.trim())) out.push(`${n}: нет вариантов`);
    if ((b.type === 'digits' || b.type === 'chars') && b.count.max !== null && b.count.max < b.count.min) out.push(`${n}: «до» меньше «от»`);
    if ((b.type === 'digits' || b.type === 'chars') && b.count.max === 0) out.push(`${n}: «до» — ноль, блок всегда пустой`);
    if (b.type === 'number' && Math.abs(b.to - b.from) >= MAX_NUMBERS) out.push(`${n}: слишком большой диапазон — не больше ${MAX_NUMBERS} чисел (для длинных номеров берите «Цифры»)`);
    if (b.type === 'date' && (b.yearFrom < 1000 || b.yearTo > 9999)) out.push(`${n}: год — четыре цифры`);
    const prev = blocks[i - 1];
    if (b.type === 'space' && prev?.type === 'space' && !b.optional && !prev.optional) out.push(`${n}: два пробела подряд — значение с двумя пробелами обычно ошибка`);
    if (prev && WORDY.has(prev.type) && WORDY.has(b.type)) out.push(`Блоки ${i} и ${i + 1} стоят вплотную — между ними обычно нужен «Пробел» или «Текст»`);
  });
  if (blocks.length && blocks.every((b) => b.optional)) out.push('Все блоки необязательные — пустое значение тоже подойдёт');
  return out;
}

/** Шаблон исправления по цифрам («9» — место для цифры): если формат — это цифры, текст, пробелы, дата и время. */
export function blocksMask(blocks: Block[] | undefined): string | undefined {
  if (!blocks?.length) return undefined;
  let mask = '';
  for (const b of blocks) {
    if (b.optional) return undefined;
    if (b.type === 'text' && !b.text.includes('9')) mask += b.text;
    else if (b.type === 'space') mask += ' ';
    else if (b.type === 'digits' && b.count.max === b.count.min && b.count.min > 0) mask += '9'.repeat(b.count.min);
    else if (b.type === 'date') mask += '99.99.9999';
    else if (b.type === 'time') mask += b.seconds ? '99:99:99' : '99:99';
    else return undefined;
  }
  return mask.includes('9') ? mask : undefined;
}

/** Пример значения по блокам — показать, что получилось. Необязательные блоки пропускаются. */
export function sampleOf(blocks: Block[]): string | undefined {
  const one = (b: Block): string => {
    switch (b.type) {
      case 'text':
        return b.text;
      case 'space':
        return ' ';
      case 'digits':
        return '0'.repeat(Math.max(1, b.count.min));
      case 'number':
        return String(numberRange(b)[0]);
      case 'chars': {
        const n = Math.max(1, b.count.min);
        const lower = b.ru ? 'а' : b.en ? 'a' : b.digits ? '0' : (b.extra[0] ?? '');
        const upper = b.ru ? 'А' : b.en ? 'A' : lower;
        if (b.case === 'upper') return upper.repeat(n);
        if (b.case === 'cap') return upper + lower.repeat(n - 1);
        return lower.repeat(n);
      }
      case 'oneof':
        return b.options.find((o) => o.trim())?.trim() ?? '';
      case 'anytext':
        return b.cap || b.ru ? 'Текст' : 'текст';
      case 'word':
        return 'Слово';
      case 'house':
        return '1';
      case 'date': {
        const y = Math.min(Math.max(2000, Math.min(b.yearFrom, b.yearTo)), Math.max(b.yearFrom, b.yearTo));
        return `01.01.${y}`;
      }
      case 'time':
        return b.seconds ? '00:00:00' : '00:00';
      case 'email':
        return 'name@example.com';
    }
  };
  if (!blocks.length) return undefined;
  const v = blocks
    .filter((b) => !b.optional)
    .map(one)
    .join('');
  return v && matches(blocks, v) ? v : undefined;
}

// ---------- Готовые форматы ----------

export interface FormatPreset {
  id: string;
  title: string;
  example: string;
  blocks: Block[];
}

const T = (text: string): Block => ({ type: 'text', text });
const D = (n: number): Block => ({ type: 'digits', count: { min: n, max: n } });
const S: Block = { type: 'space' };
const DATE: Block = { type: 'date', yearFrom: YEAR_FROM, yearTo: YEAR_TO };
const oneof = (...options: string[]): Block => ({ type: 'oneof', options });

export const COUNTRIES = ['Россия', 'Казахстан', 'Кыргызстан', 'Киргизия', 'Узбекистан', 'Таджикистан', 'Туркменистан', 'Украина', 'Беларусь', 'Белоруссия', 'Молдова', 'Армения', 'Азербайджан', 'Грузия', 'Монголия', 'Китай'];

/** Готовые форматы для столбцов анкеты. */
export const FORMAT_PRESETS: FormatPreset[] = [
  { id: 'date', title: 'Дата ДД.ММ.ГГГГ', example: '01.01.2000', blocks: [DATE] },
  { id: 'datetime', title: 'Дата и время', example: '01.01.2025 00:00:00', blocks: [DATE, S, { type: 'time', seconds: true }] },
  { id: 'phone', title: 'Телефон', example: '8(000)000-00-00', blocks: [T('8('), D(3), T(')'), D(3), T('-'), D(2), T('-'), D(2)] },
  { id: 'email', title: 'Электронная почта', example: 'name@example.com', blocks: [{ type: 'email' }] },
  { id: 'snils', title: 'СНИЛС', example: '000-000-000 00', blocks: [D(3), T('-'), D(3), T('-'), D(3), S, D(2)] },
  { id: 'inn', title: 'ИНН (12 цифр)', example: '000000000000', blocks: [D(12)] },
  { id: 'series', title: 'Серия паспорта (4 цифры)', example: '0000', blocks: [D(4)] },
  { id: 'number', title: 'Номер паспорта (6 цифр)', example: '000000', blocks: [D(6)] },
  { id: 'code', title: 'Код подразделения', example: '000-000', blocks: [D(3), T('-'), D(3)] },
  { id: 'card', title: 'Номер членского билета', example: '00-00 000', blocks: [D(2), T('-'), D(2), S, D(3)] },
  {
    id: 'vk',
    title: 'Ссылка ВКонтакте',
    example: 'https://vk.com/username',
    blocks: [oneof('https://vk.com/', 'https://vk.ru/'), { type: 'chars', ru: false, en: true, digits: true, extra: '_.', case: 'any', count: { min: 1, max: null } }],
  },
  { id: 'name', title: 'Фамилия, имя, отчество', example: 'Фамилия', blocks: [{ type: 'word', hyphen: true }] },
  { id: 'text', title: 'Текст без лишних пробелов', example: 'Текст', blocks: [{ type: 'anytext' }] },
  { id: 'quoted', title: 'Название с «ёлочками»', example: 'ГБПОУ «Название»', blocks: [{ type: 'anytext', quotes: 'guillemets' }] },
  { id: 'squad', title: 'Название в «ёлочках»', example: '«Название»', blocks: [T('«'), { type: 'anytext', quotes: 'none' }, T('»')] },
  { id: 'specialty', title: 'Код и название специальности', example: '00.00.00 Название специальности', blocks: [D(2), T('.'), D(2), T('.'), D(2), S, { type: 'anytext', cap: true }] },
  { id: 'course', title: 'Курс (1–6)', example: '1', blocks: [{ type: 'number', from: 1, to: 6 }] },
  { id: 'group', title: 'Группа (без пробелов)', example: 'ГР-01', blocks: [{ type: 'chars', ru: true, en: true, digits: true, extra: '-./_', case: 'any', count: { min: 1, max: null } }] },
  { id: 'gender', title: 'Пол', example: 'Мужской', blocks: [oneof('Мужской', 'Женский')] },
  { id: 'form', title: 'Форма обучения', example: 'очная', blocks: [oneof('очная', 'заочная', 'очно-заочная')] },
  { id: 'yesno', title: 'Да / Нет', example: 'Да', blocks: [oneof('Да', 'Нет')] },
];

/** Готовые форматы для частей ячейки-древа (конструктор адреса, места рождения). */
export const PART_PRESETS: FormatPreset[] = [
  { id: 'place', title: 'Название (с заглавной, русские буквы)', example: 'Примерное', blocks: [{ type: 'anytext', cap: true, ru: true }] },
  { id: 'index', title: 'Индекс (6 цифр)', example: '000000', blocks: [D(6)] },
  { id: 'house', title: 'Номер дома', example: '1', blocks: [{ type: 'house', slash: true }] },
  { id: 'flat', title: 'Номер квартиры', example: '1', blocks: [{ type: 'house', slash: false }] },
  { id: 'country', title: 'Страна', example: 'Россия', blocks: [oneof(...COUNTRIES)] },
  { id: 'text', title: 'Текст без лишних пробелов', example: 'Текст', blocks: [{ type: 'anytext' }] },
];

export const PRESET_BY_ID = new Map(FORMAT_PRESETS.map((p) => [p.id, p]));
export const PART_PRESET_BY_ID = new Map(PART_PRESETS.map((p) => [p.id, p]));

/** Блоки готового формата (копия — чтобы правка не задела образец). */
export function presetBlocks(id: string, parts = false): Block[] {
  const p = (parts ? PART_PRESET_BY_ID : PRESET_BY_ID).get(id);
  if (!p) throw new Error(`Нет готового формата «${id}»`);
  return structuredClone(p.blocks);
}

/** Какой готовый формат собран из этих блоков (если какой-то). */
export function findPreset(blocks: Block[] | undefined, list: FormatPreset[] = FORMAT_PRESETS): FormatPreset | undefined {
  if (!blocks?.length) return undefined;
  const key = blocksKey(blocks);
  return list.find((p) => blocksKey(p.blocks) === key);
}
