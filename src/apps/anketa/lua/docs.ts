/*
 * Справка по проверкам на Lua: что есть в среде, откуда брать данные и как отдавать результат.
 * Из этого же списка — подсказки при наборе кода (Ctrl+Пробел) и страница «Справка».
 */

export type ApiGroup = 'data' | 'result' | 'setting' | 'base' | 'lib' | 'lua';

export interface ApiEntry {
  /** Что набирают: «problem», «lib.is_date», «cell». */
  name: string;
  /** Как вызывать — для показа. */
  signature: string;
  /** Что вставить по кнопке или из подсказки. «|» — где окажется курсор. */
  insert: string;
  group: ApiGroup;
  about: string;
  example?: string;
}

export const API_GROUPS: { id: ApiGroup; title: string; about: string }[] = [
  { id: 'data', title: 'Откуда брать данные', about: 'Значение ячейки, другие ячейки этой анкеты, галочки «Проверено».' },
  { id: 'result', title: 'Как отдавать результат', about: 'Ошибки, предупреждения, советы, исправления, галочки и уникальность.' },
  { id: 'setting', title: 'Регулировки', about: 'Кнопки и поля в настройках столбца — чтобы менять проверку без кода.' },
  { id: 'base', title: 'База данных', about: 'Древа «ключ:значение»: проверить, что значение есть в базе, найти, получить список.' },
  { id: 'lib', title: 'Готовые функции', about: 'Частые проверки: русские/латинские буквы, даты, телефон, почта, пробелы, кавычки.' },
  { id: 'lua', title: 'Lua: самое нужное', about: 'Немного языка: условия, переменные, списки, функции.' },
];

