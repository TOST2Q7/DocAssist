import { FIELD_BY_ID, PERSON_FIELDS } from '@/core/schema/fields';
import { defineDocType } from '@/core/schema/docType';
import { PRESET_BY_ID, type Block } from '@/shared/cell/blocks';
import { regexToBlocks } from '@/shared/cell/legacy';
import { birthplaceTemplate, registrationTemplate, residenceTemplate, type CellKey, type CellTemplate } from '@/shared/cell/template';

/*
 * Шаблоны и правила проверки. Хранятся в папке приложения: «Проверка анкет/rules.json».
 * Версия 4 — формат из блоков, списки «ключ:значение» и древо с конструктором (в версии 3 формат был regex).
 */

export type FieldKind = 'text' | 'list' | 'tree';

export const KIND_LABELS: Record<FieldKind, string> = {
  text: 'Формат',
  list: 'Список из базы',
  tree: 'Древо (конструктор)',
};

export interface FieldRule {
  kind: FieldKind;
  /** Формат значения — блоки. Пусто — любое. Для древа формат задаётся у каждой части в конструкторе. */
  format: Block[];
  /** Пример правильного значения — для подсказки. */
  example: string;
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
  /** Свой regex из версии 0.3, который не перевёлся в блоки: показывается в правилах, пока правило не сохранят. */
  legacy?: string;
}

export interface AnketaRules {
  fields: Record<string, FieldRule>;
}

const fmt = (preset: string, extra: Partial<FieldRule> = {}): FieldRule => {
  const p = PRESET_BY_ID.get(preset)!;
  return {
    kind: 'text',
    format: structuredClone(p.blocks),
    example: p.example,
    required: true,
    confirm: false,
    unique: false,
    ...extra,
  };
};
const list = (preset: string, extra: Partial<FieldRule> = {}): FieldRule => ({ ...fmt(preset), kind: 'list', ...extra });
const tree = (template: CellTemplate, extra: Partial<FieldRule> = {}): FieldRule => ({
  kind: 'tree',
  format: [],
  example: '',
  required: true,
  confirm: false,
  unique: false,
  template,
  ...extra,
});

/**
 * Примеры по умолчанию — нейтральные заготовки, а не чьи-то данные. Показываются в подсказках «Пример: …»,
 * в правилах и в конструкторе; каждый можно переписать («Шаблоны и правила» → «Примеры значений»).
 */
export const DEFAULT_EXAMPLES: Record<string, string> = {
  'meta.timestamp': '01.01.2025 00:00:00',
  'person.region': 'Республика Регион',
  'person.lastName': 'Фамилия',
  'person.firstName': 'Имя',
  'person.middleName': 'Отчество',
  'rso.position': 'Кандидат',
  'rso.branch': 'Региональное отделение',
  'person.gender': 'Мужской',
  'person.birthDate': '01.01.2000',
  'person.snils': '000-000-000 00',
  'person.inn': '000000000000',
  'person.phone': '8(000)000-00-00',
  'person.email': 'name@example.com',
  'passport.series': '0000',
  'passport.number': '000000',
  'person.birthPlace': 'с. Примерное Районный р-н Республика Регион Россия',
  'passport.issuedBy': 'Название органа',
  'passport.issueDate': '01.01.2014',
  'passport.divisionCode': '000-000',
  'person.regAddress': '000000, Респ. Регион, р-н Районный, с. Примерное, ул. Примерная, д. 1',
  'person.factAddress': 'Респ. Регион, г. Примерск, ул. Примерная, д. 1, кв. 1',
  'rso.joinDate': '01.01.2025',
  'rso.leaveDate': '01.01.2026',
  'rso.cardNumber': '00-00 000',
  'rso.direction': 'студенческие сервисные отряды',
  'rso.squad': '«Название»',
  'rso.experience': 'Не имею',
  'edu.institution': 'ГБПОУ «Название»',
  'edu.specialty': '00.00.00 Название специальности',
  'edu.course': '1',
  'edu.group': 'ГР-01',
  'edu.form': 'очная',
  'person.vk': 'https://vk.com/username',
  'rso.wasMember': 'Нет',
  'rso.checkMark': '01.01.2025',
};

