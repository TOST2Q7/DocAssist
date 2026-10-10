/*
 * Проверки по умолчанию — код на Lua для каждого из 35 столбцов анкеты.
 * Регулировки (setting.*) из кода появляются в «Шаблонах и правилах» кнопками и полями — менять код не нужно.
 */

export const DEFAULT_COMMON = `-- Общие проверки: выполняются для каждой ячейки перед проверкой столбца.

if value ~= "" and lib.is_empty(value) then
  problem("Только пробелы — ячейка выглядит пустой", { fix = "" })
  stop()  -- дальше эту ячейку не проверять
end

if setting.toggle("Буквы из двух символов («й» как «и» + «˘»)", true) and lib.odd_letters(value) then
  problem("Буква записана двумя символами (например, «й» как «и» + «˘») — её не найдёт поиск", { fix = lib.fix_letters(value) })
end

if setting.toggle("Латинские буквы внутри русских слов", true) then
  local mixed = lib.mixed_words(value)
  if #mixed > 0 then
    problem("Смешаны русские и латинские буквы: " .. lib.join(mixed, ", "), { fix = lib.fix_letters(value) })
  end
end
`;

export const DEFAULT_LIBRARY = `-- Моя библиотека: свои функции и значения, которые видны во всех проверках.
-- Значение ячейки передавайте параметром — внутри функций библиотеки нет «value».
--
-- Пример:
-- function is_group_code(s)
--   return lib.mask(s, "99-99")
-- end
--
-- Функция, которая принимает текст и возвращает true/false, появится и в конструкторе ячейки
-- (адреса, место рождения) как проверка части.
`;

const header = (title: string, about: string) => `-- ${title}: ${about}\n`;

const confirmBlock = `
if setting.toggle("Галочка у каждого человека", true) then
  confirm()
end
`;

const uniqueBlock = (label = 'Уникальное — повтор у другого человека будет ошибкой', withFields?: string[]) => `
if setting.toggle("${label}", true) then
  unique(${withFields ? `{ with = { ${withFields.map((f) => `"${f}"`).join(', ')} } }` : ''})
end
`;

/** Значение из базы («Регион», «Должность»…). */
const list = (title: string, inside?: string) =>
  header(title, `значение из базы${inside ? ` — своё для каждого «${inside}»` : ''}. Новое — проверить и добавить в базу.`) +
  `
if is_empty(true) then return end

if lib.extra_spaces(value) then
  problem("Лишние пробелы", { fix = lib.fix_spaces(value) })
  return
end

base.check(${inside ? `{ inside = "${inside}" }` : ''})
`;

/** Цифры по шаблону («9» — цифра). */
const masked = (title: string, mask: string, opts: { required?: boolean; confirm?: boolean; unique?: string[] | true; extra?: string } = {}) =>
  header(title, `цифры по шаблону ${mask.replace(/9/g, '0')}`) +
  `
if is_empty(${opts.required === false ? 'false' : 'true'}) then return end

local mask = setting.text("Шаблон (9 — цифра)", "${mask}")
if not lib.mask(value, mask) then
  problem("Нужно по шаблону: " .. lib.mask_example(mask), { fix = lib.fix_mask(value, mask) })
  return
end
${opts.extra ?? ''}${opts.confirm === false ? '' : confirmBlock}${opts.unique ? uniqueBlock(undefined, opts.unique === true ? undefined : opts.unique) : ''}`;

const date = (title: string, opts: { required?: boolean; confirm?: boolean; extra?: string } = {}) =>
  header(title, 'дата ДД.ММ.ГГГГ (и такая дата должна существовать)') +
  `
if is_empty(${opts.required === false ? 'false' : 'true'}) then return end

if not lib.is_date(value) then
  problem("Нужно: дата ДД.ММ.ГГГГ, и такая дата должна существовать", { fix = lib.try_fix(value, lib.is_date) })
  return
end
${opts.extra ?? ''}${opts.confirm ? confirmBlock : ''}`;

const name = (title: string, required = true, unique?: string[]) =>
  header(title, 'русскими буквами с заглавной, двойная — через дефис') +
  `
if is_empty(${required}) then return end

if not lib.is_name(value) then
  problem("Нужно русскими буквами с заглавной: «${title}», двойная — через дефис", { fix = lib.try_fix(value, lib.is_name) })
end
${confirmBlock}${unique ? uniqueBlock('Уникальное — ФИО целиком не повторяется', unique) : ''}`;