export const API: ApiEntry[] = [
  // ---------- Данные ----------
  { name: 'value', signature: 'value', insert: 'value', group: 'data', about: 'Значение этой ячейки — текст, как в таблице. Пустая ячейка — "" (пустая строка).', example: 'if value == "" then return end' },
  {
    name: 'field',
    signature: 'field.name, field.number, field.id',
    insert: 'field.name',
    group: 'data',
    about: 'Столбец, который проверяется: название, номер в анкете (1–35), постоянный id.',
    example: 'problem("Не заполнено: " .. field.name)',
  },
  { name: 'confirmed', signature: 'confirmed', insert: 'confirmed', group: 'data', about: 'true, если у этой ячейки поставлена галочка «Проверено, значение верное» (для этого значения).' },
  { name: 'row', signature: 'row', insert: 'row', group: 'data', about: 'Номер анкеты (строки таблицы), с 1.' },
  {
    name: 'cell',
    signature: 'cell("Название столбца")',
    insert: 'cell("|")',
    group: 'data',
    about:
      'Другая ячейка этой анкеты: .value — значение, .confirmed — стоит ли галочка «Проверено», .ok — проверка без замечаний, .status — "ok" / "warn" / "error", .empty — пустая ли, .vars — что она запомнила через remember. Столбец — по названию («Группа»), по номеру (31) или id. Нет такого столбца в таблице — nil.',
    example: 'local group = cell("Группа")\nif group and not group.confirmed then\n  warning("Сначала проверьте группу")\nend',
  },

  // ---------- Результат ----------
  {
    name: 'problem',
    signature: 'problem("текст", { fix = исправление, part = "что подсветить" })',
    insert: 'problem("|")',
    group: 'result',
    about: 'Ошибка (красная). Анкета не готова, пока ошибку не исправят или не проигнорируют. fix — исправленное значение (кнопка «Применить»), part — кусок значения, который подсветить.',
    example: 'problem("Нужно 6 цифр", { fix = lib.try_fix(value, lib.only_digits) })',
  },
  {
    name: 'warning',
    signature: 'warning("текст", { fix = исправление })',
    insert: 'warning("|")',
    group: 'result',
    about: 'Предупреждение (жёлтое). Снимается галочкой «Проверено, значение верное» у этого человека.',
    example: 'if lib.age(value) > 35 then\n  warning("Возраст больше 35 — проверьте дату")\nend',
  },
  {
    name: 'notice',
    signature: 'notice("текст", { fix = исправление })',
    insert: 'notice("|")',
    group: 'result',
    about: 'Совет (серый). Ни на что не влияет — анкета может быть готова. Удобно, чтобы предложить исправление, но не требовать его.',
    example: 'if value ~= lib.lower(value) then\n  notice("Лучше строчными", { fix = lib.lower(value) })\nend',
  },
  {
    name: 'confirm',
    signature: 'confirm("текст")',
    insert: 'confirm()',
    group: 'result',
    about: 'Попросить галочку «Проверено» у каждого человека (индивидуальное значение: паспорт, телефон…). Без текста — «Индивидуальное значение — проверьте и поставьте галочку».',
  },
  { name: 'suggest', signature: 'suggest(исправление, "текст")', insert: 'suggest(|)', group: 'result', about: 'Предложить исправленное значение (кнопка «Применить»). С текстом — ещё и совет.' },
  { name: 'example', signature: 'example("пример")', insert: 'example("|")', group: 'result', about: 'Пример правильного значения — показывается у ошибки. По умолчанию — пример из настроек столбца.' },
  {
    name: 'unique',
    signature: 'unique({ with = { "Имя", "Отчество" }, people = true })',
    insert: 'unique()',
    group: 'result',
    about: 'Значение не должно повторяться у других людей — в таблице и в базе людей (people = false — только в таблице). with — сравнивать вместе с другими столбцами (ФИО целиком, серия + номер паспорта).',
  },
  {
    name: 'remember',
    signature: 'remember("имя", значение)',
    insert: 'remember("|", value)',
    group: 'result',
    about: 'Запомнить значение для других ячеек: они прочитают его как cell("Этот столбец").vars["имя"].',
    example: 'remember("курс", lib.sub(value, 4, 4))',
  },
  {
    name: 'is_empty',
    signature: 'is_empty(обязательное)',
    insert: 'if is_empty(true) then return end',
    group: 'result',
    about: 'Пустая ли ячейка. Добавляет регулировку «Обязательное»: если она включена, пустое значение — ошибка. Обычно первая строка проверки.',
    example: 'if is_empty(true) then return end',
  },
  { name: 'stop', signature: 'stop()', insert: 'stop()', group: 'result', about: 'Прекратить проверку этой ячейки. В общих проверках — не запускать проверку столбца.' },
  { name: 'print', signature: 'print(что угодно)', insert: 'print(|)', group: 'result', about: 'Вывести значение в «Проверить значение» — чтобы посмотреть, что получилось. В анкетах не видно.' },

  // ---------- Регулировки ----------
  {
    name: 'setting.toggle',
    signature: 'setting.toggle("Название", true)',
    insert: 'setting.toggle("|", true)',
    group: 'setting',
    about: 'Переключатель в настройках столбца. Возвращает true/false. Второе — значение по умолчанию.',
    example: 'if setting.toggle("Галочка у каждого человека", true) then\n  confirm()\nend',
  },
  {
    name: 'setting.number',
    signature: 'setting.number("Название", 6)',
    insert: 'setting.number("|", 0)',
    group: 'setting',
    about: 'Поле для числа в настройках. Возвращает число.',
    example: 'local max = setting.number("Курс до", 6)',
  },
  { name: 'setting.text', signature: 'setting.text("Название", "по умолчанию")', insert: 'setting.text("|", "")', group: 'setting', about: 'Поле для текста в настройках. Возвращает текст.' },
  {
    name: 'setting.list',
    signature: 'setting.list("Название", { "а", "б" })',
    insert: 'setting.list("|", { "" })',
    group: 'setting',
    about: 'Список значений (каждое с новой строки) в настройках. Возвращает список.',
    example: 'local options = setting.list("Варианты", { "Да", "Нет" })\nif not lib.one_of(value, options) then problem("Нужно: " .. lib.join(options, " или ")) end',
  },
  {
    name: 'setting.choice',
    signature: 'setting.choice("Название", { "мягко", "строго" }, "строго")',
    insert: 'setting.choice("|", { "", "" }, "")',
    group: 'setting',
    about: 'Выбор одного из вариантов (выпадающий список). Возвращает выбранный текст.',
  },
  { name: 'setting.info', signature: 'setting.info("Пояснение")', insert: 'setting.info("|")', group: 'setting', about: 'Пояснение в настройках столбца — для тех, кто не читает код.' },

  // ---------- База ----------
  {
    name: 'base.check',
    signature: 'base.check({ tree = "Древо", inside = "Столбец", value = значение })',
    insert: 'base.check()',
    group: 'base',
    about:
      'Значение должно быть в базе. Нет — предупреждение «Нет в базе» и кнопка «Верно — добавить в базу». По умолчанию древо — название столбца. inside — хранить внутри значения другого столбца («Кем выдан» внутри «Код подразделения»). Возвращает true, если значение уже есть.',
    example: 'base.check({ inside = "Код подразделения" })',
  },
  {
    name: 'base.check_parts',
    signature: 'base.check_parts()',
    insert: 'base.check_parts()',
    group: 'base',
    about: 'Разобрать ячейку на части по конструктору ячейки (ниже, в настройках столбца) и сверить с древом: каждая часть — внутри предыдущей. Так проверяются адреса и место рождения.',
  },
  {
    name: 'base.has',
    signature: 'base.has("Древо", "значение", "внутри него", …)',
    insert: 'base.has("|", value)',
    group: 'base',
    about: 'Есть ли в древе такое значение. Несколько значений — каждое следующее где-то внутри предыдущего.',
    example: 'if not base.has("Адреса", "Регион", value) then\n  warning("Такого города нет в регионе")\nend',
  },
  { name: 'base.list', signature: 'base.list("Древо", "значение", …)', insert: 'base.list("|")', group: 'base', about: 'Что лежит внутри значения (без значений — верхний уровень древа). Возвращает список.' },
  { name: 'base.find', signature: 'base.find("Древо", "значение")', insert: 'base.find("|", value)', group: 'base', about: 'Где в древе встречается значение: список путей (каждый путь — список значений сверху вниз).' },
  { name: 'base.trees', signature: 'base.trees()', insert: 'base.trees()', group: 'base', about: 'Названия всех древ в базе.' },

  // ---------- Готовые функции ----------
  { name: 'lib.trim', signature: 'lib.trim(текст)', insert: 'lib.trim(value)', group: 'lib', about: 'Убрать пробелы в начале и в конце.' },
  { name: 'lib.fix_spaces', signature: 'lib.fix_spaces(текст)', insert: 'lib.fix_spaces(value)', group: 'lib', about: 'Убрать лишние пробелы: в начале, в конце и двойные.' },
  { name: 'lib.extra_spaces', signature: 'lib.extra_spaces(текст)', insert: 'lib.extra_spaces(value)', group: 'lib', about: 'true, если есть лишние пробелы.' },
  { name: 'lib.lower', signature: 'lib.lower(текст)', insert: 'lib.lower(value)', group: 'lib', about: 'Все буквы строчные (понимает русские).' },
  { name: 'lib.upper', signature: 'lib.upper(текст)', insert: 'lib.upper(value)', group: 'lib', about: 'Все буквы заглавные.' },
  { name: 'lib.capitalize', signature: 'lib.capitalize(текст)', insert: 'lib.capitalize(value)', group: 'lib', about: 'Каждое слово с заглавной: «иВАНОВ-петров» → «Иванов-Петров».' },
  { name: 'lib.cap_first', signature: 'lib.cap_first(текст)', insert: 'lib.cap_first(value)', group: 'lib', about: 'Первая буква заглавная, остальное как есть.' },
  { name: 'lib.is_capitalized', signature: 'lib.is_capitalized(текст)', insert: 'lib.is_capitalized(value)', group: 'lib', about: 'true, если начинается с заглавной буквы.' },
  { name: 'lib.len', signature: 'lib.len(текст)', insert: 'lib.len(value)', group: 'lib', about: 'Сколько символов (русские буквы считаются правильно, в отличие от #).' },
  { name: 'lib.sub', signature: 'lib.sub(текст, с, по)', insert: 'lib.sub(value, 1, |)', group: 'lib', about: 'Часть текста по номерам символов (с 1). lib.sub("ИС-21", 4, 5) → «21». Без «по» — до конца.' },
  { name: 'lib.words', signature: 'lib.words(текст)', insert: 'lib.words(value)', group: 'lib', about: 'Список слов (через пробел).' },
  { name: 'lib.split', signature: 'lib.split(текст, ",")', insert: 'lib.split(value, "|")', group: 'lib', about: 'Разделить текст по разделителю. Возвращает список.' },
  { name: 'lib.join', signature: 'lib.join(список, ", ")', insert: 'lib.join(|, ", ")', group: 'lib', about: 'Склеить список в текст через разделитель.' },
  { name: 'lib.starts', signature: 'lib.starts(текст, "начало")', insert: 'lib.starts(value, "|")', group: 'lib', about: 'true, если текст начинается с этого.' },
  { name: 'lib.ends', signature: 'lib.ends(текст, "конец")', insert: 'lib.ends(value, "|")', group: 'lib', about: 'true, если текст кончается этим.' },
  { name: 'lib.contains', signature: 'lib.contains(текст, "кусок")', insert: 'lib.contains(value, "|")', group: 'lib', about: 'true, если в тексте есть этот кусок.' },
  { name: 'lib.replace', signature: 'lib.replace(текст, "что", "на что")', insert: 'lib.replace(value, "|", "")', group: 'lib', about: 'Заменить все вхождения (просто текст, без шаблонов).' },
  { name: 'lib.is_empty', signature: 'lib.is_empty(текст)', insert: 'lib.is_empty(|)', group: 'lib', about: 'true, если пусто или только пробелы.' },
  { name: 'lib.has_latin', signature: 'lib.has_latin(текст)', insert: 'lib.has_latin(value)', group: 'lib', about: 'Есть ли латинские буквы.' },
  { name: 'lib.has_cyrillic', signature: 'lib.has_cyrillic(текст)', insert: 'lib.has_cyrillic(value)', group: 'lib', about: 'Есть ли русские буквы.' },
  { name: 'lib.only_cyrillic', signature: 'lib.only_cyrillic(текст)', insert: 'lib.only_cyrillic(value)', group: 'lib', about: 'Все буквы русские (цифры, пробелы и знаки не мешают).' },
  { name: 'lib.only_latin', signature: 'lib.only_latin(текст)', insert: 'lib.only_latin(value)', group: 'lib', about: 'Все буквы латинские.' },
  { name: 'lib.mixed_words', signature: 'lib.mixed_words(текст)', insert: 'lib.mixed_words(value)', group: 'lib', about: 'Слова, где смешаны русские и латинские буквы («Ивaнов» с латинской «a»). Возвращает список.' },
  { name: 'lib.odd_letters', signature: 'lib.odd_letters(текст)', insert: 'lib.odd_letters(value)', group: 'lib', about: 'true, если буква записана двумя символами: «й» как «и» + «˘», «ё» как «е» + «¨».' },
  { name: 'lib.fix_letters', signature: 'lib.fix_letters(текст)', insert: 'lib.fix_letters(value)', group: 'lib', about: 'Исправить буквы: «й»/«ё» одним символом, латинские двойники в русских словах — на русские.' },
  { name: 'lib.is_name', signature: 'lib.is_name(текст)', insert: 'lib.is_name(value)', group: 'lib', about: 'Русское слово с заглавной; двойное — через дефис («Петрова-Водкина»).' },
  { name: 'lib.has_digits', signature: 'lib.has_digits(текст)', insert: 'lib.has_digits(value)', group: 'lib', about: 'Есть ли цифры.' },
  { name: 'lib.only_digits', signature: 'lib.only_digits(текст)', insert: 'lib.only_digits(value)', group: 'lib', about: 'Только цифры, без пробелов и знаков.' },
  { name: 'lib.number', signature: 'lib.number(текст)', insert: 'lib.number(value)', group: 'lib', about: 'Текст → число («2» → 2, «2,5» → 2.5). Не число — nil.' },
  { name: 'lib.is_number', signature: 'lib.is_number(текст)', insert: 'lib.is_number(value)', group: 'lib', about: 'Похоже ли на число.' },
  { name: 'lib.in_range', signature: 'lib.in_range(число, от, до)', insert: 'lib.in_range(lib.number(value), 1, |)', group: 'lib', about: 'Число от … до … (включительно).' },
  { name: 'lib.one_of', signature: 'lib.one_of(текст, { "а", "б" })', insert: 'lib.one_of(value, { "|" })', group: 'lib', about: 'Совпадает ли с одним из вариантов (точно, с учётом регистра).' },
  { name: 'lib.mask', signature: 'lib.mask(текст, "8(999)999-99-99")', insert: 'lib.mask(value, "|")', group: 'lib', about: 'Подходит ли под шаблон: «9» — любая цифра, остальное — точно такие символы.' },
  { name: 'lib.fix_mask', signature: 'lib.fix_mask(текст, "999-999")', insert: 'lib.fix_mask(value, "|")', group: 'lib', about: 'Разложить цифры значения по шаблону: «80001112233» → «8(000)111-22-33». Не получилось — nil.' },
  { name: 'lib.mask_example', signature: 'lib.mask_example("999-999")', insert: 'lib.mask_example(|)', group: 'lib', about: 'Шаблон для показа: «9» → «0»: «000-000».' },
  { name: 'lib.is_date', signature: 'lib.is_date(текст, год_от, год_до)', insert: 'lib.is_date(value)', group: 'lib', about: 'Дата ДД.ММ.ГГГГ, и такая дата существует (31.04 — нет). Годы по умолчанию 1900–2099.' },
  { name: 'lib.fix_date', signature: 'lib.fix_date(текст)', insert: 'lib.fix_date(value)', group: 'lib', about: '«1.1.2000» → «01.01.2000», «1/1/00» → «01.01.2000». Не получилось — nil.' },
  { name: 'lib.date', signature: 'lib.date(текст)', insert: 'lib.date(value)', group: 'lib', about: 'Разобрать дату: .day, .month, .year. Не дата — nil.' },
  { name: 'lib.today', signature: 'lib.today()', insert: 'lib.today()', group: 'lib', about: 'Сегодняшняя дата ДД.ММ.ГГГГ.' },
  { name: 'lib.age', signature: 'lib.age(дата_рождения, на_дату)', insert: 'lib.age(value)', group: 'lib', about: 'Сколько полных лет. Без второй даты — на сегодня.' },
  { name: 'lib.before', signature: 'lib.before(дата1, дата2)', insert: 'lib.before(value, |)', group: 'lib', about: 'true, если дата1 раньше даты2.' },
  { name: 'lib.after', signature: 'lib.after(дата1, дата2)', insert: 'lib.after(value, |)', group: 'lib', about: 'true, если дата1 позже даты2.' },
  { name: 'lib.is_time', signature: 'lib.is_time(текст)', insert: 'lib.is_time(value)', group: 'lib', about: 'Время ЧЧ:ММ или ЧЧ:ММ:СС.' },
  { name: 'lib.is_datetime', signature: 'lib.is_datetime(текст)', insert: 'lib.is_datetime(value)', group: 'lib', about: 'Дата и время: «01.01.2025 10:00:00».' },
  { name: 'lib.is_phone', signature: 'lib.is_phone(текст)', insert: 'lib.is_phone(value)', group: 'lib', about: 'Телефон 8(000)000-00-00.' },
  { name: 'lib.fix_phone', signature: 'lib.fix_phone(текст)', insert: 'lib.fix_phone(value)', group: 'lib', about: '«+7 900 000 00 00» → «8(900)000-00-00».' },
  { name: 'lib.is_email', signature: 'lib.is_email(текст)', insert: 'lib.is_email(value)', group: 'lib', about: 'Почта имя@сайт.ru строчными буквами.' },
  { name: 'lib.is_email_any', signature: 'lib.is_email_any(текст)', insert: 'lib.is_email_any(value)', group: 'lib', about: 'Почта имя@сайт.ru, заглавные тоже можно.' },
  { name: 'lib.is_vk', signature: 'lib.is_vk(текст)', insert: 'lib.is_vk(value)', group: 'lib', about: 'Ссылка https://vk.com/… или https://vk.ru/….' },
  { name: 'lib.fix_vk', signature: 'lib.fix_vk(текст)', insert: 'lib.fix_vk(value)', group: 'lib', about: '«vk.com/id1» → «https://vk.com/id1».' },
  { name: 'lib.is_url', signature: 'lib.is_url(текст)', insert: 'lib.is_url(value)', group: 'lib', about: 'Ссылка http(s)://….' },
  { name: 'lib.has_bad_quotes', signature: 'lib.has_bad_quotes(текст)', insert: 'lib.has_bad_quotes(value)', group: 'lib', about: 'Есть ли прямые кавычки "…" или „…“ вместо «ёлочек».' },
  { name: 'lib.fix_quotes', signature: 'lib.fix_quotes(текст)', insert: 'lib.fix_quotes(value)', group: 'lib', about: 'Все кавычки → «ёлочки», лишние пробелы — убрать.' },
  { name: 'lib.in_guillemets', signature: 'lib.in_guillemets(текст)', insert: 'lib.in_guillemets(value)', group: 'lib', about: 'Всё значение в «ёлочках»: «Название».' },
  { name: 'lib.snils_ok', signature: 'lib.snils_ok(текст)', insert: 'lib.snils_ok(value)', group: 'lib', about: 'Сходится ли контрольное число СНИЛС.' },
  { name: 'lib.inn_ok', signature: 'lib.inn_ok(текст)', insert: 'lib.inn_ok(value)', group: 'lib', about: 'Сходится ли контрольное число ИНН (10 или 12 цифр).' },
  {
    name: 'lib.try_fix',
    signature: 'lib.try_fix(текст, проверка, шаблон)',
    insert: 'lib.try_fix(value, |)',
    group: 'lib',
    about:
      'Найти простое исправление, которое проходит проверку: убрать пробелы, поправить кавычки и регистр, дописать нули в дате, разложить цифры по шаблону. Проверка — функция, которая отвечает true/false. Не нашлось — nil.',
    example: 'problem("Нужно: дата", { fix = lib.try_fix(value, lib.is_date) })',
  },

  // ---------- Lua ----------
  { name: 'if', signature: 'if условие then … end', insert: 'if | then\n  \nend', group: 'lua', about: 'Условие. Можно с else / elseif. Сравнение: == (равно), ~= (не равно), <, >, <=, >=.', example: 'if value == "Да" then\n  …\nelse\n  …\nend' },
  { name: 'local', signature: 'local имя = значение', insert: 'local | = ', group: 'lua', about: 'Своя переменная. Живёт до конца проверки этой ячейки.' },
  { name: 'and / or / not', signature: 'a and b, a or b, not a', insert: ' and ', group: 'lua', about: 'И, ИЛИ, НЕ.' },
  { name: '..', signature: '"текст" .. значение', insert: ' .. ', group: 'lua', about: 'Склеить текст: "Курс " .. value.' },
  { name: 'return', signature: 'return', insert: 'return', group: 'lua', about: 'Закончить проверку ячейки (дальше код не выполняется).' },
  { name: 'for', signature: 'for i, x in ipairs(список) do … end', insert: 'for _, x in ipairs(|) do\n  \nend', group: 'lua', about: 'Перебрать список.' },
  { name: 'function', signature: 'local function имя(x) … end', insert: 'local function |(v)\n  return true\nend', group: 'lua', about: 'Своя функция. Нужна, например, для lib.try_fix.' },
  { name: 'nil', signature: 'nil', insert: 'nil', group: 'lua', about: '«Ничего». Например, cell() возвращает nil, если столбца нет в таблице: if g then … end.' },
  { name: '{ }', signature: '{ "а", "б" }', insert: '{ "|" }', group: 'lua', about: 'Список. #список — сколько элементов, список[1] — первый.' },
  { name: '--', signature: '-- комментарий', insert: '-- ', group: 'lua', about: 'Комментарий: до конца строки, не выполняется.' },
];

