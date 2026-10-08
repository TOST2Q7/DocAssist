/** Имена пользовательских справочников проверки анкет (лёгкий модуль — нужен манифесту). */
export const DICT = {
  firstNames: 'person.firstNames',
  patronymics: 'person.patronymics',
  emailDomains: 'email.domains',
  issuedBy: 'passport.issuedBy',
  specialties: 'edu.specialties',
  institutions: 'edu.institutions',
  squads: 'rso.squads',
} as const;

export const DICT_TITLES: Record<string, string> = {
  [DICT.firstNames]: 'Имена',
  [DICT.patronymics]: 'Отчества',
  [DICT.emailDomains]: 'Почтовые домены',
  [DICT.issuedBy]: 'Подразделения, выдающие паспорта',
  [DICT.specialties]: 'Направления обучения',
  [DICT.institutions]: 'Учебные заведения',
  [DICT.squads]: 'Отряды',
};
