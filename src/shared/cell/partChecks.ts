/*
 * Проверки частей ячейки в конструкторе (регион, индекс, дом…). Выбираются из списка;
 * своя проверка — функция Lua из «Моей библиотеки» (принимает текст части, возвращает true/false).
 */

export const COUNTRIES = ['Россия', 'Казахстан', 'Кыргызстан', 'Киргизия', 'Узбекистан', 'Таджикистан', 'Туркменистан', 'Украина', 'Беларусь', 'Белоруссия', 'Молдова', 'Армения', 'Азербайджан', 'Грузия', 'Монголия', 'Китай'];

export interface PartCheck {
  id: string;
  title: string;
  example: string;
  test: (v: string) => boolean;
}

export const PART_CHECKS: PartCheck[] = [
  { id: '', title: 'Любое значение', example: '', test: () => true },
  { id: 'place', title: 'Название: с заглавной, русские буквы, цифры, дефис', example: 'Примерное', test: (v) => /^[А-ЯЁ0-9][А-Яа-яЁё0-9-]*( [А-Яа-яЁё0-9-]+)*$/.test(v) },
  { id: 'index', title: 'Индекс: 6 цифр', example: '000000', test: (v) => /^\d{6}$/.test(v) },
  { id: 'house', title: 'Номер дома: 1, 12а, 12/3', example: '1', test: (v) => /^\d+[а-я]?(\/\d+[а-я]?)?$/.test(v) },
  { id: 'flat', title: 'Номер квартиры: 1, 12а', example: '1', test: (v) => /^\d+[а-я]?$/.test(v) },
  { id: 'country', title: 'Страна из списка', example: 'Россия', test: (v) => COUNTRIES.includes(v) },
  { id: 'text', title: 'Текст без лишних пробелов', example: 'Текст', test: (v) => /^\S+( \S+)*$/.test(v) },
];

export const PART_CHECK_BY_ID = new Map(PART_CHECKS.map((c) => [c.id, c]));

/** Проверка части по умолчанию: встроенная по id; неизвестное (функция библиотеки) без Lua — подходит всё. */
export const builtinFits = (check: string, value: string) => (PART_CHECK_BY_ID.get(check)?.test ?? (() => true))(value);