const oneOf = (title: string, options: string[], required = true) =>
  header(title, `одно из: ${options.join(', ')}`) +
  `
if is_empty(${required}) then return end

local options = setting.list("Варианты", { ${options.map((o) => `"${o}"`).join(', ')} })
if not lib.one_of(value, options) then
  problem("Нужно одно из: " .. lib.join(options, ", "), {
    fix = lib.try_fix(value, function(v) return lib.one_of(v, options) end),
  })
end
`;

const tree = (title: string) =>
  header(title, 'части ячейки по конструктору (ниже) сверяются с древом в базе') +
  `
if is_empty(true) then return end

base.check_parts()
`;

export const DEFAULT_SCRIPTS: Record<string, string> = {
  'meta.timestamp':
    header('Отметка времени', 'дата и время ДД.ММ.ГГГГ ЧЧ:ММ:СС') +
    `
if is_empty(true) then return end

if not lib.is_datetime(value) then
  problem("Нужно: дата и время — ДД.ММ.ГГГГ ЧЧ:ММ:СС", { fix = lib.try_fix(value, lib.is_datetime) })
end
`,
  'person.region': list('Регион'),
  'person.lastName': name('Фамилия', true, ['Имя', 'Отчество']),
  'person.firstName': name('Имя'),
  'person.middleName': name('Отчество', false),
  'rso.position': list('Должность в СО'),
  'rso.branch': list('Региональное отделение'),
  'person.gender': oneOf('Пол', ['Мужской', 'Женский']),
  'person.birthDate': date('Дата рождения', {
    confirm: true,
    extra: `
local from = setting.number("Возраст от", 14)
local to = setting.number("Возраст до", 35)
local age = lib.age(value)
if age < from or age > to then
  warning("Возраст " .. age .. " — не от " .. from .. " до " .. to .. ". Проверьте дату рождения")
end
`,
  }),
  'person.snils': masked('СНИЛС', '999-999-999 99', {
    unique: true,
    extra: `
if setting.toggle("Проверять контрольное число", true) and not lib.snils_ok(value) then
  warning("Контрольное число СНИЛС не сходится — проверьте цифры")
end
`,
  }),
  'person.inn': masked('ИНН', '999999999999', {
    unique: true,
    extra: `
if setting.toggle("Проверять контрольное число", true) and not lib.inn_ok(value) then
  warning("Контрольное число ИНН не сходится — проверьте цифры")
end
`,
  }),
  'person.phone': masked('Контактный телефон', '8(999)999-99-99', { unique: true }),
  'person.email':
    header('Электронная почта', 'имя@сайт.ru, строчными буквами') +
    `
if is_empty(true) then return end

if not lib.is_email_any(value) then
  problem("Нужно: имя@сайт.ru", { fix = lib.try_fix(value, lib.is_email_any) })
  return
end

-- С заглавными буквами почта тоже работает — только советуем строчные.
if value ~= lib.lower(value) then
  notice("Почту лучше писать строчными буквами", { fix = lib.lower(value) })
end
${confirmBlock}${uniqueBlock()}`,
  'passport.series': masked('Серия паспорта', '9999'),
  'passport.number': masked('Номер паспорта', '999999', { unique: ['Серия Паспорта'] }),
  'person.birthPlace': tree('Город рождения'),
  'passport.issuedBy': list('Кем выдан паспорт', 'Код подразделения'),
  'passport.issueDate': date('Дата выдачи паспорта', {
    confirm: true,
    extra: `
-- Сравнение с другой ячейкой: выдан не раньше 14 лет.
local birth = cell("Дата рождения")
if birth and lib.is_date(birth.value) then
  local age = lib.age(birth.value, value)
  if age < 14 then
    warning("Паспорт выдан в " .. age .. " лет — раньше 14. Проверьте даты")
  end
end
`,
  }),
  'passport.divisionCode':
    masked('Код подразделения', '999-999', { confirm: false }) +
    `
base.check()
`,
  'person.regAddress': tree('Место регистрации'),
  'person.factAddress': tree('Адрес проживания'),
  'rso.joinDate': date('Дата вступления'),
  'rso.leaveDate': date('Дата исключения', {
    required: false,
    extra: `
local join = cell("Дата вступления")
if join and lib.is_date(join.value) and lib.before(value, join.value) then
  problem("Дата исключения раньше даты вступления (" .. join.value .. ")")
end
`,
  }),
  'rso.cardNumber': masked('Номер членского билета', '99-99 999', { required: false }),
  'rso.direction': list('Направление ЛСО'),
  'rso.squad':
    header('Название отряда', 'в «ёлочках»: «Название»; значение из базы') +
    `
if is_empty(true) then return end

if not lib.in_guillemets(value) then
  problem("Название пишется в «ёлочках»: «Название»", { fix = lib.try_fix(value, lib.in_guillemets) })
  return
end

base.check()
`,
  'rso.experience': list('Опыт работы на объектах РСО'),
  'edu.institution':
    header('Место учебы', 'кавычки только «ёлочки»; значение из базы') +
    `
if is_empty(true) then return end

if lib.extra_spaces(value) or lib.has_bad_quotes(value) then
  problem("Кавычки — только «ёлочки», без лишних пробелов", { fix = lib.fix_quotes(value) })
  return
end

base.check()
`,
  'edu.specialty':
    header('Направление обучения', '«00.00.00 Название специальности»; значение из базы') +
    `
if is_empty(true) then return end

local code = lib.sub(value, 1, 8)
local name = lib.sub(value, 10)
if not lib.mask(code, "99.99.99") or lib.sub(value, 9, 9) ~= " " or not lib.is_capitalized(name) or lib.extra_spaces(value) then
  problem("Нужно: код и название — «00.00.00 Название специальности»", { fix = lib.try_fix(value, function(v)
    return lib.mask(lib.sub(v, 1, 8), "99.99.99") and lib.sub(v, 9, 9) == " " and lib.is_capitalized(lib.sub(v, 10))
  end) })
  return
end

base.check()
`,
  'edu.course':
    header('Курс', 'число от … до … (настраивается)') +
    `
if is_empty(true) then return end

local from = setting.number("Курс от", 1)
local to = setting.number("Курс до", 6)
local function fits(v)
  local n = lib.number(v)
  return n ~= nil and n >= from and n <= to and lib.only_digits(v)
end

if not fits(value) then
  problem("Нужно число от " .. from .. " до " .. to, { fix = lib.try_fix(value, fits) })
end
${confirmBlock}`,
  'edu.group':
    header('Группа', 'без пробелов') +
    `
if is_empty(true) then return end

if lib.contains(value, " ") then
  problem("Группа пишется без пробелов", { fix = lib.replace(lib.fix_spaces(value), " ", "") })
end
${confirmBlock}`,
  'edu.form': oneOf('Форма обучения', ['очная', 'заочная', 'очно-заочная']),
  'person.vk':
    header('Ссылка на страницу в ВК', 'https://vk.com/… или https://vk.ru/…') +
    `
if is_empty(true) then return end

if not lib.is_vk(value) then
  problem("Нужно: https://vk.com/имя или https://vk.ru/имя", { fix = lib.fix_vk(value) })
end
${confirmBlock}${uniqueBlock()}`,
  'rso.wasMember': oneOf('Состоял(а) ли ранее в отрядах', ['Да', 'Нет'], false),
  'rso.checkMark': date('Отметка проверки перс. данных', { required: false }),
};

