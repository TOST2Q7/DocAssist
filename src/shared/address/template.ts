import type { Level } from './types';

/*
 * Шаблон адреса описывает, КАК должен выглядеть правильный адрес:
 * порядок частей, разделитель, сокращения, обязательные части.
 * У каждой части можно задать свою приставку и окончание.
 */
export interface AddressTemplate {
  id: string;
  name: string;
  description?: string;
  builtin?: boolean;
  order: 'big-to-small' | 'small-to-big';
  separator: string;
  /** Типы: «ул.» (short) или «улица» (full). */
  typeStyle: 'short' | 'full';
  /** Регион: «Респ. Хакасия» (short) или «Республика Хакасия» (full). */
  regionStyle: 'short' | 'full';
  index: 'required' | 'optional' | 'never';
  country: 'always' | 'keep' | 'never';
  region: 'required' | 'optional';
  district: 'keep' | 'always' | 'never';
  house: 'required' | 'optional';
  parts?: Partial<Record<Level, { prefix?: string; suffix?: string }>>;
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
    index: 'required',
    country: 'never',
    region: 'required',
    district: 'keep',
    house: 'required',
  },
  {
    id: 'residence',
    name: 'Адрес проживания',
    description: 'Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1',
    builtin: true,
    order: 'big-to-small',
    separator: ', ',
    typeStyle: 'short',
    regionStyle: 'short',
    index: 'optional',
    country: 'never',
    region: 'required',
    district: 'keep',
    house: 'required',
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
    index: 'never',
    country: 'always',
    region: 'required',
    district: 'keep',
    house: 'optional',
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
    index: 'optional',
    country: 'never',
    region: 'required',
    district: 'keep',
    house: 'optional',
  },
];
