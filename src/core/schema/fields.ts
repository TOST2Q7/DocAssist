/**
 * Общий «язык» приложений — канонические поля.
 *
 * Разные таблицы называют одно и то же по-разному («Номер ИНН», «ИНН», «инн физлица»).
 * Приложения сопоставляют столбцы с этими идентификаторами и дальше обмениваются данными
 * уже на общем языке: `person.lastName`, `passport.series` и т.д.
 *
 * Идентификаторы — постоянные. Переименовывать нельзя (на них ссылаются сохранённые данные),
 * можно только добавлять новые и расширять aliases.
 */

import type { VarKind } from '../variables/types';

export type FieldKind =
  | 'text'
  | 'name'
  | 'date'
  | 'datetime'
  | 'phone'
  | 'email'
  | 'address'
  | 'birthplace'
  | 'snils'
  | 'inn'
  | 'passportSeries'
  | 'passportNumber'
  | 'divisionCode'
  | 'issuedBy'
  | 'region'
  | 'url'
  | 'enum'
  | 'number'
  | 'quoted'
  | 'specialty'
  | 'cardNumber';

export interface FieldDef {
  id: string;
  label: string;
  kind: FieldKind;
  /** Варианты заголовков столбцов (сравниваются без учёта регистра, пробелов и «ё»). */
  aliases: string[];
  /** Какой тип глобальной переменной подходит для подсказок в этом поле. */
  varKind?: VarKind;
  /** Для полей-списков: имя справочника допустимых значений. */
  enumDict?: string;
}

