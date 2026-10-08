import { defineDocType } from '@/core/schema/docType';
import { BUILTIN_TEMPLATES, migrateTemplateV1, type AddressTemplate, type AddressTemplateV1 } from '@/shared/address/template';

/*
 * Шаблоны и правила проверки. Хранятся в папке приложения: «Проверка анкет/rules.json».
 * Версия 2 — строгая проверка (маски вместо стилей, шаблоны адресов с обязательными частями).
 */

export interface AnketaRules {
  /** Маска телефона: 9 — цифра. Ровно 10 цифр после кода страны. */
  phoneMask: string;
  /** Маска номера членского билета. */
  cardMask: string;
  /** Кавычки в названиях отряда и учебного заведения. */
  quoteStyle: 'guillemets' | 'straight';
  /** Как писать столбец «Регион»: «Республика Хакасия» или «Респ. Хакасия». */
  regionStyle: 'full' | 'short';
  /** Какой шаблон адреса применять к какому полю. */
  addressTemplates: Record<string, string>;
  customTemplates: AddressTemplate[];
  ageMin: number;
  ageMax: number;
  /** Как пишется «даты нет» (дата исключения). */
  emptyDate: string;
  emailLowercase: boolean;
}

export const PHONE_MASKS = ['8(999)999-99-99', '8 (999) 999-99-99', '+7 (999) 999-99-99', '+7(999)999-99-99', '89999999999'];

export const DEFAULT_RULES: AnketaRules = {
  phoneMask: '8(999)999-99-99',
  cardMask: '99-99 999',
  quoteStyle: 'guillemets',
  regionStyle: 'full',
  addressTemplates: {
    'person.regAddress': 'registration',
    'person.factAddress': 'residence',
    'person.birthPlace': 'birthplace',
  },
  customTemplates: [],
  ageMin: 14,
  ageMax: 35,
  emptyDate: '00.00.0000',
  emailLowercase: true,
};

interface RulesV1 {
  phoneStyle?: string;
  quoteStyle?: string;
  addressTemplates?: Record<string, string>;
  customTemplates?: AddressTemplateV1[];
  ageMin?: number;
  ageMax?: number;
  emptyDate?: string;
  emailLowercase?: boolean;
}

const PHONE_STYLE_TO_MASK: Record<string, string> = {
  'eight-compact': '8(999)999-99-99',
  eight: '8 (999) 999-99-99',
  plus7: '+7 (999) 999-99-99',
  'plus7-compact': '+7(999)999-99-99',
  digits: '89999999999',
};

export const rulesDocType = defineDocType<AnketaRules>({
  type: 'anketa/rules',
  version: 2,
  migrations: {
    // 0.1 → строгая проверка: стиль телефона → маска, старые шаблоны адресов → новая структура.
    1: (v1: RulesV1): AnketaRules => ({
      ...DEFAULT_RULES,
      phoneMask: PHONE_STYLE_TO_MASK[v1.phoneStyle ?? ''] ?? DEFAULT_RULES.phoneMask,
      quoteStyle: v1.quoteStyle === 'straight' ? 'straight' : 'guillemets',
      addressTemplates: { ...DEFAULT_RULES.addressTemplates, ...v1.addressTemplates },
      customTemplates: (v1.customTemplates ?? []).map(migrateTemplateV1),
      ageMin: v1.ageMin ?? DEFAULT_RULES.ageMin,
      ageMax: v1.ageMax ?? DEFAULT_RULES.ageMax,
      emptyDate: v1.emptyDate ?? DEFAULT_RULES.emptyDate,
      emailLowercase: v1.emailLowercase ?? DEFAULT_RULES.emailLowercase,
    }),
  },
  empty: () => structuredClone(DEFAULT_RULES),
});

export function allTemplates(rules: AnketaRules): AddressTemplate[] {
  return [...BUILTIN_TEMPLATES, ...rules.customTemplates];
}

export function templateFor(rules: AnketaRules, fieldId: string): AddressTemplate {
  const all = allTemplates(rules);
  const id = rules.addressTemplates[fieldId] ?? DEFAULT_RULES.addressTemplates[fieldId] ?? 'residence';
  return all.find((t) => t.id === id) ?? BUILTIN_TEMPLATES[1];
}
