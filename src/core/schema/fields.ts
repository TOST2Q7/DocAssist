/**
 * Общий «язык» приложений — канонические поля анкеты РСО.
 *
 * Порядок и названия — как в форме анкеты (35 столбцов). Разные таблицы могут называть столбцы
 * немного иначе («ИНН» вместо «Номер ИНН») — для этого aliases. Если у таблицы нет строки заголовков,
 * столбцы понимаются по порядку.
 *
 * Идентификаторы — постоянные. Переименовывать нельзя (на них ссылаются сохранённые данные),
 * можно только добавлять новые и расширять aliases.
 */

import type { VarKind } from '../variables/types';

export interface FieldDef {
  id: string;
  /** Название столбца, как в форме анкеты. */
  label: string;
  /** Другие варианты заголовков (сравниваются без учёта регистра, пробелов и «ё»). */
  aliases: string[];
  /** Тип глобальной переменной для кнопки «Сохранить в переменные». */
  varKind?: VarKind;
}

export const PERSON_FIELDS: FieldDef[] = [
  { id: 'meta.timestamp', label: 'Отметка времени', aliases: ['timestamp', 'дата заполнения'], varKind: 'date' },
  { id: 'person.region', label: 'Регион', aliases: ['субъект рф', 'субъект'] },
  { id: 'person.lastName', label: 'Фамилия', aliases: [], varKind: 'name' },
  { id: 'person.firstName', label: 'Имя', aliases: [], varKind: 'name' },
  { id: 'person.middleName', label: 'Отчество', aliases: [], varKind: 'name' },
  { id: 'rso.position', label: 'Должность в СО', aliases: ['должность'] },
  { id: 'rso.branch', label: 'Региональное отделение', aliases: ['ро'], varKind: 'organization' },
  { id: 'person.gender', label: 'Пол', aliases: [] },
  { id: 'person.birthDate', label: 'Дата рождения', aliases: [], varKind: 'date' },
  { id: 'person.snils', label: 'СНИЛС, ПСС', aliases: ['снилс', 'снилс псс', 'страховое свидетельство'], varKind: 'document' },
  { id: 'person.inn', label: 'Номер ИНН', aliases: ['инн'], varKind: 'document' },
  { id: 'person.phone', label: 'Контактный телефон', aliases: ['телефон', 'номер телефона'], varKind: 'phone' },
  { id: 'person.email', label: 'Электронная почта', aliases: ['email', 'e-mail', 'почта'], varKind: 'email' },
  { id: 'passport.series', label: 'Серия Паспорта', aliases: [], varKind: 'document' },
  { id: 'passport.number', label: 'Номер Паспорта', aliases: [], varKind: 'document' },
  { id: 'person.birthPlace', label: 'Город рождения', aliases: ['место рождения'], varKind: 'address' },
  { id: 'passport.issuedBy', label: 'Кем выдан паспорт', aliases: ['кем выдан'], varKind: 'organization' },
  { id: 'passport.issueDate', label: 'Дата выдачи паспорта', aliases: ['дата выдачи'], varKind: 'date' },
  { id: 'passport.divisionCode', label: 'Код подразделения', aliases: [], varKind: 'document' },
  {
    id: 'person.regAddress',
    label: 'Место регистрации по паспорту (с индексом)',
    aliases: ['место регистрации по паспорту', 'адрес регистрации', 'место регистрации', 'адрес прописки'],
    varKind: 'address',
  },
  { id: 'person.factAddress', label: 'Адрес фактического проживания', aliases: ['фактический адрес', 'адрес проживания'], varKind: 'address' },
  { id: 'rso.joinDate', label: 'Дата вступления', aliases: [], varKind: 'date' },
  { id: 'rso.leaveDate', label: 'Дата исключения', aliases: [], varKind: 'date' },
  { id: 'rso.cardNumber', label: 'Номер членского билета', aliases: ['членский билет'], varKind: 'document' },
  { id: 'rso.direction', label: 'Направление ЛСО', aliases: [] },
  { id: 'rso.squad', label: 'Название отряда', aliases: ['отряд'], varKind: 'organization' },
  { id: 'rso.experience', label: 'Опыт работы на объектах РСО', aliases: ['опыт работы'] },
  { id: 'edu.institution', label: 'Место учебы', aliases: ['место учёбы', 'учебное заведение', 'образовательная организация'], varKind: 'organization' },
  { id: 'edu.specialty', label: 'Направление обучения (с кодом специальности)', aliases: ['направление обучения', 'специальность'] },
  { id: 'edu.course', label: 'Курс', aliases: [], varKind: 'number' },
  { id: 'edu.group', label: 'Группа', aliases: [] },
  { id: 'edu.form', label: 'Форма обучения', aliases: [] },
  { id: 'person.vk', label: 'Ссылка на страницу в ВК', aliases: ['ссылка на вк', 'вк', 'vk', 'вконтакте'], varKind: 'url' },
  { id: 'rso.wasMember', label: 'Состоял(а) ли ранее в отрядах?', aliases: ['состоял ли ранее в отрядах', 'состояла ли ранее в отрядах'] },
  {
    id: 'rso.checkMark',
    label: 'Отметка проверки перс. данных кандидата командным составом отряда.',
    aliases: ['отметка проверки персональных данных', 'отметка проверки'],
    varKind: 'date',
  },
];

export const FIELD_BY_ID = new Map(PERSON_FIELDS.map((f) => [f.id, f]));

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s ]+/g, ' ')
    .replace(/[.:;?]+$/g, '')
    .trim();
}

/** Сопоставить заголовки столбцов с каноническими полями. Возвращает fieldId для каждого столбца (или null). */
export function matchColumns(headers: string[], fields: FieldDef[] = PERSON_FIELDS): (string | null)[] {
  const used = new Set<string>();
  const result: (string | null)[] = headers.map(() => null);
  const norm = headers.map(normalizeHeader);
  const names = (f: FieldDef) => [f.label, ...f.aliases].map(normalizeHeader);
  // 1. Точные совпадения с названием или вариантом.
  norm.forEach((h, i) => {
    if (!h) return;
    const f = fields.find((f) => !used.has(f.id) && names(f).includes(h));
    if (f) {
      result[i] = f.id;
      used.add(f.id);
    }
  });
  // 2. Заголовок начинается с названия («Направление обучения (с кодом…)» → «направление обучения»).
  norm.forEach((h, i) => {
    if (!h || result[i]) return;
    const f = fields.find((f) => !used.has(f.id) && names(f).some((a) => a.length >= 3 && h.startsWith(a)));
    if (f) {
      result[i] = f.id;
      used.add(f.id);
    }
  });
  return result;
}

/**
 * Похожа ли строка на заголовок анкеты. Если нет — у таблицы нет строки заголовков
 * (например, строки вставлены из буфера), и столбцы понимаются по порядку формы.
 */
export function looksLikeHeader(row: string[]): boolean {
  const filled = row.filter((c) => c.trim()).length;
  if (!filled) return false;
  // Заголовок — когда с названиями формы совпадает хотя бы половина заполненных ячеек.
  return matchColumns(row).filter(Boolean).length * 2 >= filled;
}
