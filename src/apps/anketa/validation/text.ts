import { ENUM_BY_ID } from '@/core/schema/enums';
import { REGIONS } from '@/shared/address/regions';
import type { Gazetteer } from '@/shared/address/gazetteer';
import { parseAddress } from '@/shared/address/parse';
import {
  capitalizeWord,
  closest,
  fixAbbreviations,
  fixMixedScript,
  fixSpaces,
  mixedScriptProblems,
  normalizeForCompare,
  normalizeQuotes,
  quoteProblems,
  spaceProblems,
  type QuoteStyle,
} from '@/shared/text/text';
import type { Issue } from '../model/types';
import type { SimpleCheck } from './documents';

/** Общие проверки любого текста: пробелы и латиница в русских словах. */
export function genericText(value: string, opts: { mixedScript?: boolean } = {}): SimpleCheck {
  const issues: Issue[] = [];
  for (const p of spaceProblems(value)) issues.push({ code: p.code, severity: 'warning', category: 'format', message: p.message, span: p.span });
  if (opts.mixedScript !== false) {
    for (const p of mixedScriptProblems(value)) issues.push({ code: p.code, severity: 'error', category: 'typo', message: p.message, span: p.span });
  }
  let fixed = fixSpaces(value);
  if (opts.mixedScript !== false) fixed = fixMixedScript(fixed);
  for (const i of issues) i.fix = fixed;
  return { issues, suggestion: fixed !== value ? fixed : undefined };
}

