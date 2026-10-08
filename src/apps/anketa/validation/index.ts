import { FIELD_BY_ID } from '@/core/schema/fields';
import { checkAddress } from '@/shared/address/check';
import type { Gazetteer } from '@/shared/address/gazetteer';
import { templateFor, type AnketaRules } from '../model/rules';
import { countIssues, SEVERITY_ORDER, type FieldResult, type Issue, type PersonResult } from '../model/types';
import { checkDate, type SimpleDate } from './dates';
import { checkCardNumber, checkDivisionCode, checkInn, checkPassportNumber, checkPassportSeries, checkSnils, type SimpleCheck } from './documents';
import { checkEmail, checkPhone, checkVk } from './contacts';
import { crossChecks } from './cross';
import { checkCourse, checkEnum, checkIssuedBy, checkName, checkQuoted, checkRegionField, checkSpecialty, genericText } from './text';

/*
 * Движок проверки анкеты. Для каждого поля — своя проверка по типу (СНИЛС, дата, адрес…),
 * затем перекрёстные проверки между полями и поиск дублей между строками.
 */

export interface EnumUserData {
  values: string[];
  hidden: string[];
}

export interface CheckContext {
  gaz: Gazetteer;
  rules: AnketaRules;
  enums: Record<string, EnumUserData>;
  now: SimpleDate;
}

const REQUIRED_DATES = new Set(['person.birthDate', 'passport.issueDate', 'rso.joinDate']);

export function checkField(fieldId: string | null, value: string, ctx: CheckContext): Omit<FieldResult, 'col'> {
  const res = (c: SimpleCheck): Omit<FieldResult, 'col'> => ({ fieldId, value, issues: c.issues, suggestion: c.suggestion, meta: c.meta });
  const def = fieldId ? FIELD_BY_ID.get(fieldId) : undefined;
  if (!def) {
    const g = genericText(value);
    return res({ issues: g.issues.filter((i) => i.code !== 'mixed-script' || value.length < 200), suggestion: g.suggestion });
  }
  const { rules } = ctx;
  switch (def.kind) {
    case 'name':
      return res(checkName(value, def.id !== 'person.middleName', def.label));
    case 'date':
      return res(
        checkDate(value, {
          required: REQUIRED_DATES.has(def.id),
          placeholders: def.id === 'rso.leaveDate' ? [rules.emptyDate, ''] : [],
          canonicalPlaceholder: def.id === 'rso.leaveDate' ? rules.emptyDate : undefined,
          allowFuture: def.id === 'rso.joinDate' || def.id === 'rso.leaveDate',
          now: ctx.now,
        }),
      );
    case 'datetime':
      return res(checkDate(value, { required: false, withTime: true, now: ctx.now, allowFuture: false }));
    case 'phone':
      return res(checkPhone(value, rules.phoneStyle));
    case 'email':
      return res(checkEmail(value, rules.emailLowercase));
    case 'snils':
      return res(checkSnils(value));
    case 'inn':
      return res(checkInn(value));
    case 'passportSeries':
      return res(checkPassportSeries(value));
    case 'passportNumber':
      return res(checkPassportNumber(value));
    case 'divisionCode':
      return res(checkDivisionCode(value));
    case 'cardNumber':
      return res(checkCardNumber(value, rules.cardPattern));
    case 'issuedBy':
      return res(checkIssuedBy(value));
    case 'region':
      return res(checkRegionField(value, ctx.gaz));
    case 'url':
      return res(checkVk(value));
    case 'enum': {
      const u = ctx.enums[def.enumDict ?? ''] ?? { values: [], hidden: [] };
      return res(checkEnum(value, def.enumDict ?? '', u.values, u.hidden, def.label));
    }
    case 'number':
      return res(checkCourse(value));
    case 'quoted':
      return res(checkQuoted(value, rules.quoteStyle, { requireQuotes: def.id === 'rso.squad' && rules.squadQuotes, label: def.label }));
    case 'specialty':
      return res(checkSpecialty(value));
    case 'address':
    case 'birthplace': {
      const r = checkAddress(value, templateFor(rules, def.id), ctx.gaz);
      const issues: Issue[] = r.issues.map((i) => ({ ...i }));
      const region = r.regionNode?.region;
      return {
        fieldId,
        value,
        issues,
        parts: r.parts,
        suggestion: r.suggestion && r.suggestion !== value ? r.suggestion : undefined,
        meta: region ? region.short : undefined,
      };
    }
    default: {
      const g = genericText(value);
      return res(g);
    }
  }
}

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function checkPerson(row: number, values: string[], columns: (string | null)[], ctx: CheckContext): PersonResult {
  const fields: FieldResult[] = values.map((value, col) => ({ ...checkField(columns[col], value ?? '', ctx), col }));
  const byId = new Map(fields.filter((f) => f.fieldId).map((f) => [f.fieldId!, f]));
  crossChecks((id) => byId.get(id), ctx.now, ctx.rules.ageMin, ctx.rules.ageMax);
  for (const f of fields) f.issues = sortIssues(f.issues);
  return { row, fields, counts: countIssues(fields) };
}

const DUP_FIELDS = ['person.snils', 'person.inn', 'person.email', 'person.phone'];

/** Дубли между строками: одинаковые СНИЛС, ИНН, паспорт, почта, телефон. */
export function findDuplicates(rows: string[][], columns: (string | null)[], names: string[]): Map<number, Map<number, Issue>> {
  const out = new Map<number, Map<number, Issue>>();
  const addIssue = (row: number, col: number, issue: Issue) => {
    if (!out.has(row)) out.set(row, new Map());
    out.get(row)!.set(col, issue);
  };
  const keyed = (col: number, key: (r: string[]) => string, label: string) => {
    const seen = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const k = key(r);
      if (!k) return;
      seen.set(k, [...(seen.get(k) ?? []), i]);
    });
    for (const list of seen.values()) {
      if (list.length < 2) continue;
      for (const i of list) {
        const others = list.filter((j) => j !== i).map((j) => `${names[j] || `строка ${j + 1}`}`);
        addIssue(i, col, { code: 'duplicate', severity: 'warning', category: 'duplicate', message: `${label} совпадает: ${others.join(', ')}` });
      }
    }
  };
  for (const id of DUP_FIELDS) {
    const col = columns.indexOf(id);
    if (col < 0) continue;
    keyed(col, (r) => (id === 'person.email' ? (r[col] ?? '').trim().toLowerCase() : (r[col] ?? '').replace(/\D/g, '').slice(-10)), FIELD_BY_ID.get(id)!.label);
  }
  const s = columns.indexOf('passport.series');
  const n = columns.indexOf('passport.number');
  if (s >= 0 && n >= 0) {
    keyed(n, (r) => {
      const v = (r[s] ?? '').replace(/\D/g, '') + (r[n] ?? '').replace(/\D/g, '');
      return v.length >= 9 ? v : '';
    }, 'Паспорт');
  }
  return out;
}
