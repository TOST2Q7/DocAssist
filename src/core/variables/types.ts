export type VarKind =
  | 'fio'
  | 'name'
  | 'phone'
  | 'email'
  | 'address'
  | 'date'
  | 'document'
  | 'organization'
  | 'url'
  | 'number'
  | 'text';

export const VAR_KINDS: Record<VarKind, { label: string; defaultKey: string }> = {
  fio: { label: 'ФИО', defaultKey: 'fio' },
  name: { label: 'Имя / фамилия', defaultKey: 'name' },
  phone: { label: 'Телефон', defaultKey: 'phone' },
  email: { label: 'Эл. почта', defaultKey: 'email' },
  address: { label: 'Адрес', defaultKey: 'address' },
  date: { label: 'Дата', defaultKey: 'date' },
  document: { label: 'Документ / номер', defaultKey: 'doc' },
  organization: { label: 'Организация', defaultKey: 'org' },
  url: { label: 'Ссылка', defaultKey: 'link' },
  number: { label: 'Число', defaultKey: 'num' },
  text: { label: 'Текст', defaultKey: 'text' },
};

export interface Variable {
  id: string;
  /** Ключ для подстановки: <fio>, <phone>, <адрес_штаба>. */
  key: string;
  label: string;
  value: string;
  kind: VarKind;
  /** Откуда пришло значение (приложение, файл). */
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export const VAR_KEY_RE = /^[\p{L}\p{N}_.-]{1,40}$/u;
