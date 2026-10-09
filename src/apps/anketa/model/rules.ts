import { FIELD_BY_ID, PERSON_FIELDS } from '@/core/schema/fields';
import { defineDocType } from '@/core/schema/docType';
import { PRESET_BY_ID } from '@/shared/cell/format';
import { birthplaceTemplate, registrationTemplate, residenceTemplate, type CellTemplate } from '@/shared/cell/template';

/*
 * Шаблоны и правила проверки. Хранятся в папке приложения: «Проверка анкет/rules.json».
 * Версия 3 — проверка по regex, спискам «ключ:значение» и древу с конструктором.
 */

export type FieldKind = 'text' | 'list' | 'tree';

export const KIND_LABELS: Record<FieldKind, string> = {
  text: 'Формат (regex)',
  list: 'Список из базы',
  tree: 'Древо (конструктор)',
};

export interface FieldRule {
  kind: FieldKind;
  /** Формат значения — regex. Для древа формат задаётся у каждой части в конструкторе. */
  regex: string;
  /** Пример правильного значения — для подсказки. */
  example: string;
  /** Маска для исправления (9 — цифра): «8(999)999-99-99». */
  mask?: string;
  /** Пустое значение — ошибка. */
  required: boolean;
  /** Индивидуальное значение: всегда подтверждать у каждого человека отдельно (галочка). */
  confirm: boolean;
  /** Проверять уникальность: повтор у другого человека — ошибка. Уникальное тоже подтверждается. */
  unique: boolean;
  /** Уникально вместе с другими полями: ФИО, серия + номер паспорта. */
  uniqueWith?: string[];
  /** Для списка: значение хранится внутри значения другого поля («Кем выдан» внутри «Код подразделения»). */
  within?: string;
  /** Конструктор ячейки (для древа). */
  template?: CellTemplate;
}

export interface AnketaRules {
  fields: Record<string, FieldRule>;
}

const fmt = (preset: string, extra: Partial<FieldRule> = {}): FieldRule => {
  const p = PRESET_BY_ID.get(preset)!;
  return { kind: 'text', regex: p.regex, example: p.example, ...(p.mask ? { mask: p.mask } : {}), required: true, confirm: false, unique: false, ...extra };
};
const list = (preset: string, extra: Partial<FieldRule> = {}): FieldRule => ({ ...fmt(preset), kind: 'list', ...extra });
const tree = (template: CellTemplate, extra: Partial<FieldRule> = {}): FieldRule => ({
  kind: 'tree',
  regex: '',
  example: '',
  required: true,
  confirm: false,
  unique: false,
  template,
  ...extra,
});

/** Правила по умолчанию — для каждого из 35 столбцов анкеты. */
export function defaultRules(): Record<string, FieldRule> {
  return {
    'meta.timestamp': fmt('datetime'),
    'person.region': list('text', { example: 'Республика Хакасия' }),
    'person.lastName': fmt('name', { confirm: true, unique: true, uniqueWith: ['person.firstName', 'person.middleName'] }),
    'person.firstName': fmt('name', { confirm: true, example: 'Иван' }),
    'person.middleName': fmt('name', { confirm: true, required: false, example: 'Иванович' }),
    'rso.position': list('text', { example: 'Кандидат' }),
    'rso.branch': list('text'),
    'person.gender': fmt('gender'),
    'person.birthDate': fmt('date', { confirm: true }),
    'person.snils': fmt('snils', { confirm: true, unique: true }),
    'person.inn': fmt('inn', { confirm: true, unique: true }),
    'person.phone': fmt('phone', { confirm: true, unique: true }),
    'person.email': fmt('email', { confirm: true, unique: true }),
    'passport.series': fmt('series', { confirm: true }),
    'passport.number': fmt('number', { confirm: true, unique: true, uniqueWith: ['passport.series'] }),
    'person.birthPlace': tree(birthplaceTemplate()),
    'passport.issuedBy': list('text', { example: 'МВД по Республике Хакасия', within: 'passport.divisionCode' }),
    'passport.issueDate': fmt('date', { confirm: true }),
    'passport.divisionCode': list('code'),
    'person.regAddress': tree(registrationTemplate()),
    'person.factAddress': tree(residenceTemplate()),
    'rso.joinDate': fmt('date'),
    'rso.leaveDate': fmt('date', { required: false }),
    'rso.cardNumber': fmt('card', { confirm: true, required: false }),
    'rso.direction': list('text', { example: 'студенческие сервисные отряды' }),
    'rso.squad': list('squad'),
    'rso.experience': list('text', { example: 'Не имею' }),
    'edu.institution': list('quoted'),
    'edu.specialty': list('specialty'),
    'edu.course': fmt('course', { confirm: true }),
    'edu.group': fmt('group', { confirm: true }),
    'edu.form': fmt('form'),
    'person.vk': fmt('vk', { confirm: true, unique: true }),
    'rso.wasMember': fmt('yesno', { required: false }),
    'rso.checkMark': fmt('date', { required: false }),
  };
}

/** Столбец, который не удалось сопоставить с анкетой: только без лишних пробелов. */
export const OTHER_RULE: FieldRule = fmt('text', { required: false });

export const rulesDocType = defineDocType<AnketaRules>({
  type: 'anketa/rules',
  version: 3,
  migrations: {
    // 0.1 → 0.2: см. историю; данные версии 1 сразу переводятся в формат 2, затем в 3.
    1: (v1: unknown) => v1,
    // 0.2 → 0.3: новая механика проверки (regex, списки, древо). Старые настройки не переносятся.
    2: (): AnketaRules => ({ fields: {} }),
  },
  empty: () => ({ fields: {} }),
});

/** Правила с подставленными значениями по умолчанию (для полей, которые человек не менял). */
export function resolveRules(stored: AnketaRules | undefined): Record<string, FieldRule> {
  const defaults = defaultRules();
  const out: Record<string, FieldRule> = {};
  for (const f of PERSON_FIELDS) out[f.id] = { ...defaults[f.id], ...stored?.fields?.[f.id] };
  return out;
}

/** Имя древа в базе, где хранятся значения поля. */
export function treeNameOf(fieldId: string, rules: Record<string, FieldRule>, depth = 0): string | null {
  const r = rules[fieldId];
  if (!r) return null;
  if (r.kind === 'tree') return r.template?.tree || FIELD_BY_ID.get(fieldId)?.label || fieldId;
  if (r.kind === 'list') {
    if (r.within && depth < 3 && rules[r.within]?.kind === 'list') return treeNameOf(r.within, rules, depth + 1);
    return FIELD_BY_ID.get(fieldId)?.label ?? fieldId;
  }
  return null;
}

export function allTreeNames(rules: Record<string, FieldRule>): string[] {
  return [...new Set(PERSON_FIELDS.map((f) => treeNameOf(f.id, rules)).filter((x): x is string => !!x))];
}
