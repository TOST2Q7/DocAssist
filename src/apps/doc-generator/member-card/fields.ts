import { ALL_INSTITUTIONS } from '@/content/help/institutions';
import { shortFio } from '@/content/help/manual';
import type { VarKind } from '@/core/variables/types';

/*
 * Поля учётной карточки члена организации — по образцу заполнения из методического пособия
 * (рисунок 1.12). Идентификаторы — поля базы людей (общий язык приложений), поэтому данные
 * берутся из базы, а недостающее можно дописать в неё.
 */

export interface CardField {
  /** Поле базы людей. */
  id: string;
  /** Как называется в форме. */
  label: string;
  /** Как заполнять — по методичке. */
  hint: string;
  /** Из образца заполнения в методичке. */
  example?: string;
  /** Без него карточка неполная (в образце заполнено). */
  required: boolean;
  /** Тип значения — для подсказок при наборе. */
  kind?: VarKind;
  /** Длинное значение — поле ввода в несколько строк. */
  long?: boolean;
  /** Замечание к формату (не мешает сформировать карточку). */
  check?: (value: string) => string | undefined;
  /** Правильная запись, если её можно получить из написанного. */
  fix?: (value: string) => string | undefined;
}

export interface CardSection {
  title: string;
  fields: CardField[];
}