/** Готовые куски кода — кнопка «Вставить шаблон». */
export const SNIPPETS: { title: string; code: string }[] = [
  {
    title: 'Цифры по шаблону',
    code: `local mask = setting.text("Шаблон (9 — цифра)", "999-999")
if not lib.mask(value, mask) then
  problem("Нужно по шаблону: " .. lib.mask_example(mask), { fix = lib.fix_mask(value, mask) })
end
`,
  },
  {
    title: 'Число от … до …',
    code: `local from = setting.number("От", 1)
local to = setting.number("До", 10)
local n = lib.number(value)
if not n or n < from or n > to then
  problem("Нужно число от " .. from .. " до " .. to)
end
`,
  },
  {
    title: 'Одно из списка',
    code: `local options = setting.list("Варианты", { "Да", "Нет" })
if not lib.one_of(value, options) then
  problem("Нужно одно из: " .. lib.join(options, ", "))
end
`,
  },
  {
    title: 'Только русские буквы',
    code: `if lib.has_latin(value) then
  problem("Нужно русскими буквами", { fix = lib.fix_letters(value) })
end
`,
  },
  {
    title: 'Сравнить с другой ячейкой',
    code: `local other = cell("Дата вступления")
if other and lib.is_date(other.value) and lib.before(value, other.value) then
  problem("Раньше, чем «" .. other.name .. "»: " .. other.value)
end
`,
  },
  {
    title: 'Сначала проверить другую ячейку',
    code: `local other = cell("Группа")
if other and not other.confirmed then
  warning("Сначала проверьте «" .. other.name .. "» и поставьте там галочку")
end
`,
  },
  {
    title: 'Значение из базы',
    code: `if lib.extra_spaces(value) then
  problem("Лишние пробелы", { fix = lib.fix_spaces(value) })
  return
end
base.check()
`,
  },
  {
    title: 'Галочка и уникальность',
    code: `if setting.toggle("Галочка у каждого человека", true) then
  confirm()
end
if setting.toggle("Уникальное", true) then
  unique()
end
`,
  },
];

/** Слова для подсказок при наборе: сначала API, потом стандартный Lua. */
export const LUA_WORDS = ['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while', 'ipairs', 'pairs', 'tostring', 'tonumber', 'type'];
