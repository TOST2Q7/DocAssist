/*
 * Простые исправления значения, которое не подошло под формат.
 * Исправление предлагается, только если исправленное значение подходит под тот же формат; применяет его человек.
 */

/** Заполнить шаблон цифрами значения. «80000000000» + «8(999)999-99-99» → «8(000)000-00-00». */
export function fillMask(value: string, mask: string): string | null {
  const digits = value.replace(/\D/g, '');
  const slots = (mask.match(/9/g) ?? []).length;
  // Цифры шаблона перед первой «9» («8» в телефоне): вместо них в значении может стоять «7» или «+7».
  const prefix = mask.slice(0, Math.max(0, mask.indexOf('9'))).replace(/\D/g, '');
  let use: string;
  if (digits.length === slots) use = digits;
  else if (prefix && digits.length === slots + prefix.length) use = digits.slice(prefix.length);
  else return null;
  let i = 0;
  return mask.replace(/9/g, () => use[i++]);
}

const collapse = (v: string) => v.replace(/[\s ]+/g, ' ').trim();

/** «"Название"» → «Название» в ёлочках: открывающая — в начале слова, закрывающая — в конце. */
export function fixQuotes(v: string): string {
  return v.replace(/["“”„«»]/g, (_q, i: number, s: string) => {
    const prev = s[i - 1];
    return !prev || /[\s(]/.test(prev) ? '«' : '»';
  });
}

const capitalizeParts = (v: string) => v.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());

function padDate(v: string): string {
  return v.replace(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?=$|\s)/, (_m, d: string, m: string, y: string) => `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y.length === 2 ? (Number(y) > 40 ? '19' : '20') + y : y}`);
}

/**
 * Предложить исправление: первое из простых преобразований, которое подходит под формат.
 * fits — проверка формата; mask — шаблон по цифрам («9» — цифра), если формат позволяет.
 */
export function suggestFix(value: string, fits: (v: string) => boolean, mask?: string): string | null {
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
    /\d/.test(base) ? base.replace(/\D/g, '') : null,
  ];
  for (const c of candidates) if (c !== null && c !== value && fits(c)) return c;
  return null;
}
