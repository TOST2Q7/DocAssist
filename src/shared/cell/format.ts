/*
 * Проверка формата обычным regex и простые исправления.
 * Исправление предлагается, только если исправленное значение проходит тот же regex.
 */

export interface FormatPreset {
  id: string;
  title: string;
  regex: string;
  example: string;
  /** Маска для исправления: 9 — цифра, остальное — как есть. */
  mask?: string;
}

const DATE =
  '(?:(?:0[1-9]|1\\d|2[0-8])\\.(?:0[1-9]|1[0-2])|(?:29|30)\\.(?:0[13-9]|1[0-2])|31\\.(?:0[13578]|1[02]))\\.(?:19|20)\\d{2}|29\\.02\\.(?:19|20)(?:[02468][048]|[13579][26])';

export const PRESETS: FormatPreset[] = [
  { id: 'date', title: 'Дата ДД.ММ.ГГГГ', regex: `^(?:${DATE})$`, example: '01.01.2000', mask: '99.99.9999' },
  { id: 'datetime', title: 'Дата и время', regex: `^(?:${DATE}) (?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$`, example: '01.09.2025 12:00:00', mask: '99.99.9999 99:99:99' },
  { id: 'phone', title: 'Телефон', regex: '^8\\(\\d{3}\\)\\d{3}-\\d{2}-\\d{2}$', example: '8(900)000-00-00', mask: '8(999)999-99-99' },
  { id: 'email', title: 'Электронная почта', regex: '^[a-z0-9._-]+@[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}$', example: 'ivanov@mail.ru' },
  { id: 'snils', title: 'СНИЛС', regex: '^\\d{3}-\\d{3}-\\d{3} \\d{2}$', example: '000-000-000 00', mask: '999-999-999 99' },
  { id: 'inn', title: 'ИНН (12 цифр)', regex: '^\\d{12}$', example: '123456789012', mask: '999999999999' },
  { id: 'series', title: 'Серия паспорта (4 цифры)', regex: '^\\d{4}$', example: '0000', mask: '9999' },
  { id: 'number', title: 'Номер паспорта (6 цифр)', regex: '^\\d{6}$', example: '000000', mask: '999999' },
  { id: 'code', title: 'Код подразделения', regex: '^\\d{3}-\\d{3}$', example: '190-000', mask: '999-999' },
  { id: 'card', title: 'Номер членского билета', regex: '^\\d{2}-\\d{2} \\d{3}$', example: '19-00 000', mask: '99-99 999' },
  { id: 'vk', title: 'Ссылка ВКонтакте', regex: '^https://vk\\.(ru|com)/[A-Za-z0-9_.]+$', example: 'https://vk.com/username' },
  { id: 'name', title: 'Фамилия, имя, отчество', regex: '^[А-ЯЁ][а-яё]+(-[А-ЯЁ][а-яё]+)*$', example: 'Иванов' },
  { id: 'text', title: 'Текст без лишних пробелов', regex: '^\\S+( \\S+)*$', example: 'Хакасское РО' },
  { id: 'squad', title: 'Название в «ёлочках»', regex: '^«[^«»"“”„\']+»$', example: '«Название»' },
  { id: 'quoted', title: 'Название с «ёлочками»', regex: '^(?=\\S)(?!.*\\s$)(?!.*\\s\\s)[^"“”„\']+$', example: 'ГБПОУ «Колледж»' },
  { id: 'specialty', title: 'Код и название специальности', regex: '^\\d{2}\\.\\d{2}\\.\\d{2} [А-ЯЁ][^\\s]*( \\S+)*$', example: '09.02.07 Информационные системы и программирование' },
  { id: 'course', title: 'Курс (1–6)', regex: '^[1-6]$', example: '2' },
  { id: 'group', title: 'Группа (без пробелов)', regex: '^\\S+$', example: 'ИС-21' },
  { id: 'gender', title: 'Пол', regex: '^(Мужской|Женский)$', example: 'Мужской' },
  { id: 'form', title: 'Форма обучения', regex: '^(очная|заочная|очно-заочная)$', example: 'очная' },
  { id: 'yesno', title: 'Да / Нет', regex: '^(Да|Нет)$', example: 'Да' },
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export function compileRegex(re: string): { re: RegExp | null; error?: string } {
  if (!re) return { re: null };
  try {
    return { re: new RegExp(re, 'u') };
  } catch (e) {
    return { re: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Заполнить маску цифрами значения. «89000000000» + «8(999)999-99-99» → «8(900)000-00-00». */
export function fillMask(value: string, mask: string): string | null {
  const digits = value.replace(/\D/g, '');
  const slots = (mask.match(/9/g) ?? []).length;
  // Цифры маски перед первой «9» («8» в телефоне): вместо них в значении может стоять «7» или «+7».
  const prefix = mask.slice(0, Math.max(0, mask.indexOf('9'))).replace(/\D/g, '');
  let use: string;
  if (digits.length === slots) use = digits;
  else if (prefix && digits.length === slots + prefix.length) use = digits.slice(prefix.length);
  else return null;
  let i = 0;
  return mask.replace(/9/g, () => use[i++]);
}

const collapse = (v: string) => v.replace(/[\s ]+/g, ' ').trim();

/** «"Название"» → «Название» в ёлочках: открывающая — в начале слова, закрывающая — в конце. */
export function fixQuotes(v: string): string {
  return v.replace(/["“”„«»]/g, (_q, i: number, s: string) => {
    const prev = s[i - 1];
    return !prev || /[\s(]/.test(prev) ? '«' : '»';
  });
}

const capitalizeParts = (v: string) => v.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());

function padDate(v: string): string {
  return v.replace(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/, (_m, d: string, m: string, y: string) => `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`);
}

/** Предложить исправление: первое из простых преобразований, которое проходит regex. */
export function suggestFix(value: string, re: RegExp, mask?: string): string | null {
  const base = collapse(value);
  const candidates = [
    base,
    fixQuotes(base),
    /^[^«»"“”„]+$/.test(base) ? `«${base}»` : null,
    base.toLowerCase(),
    capitalizeParts(base),
    padDate(base),
    base.replace(/^http:\/\//, 'https://').replace(/^(?:https?:\/\/)?(?:www\.|m\.)?vk\.(ru|com)\//, 'https://vk.$1/'),
    mask ? fillMask(base, mask) : null,
  ];
  for (const c of candidates) if (c !== null && c !== value && re.test(c)) return c;
  return null;
}
