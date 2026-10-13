/** Поля анкеты по разделам — для формы ручного ввода и личной карточки. Порядок внутри — как удобно заполнять. */
export interface FieldGroup {
  id: string;
  title: string;
  ids: string[];
  /** Свёрнут по умолчанию. */
  collapsed?: boolean;
}

export const FIELD_GROUPS: FieldGroup[] = [
  { id: 'main', title: 'Основное', ids: ['person.lastName', 'person.firstName', 'person.middleName', 'person.gender', 'person.birthDate', 'person.birthPlace', 'person.region'] },
  { id: 'docs', title: 'Паспорт и документы', ids: ['passport.series', 'passport.number', 'passport.issuedBy', 'passport.issueDate', 'passport.divisionCode', 'person.snils', 'person.inn'] },
  { id: 'contacts', title: 'Контакты и адреса', ids: ['person.phone', 'person.email', 'person.vk', 'person.regAddress', 'person.factAddress'] },
  { id: 'rso', title: 'Отряд', ids: ['rso.squad', 'rso.branch', 'rso.direction', 'rso.position', 'rso.joinDate', 'rso.cardNumber', 'rso.leaveDate', 'rso.experience', 'rso.wasMember'] },
  { id: 'edu', title: 'Учёба', ids: ['edu.institution', 'edu.specialty', 'edu.course', 'edu.group', 'edu.form'] },
  { id: 'service', title: 'Служебное', ids: ['meta.timestamp', 'rso.checkMark'], collapsed: true },
];

/** Длинные поля — многострочные. */
export const LONG_FIELDS = new Set(['person.birthPlace', 'passport.issuedBy', 'person.regAddress', 'person.factAddress', 'edu.institution', 'edu.specialty', 'rso.experience']);