const isDate = (v: string) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v);
  if (!m) return false;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getFullYear() === Number(m[3]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1]);
};
const dateCheck = (v: string) => (isDate(v) ? undefined : 'Нужно: ДД.ММ.ГГГГ, например 01.01.2000');
const dateFix = (v: string) => {
  const m = /^(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{4})$/.exec(v.trim());
  if (!m) return undefined;
  const out = `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[3]}`;
  return isDate(out) ? out : undefined;
};
const digitsFix = (n: number) => (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.length === n ? d : undefined;
};
/** Для сравнения названий: без регистра, «ё», вида кавычек, тире и лишних пробелов. */
const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/["„“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** Сокращённое наименование из справки, если записано полное (или сокращённое с другими кавычками). */
export function shortInstitution(value: string): string | undefined {
  const v = normName(value);
  if (!v) return undefined;
  const found = ALL_INSTITUTIONS.find((i) => normName(i.name) === v || normName(i.short) === v);
  return found && found.short !== value.trim() ? found.short : undefined;
}

const phoneFix = (v: string) => {
  let d = v.replace(/\D/g, '');
  if (d.length === 10) d = `8${d}`;
  if (d.length !== 11 || !/^[78]/.test(d)) return undefined;
  return `8(${d.slice(1, 4)})${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
};

export const CARD_SECTIONS: CardSection[] = [
  {
    title: 'ФИО и дата рождения',
    fields: [
      { id: 'person.lastName', label: 'Фамилия', hint: 'Как в паспорте.', required: true, kind: 'name' },
      { id: 'person.firstName', label: 'Имя', hint: 'Как в паспорте.', required: true, kind: 'name' },
      { id: 'person.middleName', label: 'Отчество', hint: 'Как в паспорте. Если отчества нет — оставьте пустым.', required: false, kind: 'name' },
      { id: 'person.birthDate', label: 'Дата рождения', hint: 'ДД.ММ.ГГГГ.', example: '01.01.2000', required: true, kind: 'date', check: dateCheck, fix: dateFix },
    ],
  },
  {
    title: 'Учёба и работа',
    fields: [
      {
        id: 'edu.institution',
        label: 'Место учебы',
        hint: 'Сокращённое наименование учебного заведения — как в справке (приложения 1–5), вместе с институтом или колледжем.',
        example: 'ФГБОУ ВО «ХГУ им. Н.Ф. Катанова», КПОИиП',
        required: true,
        kind: 'organization',
        check: (v) => (shortInstitution(v) ? 'В карточку пишется сокращённое наименование' : undefined),
        fix: shortInstitution,
      },
      { id: 'edu.group', label: 'Группа', hint: 'Номер группы, как в справке с места учёбы.', example: 'И-12', required: true },
      { id: 'work.place', label: 'Место работы', hint: 'Если работает. В образце не заполнено — можно оставить пустым.', required: false, kind: 'organization' },
      { id: 'work.position', label: 'Должность', hint: 'Должность на месте работы. Можно оставить пустым.', required: false },
    ],
  },
  {
    title: 'Паспортные данные',
    fields: [
      { id: 'passport.issuedBy', label: 'Выдан', hint: 'Кем выдан — как в паспорте.', example: 'МВД по Республике Регион', required: true, kind: 'organization' },
      { id: 'passport.issueDate', label: 'Дата выдачи', hint: 'ДД.ММ.ГГГГ.', example: '01.01.2014', required: true, kind: 'date', check: dateCheck, fix: dateFix },
      {
        id: 'passport.series',
        label: 'Серия',
        hint: '4 цифры без пробела.',
        example: '0000',
        required: true,
        kind: 'document',
        check: (v) => (/^\d{4}$/.test(v) ? undefined : 'Нужно 4 цифры без пробела'),
        fix: digitsFix(4),
      },
      {
        id: 'passport.number',
        label: 'Номер',
        hint: '6 цифр.',
        example: '000000',
        required: true,
        kind: 'document',
        check: (v) => (/^\d{6}$/.test(v) ? undefined : 'Нужно 6 цифр'),
        fix: digitsFix(6),
      },
    ],
  },
  {
    title: 'Адреса',
    fields: [
      {
        id: 'person.regAddress',
        label: 'Адрес (постоянная регистрация) с индексом',
        hint: 'По прописке в паспорте, в начале — индекс. Длинный адрес продолжится на следующей строке карточки.',
        example: '000000, Респ. Регион, г. Примерск, ул. Примерная, д. 1, кв. 1',
        required: true,
        kind: 'address',
        long: true,
        check: (v) => (/^\d{6},/.test(v) ? undefined : 'В начале нужен индекс: «000000, …»'),
      },
      {
        id: 'person.factAddress',
        label: 'Адрес фактического места жительства',
        hint: 'Где живёт сейчас.',
        example: 'Респ. Регион, г. Примерск, ул. Примерная, д. 1',
        required: true,
        kind: 'address',
        long: true,
      },
    ],
  },
  {
    title: 'Контакты',
    fields: [
      {
        id: 'person.phone',
        label: 'Конт. тел.',
        hint: 'Через 8, код в скобках.',
        example: '8(000)000-00-00',
        required: true,
        kind: 'phone',
        check: (v) => (/^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/.test(v) ? undefined : 'Нужно: 8(000)000-00-00'),
        fix: phoneFix,
      },
      {
        id: 'person.email',
        label: 'E-mail',
        hint: 'Электронная почта.',
        example: 'name@example.com',
        required: true,
        kind: 'email',
        check: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Нужно: имя@сайт.ru'),
        fix: (v) => {
          const t = v.replace(/\s+/g, '');
          return t !== v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : undefined;
        },
      },
    ],
  },
  {
    title: 'Членский билет',
    fields: [
      {
        id: 'rso.cardNumber',
        label: '№ членского билета',
        hint: 'Если билет уже выдан. У кандидата — пусто (в образце не заполнено).',
        required: false,
        kind: 'document',
      },
    ],
  },
];

export const CARD_FIELDS: CardField[] = CARD_SECTIONS.flatMap((s) => s.fields);
export const CARD_FIELD_BY_ID = new Map(CARD_FIELDS.map((f) => [f.id, f]));

export type CardValues = Record<string, string>;

/** Значения карточки из записи базы людей. */
export function cardValues(fields: Record<string, string> | undefined): CardValues {
  return Object.fromEntries(CARD_FIELDS.map((f) => [f.id, fields?.[f.id] ?? '']));
}

/** Обязательные поля, которые не заполнены. */
export function missingFields(values: CardValues): CardField[] {
  return CARD_FIELDS.filter((f) => f.required && !(values[f.id] ?? '').trim());
}

export function fullName(values: CardValues): string {
  return ['person.lastName', 'person.firstName', 'person.middleName']
    .map((id) => (values[id] ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/** «Фамилия И.О. - Учетная карточка члена организации.docx» — как велит методичка. */
export function cardFileName(values: CardValues): string {
  const who = shortFio(fullName(values));
  const name = `${who ? `${who} - ` : ''}Учетная карточка члена организации`;
  return `${name.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()}.docx`;
}
