import type { AddrType } from './types';

/*
 * Типы адресных объектов и их сокращения (по образцу сокращений ФИАС/ГАР).
 * Чтобы добавить новый тип — допишите строку. variants сравниваются без учёта регистра и точек.
 */
export const ADDR_TYPES: AddrType[] = [
  // Регион
  { id: 'resp', level: 'region', short: 'Респ.', full: 'Республика', variants: ['респ', 'республика'], placement: 'before' },
  { id: 'kray', level: 'region', short: 'край', full: 'край', variants: ['край', 'кр'], placement: 'after' },
  { id: 'obl', level: 'region', short: 'обл.', full: 'область', variants: ['обл', 'область', 'обл-ть'], placement: 'after' },
  { id: 'ao', level: 'region', short: 'АО', full: 'автономный округ', variants: ['ао', 'автономный округ', 'авт округ', 'а.о'], placement: 'after' },
  { id: 'aobl', level: 'region', short: 'Аобл.', full: 'автономная область', variants: ['аобл', 'автономная область', 'авт обл'], placement: 'after' },
  // Район / округ
  { id: 'rn', level: 'district', short: 'р-н', full: 'район', variants: ['р-н', 'район', 'р-он', 'рн', 'р-йон'], placement: 'after' },
  { id: 'mrn', level: 'district', short: 'м.р-н', full: 'муниципальный район', variants: ['м.р-н', 'мр-н', 'муниципальный район', 'мун район', 'м р-н'], placement: 'after' },
  { id: 'go', level: 'district', short: 'г.о.', full: 'городской округ', variants: ['г.о', 'го', 'городской округ', 'гор округ'], placement: 'before' },
  // Город
  { id: 'g', level: 'city', short: 'г.', full: 'город', variants: ['г', 'гор', 'город'], placement: 'before' },
  // Населённые пункты
  { id: 'pgt', level: 'settlement', short: 'пгт', full: 'посёлок городского типа', variants: ['пгт', 'п.г.т', 'поселок городского типа', 'посёлок городского типа'], placement: 'before' },
  { id: 'rp', level: 'settlement', short: 'рп', full: 'рабочий посёлок', variants: ['рп', 'р.п', 'р п', 'рабочий поселок', 'рабочий посёлок'], placement: 'before' },
  { id: 's', level: 'settlement', short: 'с.', full: 'село', variants: ['с', 'село'], placement: 'before' },
  { id: 'der', level: 'settlement', short: 'д.', full: 'деревня', variants: ['дер', 'деревня'], placement: 'before' },
  { id: 'p', level: 'settlement', short: 'п.', full: 'посёлок', variants: ['п', 'пос', 'поселок', 'посёлок'], placement: 'before' },
  { id: 'aal', level: 'settlement', short: 'аал', full: 'аал', variants: ['аал'], placement: 'before' },
  { id: 'aul', level: 'settlement', short: 'аул', full: 'аул', variants: ['аул'], placement: 'before' },
  { id: 'stca', level: 'settlement', short: 'ст-ца', full: 'станица', variants: ['ст-ца', 'станица', 'стц'], placement: 'before' },
  { id: 'h', level: 'settlement', short: 'х.', full: 'хутор', variants: ['х', 'хут', 'хутор'], placement: 'before' },
  { id: 'sl', level: 'settlement', short: 'сл.', full: 'слобода', variants: ['сл', 'слобода'], placement: 'before' },
  { id: 'st', level: 'settlement', short: 'ст.', full: 'станция', variants: ['ст', 'станция'], placement: 'before' },
  // Микрорайоны и территории
  { id: 'mkr', level: 'area', short: 'мкр.', full: 'микрорайон', variants: ['мкр', 'мкрн', 'мкр-н', 'микрорайон', 'м-н'], placement: 'before' },
  { id: 'kvl', level: 'area', short: 'кв-л', full: 'квартал', variants: ['кв-л', 'квартал', 'кварт'], placement: 'before' },
  { id: 'snt', level: 'area', short: 'СНТ', full: 'СНТ', variants: ['снт', 'садоводческое товарищество'], placement: 'before' },
  { id: 'ter', level: 'area', short: 'тер.', full: 'территория', variants: ['тер', 'территория'], placement: 'before' },
  // Улицы
  { id: 'ul', level: 'street', short: 'ул.', full: 'улица', variants: ['ул', 'улица', 'ули'], placement: 'before' },
  { id: 'prkt', level: 'street', short: 'пр-кт', full: 'проспект', variants: ['пр-кт', 'пр-т', 'просп', 'проспект', 'пр'], placement: 'before' },
  { id: 'per', level: 'street', short: 'пер.', full: 'переулок', variants: ['пер', 'переулок', 'п-к'], placement: 'before' },
  { id: 'br', level: 'street', short: 'б-р', full: 'бульвар', variants: ['б-р', 'бул', 'бульвар'], placement: 'before' },
  { id: 'sh', level: 'street', short: 'ш.', full: 'шоссе', variants: ['ш', 'шоссе'], placement: 'before' },
  { id: 'nab', level: 'street', short: 'наб.', full: 'набережная', variants: ['наб', 'набережная'], placement: 'before' },
  { id: 'pl', level: 'street', short: 'пл.', full: 'площадь', variants: ['пл', 'площадь'], placement: 'before' },
  { id: 'proezd', level: 'street', short: 'проезд', full: 'проезд', variants: ['проезд', 'пр-д'], placement: 'before' },
  { id: 'tup', level: 'street', short: 'туп.', full: 'тупик', variants: ['туп', 'тупик'], placement: 'before' },
  { id: 'alleya', level: 'street', short: 'аллея', full: 'аллея', variants: ['аллея', 'ал'], placement: 'before' },
  { id: 'trakt', level: 'street', short: 'тракт', full: 'тракт', variants: ['тракт'], placement: 'before' },
  { id: 'liniya', level: 'street', short: 'линия', full: 'линия', variants: ['линия', 'лн'], placement: 'before' },
  // Дом и далее
  { id: 'dom', level: 'house', short: 'д.', full: 'дом', variants: ['д', 'дом'], placement: 'before', numbered: true },
  { id: 'vld', level: 'house', short: 'влд.', full: 'владение', variants: ['влд', 'вл', 'владение'], placement: 'before', numbered: true },
  { id: 'dvld', level: 'house', short: 'двлд.', full: 'домовладение', variants: ['двлд', 'домовладение'], placement: 'before', numbered: true },
  { id: 'zd', level: 'house', short: 'зд.', full: 'здание', variants: ['зд', 'здание'], placement: 'before', numbered: true },
  { id: 'korp', level: 'building', short: 'корп.', full: 'корпус', variants: ['корп', 'корпус', 'к'], placement: 'before', numbered: true },
  { id: 'str', level: 'building', short: 'стр.', full: 'строение', variants: ['стр', 'строение'], placement: 'before', numbered: true },
  { id: 'lit', level: 'building', short: 'лит.', full: 'литера', variants: ['лит', 'литер', 'литера'], placement: 'before', numbered: true },
  { id: 'kv', level: 'flat', short: 'кв.', full: 'квартира', variants: ['кв', 'квартира', 'кварт-ра'], placement: 'before', numbered: true },
  { id: 'pom', level: 'flat', short: 'пом.', full: 'помещение', variants: ['пом', 'помещение', 'помещ'], placement: 'before', numbered: true },
  { id: 'kom', level: 'flat', short: 'ком.', full: 'комната', variants: ['ком', 'комн', 'комната'], placement: 'before', numbered: true },
  { id: 'of', level: 'flat', short: 'оф.', full: 'офис', variants: ['оф', 'офис'], placement: 'before', numbered: true },
];

