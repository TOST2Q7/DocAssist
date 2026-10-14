import { textlib, todayText } from '@/core/lua/textlib';
import type { PersonRecord } from '@/core/people/people';
import { fioText } from '@/core/people/people';
import { PERSON_FIELDS } from '@/core/schema/fields';
import type { Variable } from '@/core/variables/types';
import type { Achievement, PersonCase } from './cases';
import { declineFio, genderFromField, guessGender, shortFio, signFio, type Gender } from './names';

/*
 * Метки в шаблонах документов: {ФИО}, {Новый отряд}, {Дата перевода}…
 *
 *   {ФИО:кого}   — в родительном падеже (от кого): Примерова Примера Примеровича
 *   {ФИО:кому}   — в дательном (кому): Примерову Примеру Примеровичу
 *   {ФИО:кратко} — Примеров П. П.;  {ФИО:подпись} — П. П. Примеров
 *   {зарекомендовал|зарекомендовала} — слово по полу бойца
 *   {ключ} глобальной переменной — её значение
 *
 * Кроме коротких названий работают и полные названия полей анкеты: {Контактный телефон}, {Серия Паспорта}.
 */

export interface PlaceholderDef {
  key: string;
  /** Откуда значение (для справки). */
  hint?: string;
}

export interface PlaceholderGroup {
  title: string;
  items: PlaceholderDef[];
}

/** Короткие названия полей. */
const SHORT: Record<string, string> = {
  Фамилия: 'person.lastName',
  Имя: 'person.firstName',
  Отчество: 'person.middleName',
  Пол: 'person.gender',
  'Дата рождения': 'person.birthDate',
  'Город рождения': 'person.birthPlace',
  Регион: 'person.region',
  Телефон: 'person.phone',
  Почта: 'person.email',
  ВК: 'person.vk',
  'Адрес регистрации': 'person.regAddress',
  'Адрес проживания': 'person.factAddress',
  'Серия паспорта': 'passport.series',
  'Номер паспорта': 'passport.number',
  'Кем выдан': 'passport.issuedBy',
  'Дата выдачи': 'passport.issueDate',
  'Код подразделения': 'passport.divisionCode',
  СНИЛС: 'person.snils',
  ИНН: 'person.inn',
  Отряд: 'rso.squad',
  РО: 'rso.branch',
  Направление: 'rso.direction',
  Должность: 'rso.position',
  'Дата вступления': 'rso.joinDate',
  'Дата исключения': 'rso.leaveDate',
  'Членский билет': 'rso.cardNumber',
  'Опыт работы': 'rso.experience',
  'Место учёбы': 'edu.institution',
  Специальность: 'edu.specialty',
  Курс: 'edu.course',
  Группа: 'edu.group',
  'Форма обучения': 'edu.form',
};

/** Данные перевода для меток. */
export interface TransferValues {
  date: string;
  reason: string;
  toSquad: string;
  toBranch: string;
  toDirection: string;
  toPosition: string;
  commanderFrom: string;
  commanderTo: string;
}

export const TRANSFER_KEYS: Record<keyof TransferValues, string> = {
  toSquad: 'Новый отряд',
  toBranch: 'Новое РО',
  toDirection: 'Новое направление',
  toPosition: 'Новая должность',
  date: 'Дата перевода',
  reason: 'Причина',
  commanderFrom: 'Командир прежнего отряда',
  commanderTo: 'Командир нового отряда',
};

export const PLACEHOLDER_GROUPS: PlaceholderGroup[] = [
  {
    title: 'Боец',
    items: [
      { key: 'ФИО' },
      { key: 'ФИО:кого', hint: 'от кого: Примерова Примера Примеровича' },
      { key: 'ФИО:кому', hint: 'кому: Примерову Примеру Примеровичу' },
      { key: 'ФИО:кратко', hint: 'Примеров П. П.' },
      { key: 'ФИО:подпись', hint: 'П. П. Примеров' },
      ...['Фамилия', 'Имя', 'Отчество', 'Пол', 'Дата рождения', 'Возраст', 'Город рождения', 'Регион', 'Телефон', 'Почта', 'ВК', 'Адрес регистрации', 'Адрес проживания'].map((key) => ({ key })),
    ],
  },
  {
    title: 'Документы',
    items: [{ key: 'Паспорт', hint: 'серия и номер' }, ...['Серия паспорта', 'Номер паспорта', 'Кем выдан', 'Дата выдачи', 'Код подразделения', 'СНИЛС', 'ИНН'].map((key) => ({ key }))],
  },
  { title: 'Отряд', items: ['Отряд', 'РО', 'Направление', 'Должность', 'Дата вступления', 'Дата исключения', 'Членский билет', 'Опыт работы'].map((key) => ({ key })) },
  { title: 'Учёба', items: ['Место учёбы', 'Специальность', 'Курс', 'Группа', 'Форма обучения'].map((key) => ({ key })) },
  {
    title: 'Личное дело',
    items: [
      { key: 'Характеристика', hint: 'текст из личной папки' },
      { key: 'Достижения', hint: 'списком, каждое с новой строки' },
      { key: 'Достижения в тексте', hint: '«Имеет достижения: …» или пусто' },
    ],
  },
  {
    title: 'Перевод',
    items: [
      ...Object.values(TRANSFER_KEYS).map((key) => ({ key })),
      { key: 'Командир нового отряда:кому', hint: 'Командирову К. К.' },
      { key: 'Командир прежнего отряда:подпись', hint: 'К. К. Командиров' },
    ],
  },
  {
    title: 'Прочее',
    items: [
      { key: 'Сегодня', hint: 'ДД.ММ.ГГГГ' },
      { key: 'Год' },
      { key: 'он|она', hint: 'слово по полу бойца' },
      { key: 'зарекомендовал|зарекомендовала' },
    ],
  },
];