export function checkName(value: string, required: boolean, label: string): SimpleCheck {
  const base = genericText(value);
  const v = base.suggestion ?? value;
  if (!v.trim()) {
    return {
      issues: required
        ? [{ code: 'empty', severity: 'error', category: 'missing', message: `${label}: не заполнено` }]
        : [{ code: 'empty', severity: 'info', category: 'missing', message: `${label} не указано (если нет — всё в порядке)` }],
    };
  }
  const issues = [...base.issues];
  let fixed = v.replace(/\s*-\s*/g, '-');
  if (/[^А-ЯЁа-яё\-\s']/.test(fixed)) {
    issues.push({ code: 'name-chars', severity: 'error', category: 'format', message: 'Допустимы только русские буквы, дефис и пробел' });
  }
  const cased = fixed
    .split(' ')
    .map((w) => (w && (w === w.toLowerCase() || w === w.toUpperCase() || w[0] !== w[0].toUpperCase()) ? capitalizeWord(w) : w))
    .join(' ');
  if (cased !== fixed) {
    issues.push({ code: 'name-case', severity: 'warning', category: 'format', message: `Регистр: «${fixed}» → «${cased}»`, fix: cased });
    fixed = cased;
  }
  if (fixed !== v && !issues.some((i) => i.code === 'name-case')) {
    issues.push({ code: 'name-format', severity: 'warning', category: 'format', message: `«${fixed}»`, fix: fixed });
  }
  for (const i of issues) if (i.fix) i.fix = fixed;
  return { issues, suggestion: fixed !== value ? fixed : undefined };
}

export function checkQuoted(value: string, quoteStyle: QuoteStyle, opts: { requireQuotes?: boolean; label: string }): SimpleCheck {
  const base = genericText(value);
  const v = base.suggestion ?? value;
  if (!v.trim()) return { issues: [{ code: 'empty', severity: 'warning', category: 'missing', message: `${opts.label}: не заполнено` }] };
  const issues = [...base.issues];
  let fixed = fixAbbreviations(v);
  if (fixed !== v) issues.push({ code: 'abbr-case', severity: 'warning', category: 'format', message: 'Аббревиатуры пишутся прописными (ГБПОУ, МВД…)' });
  for (const p of quoteProblems(fixed, quoteStyle)) {
    issues.push({ code: p.code, severity: p.code === 'quotes-style' ? 'info' : 'warning', category: 'format', message: p.message });
  }
  fixed = normalizeQuotes(fixed, quoteStyle);
  if (opts.requireQuotes && !/[«"“„]/.test(fixed) && quoteStyle !== 'keep') {
    const [o, c] = quoteStyle === 'guillemets' ? ['«', '»'] : ['"', '"'];
    fixed = `${o}${fixed}${c}`;
    issues.push({ code: 'quotes-missing', severity: 'info', category: 'format', message: `Название обычно пишут в кавычках: ${fixed}` });
  }
  for (const i of issues) i.fix = fixed;
  return { issues, suggestion: fixed !== value ? fixed : undefined };
}

export function checkIssuedBy(value: string): SimpleCheck {
  const base = genericText(value);
  const v = base.suggestion ?? value;
  if (!v.trim()) return { issues: [{ code: 'empty', severity: 'error', category: 'missing', message: 'Не указано, кем выдан паспорт' }] };
  const issues = [...base.issues];
  let fixed = fixAbbreviations(v);
  fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);
  if (fixed !== v) issues.push({ code: 'issued-case', severity: 'warning', category: 'format', message: 'Регистр: аббревиатуры (МВД, УФМС, ГУ) — прописными' });
  fixed = fixed.replace(/\bроссии\b/g, 'России');
  for (const i of issues) i.fix = fixed;
  return { issues, suggestion: fixed !== value ? fixed : undefined };
}

export function checkSpecialty(value: string): SimpleCheck {
  const base = genericText(value);
  const v = base.suggestion ?? value;
  if (!v.trim()) return { issues: [{ code: 'empty', severity: 'warning', category: 'missing', message: 'Направление обучения не указано' }] };
  const issues = [...base.issues];
  const m = v.match(/^(\d{2})\s*[.,/ ]?\s*(\d{2})\s*[.,/ ]?\s*(\d{2})\s*[-–—:.]?\s*(.*)$/);
  if (!m) {
    issues.push({ code: 'specialty-code', severity: 'warning', category: 'missing', message: 'Не указан код специальности (вида 09.02.07) в начале' });
    return { issues, suggestion: base.suggestion };
  }
  const name = m[4].trim();
  const glued = new RegExp(`^${m[1]}\\.${m[2]}\\.${m[3]}[\\p{L}]`, 'u').test(v);
  if (glued) {
    const at = 8;
    issues.push({ code: 'glued', severity: 'warning', category: 'glued', message: 'Код и название слиплись', span: [0, Math.min(v.length, at + 4)] });
  }
  const nice = name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
  const fixed = `${m[1]}.${m[2]}.${m[3]}${nice ? ' ' + nice : ''}`;
  if (!name) issues.push({ code: 'specialty-name', severity: 'info', category: 'missing', message: 'После кода нет названия специальности' });
  if (fixed !== v && !glued) issues.push({ code: 'specialty-format', severity: 'warning', category: 'format', message: `Формат: «${fixed}»` });
  for (const i of issues) if (i.category !== 'missing') i.fix = fixed;
  return { issues, suggestion: fixed !== value ? fixed : undefined };
}

const ORDINALS: Record<string, string> = { первый: '1', второй: '2', третий: '3', четвертый: '4', четвёртый: '4', пятый: '5', шестой: '6' };

export function checkCourse(value: string): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'warning', category: 'missing', message: 'Курс не указан' }] };
  const word = ORDINALS[v.toLowerCase().replace(/\s*курс$/, '')];
  const d = word ?? v.match(/^(\d)\s*(?:-?(?:й|ой|ый))?\s*(?:курс)?$/i)?.[1];
  if (!d) return { issues: [{ code: 'course-invalid', severity: 'warning', category: 'format', message: 'Курс — одна цифра от 1 до 6' }] };
  const issues: Issue[] = [];
  if (Number(d) < 1 || Number(d) > 6) issues.push({ code: 'course-range', severity: 'warning', category: 'consistency', message: 'Курс обычно от 1 до 6' });
  if (d !== v) issues.push({ code: 'course-format', severity: 'warning', category: 'format', message: `Курс — только цифра: «${d}»`, fix: d });
  return { issues, suggestion: d !== v ? d : undefined };
}

