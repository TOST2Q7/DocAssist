/*
 * Сокращения (приписки) — встроенный справочник. База данных изначально пустая, а сокращения известны все:
 * по ним ячейка дробится на части, и по ним же ручное добавление предупреждает «приписку писать не нужно».
 * Основа — сокращения адресных объектов ФИАС (приказ Минфина № 171н), плюс полные слова для мест рождения.
 */

export type AbbrGroup = 'region' | 'district' | 'locality' | 'street' | 'house' | 'building' | 'flat' | 'country';

export interface Abbr {
  /** Как пишется в таблице: «Респ.», «р-н». */
  abbr: string;
  /** Полное название: «Республика», «Район». */
  title: string;
  /** Пишется после названия: «Красноярский край», «Кемеровская обл.». */
  after?: boolean;
  group: AbbrGroup;
}

export const ABBR_GROUPS: Record<AbbrGroup, string> = {
  country: 'Страна',
  region: 'Регион',
  district: 'Район, округ',
  locality: 'Населённый пункт',
  street: 'Улица',
  house: 'Дом',
  building: 'Корпус, строение',
  flat: 'Квартира, помещение',
};

export const ABBREVIATIONS: Abbr[] = [
  // Регионы
  { abbr: 'Респ.', title: 'Республика', group: 'region' },
  { abbr: 'край', title: 'Край', after: true, group: 'region' },
  { abbr: 'обл.', title: 'Область', after: true, group: 'region' },
  { abbr: 'АО', title: 'Автономный округ', after: true, group: 'region' },
  { abbr: 'Аобл.', title: 'Автономная область', after: true, group: 'region' },
  { abbr: 'г.ф.з.', title: 'Город федерального значения', group: 'region' },
  // Районы и округа
  { abbr: 'р-н', title: 'Район', group: 'district' },
  { abbr: 'м.р-н', title: 'Муниципальный район', group: 'district' },
  { abbr: 'г.о.', title: 'Городской округ', group: 'district' },
  { abbr: 'м.о.', title: 'Муниципальный округ', group: 'district' },
  { abbr: 'у.', title: 'Улус', group: 'district' },
  { abbr: 'с/с', title: 'Сельсовет', group: 'district' },
  { abbr: 'с.п.', title: 'Сельское поселение', group: 'district' },
  { abbr: 'г.п.', title: 'Городское поселение', group: 'district' },
  // Населённые пункты
  { abbr: 'г.', title: 'Город', group: 'locality' },
  { abbr: 'пгт', title: 'Посёлок городского типа', group: 'locality' },
  { abbr: 'рп', title: 'Рабочий посёлок', group: 'locality' },
  { abbr: 'кп', title: 'Курортный посёлок', group: 'locality' },
  { abbr: 'дп', title: 'Дачный посёлок', group: 'locality' },
  { abbr: 'с.', title: 'Село', group: 'locality' },
  { abbr: 'д.', title: 'Деревня', group: 'locality' },
  { abbr: 'п.', title: 'Посёлок', group: 'locality' },
  { abbr: 'аал', title: 'Аал', group: 'locality' },
  { abbr: 'аул', title: 'Аул', group: 'locality' },
  { abbr: 'х.', title: 'Хутор', group: 'locality' },
  { abbr: 'ст-ца', title: 'Станица', group: 'locality' },
  { abbr: 'сл.', title: 'Слобода', group: 'locality' },
  { abbr: 'ст.', title: 'Станция', group: 'locality' },
  { abbr: 'ж/д ст.', title: 'Железнодорожная станция', group: 'locality' },
  { abbr: 'рзд.', title: 'Разъезд', group: 'locality' },
  { abbr: 'у.', title: 'Улус (населённый пункт)', group: 'locality' },
  { abbr: 'нп', title: 'Населённый пункт', group: 'locality' },
  { abbr: 'снт', title: 'Садовое товарищество', group: 'locality' },
  // Улицы
  { abbr: 'ул.', title: 'Улица', group: 'street' },
  { abbr: 'пр-кт', title: 'Проспект', group: 'street' },
  { abbr: 'пер.', title: 'Переулок', group: 'street' },
  { abbr: 'б-р', title: 'Бульвар', group: 'street' },
  { abbr: 'ш.', title: 'Шоссе', group: 'street' },
  { abbr: 'наб.', title: 'Набережная', group: 'street' },
  { abbr: 'пл.', title: 'Площадь', group: 'street' },
  { abbr: 'проезд', title: 'Проезд', group: 'street' },
  { abbr: 'туп.', title: 'Тупик', group: 'street' },
  { abbr: 'мкр.', title: 'Микрорайон', group: 'street' },
  { abbr: 'кв-л', title: 'Квартал', group: 'street' },
  { abbr: 'ал.', title: 'Аллея', group: 'street' },
  { abbr: 'тракт', title: 'Тракт', group: 'street' },
  { abbr: 'линия', title: 'Линия', group: 'street' },
  { abbr: 'тер.', title: 'Территория', group: 'street' },
  { abbr: 'ж/м', title: 'Жилой массив', group: 'street' },
  // Дом
  { abbr: 'д.', title: 'Дом', group: 'house' },
  { abbr: 'влд.', title: 'Владение', group: 'house' },
  { abbr: 'двлд.', title: 'Домовладение', group: 'house' },
  { abbr: 'зд.', title: 'Здание', group: 'house' },
  { abbr: 'уч.', title: 'Участок', group: 'house' },
  // Корпус, строение
  { abbr: 'к.', title: 'Корпус', group: 'building' },
  { abbr: 'корп.', title: 'Корпус', group: 'building' },
  { abbr: 'стр.', title: 'Строение', group: 'building' },
  { abbr: 'соор.', title: 'Сооружение', group: 'building' },
  // Квартира, помещение
  { abbr: 'кв.', title: 'Квартира', group: 'flat' },
  { abbr: 'пом.', title: 'Помещение', group: 'flat' },
  { abbr: 'ком.', title: 'Комната', group: 'flat' },
  { abbr: 'оф.', title: 'Офис', group: 'flat' },
];

