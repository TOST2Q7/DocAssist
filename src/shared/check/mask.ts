/*
 * Маски — простые шаблоны для полей фиксированного вида.
 *   9 — одна цифра; \9 — сама цифра «9»; остальные символы пишутся как есть.
 * Примеры: телефон 8(999)999-99-99, СНИЛС 999-999-999 99, членский билет 99-99 999.
 */

type Part = { lit: string } | { digit: true };

export function parseMask(mask: string): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < mask.length; i++) {
    const c = mask[i];
    if (c === '\\' && i + 1 < mask.length) out.push({ lit: mask[++i] });
    else if (c === '9') out.push({ digit: true });
    else out.push({ lit: c });
  }
  return out;
}

export function maskDigits(mask: string): number {
  return parseMask(mask).filter((p) => 'digit' in p).length;
}

/** Подставить цифры в маску. Возвращает null, если цифр не столько, сколько мест. */
export function fillMask(digits: string, mask: string): string | null {
  const parts = parseMask(mask);
  if (digits.length !== parts.filter((p) => 'digit' in p).length || /\D/.test(digits)) return null;
  let k = 0;
  return parts.map((p) => ('digit' in p ? digits[k++] : p.lit)).join('');
}

/** Маска для показа человеку: 9 → X. */
export function showMask(mask: string): string {
  return parseMask(mask)
    .map((p) => ('digit' in p ? 'X' : p.lit))
    .join('');
}

/** Цифры, которые маска задаёт сама (например, «8» в начале телефонной маски). */
export function maskLiteralDigits(mask: string): string {
  return parseMask(mask)
    .map((p) => ('lit' in p && /\d/.test(p.lit) ? p.lit : ''))
    .join('');
}