const norm = (k: string) => k.toLowerCase().replace(/ё/g, 'е').replace(/[\s ]+/g, ' ').trim();

/** Добавить значения меток (например, для сканов: {Документ}, {№}) — исходная таблица не меняется. */
export function withValues(values: Map<string, string>, extra: Record<string, string>): Map<string, string> {
  const out = new Map(values);
  for (const [k, v] of Object.entries(extra)) out.set(norm(k), v);
  return out;
}

/** Достижения строками: «01.09.2025 — Грамота за … (РО)». */
export function achievementsText(list: Achievement[]): string {
  return list.map((a) => [a.date, a.title].filter(Boolean).join(' — ') + (a.level ? ` (${a.level})` : '')).join('\n');
}

export function personGender(fields: Record<string, string>): Gender | null {
  return genderFromField(fields['person.gender']) ?? guessGender({ last: fields['person.lastName'], first: fields['person.firstName'], middle: fields['person.middleName'] });
}

/** Все значения меток для человека (и перевода, если он оформляется). */
export function placeholderValues(record: Pick<PersonRecord, 'fields'>, c?: Pick<PersonCase, 'characteristic' | 'achievements'>, transfer?: Partial<TransferValues>, now = new Date()): Map<string, string> {
  const f = record.fields;
  const values = new Map<string, string>();
  const set = (k: string, v: string | undefined) => values.set(norm(k), v ?? '');
  for (const def of PERSON_FIELDS) set(def.label, f[def.id]);
  for (const [k, id] of Object.entries(SHORT)) set(k, f[id]);
  set('ФИО', fioText(f));
  set('Паспорт', [f['passport.series'], f['passport.number']].filter(Boolean).join(' '));
  const age = textlib.age(f['person.birthDate'], todayText(now));
  set('Возраст', age === null ? '' : String(age));
  set('Характеристика', c?.characteristic ?? '');
  set('Достижения', achievementsText(c?.achievements ?? []));
  const list = c?.achievements ?? [];
  set('Достижения в тексте', list.length ? `Имеет достижения: ${list.map((a) => a.title + (a.date ? ` (${a.date})` : '')).join('; ')}.` : '');
  for (const [k, title] of Object.entries(TRANSFER_KEYS)) set(title, transfer?.[k as keyof TransferValues]);
  // Пусто в переводе — значит, как сейчас.
  if (transfer) {
    set(TRANSFER_KEYS.toBranch, transfer.toBranch?.trim() || f['rso.branch']);
    set(TRANSFER_KEYS.toDirection, transfer.toDirection?.trim() || f['rso.direction']);
    set(TRANSFER_KEYS.toPosition, transfer.toPosition?.trim() || f['rso.position']);
  }
  set('Сегодня', todayText(now));
  set('Год', String(now.getFullYear()));
  return values;
}

export interface Resolution {
  /** Значение метки или undefined — метка неизвестна. */
  resolve: (key: string) => string | undefined;
  /** Метки, которые оказались пустыми (чтобы предупредить). */
  empty: Set<string>;
  unknown: Set<string>;
}

/**
 * Подстановка меток для человека: значения полей, перевод, склонения, слова по полу, глобальные переменные.
 * Падеж применяется к ФИО и другим именам: {Командир нового отряда:кому}.
 */
export function makeResolver(values: Map<string, string>, gender: Gender | null, vars: Variable[] = []): Resolution {
  const varMap = new Map(vars.map((v) => [norm(v.key), v.value]));
  const empty = new Set<string>();
  const unknown = new Set<string>();
  const base = (key: string): string | undefined => values.get(norm(key)) ?? varMap.get(norm(key));
  const resolve = (raw: string): string | undefined => {
    const key = raw.trim();
    let out: string | undefined;
    const colon = key.lastIndexOf(':');
    const mod = colon > 0 ? norm(key.slice(colon + 1)) : '';
    if (mod && ['кого', 'кому', 'кратко', 'подпись'].includes(mod)) {
      const name = key.slice(0, colon);
      const v = base(name);
      if (v !== undefined) {
        // Пол — бойца, если это его ФИО; для других имён — угадывается по самому имени.
        const g = norm(name) === 'фио' ? gender : null;
        out = mod === 'кого' ? declineFio(v, 'gen', g) : mod === 'кому' ? declineFio(v, 'dat', g) : mod === 'кратко' ? shortFio(v) : signFio(v);
      }
    } else if (key.includes('|')) {
      const [m, f] = key.split('|').map((s) => s.trim());
      out = gender === 'm' ? m : gender === 'f' ? f : `${m}/${f}`;
    } else {
      out = base(key);
    }
    if (out === undefined) unknown.add(key);
    else if (!out.trim()) empty.add(key);
    return out;
  };
  return { resolve, empty, unknown };
}

/** Заменить метки в тексте. Неизвестные остаются как есть. */
export function fillText(text: string, resolve: (key: string) => string | undefined): string {
  return text.replace(/\{([^{}\n]{1,80})\}/g, (m, key: string) => resolve(key) ?? m);
}
