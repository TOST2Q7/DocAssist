import type { Level } from './types';

/*
 * Шаблон адреса — точное описание правильного адреса:
 *  - порядок частей и разделитель;
 *  - как писать типы («ул.» или «улица») и регион («Респ. Хакасия» или «Республика Хакасия»);
 *  - какие части обязательны, какие допустимы, а какие запрещены;
 *  - что обязательно должно быть в справочнике (населённый пункт, улица, индекс).
 * Адрес верен, только если он в точности совпадает с тем, что получается по шаблону.
 */

export type PartRule = 'required' | 'optional' | 'never';

export interface AddressParts {
  index: PartRule;
  country: PartRule;
  region: 'required' | 'optional';
  /** required — если в справочнике у населённого пункта есть район, он должен быть указан. */
  district: PartRule;
  street: PartRule;
  house: PartRule;
  building: 'optional' | 'never';
  flat: 'optional' | 'never';
}

export interface AddressVerify {
  /** Населённый пункт должен быть в справочнике. */
  locality: boolean;
  /** Улица должна быть в справочнике (внутри своего населённого пункта). */
  street: boolean;
  /** Индекс должен быть подтверждён для населённого пункта. */
  index: boolean;
}

export interface AddressTemplate {
  id: string;
  name: string;
  description?: string;
  builtin?: boolean;
  order: 'big-to-small' | 'small-to-big';
  separator: string;
  typeStyle: 'short' | 'full';
  regionStyle: 'short' | 'full';
  parts: AddressParts;
  /** Буква в номере дома: «12а» или «12А». */
  houseLetter: 'lower' | 'upper';
  verify: AddressVerify;
  /** Приставки и окончания частей. */
  affixes?: Partial<Record<Level, { prefix?: string; suffix?: string }>>;
}

export const BUILTIN_TEMPLATES: AddressTemplate[] = [
  {
    id: 'registration',
    name: 'Адрес регистрации (с индексом)',
    description: '655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1',
    builtin: true,
    order: 'big-to-small',
    separator: ', ',
    typeStyle: 'short',
    regionStyle: 'short',
    parts: { index: 'required', country: 'never', region: 'required', district: 'never', street: 'required', house: 'required', building: 'optional', flat: 'optional' },
    houseLetter: 'lower',
    verify: { locality: true, street: true, index: true },
  },
  {
    id: 'residence',
    name: 'Адрес проживания (без индекса)',
    description: 'Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1',
    builtin: true,
    order: 'big-to-small',
    separator: ', ',
    typeStyle: 'short',
    regionStyle: 'short',
    parts: { index: 'never', country: 'never', region: 'required', district: 'never', street: 'required', house: 'required', building: 'optional', flat: 'optional' },
    houseLetter: 'lower',
    verify: { locality: true, street: true, index: false },
  },
  {
    id: 'birthplace',
    name: 'Место рождения (как в паспорте)',
    description: 'с. Аскиз Аскизский р-н Республика Хакасия Россия',
    builtin: true,
    order: 'small-to-big',
    separator: ' ',
    typeStyle: 'short',
    regionStyle: 'full',
    parts: { index: 'never', country: 'required', region: 'required', district: 'required', street: 'never', house: 'never', building: 'never', flat: 'never' },
    houseLetter: 'lower',
    verify: { locality: true, street: false, index: false },
  },
  {
    id: 'full-words',
    name: 'Полными словами',
    description: '655700, Республика Хакасия, село Аскиз, улица Ленина, дом 1',
    builtin: true,
    order: 'big-to-small',
    separator: ', ',
    typeStyle: 'full',
    regionStyle: 'full',
    parts: { index: 'optional', country: 'never', region: 'required', district: 'optional', street: 'required', house: 'required', building: 'optional', flat: 'optional' },
    houseLetter: 'lower',
    verify: { locality: true, street: true, index: true },
  },
];

/** Шаблон из версии 0.1 (плоские поля) → новая структура. */
export interface AddressTemplateV1 {
  id: string;
  name: string;
  description?: string;
  order: 'big-to-small' | 'small-to-big';
  separator: string;
  typeStyle: 'short' | 'full';
  regionStyle: 'short' | 'full';
  index: 'required' | 'optional' | 'never';
  country: 'always' | 'keep' | 'never';
  region: 'required' | 'optional';
  district: 'keep' | 'always' | 'never';
  house: 'required' | 'optional';
  parts?: Partial<Record<Level, { prefix?: string; suffix?: string }>>;
}

export function migrateTemplateV1(t: AddressTemplateV1): AddressTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    order: t.order,
    separator: t.separator,
    typeStyle: t.typeStyle,
    regionStyle: t.regionStyle,
    parts: {
      index: t.index,
      country: t.country === 'always' ? 'required' : t.country === 'keep' ? 'optional' : 'never',
      region: t.region,
      district: t.district === 'always' ? 'required' : t.district === 'keep' ? 'optional' : 'never',
      street: t.house === 'required' ? 'required' : 'optional',
      house: t.house,
      building: 'optional',
      flat: 'optional',
    },
    houseLetter: 'lower',
    verify: { locality: true, street: true, index: t.index !== 'never' },
    affixes: t.parts,
  };
}