export const TYPE_BY_ID = new Map(ADDR_TYPES.map((t) => [t.id, t]));

/** Нормализация слова для сравнения: нижний регистр, ё→е, без конечной точки. */
export function normWord(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[–—]/g, '-')
    .replace(/\.+$/, '')
    .trim();
}

/** Индекс вариантов: «ул» → [улица]. Многословные варианты хранятся с пробелами. */
const VARIANT_INDEX = new Map<string, AddrType[]>();
for (const t of ADDR_TYPES) {
  for (const v of t.variants) {
    const key = normWord(v.replace(/ё/g, 'е'));
    const list = VARIANT_INDEX.get(key) ?? [];
    list.push(t);
    VARIANT_INDEX.set(key, list);
  }
}

export const MAX_TYPE_WORDS = 3;

export function findTypes(phrase: string): AddrType[] {
  return VARIANT_INDEX.get(normWord(phrase)) ?? [];
}

export function isTypeWord(word: string): boolean {
  return VARIANT_INDEX.has(normWord(word));
}

/** Сокращения, которые пишутся с точкой. */
export function needsDot(t: AddrType): boolean {
  return t.short.endsWith('.');
}

export const COUNTRY_WORDS = ['россия', 'рф', 'российская федерация'];
export const COUNTRY_NAME = 'Россия';