/** Примеры по умолчанию — нейтральные заготовки, а не чьи-то данные. */
export const DEFAULT_EXAMPLES: Record<string, string> = {
  'meta.timestamp': '01.01.2025 00:00:00',
  'person.region': 'Республика Регион',
  'person.lastName': 'Фамилия',
  'person.firstName': 'Имя',
  'person.middleName': 'Отчество',
  'rso.position': 'Кандидат',
  'rso.branch': 'Региональное отделение',
  'person.gender': 'Мужской',
  'person.birthDate': '01.01.2000',
  'person.snils': '000-000-000 00',
  'person.inn': '000000000000',
  'person.phone': '8(000)000-00-00',
  'person.email': 'name@example.com',
  'passport.series': '0000',
  'passport.number': '000000',
  'person.birthPlace': 'с. Примерное Районный р-н Республика Регион Россия',
  'passport.issuedBy': 'Название органа',
  'passport.issueDate': '01.01.2014',
  'passport.divisionCode': '000-000',
  'person.regAddress': '000000, Респ. Регион, р-н Районный, с. Примерное, ул. Примерная, д. 1',
  'person.factAddress': 'Респ. Регион, г. Примерск, ул. Примерная, д. 1, кв. 1',
  'rso.joinDate': '01.01.2025',
  'rso.leaveDate': '01.01.2026',
  'rso.cardNumber': '00-00 000',
  'rso.direction': 'студенческие сервисные отряды',
  'rso.squad': '«Название»',
  'rso.experience': 'Не имею',
  'edu.institution': 'ГБПОУ «Название»',
  'edu.specialty': '00.00.00 Название специальности',
  'edu.course': '1',
  'edu.group': 'ГР-01',
  'edu.form': 'очная',
  'person.vk': 'https://vk.com/username',
  'rso.wasMember': 'Нет',
  'rso.checkMark': '01.01.2025',
};
