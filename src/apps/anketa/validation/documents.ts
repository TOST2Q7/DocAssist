import { regionBySubject, regionsByOkato } from '@/shared/address/regions';
import type { Issue } from '../model/types';

export interface SimpleCheck {
  issues: Issue[];
  suggestion?: string;
  meta?: string;
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

// ---------- СНИЛС ----------

export function snilsChecksum(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (9 - i);
  let cs: number;
  if (sum < 100) cs = sum;
  else if (sum === 100 || sum === 101) cs = 0;
  else {
    cs = sum % 101;
    if (cs === 100) cs = 0;
  }
  return String(cs).padStart(2, '0');
}

export function formatSnils(d: string): string {
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)} ${d.slice(9, 11)}`;
}

export function checkSnils(value: string): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'error', category: 'missing', message: 'СНИЛС не заполнен' }] };
  const d = digitsOf(v);
  if (d.length !== 11) {
    return { issues: [{ code: 'snils-length', severity: 'error', category: 'format', message: `В СНИЛС должно быть 11 цифр, а здесь ${d.length}` }] };
  }
  const issues: Issue[] = [];
  const formatted = formatSnils(d);
  // Контрольная сумма проверяется для номеров больше 001-001-998.
  if (Number(d.slice(0, 9)) > 1001998 && snilsChecksum(d.slice(0, 9)) !== d.slice(9)) {
    issues.push({
      code: 'snils-checksum',
      severity: 'error',
      category: 'typo',
      message: `Неверная контрольная сумма СНИЛС: для ${formatted.slice(0, 11)} должно быть ${snilsChecksum(d.slice(0, 9))}, а указано ${d.slice(9)}. Скорее всего, опечатка в цифрах`,
    });
  }
  if (formatted !== v) {
    issues.push({ code: 'snils-format', severity: 'warning', category: 'format', message: `Формат СНИЛС: «${formatted}»`, fix: formatted });
  }
  return { issues, suggestion: formatted !== v ? formatted : undefined };
}

// ---------- ИНН ----------

function innDigit(d: string, weights: number[]): number {
  return (weights.reduce((s, w, i) => s + w * Number(d[i]), 0) % 11) % 10;
}

export function isValidInn12(d: string): boolean {
  if (!/^\d{12}$/.test(d)) return false;
  const n11 = innDigit(d, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
  const n12 = innDigit(d, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
  return n11 === Number(d[10]) && n12 === Number(d[11]);
}

export function checkInn(value: string): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'warning', category: 'missing', message: 'ИНН не указан' }] };
  const d = digitsOf(v);
  const issues: Issue[] = [];
  if (d.length === 10) {
    return { issues: [{ code: 'inn-org', severity: 'error', category: 'format', message: '10 цифр — это ИНН организации. У человека ИНН из 12 цифр' }] };
  }
  if (d.length !== 12) {
    return { issues: [{ code: 'inn-length', severity: 'error', category: 'format', message: `В ИНН должно быть 12 цифр, а здесь ${d.length}` }] };
  }
  if (!isValidInn12(d)) {
    issues.push({ code: 'inn-checksum', severity: 'error', category: 'typo', message: 'Неверные контрольные цифры ИНН — скорее всего, опечатка' });
  }
  if (d !== v) issues.push({ code: 'inn-format', severity: 'warning', category: 'format', message: 'ИНН пишется только цифрами, без пробелов и знаков', fix: d });
  const region = regionBySubject(d.slice(0, 2));
  return { issues, suggestion: d !== v ? d : undefined, meta: region ? `выдан: ${region.short}` : undefined };
}

// ---------- Паспорт ----------

export function checkPassportSeries(value: string): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'error', category: 'missing', message: 'Серия паспорта не заполнена' }] };
  const d = digitsOf(v);
  if (/[^\d\s]/.test(v)) {
    return { issues: [{ code: 'series-chars', severity: 'error', category: 'format', message: 'Серия паспорта РФ — 4 цифры' }], suggestion: d.length === 4 ? d : undefined };
  }
  if (d.length === 3) {
    const fixed = '0' + d;
    return {
      issues: [{ code: 'series-lost-zero', severity: 'warning', category: 'format', message: `3 цифры — похоже, Excel убрал ведущий ноль: «${fixed}»`, fix: fixed }],
      suggestion: fixed,
    };
  }
  if (d.length !== 4) return { issues: [{ code: 'series-length', severity: 'error', category: 'format', message: `Серия паспорта — 4 цифры, а здесь ${d.length}` }] };
  const regions = regionsByOkato(d.slice(0, 2));
  const meta = regions.length ? `бланк: ${regions.map((r) => r.short).join(' / ')}, ${blankYear(d)} г.` : undefined;
  if (d !== v) return { issues: [{ code: 'series-format', severity: 'warning', category: 'format', message: `Серия пишется без пробелов: «${d}»`, fix: d }], suggestion: d, meta };
  return { issues: [], meta };
}

/** Год изготовления бланка по 3–4 цифрам серии. */
export function blankYear(series: string): number {
  const yy = Number(series.slice(2, 4));
  return yy >= 97 ? 1900 + yy : 2000 + yy;
}

export function checkPassportNumber(value: string): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'error', category: 'missing', message: 'Номер паспорта не заполнен' }] };
  const d = digitsOf(v);
  if (/[^\d\s]/.test(v)) return { issues: [{ code: 'number-chars', severity: 'error', category: 'format', message: 'Номер паспорта — 6 цифр' }] };
  if (d.length < 6 && d.length >= 4) {
    const fixed = d.padStart(6, '0');
    return {
      issues: [{ code: 'number-lost-zero', severity: 'warning', category: 'format', message: `${d.length} цифр — похоже, Excel убрал ведущие нули: «${fixed}»`, fix: fixed }],
      suggestion: fixed,
    };
  }
  if (d.length !== 6) return { issues: [{ code: 'number-length', severity: 'error', category: 'format', message: `Номер паспорта — 6 цифр, а здесь ${d.length}` }] };
  if (d !== v) return { issues: [{ code: 'number-format', severity: 'warning', category: 'format', message: `Номер пишется без пробелов: «${d}»`, fix: d }], suggestion: d };
  return { issues: [] };
}

export function checkDivisionCode(value: string): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'error', category: 'missing', message: 'Код подразделения не заполнен' }] };
  const d = digitsOf(v);
  if (d.length === 5) {
    const fixed = `0${d.slice(0, 2)}-${d.slice(2)}`;
    return { issues: [{ code: 'division-lost-zero', severity: 'warning', category: 'format', message: `5 цифр — похоже, потерян ведущий ноль: «${fixed}»`, fix: fixed }], suggestion: fixed };
  }
  if (d.length !== 6) return { issues: [{ code: 'division-length', severity: 'error', category: 'format', message: `Код подразделения — 6 цифр (XXX-XXX), а здесь ${d.length}` }] };
  const formatted = `${d.slice(0, 3)}-${d.slice(3)}`;
  const region = regionBySubject(d.slice(0, 2));
  const meta = region ? region.short : `код региона ${d.slice(0, 2)}`;
  if (formatted !== v) {
    return { issues: [{ code: 'division-format', severity: 'warning', category: 'format', message: `Формат кода: «${formatted}»`, fix: formatted }], suggestion: formatted, meta };
  }
  return { issues: [], meta };
}

export function checkCardNumber(value: string, pattern: string): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'info', category: 'missing', message: 'Номер членского билета не указан' }] };
  const issues: Issue[] = [];
  if (pattern) {
    try {
      if (!new RegExp(pattern).test(v)) {
        issues.push({ code: 'card-pattern', severity: 'warning', category: 'format', message: `Номер не соответствует шаблону ${pattern}` });
      }
    } catch {
      /* неверный шаблон в настройках — пропускаем */
    }
  }
  const region = /^\d{2}/.test(v) ? regionBySubject(v.slice(0, 2)) : undefined;
  return { issues, meta: region ? region.short : undefined };
}
