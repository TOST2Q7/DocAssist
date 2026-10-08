/** Группы полей в карточке человека (вместо одной длинной строки таблицы). */
export const GROUPS: { id: string; title: string; fields: string[] }[] = [
  { id: 'main', title: 'Основное', fields: ['person.lastName', 'person.firstName', 'person.middleName', 'person.gender', 'person.birthDate', 'person.region', 'person.birthPlace'] },
  { id: 'docs', title: 'Документы', fields: ['passport.series', 'passport.number', 'passport.issueDate', 'passport.divisionCode', 'passport.issuedBy', 'person.snils', 'person.inn'] },
  { id: 'contacts', title: 'Контакты', fields: ['person.phone', 'person.email', 'person.vk'] },
  { id: 'address', title: 'Адреса', fields: ['person.regAddress', 'person.factAddress'] },
  { id: 'rso', title: 'Студенческий отряд', fields: ['rso.position', 'rso.branch', 'rso.direction', 'rso.squad', 'rso.joinDate', 'rso.leaveDate', 'rso.cardNumber', 'rso.experience'] },
  { id: 'edu', title: 'Учёба', fields: ['edu.institution', 'edu.specialty', 'edu.course', 'edu.group', 'edu.form'] },
];

export const KNOWN_GROUP_FIELDS = new Set(GROUPS.flatMap((g) => g.fields));
