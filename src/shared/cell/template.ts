/*
 * Конструктор ячейки: из каких частей (блоков) она состоит, как они пишутся и в каком порядке
 * сохраняются в древо.
 *
 * Пример — «Место регистрации»: «000000, Респ. Регион, р-н Районный, с. Примерное, ул. Примерная, д. 1».
 *   Части (ключи) по порядку записи: 1 Индекс, 2 Регион, 3 Район, 4 Населённый пункт, 5 Улица, 6 Дом, 7 Квартира.
 *   Порядок в древе: «2, 1, 3, *» → Регион → Индекс → Район → Населённый пункт → Улица → Дом → Квартира.
 *   «*» берёт предыдущее число и отдаёт все оставшиеся части по порядку после него.
 *   Индекс идёт в ячейке первым, но хранится под регионом: такой же индекс в другом регионе — ошибка.
 */

export interface KeyTag {
  /** Как пишется в таблице: «Респ.», «р-н». */
  abbr: string;
  /** Для человека: «Республика». */
  title: string;
  /** Пишется после значения: «Красноярский край». */
  after?: boolean;
}

export interface CellKey {
  /** Постоянный идентификатор части (по нему хранятся узлы древа). */
  id: string;
  /** Описание — можно переписать: «Регион», «Населённый пункт». */
  title: string;
  /** Приписки, с которыми часть пишется в таблице. Пусто — без приписки (индекс). */
  tags: KeyTag[];
  /** Формат значения (без приписки), regex. Пусто — любое. */
  regex: string;
  required: boolean;
  /**
   * Значение может быть только в одной ветке верхнего уровня древа.
   * Например, индекс 000000 есть в «Регион» — тот же индекс в другом регионе будет ошибкой.
   */
  single?: boolean;
}

export interface CellTemplate {
  /** Имя древа в базе. Ячейки с одним древом делят знания (регистрация и проживание). */
  tree: string;
  /** Разделитель частей: «, » — части через запятую; « » — через пробел (место рождения). */
  separator: ', ' | ' ';
  keys: CellKey[];
  /** Порядок сохранения в древо: «2, 1, 3, *». */
  order: string;
}

export interface OrderResult {
  /** Индексы ключей (с нуля) в порядке древа. */
  order: number[];
  error?: string;
}

/** Разобрать порядок «2, 1, 3, *». Части, которых нет в порядке, в древо не сохраняются (только проверяются). */
export function parseOrder(text: string, count: number): OrderResult {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const out: number[] = [];
  let prev = 0;
  for (const p of parts) {
    if (p === '*') {
      for (let i = prev + 1; i <= count; i++) if (!out.includes(i)) out.push(i);
      continue;
    }
    if (!/^\d+$/.test(p)) return { order: out.map((n) => n - 1), error: `«${p}» — нужно число или «*»` };
    const n = Number(p);
    if (n < 1 || n > count) return { order: out.map((x) => x - 1), error: `Части №${n} нет (всего частей: ${count})` };
    if (out.includes(n)) return { order: out.map((x) => x - 1), error: `Часть №${n} указана дважды` };
    out.push(n);
    prev = n;
  }
  if (!out.length) return { order: [], error: 'Порядок пуст — в древо ничего не сохранится' };
  return { order: out.map((n) => n - 1) };
}

// ---------- Шаблоны по умолчанию ----------

const NAME_RE = '^[А-ЯЁ0-9][А-Яа-яЁё0-9-]*( [А-Яа-яЁё0-9-]+)*$';
const tag = (abbr: string, title: string, after?: boolean): KeyTag => (after ? { abbr, title, after } : { abbr, title });

const LOCALITY_TAGS = [
  tag('г.', 'Город'),
  tag('с.', 'Село'),
  tag('д.', 'Деревня'),
  tag('п.', 'Посёлок'),
  tag('пгт', 'Посёлок городского типа'),
  tag('рп', 'Рабочий посёлок'),
  tag('аал', 'Аал'),
  tag('аул', 'Аул'),
  tag('ст-ца', 'Станица'),
  tag('х.', 'Хутор'),
  tag('снт', 'Садовое товарищество'),
];

const STREET_TAGS = [
  tag('ул.', 'Улица'),
  tag('пр-кт', 'Проспект'),
  tag('пер.', 'Переулок'),
  tag('б-р', 'Бульвар'),
  tag('ш.', 'Шоссе'),
  tag('наб.', 'Набережная'),
  tag('пл.', 'Площадь'),
  tag('проезд', 'Проезд'),
  tag('туп.', 'Тупик'),
  tag('мкр.', 'Микрорайон'),
  tag('кв-л', 'Квартал'),
];

function addressKeys(indexRequired: boolean): CellKey[] {
  return [
    { id: 'index', title: 'Индекс', tags: [], regex: '^\\d{6}$', required: indexRequired, single: true },
    {
      id: 'region',
      title: 'Регион',
      tags: [tag('Респ.', 'Республика'), tag('край', 'Край', true), tag('обл.', 'Область', true), tag('АО', 'Автономный округ', true)],
      regex: NAME_RE,
      required: true,
    },
    { id: 'district', title: 'Район', tags: [tag('р-н', 'Район'), tag('г.о.', 'Городской округ'), tag('м.р-н', 'Муниципальный район')], regex: NAME_RE, required: false, single: true },
    { id: 'locality', title: 'Населённый пункт', tags: LOCALITY_TAGS, regex: NAME_RE, required: true, single: true },
    { id: 'street', title: 'Улица', tags: STREET_TAGS, regex: NAME_RE, required: false },
    { id: 'house', title: 'Дом', tags: [tag('д.', 'Дом')], regex: '^\\d+[а-я]?(/\\d+[а-я]?)?$', required: true },
    { id: 'flat', title: 'Квартира', tags: [tag('кв.', 'Квартира')], regex: '^\\d+[а-я]?$', required: false },
  ];
}

export function registrationTemplate(): CellTemplate {
  return { tree: 'Адреса', separator: ', ', keys: addressKeys(true), order: '2, 1, 3, *' };
}

export function residenceTemplate(): CellTemplate {
  return { tree: 'Адреса', separator: ', ', keys: addressKeys(false), order: '2, 1, 3, *' };
}

/** Место рождения, как пишут в анкетах: «с. Примерное Районный р-н Республика Регион Россия». */
export function birthplaceTemplate(): CellTemplate {
  return {
    tree: 'Места рождения',
    separator: ' ',
    keys: [
      { id: 'locality', title: 'Населённый пункт', tags: LOCALITY_TAGS, regex: NAME_RE, required: true },
      { id: 'district', title: 'Район', tags: [tag('р-н', 'Район', true)], regex: NAME_RE, required: false },
      {
        id: 'region',
        title: 'Регион',
        tags: [tag('Республика', 'Республика'), tag('край', 'Край', true), tag('область', 'Область', true)],
        regex: NAME_RE,
        required: false,
      },
      {
        id: 'country',
        title: 'Страна',
        tags: [],
        regex: '^(Россия|Казахстан|Кыргызстан|Киргизия|Узбекистан|Таджикистан|Туркменистан|Украина|Беларусь|Белоруссия|Молдова|Армения|Азербайджан|Грузия|Монголия|Китай)$',
        required: false,
      },
    ],
    order: '4, 3, 2, 1',
  };
}