/** Правила по умолчанию — для каждого из 35 столбцов анкеты. */
export function defaultRules(): Record<string, FieldRule> {
  const rules: Record<string, FieldRule> = {
    'meta.timestamp': fmt('datetime'),
    'person.region': list('text'),
    'person.lastName': fmt('name', { confirm: true, unique: true, uniqueWith: ['person.firstName', 'person.middleName'] }),
    'person.firstName': fmt('name', { confirm: true }),
    'person.middleName': fmt('name', { confirm: true, required: false }),
    'rso.position': list('text'),
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
    'passport.issuedBy': list('text', { within: 'passport.divisionCode' }),
    'passport.issueDate': fmt('date', { confirm: true }),
    'passport.divisionCode': list('code'),
    'person.regAddress': tree(registrationTemplate()),
    'person.factAddress': tree(residenceTemplate()),
    'rso.joinDate': fmt('date'),
    'rso.leaveDate': fmt('date', { required: false }),
    'rso.cardNumber': fmt('card', { confirm: true, required: false }),
    'rso.direction': list('text'),
    'rso.squad': list('squad'),
    'rso.experience': list('text'),
    'edu.institution': list('quoted'),
    'edu.specialty': list('specialty'),
    'edu.course': fmt('course', { confirm: true }),
    'edu.group': fmt('group', { confirm: true }),
    'edu.form': fmt('form'),
    'person.vk': fmt('vk', { confirm: true, unique: true }),
    'rso.wasMember': fmt('yesno', { required: false }),
    'rso.checkMark': fmt('date', { required: false }),
  };
  for (const [id, example] of Object.entries(DEFAULT_EXAMPLES)) if (rules[id]) rules[id].example = example;
  return rules;
}

/** Столбец, который не удалось сопоставить с анкетой: только без лишних пробелов. */
export const OTHER_RULE: FieldRule = fmt('text', { required: false });

/** Часть конструктора 0.3: regex → блоки; не перевёлся — формат части по умолчанию (или любое значение). */
function migrateKey03(fieldId: string, key: any, defaults: Record<string, FieldRule>): CellKey {
  const { regex, ...rest } = key ?? {};
  const fallback = defaults[fieldId]?.template?.keys.find((k) => k.id === rest.id)?.format ?? [];
  const format = typeof regex === 'string' ? (regexToBlocks(regex, true) ?? structuredClone(fallback)) : structuredClone(fallback);
  return { ...rest, format } as CellKey;
}

/** Правило 0.3 → 0.4: формат-regex → блоки. Блоки из конструктора 0.3 переносятся как есть. */
export function migrateRule03(fieldId: string, old: any, defaults: Record<string, FieldRule> = defaultRules()): FieldRule {
  const def = defaults[fieldId] ?? OTHER_RULE;
  const { regex, mask: _mask, blocks, ...rest } = old ?? {};
  const out = { ...def, ...rest } as FieldRule;
  if (Array.isArray(blocks)) out.format = blocks;
  else if (typeof regex === 'string') {
    const converted = regexToBlocks(regex);
    if (converted) out.format = converted;
    else {
      out.format = structuredClone(def.format);
      out.legacy = regex;
    }
  }
  if (out.template?.keys) out.template = { ...out.template, keys: out.template.keys.map((k) => migrateKey03(fieldId, k, defaults)) };
  return out;
}

export const rulesDocType = defineDocType<AnketaRules>({
  type: 'anketa/rules',
  version: 4,
  migrations: {
    // 0.1 → 0.2: см. историю; данные версии 1 сразу переводятся в формат 2, затем в 3.
    1: (v1: unknown) => v1,
    // 0.2 → 0.3: новая механика проверки (regex, списки, древо). Старые настройки не переносятся.
    2: (): AnketaRules => ({ fields: {} }),
    // 0.3 → 0.4: формат — блоки вместо regex.
    3: (v3: { fields?: Record<string, unknown> }): AnketaRules => {
      const defaults = defaultRules();
      return { fields: Object.fromEntries(Object.entries(v3?.fields ?? {}).map(([id, r]) => [id, migrateRule03(id, r, defaults)])) };
    },
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
