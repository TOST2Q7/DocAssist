import { fixSpaces, parseDate, textlib } from '@/core/lua/textlib';
import { fioText, type PersonRecord } from '@/core/people/people';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { fixQuotes } from '@/shared/cell/format';

/*
 * Подсказки при ручном вводе: тот же формат, что ждёт «Проверка анкет» по умолчанию
 * (телефон 8(000)000-00-00, СНИЛС 000-000-000 00, даты ДД.ММ.ГГГГ…). Сохранять они не мешают —
 * личное дело можно заполнять постепенно, — но показывают, что поправить, и предлагают исправление.
 */

export interface FieldNote {
  level: 'error' | 'warn';
  text: string;
  /** Исправленное значение (если его можно предложить). */
  fix?: string;
}

const NAME_FIELDS = new Set(['person.lastName', 'person.firstName', 'person.middleName']);
const DATE_FIELDS = new Set(['person.birthDate', 'passport.issueDate', 'rso.joinDate', 'rso.leaveDate', 'rso.checkMark']);

/** Поля с выбором из списка. */
export const FIELD_OPTIONS: Record<string, string[]> = {
  'person.gender': ['Мужской', 'Женский'],
  'edu.form': ['очная', 'заочная', 'очно-заочная'],
  'rso.wasMember': ['Да', 'Нет'],
};

/** Шаблоны по цифрам («9» — цифра). */
export const FIELD_MASKS: Record<string, string> = {
  'person.snils': '999-999-999 99',
  'person.inn': '999999999999',
  'person.phone': '8(999)999-99-99',
  'passport.series': '9999',
  'passport.number': '999999',
  'passport.divisionCode': '999-999',
  'rso.cardNumber': '99-99 999',
};

const example = (mask: string) => mask.replace(/9/g, '0');
const capitalize = (v: string) => v.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());

/** Замечания к одному полю. */
export function checkField(id: string, raw: string, all: Record<string, string> = {}): FieldNote[] {
  const v = raw;
  if (!v.trim()) return [];
  const notes: FieldNote[] = [];
  const spaced = fixSpaces(v);
  if (spaced !== v) notes.push({ level: 'warn', text: 'Лишние пробелы', fix: spaced });
  if (textlib.odd_letters(v) || textlib.mixed_words(v).length) notes.push({ level: 'error', text: 'Буквы из разных алфавитов или «й» из двух символов', fix: textlib.fix_letters(v).normalize('NFC') });

  if (NAME_FIELDS.has(id) && !textlib.is_name(spaced)) {
    const fix = capitalize(spaced);
    notes.push({ level: 'warn', text: 'Русскими буквами, с заглавной', ...(textlib.is_name(fix) ? { fix } : {}) });
  }

  if (DATE_FIELDS.has(id)) {
    const d = parseDate(spaced);
    if (!d) {
      const fix = textlib.fix_date(spaced);
      notes.push({ level: 'error', text: 'Дата: ДД.ММ.ГГГГ', ...(fix ? { fix } : {}) });
    } else if (id === 'person.birthDate') {
      const age = textlib.age(spaced);
      if (age !== null && (age < 14 || age > 45)) notes.push({ level: 'warn', text: `Проверьте дату: возраст ${age}` });
    } else if (id === 'passport.issueDate' && textlib.before(spaced, all['person.birthDate'])) {
      notes.push({ level: 'error', text: 'Паспорт выдан раньше даты рождения' });
    } else if (id === 'rso.leaveDate' && textlib.before(spaced, all['rso.joinDate'])) {
      notes.push({ level: 'error', text: 'Исключение раньше вступления' });
    }
  }

  const mask = FIELD_MASKS[id];
  if (mask && !textlib.mask(spaced, mask)) {
    const fix = textlib.fix_mask(spaced, mask);
    notes.push({ level: 'warn', text: `По шаблону ${example(mask)}`, ...(fix ? { fix } : {}) });
  } else if (id === 'person.snils' && !textlib.snils_ok(spaced)) {
    notes.push({ level: 'error', text: 'СНИЛС с ошибкой: не сходится контрольное число' });
  } else if (id === 'person.inn' && !textlib.inn_ok(spaced)) {
    notes.push({ level: 'error', text: 'ИНН с ошибкой: не сходятся контрольные цифры' });
  }

  if (id === 'person.email') {
    if (!textlib.is_email_any(spaced)) notes.push({ level: 'error', text: 'Почта: имя@домен.ru' });
    else if (spaced !== spaced.toLowerCase()) notes.push({ level: 'warn', text: 'Почту лучше строчными буквами', fix: spaced.toLowerCase() });
  }
  if (id === 'person.vk' && !textlib.is_vk(spaced)) {
    const fix = textlib.fix_vk(spaced);
    notes.push({ level: 'warn', text: 'Ссылка: https://vk.com/…', ...(fix ? { fix } : {}) });
  }
  if (id === 'edu.course') {
    const n = textlib.number(spaced);
    if (n === null || !Number.isInteger(n) || n < 1 || n > 6) notes.push({ level: 'warn', text: 'Курс — число от 1 до 6' });
  }
  if (id === 'rso.squad' && !textlib.in_guillemets(spaced)) {
    const quoted = fixQuotes(spaced);
    const fix = textlib.in_guillemets(quoted) ? quoted : /^[^«»"“”„]+$/.test(spaced) ? `«${spaced}»` : undefined;
    notes.push({ level: 'warn', text: 'Название в кавычках-ёлочках: «Название»', ...(fix ? { fix } : {}) });
  }
  const options = FIELD_OPTIONS[id];
  if (options && !options.includes(spaced)) notes.push({ level: 'warn', text: `Одно из: ${options.join(', ')}` });
  return notes;
}

/** Поля, повтор которых у другого человека — ошибка. */
export const UNIQUE_FIELDS = ['person.snils', 'person.inn', 'person.phone', 'person.email', 'passport.number'];

/** Значения, которые уже есть у других людей базы: поле → ФИО того, у кого есть. */
export function findDuplicates(fields: Record<string, string>, records: PersonRecord[], selfId?: string): Record<string, string> {
  const out: Record<string, string> = {};
  const key = (id: string, f: Record<string, string>) => {
    const v = (f[id] ?? '').replace(/\s+/g, '').toLowerCase();
    if (!v) return '';
    return id === 'passport.number' ? `${(f['passport.series'] ?? '').replace(/\s+/g, '')} ${v}` : v;
  };
  for (const id of UNIQUE_FIELDS) {
    const mine = key(id, fields);
    if (!mine) continue;
    const other = records.find((r) => r.id !== selfId && key(id, r.fields) === mine);
    if (other) out[id] = fioText(other.fields) || '(без ФИО)';
  }
  return out;
}

/** Сколько замечаний в анкете (для счётчика). */
export function countNotes(fields: Record<string, string>): { error: number; warn: number } {
  let error = 0;
  let warn = 0;
  for (const [id, v] of Object.entries(fields)) {
    if (!FIELD_BY_ID.has(id)) continue;
    for (const n of checkField(id, v, fields)) {
      if (n.level === 'error') error++;
      else warn++;
    }
  }
  return { error, warn };
}

/** Разобрать «Фамилия Имя Отчество» из одной строки. */
export function splitFio(text: string): Record<string, string> {
  const [last = '', first = '', ...rest] = fixSpaces(text).split(' ');
  return { 'person.lastName': last, 'person.firstName': first, 'person.middleName': rest.join(' ') };
}