export const PERSON_FIELDS: FieldDef[] = [
  { id: 'meta.timestamp', label: 'Отметка времени', kind: 'datetime', aliases: ['отметка времени', 'timestamp', 'дата заполнения'] },
  { id: 'person.region', label: 'Регион', kind: 'region', aliases: ['регион', 'субъект рф', 'субъект'] },
  { id: 'person.lastName', label: 'Фамилия', kind: 'name', aliases: ['фамилия'], varKind: 'name' },
  { id: 'person.firstName', label: 'Имя', kind: 'name', aliases: ['имя'], varKind: 'name' },
  { id: 'person.middleName', label: 'Отчество', kind: 'name', aliases: ['отчество'], varKind: 'name' },
  { id: 'rso.position', label: 'Должность в СО', kind: 'enum', aliases: ['должность в со', 'должность'], enumDict: 'rso.position' },
  { id: 'rso.branch', label: 'Региональное отделение', kind: 'enum', aliases: ['региональное отделение', 'ро'], enumDict: 'rso.branch' },
  { id: 'person.gender', label: 'Пол', kind: 'enum', aliases: ['пол'], enumDict: 'person.gender' },
  { id: 'person.birthDate', label: 'Дата рождения', kind: 'date', aliases: ['дата рождения'], varKind: 'date' },
  { id: 'person.snils', label: 'СНИЛС', kind: 'snils', aliases: ['снилс, псс', 'снилс', 'снилс псс', 'страховое свидетельство'], varKind: 'document' },
  { id: 'person.inn', label: 'ИНН', kind: 'inn', aliases: ['номер инн', 'инн'], varKind: 'document' },
  { id: 'person.phone', label: 'Контактный телефон', kind: 'phone', aliases: ['контактный телефон', 'телефон', 'номер телефона'], varKind: 'phone' },
  { id: 'person.email', label: 'Электронная почта', kind: 'email', aliases: ['электронная почта', 'email', 'e-mail', 'почта'], varKind: 'email' },
  { id: 'passport.series', label: 'Серия паспорта', kind: 'passportSeries', aliases: ['серия паспорта'], varKind: 'document' },
  { id: 'passport.number', label: 'Номер паспорта', kind: 'passportNumber', aliases: ['номер паспорта'], varKind: 'document' },
  { id: 'person.birthPlace', label: 'Место рождения', kind: 'birthplace', aliases: ['город рождения', 'место рождения'], varKind: 'address' },
  { id: 'passport.issuedBy', label: 'Кем выдан паспорт', kind: 'issuedBy', aliases: ['кем выдан паспорт', 'кем выдан'], varKind: 'organization' },
  { id: 'passport.issueDate', label: 'Дата выдачи паспорта', kind: 'date', aliases: ['дата выдачи паспорта', 'дата выдачи'], varKind: 'date' },
  { id: 'passport.divisionCode', label: 'Код подразделения', kind: 'divisionCode', aliases: ['код подразделения'], varKind: 'document' },
  {
    id: 'person.regAddress',
    label: 'Адрес регистрации',
    kind: 'address',
    aliases: ['место регистрации по паспорту (с индексом)', 'место регистрации по паспорту', 'адрес регистрации', 'место регистрации', 'адрес прописки'],
    varKind: 'address',
  },
  { id: 'person.factAddress', label: 'Адрес проживания', kind: 'address', aliases: ['адрес фактического проживания', 'фактический адрес', 'адрес проживания'], varKind: 'address' },
  { id: 'rso.joinDate', label: 'Дата вступления', kind: 'date', aliases: ['дата вступления'], varKind: 'date' },
  { id: 'rso.leaveDate', label: 'Дата исключения', kind: 'date', aliases: ['дата исключения'], varKind: 'date' },
  { id: 'rso.cardNumber', label: 'Номер членского билета', kind: 'cardNumber', aliases: ['номер членского билета', 'членский билет'], varKind: 'document' },
  { id: 'rso.direction', label: 'Направление ЛСО', kind: 'enum', aliases: ['направление лсо', 'направление'], enumDict: 'rso.direction' },
  { id: 'rso.squad', label: 'Название отряда', kind: 'quoted', aliases: ['название отряда', 'отряд'], varKind: 'organization' },
  { id: 'rso.experience', label: 'Опыт работы на объектах РСО', kind: 'enum', aliases: ['опыт работы на объектах рсо', 'опыт работы'], enumDict: 'rso.experience' },
  { id: 'edu.institution', label: 'Место учёбы', kind: 'quoted', aliases: ['место учебы', 'учебное заведение', 'образовательная организация'], varKind: 'organization' },
  {
    id: 'edu.specialty',
    label: 'Направление обучения',
    kind: 'specialty',
    aliases: ['направление обучения (с кодом специальности)', 'направление обучения', 'специальность'],
  },
  { id: 'edu.course', label: 'Курс', kind: 'number', aliases: ['курс'] },
  { id: 'edu.group', label: 'Группа', kind: 'text', aliases: ['группа'] },
  { id: 'edu.form', label: 'Форма обучения', kind: 'enum', aliases: ['форма обучения'], enumDict: 'edu.form' },
  { id: 'person.vk', label: 'Страница ВКонтакте', kind: 'url', aliases: ['ссылка на страницу в вк', 'ссылка на вк', 'вк', 'vk', 'вконтакте'], varKind: 'url' },
];

export const FIELD_BY_ID = new Map(PERSON_FIELDS.map((f) => [f.id, f]));

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s ]+/g, ' ')
    .replace(/[.:;]+$/g, '')
    .trim();
}

/** Сопоставить заголовки столбцов с каноническими полями. Возвращает fieldId для каждого столбца (или null). */
export function matchColumns(headers: string[], fields: FieldDef[] = PERSON_FIELDS): (string | null)[] {
  const used = new Set<string>();
  const result: (string | null)[] = headers.map(() => null);
  const norm = headers.map(normalizeHeader);
  // 1. Точные совпадения по алиасам.
  norm.forEach((h, i) => {
    if (!h) return;
    const f = fields.find((f) => !used.has(f.id) && f.aliases.some((a) => normalizeHeader(a) === h));
    if (f) {
      result[i] = f.id;
      used.add(f.id);
    }
  });
  // 2. Заголовок начинается с алиаса («Направление обучения (с кодом…)» → «направление обучения»).
  norm.forEach((h, i) => {
    if (!h || result[i]) return;
    const f = fields.find((f) => !used.has(f.id) && f.aliases.some((a) => normalizeHeader(a).length >= 3 && h.startsWith(normalizeHeader(a))));
    if (f) {
      result[i] = f.id;
      used.add(f.id);
    }
  });
  return result;
}
