import { defineDocType } from '@/core/schema/docType';
import type { QuoteStyle } from '@/shared/text/text';
import { BUILTIN_TEMPLATES, type AddressTemplate } from '@/shared/address/template';

/*
 * Настройки проверки (шаблоны). Хранятся в папке приложения: «Проверка анкет/rules.json».
 */

export type PhoneStyle = 'eight-compact' | 'eight' | 'plus7' | 'plus7-compact' | 'digits';

export const PHONE_STYLES: Record<PhoneStyle, string> = {
  'eight-compact': '8(900)000-00-00',
  eight: '8 (983) 000-00-00',
  plus7: '+7 (983) 000-00-00',
  'plus7-compact': '+7(983)000-00-00',
  digits: '89000000000',
};

export interface AnketaRules {
  phoneStyle: PhoneStyle;
  quoteStyle: QuoteStyle;
  /** Какой шаблон адреса применять к какому полю. */
  addressTemplates: Record<string, string>;
  customTemplates: AddressTemplate[];
  ageMin: number;
  ageMax: number;
  /** Регулярное выражение для номера членского билета (пусто — не проверять формат). */
  cardPattern: string;
  /** Значение «нет даты» (например, для даты исключения). */
  emptyDate: string;
  emailLowercase: boolean;
  /** Требовать кавычки в названии отряда. */
  squadQuotes: boolean;
}

export const DEFAULT_RULES: AnketaRules = {
  phoneStyle: 'eight-compact',
  quoteStyle: 'guillemets',
  addressTemplates: {
    'person.regAddress': 'registration',
    'person.factAddress': 'residence',
    'person.birthPlace': 'birthplace',
  },
  customTemplates: [],
  ageMin: 14,
  ageMax: 35,
  cardPattern: '',
  emptyDate: '00.00.0000',
  emailLowercase: true,
  squadQuotes: true,
};

export const rulesDocType = defineDocType<AnketaRules>({
  type: 'anketa/rules',
  version: 1,
  migrations: {},
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