export function enumValues(dictId: string, userValues: string[] = [], hidden: string[] = []): string[] {
  const def = ENUM_BY_ID.get(dictId);
  return [...new Set([...(def?.values ?? []).filter((x) => !hidden.includes(x)), ...userValues])];
}

export function checkEnum(value: string, dictId: string, userValues: string[], hidden: string[], label: string): SimpleCheck {
  const def = ENUM_BY_ID.get(dictId);
  const values = enumValues(dictId, userValues, hidden);
  const base = genericText(value);
  const v = (base.suggestion ?? value).trim();
  if (!v) return { issues: [{ code: 'empty', severity: def?.strict ? 'error' : 'warning', category: 'missing', message: `${label}: не заполнено` }] };
  const issues = [...base.issues];
  if (values.includes(v)) return { issues, suggestion: base.suggestion };
  const nv = normalizeForCompare(v);
  const exact = values.find((x) => normalizeForCompare(x) === nv);
  const alias = def?.aliases?.[nv];
  const near = !exact && !alias ? closest(v, values) : null;
  const target = exact ?? alias ?? near;
  if (target) {
    issues.push({
      code: exact ? 'enum-case' : alias ? 'enum-alias' : 'enum-typo',
      severity: 'warning',
      category: exact ? 'format' : 'typo',
      message: exact ? `Написание по справочнику: «${target}»` : near ? `Возможно, опечатка: «${target}»?` : `По справочнику: «${target}»`,
      fix: target,
    });
    for (const i of issues) if (!i.fix || i.code === 'trim' || i.code === 'double-space') i.fix = target;
    return { issues, suggestion: target };
  }
  issues.push({
    code: 'enum-unknown',
    severity: def?.strict ? 'warning' : 'info',
    category: 'dictionary',
    message: `«${v}» нет в справочнике «${def?.title ?? label}». Варианты: ${values.slice(0, 6).join(', ')}${values.length > 6 ? '…' : ''}`,
    action: { kind: 'add-enum', dict: dictId, value: v },
  });
  return { issues, suggestion: base.suggestion };
}

/** Найти регион по произвольному тексту («Хакасия», «Республика Хакасия», «РХ»…). */
export function findRegionNode(text: string, gaz: Gazetteer) {
  const direct = gaz.find(text).find((n) => n.level === 'region');
  if (direct) return direct;
  const { components } = parseAddress(text, gaz);
  for (const c of components) {
    const node = gaz.find(c.name).find((n) => n.level === 'region');
    if (node) return node;
  }
  return null;
}

export function checkRegionField(value: string, gaz: Gazetteer): SimpleCheck {
  const base = genericText(value);
  const v = (base.suggestion ?? value).trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'error', category: 'missing', message: 'Регион не указан' }] };
  const node = findRegionNode(v, gaz);
  if (!node?.region) {
    const names = REGIONS.map((r) => r.full);
    const near = closest(v, names, 3);
    return {
      issues: [
        ...base.issues,
        {
          code: 'region-unknown',
          severity: 'error',
          category: 'typo',
          message: near ? `Неизвестный регион. Возможно, «${near}»?` : 'Неизвестный регион',
          fix: near ?? undefined,
        },
      ],
      suggestion: near ?? base.suggestion,
    };
  }
  const canonical = node.region.full;
  const issues = [...base.issues];
  if (canonical !== v) issues.push({ code: 'region-format', severity: 'warning', category: 'format', message: `Полное название: «${canonical}»`, fix: canonical });
  for (const i of issues) i.fix = canonical;
  return { issues, suggestion: canonical !== value ? canonical : undefined, meta: node.region.subject ? `код региона ${node.region.subject}` : undefined };
}
