import { FIELD_BY_ID, PERSON_FIELDS } from '@/core/schema/fields';
import { defineDocType } from '@/core/schema/docType';
import { birthplaceTemplate, registrationTemplate, residenceTemplate, type CellTemplate } from '@/shared/cell/template';
import { DEFAULT_COMMON, DEFAULT_EXAMPLES, DEFAULT_LIBRARY, DEFAULT_SCRIPTS } from '../lua/defaults';

/*
 * Проверки анкеты — код на Lua. Хранятся в папке приложения: «Проверка анкет/checks.json».
 * В файле — только то, что изменили: остальное берётся по умолчанию.
 */

/** Значение регулировки: переключатель, число, текст, список, выбор. */
export type SettingValue = boolean | number | string | string[];

export interface FieldCheck {
  /** Код проверки на Lua. */
  script: string;
  /** Значения регулировок (setting.* в коде) по их названиям. */
  settings: Record<string, SettingValue>;
  /** Пример правильного значения — показывается у ошибки. */
  example: string;
  /** Конструктор ячейки — для base.check_parts() (адреса, место рождения). */
  template?: CellTemplate;
}

export interface CommonCheck {
  script: string;
  settings: Record<string, SettingValue>;
}

export interface AnketaChecks {
  /** Общие проверки для каждой ячейки. */
  common?: Partial<CommonCheck>;
  /** «Моя библиотека» — свои функции на Lua. */
  library?: string;
  /** Только изменённые поля. */
  fields: Record<string, Partial<FieldCheck>>;
}

export interface ResolvedChecks {
  common: CommonCheck;
  library: string;
  fields: Record<string, FieldCheck>;
}

export { DEFAULT_EXAMPLES };

const TEMPLATES: Record<string, () => CellTemplate> = {
  'person.birthPlace': birthplaceTemplate,
  'person.regAddress': registrationTemplate,
  'person.factAddress': residenceTemplate,
};

export function defaultField(id: string): FieldCheck {
  const t = TEMPLATES[id];
  return { script: DEFAULT_SCRIPTS[id] ?? '', settings: {}, example: DEFAULT_EXAMPLES[id] ?? '', ...(t ? { template: t() } : {}) };
}

export function defaultChecks(): ResolvedChecks {
  return {
    common: { script: DEFAULT_COMMON, settings: {} },
    library: DEFAULT_LIBRARY,
    fields: Object.fromEntries(PERSON_FIELDS.map((f) => [f.id, defaultField(f.id)])),
  };
}

export const checksDocType = defineDocType<AnketaChecks>({
  type: 'anketa/checks',
  version: 1,
  migrations: {},
  empty: () => ({ fields: {} }),
});

/** Проверки с подставленными значениями по умолчанию. */
export function resolveChecks(stored: AnketaChecks | undefined): ResolvedChecks {
  const d = defaultChecks();
  return {
    common: { ...d.common, ...stored?.common },
    library: stored?.library ?? d.library,
    fields: Object.fromEntries(PERSON_FIELDS.map((f) => [f.id, { ...d.fields[f.id], ...stored?.fields?.[f.id] }])),
  };
}

export const fieldLabel = (id: string) => FIELD_BY_ID.get(id)?.label ?? id;