/**
 * Полные слова, которые встречаются вместо сокращений (особенно в месте рождения):
 * «Республика Хакасия», «Аскизский район», «город Абакан».
 */
export const FULL_WORDS: Abbr[] = [
  { abbr: 'Республика', title: 'Республика', group: 'region' },
  { abbr: 'область', title: 'Область', after: true, group: 'region' },
  { abbr: 'район', title: 'Район', after: true, group: 'district' },
  { abbr: 'город', title: 'Город', group: 'locality' },
  { abbr: 'село', title: 'Село', group: 'locality' },
  { abbr: 'деревня', title: 'Деревня', group: 'locality' },
  { abbr: 'посёлок', title: 'Посёлок', group: 'locality' },
  { abbr: 'поселок', title: 'Посёлок', group: 'locality' },
  { abbr: 'улица', title: 'Улица', group: 'street' },
  { abbr: 'дом', title: 'Дом', group: 'house' },
  { abbr: 'квартира', title: 'Квартира', group: 'flat' },
];

const lower = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Все известные написания сокращений и полных слов (в нижнем регистре, без точки в конце) — для поиска приписок в тексте. */
const KNOWN = new Set(
  [...ABBREVIATIONS, ...FULL_WORDS].flatMap((a) => [lower(a.abbr), lower(a.abbr).replace(/\.$/, ''), lower(a.title)]).filter((s) => s.length > 0),
);

/**
 * Найти в тексте слова-приписки («Респ.», «р-н», «улица»…). Нужно для ручного добавления в базу:
 * в базу пишется только само значение, без приписки.
 */
export function findAbbreviations(text: string): string[] {
  const out: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = lower(word).replace(/[,;]+$/, '');
    if (KNOWN.has(w) || KNOWN.has(w.replace(/\.$/, ''))) out.push(word);
    else {
      // Слипшееся: «ул.Ленина», «д.18».
      const m = /^([\p{L}/-]+\.)[\p{L}\p{N}]/u.exec(word);
      if (m && KNOWN.has(lower(m[1])) && lower(m[1]).length > 1) out.push(m[1]);
    }
  }
  return out;
}
