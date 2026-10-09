import { describe, expect, it } from 'vitest';
import { BaseTree, type BaseEntry, type Step } from '@/core/base/tree';
import type { PersonRecord } from '@/core/people/people';
import { PERSON_FIELDS } from '@/core/schema/fields';
import { resolveRules } from '../model/rules';
import { applyUniqueness, checkPerson, matchWithPeople, type CheckContext } from './engine';

const HEADERS = PERSON_FIELDS.map((f) => f.label);
const COLUMNS = PERSON_FIELDS.map((f) => f.id);
const col = (id: string) => COLUMNS.indexOf(id);

/** Строка из ТЗ (35 столбцов). */
const SAMPLE = [
  '01.09.2025 12:00:00',
  'Республика Хакасия',
  'Иванов',
  'Иван',
  'Иванович',
  'Кандидат',
  'Хакасское РО',
  'Мужской',
  '01.01.2000',
  '000-000-000 00',
  '123456789012',
  '8(900)000-00-00',
  'Ivanov@example.com',
  '0000',
  '000000',
  'с. Аскиз Аскизский р-н Республика Хакасия Россия',
  'МВД по Республике Хакасия',
  '15.01.2014',
  '190-000',
  '655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1',
  'Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1',
  '01.10.2025',
  '00.00.0000',
  '19-00 000',
  'студенческие сервисные отряды',
  '"Название"',
  'Не имею',
  'ГБПОУ "Колледж»',
  '09.02.07 Информационные системы и программирование',
  '2',
  'ИС-21',
  'очная',
  'https://vk.com/username',
  '',
  '01.09.2025',
];

const entry = (path: Step[]): BaseEntry => ({ id: Math.random().toString(36), path, addedAt: '', source: 'test' });

function ctx(trees: Record<string, Step[][]> = {}, people: PersonRecord[] = []): CheckContext {
  return {
    rules: resolveRules(undefined),
    trees: new Map(Object.entries(trees).map(([name, paths]) => [name, new BaseTree(paths.map(entry))])),
    people,
  };
}

describe('анкета: пустая база', () => {
  const r = checkPerson(0, SAMPLE, COLUMNS, ctx());
  const f = (id: string) => r.fields[col(id)];

  it('35 столбцов по названиям формы', () => {
    expect(HEADERS).toHaveLength(35);
    expect(HEADERS[0]).toBe('Отметка времени');
    expect(HEADERS[34]).toBe('Отметка проверки перс. данных кандидата командным составом отряда.');
  });

  it('формат: почта, кавычки, «00.00.0000» — ошибки с исправлением', () => {
    expect(f('person.email')).toMatchObject({ status: 'error', fix: 'ivanov@example.com' });
    expect(f('rso.squad')).toMatchObject({ status: 'error', fix: '«Название»' });
    expect(f('edu.institution')).toMatchObject({ status: 'error', fix: 'ГБПОУ «Колледж»' });
    expect(f('rso.leaveDate').status).toBe('error');
  });

  it('индивидуальные поля — всегда предупреждение и галочка', () => {
    for (const id of ['person.lastName', 'person.firstName', 'person.birthDate', 'person.snils', 'person.inn', 'person.phone', 'passport.series', 'passport.number', 'passport.issueDate', 'edu.course', 'edu.group', 'person.vk']) {
      expect(f(id), id).toMatchObject({ status: 'warn', confirm: { person: true }, confirmed: false });
    }
  });

  it('списки и древо: всё новое — предупреждение с добавлением в базу', () => {
    expect(f('rso.position')).toMatchObject({ status: 'warn', confirm: { base: { tree: 'Должность в СО', path: [{ k: 'rso.position', v: 'Кандидат' }] } } });
    expect(f('passport.issuedBy').confirm?.base?.path).toEqual([
      { k: 'passport.divisionCode', v: '190-000' },
      { k: 'passport.issuedBy', v: 'МВД по Республике Хакасия' },
    ]);
    expect(f('passport.issuedBy').confirm?.base?.tree).toBe('Код подразделения');
    const reg = f('person.regAddress');
    expect(reg.status).toBe('warn');
    expect(reg.confirm?.base?.path.map((s) => s.v)).toEqual(['Хакасия', '655700', 'Аскиз', 'Ленина', '1']);
    expect(f('person.birthPlace').confirm?.base?.path.map((s) => s.v)).toEqual(['Россия', 'Хакасия', 'Аскизский', 'Аскиз']);
  });

  it('пустое необязательное поле — без замечаний', () => {
    expect(f('rso.wasMember').status).toBe('ok');
  });
});

describe('анкета: заполненная база и подтверждения', () => {
  const base = ctx({
    Адреса: [[{ k: 'region', v: 'Хакасия', t: 'Респ.' }, { k: 'index', v: '655700' }, { k: 'locality', v: 'Аскиз', t: 'с.' }, { k: 'street', v: 'Ленина', t: 'ул.' }, { k: 'house', v: '1', t: 'д.' }]],
    'Должность в СО': [[{ k: 'rso.position', v: 'Кандидат' }]],
  });

  it('адрес есть в базе — верно (и регистрация, и проживание без индекса)', () => {
    const r = checkPerson(0, SAMPLE, COLUMNS, base);
    expect(r.fields[col('person.regAddress')].status).toBe('ok');
    expect(r.fields[col('person.factAddress')].status).toBe('ok');
    expect(r.fields[col('rso.position')].status).toBe('ok');
  });

  it('тот же индекс с другим регионом — ошибка', () => {
    const v = [...SAMPLE];
    v[col('person.regAddress')] = '655700, Респ. Тыва, с. Аскиз, ул. Ленина, д. 1';
    const f = checkPerson(0, v, COLUMNS, base).fields[col('person.regAddress')];
    expect(f.status).toBe('error');
    expect(f.issues.some((i) => i.confirmable && i.text.includes('655700'))).toBe(true);
  });

  it('галочка снимает предупреждение только для того же значения', () => {
    const c = col('person.snils');
    expect(checkPerson(0, SAMPLE, COLUMNS, base, { [c]: SAMPLE[c] }).fields[c]).toMatchObject({ status: 'ok', confirmed: true });
    expect(checkPerson(0, SAMPLE, COLUMNS, base, { [c]: '000-000-000 00' }).fields[c].status).toBe('warn');
  });
});

describe('уникальность и база людей', () => {
  const c = ctx();
  const other = [...SAMPLE];
  other[col('person.lastName')] = 'Иванов';

  it('повтор в таблице — ошибка у обоих', () => {
    const rows = [SAMPLE, other];
    const results = rows.map((v, i) => checkPerson(i, v, COLUMNS, c));
    const out = applyUniqueness(results, rows, COLUMNS, ['Иванов Иван', 'Иванов Иван'], c);
    expect(out[0].fields[col('person.snils')].status).toBe('error');
    expect(out[1].fields[col('person.snils')].issues.map((i) => i.text).join()).toMatch(/Повторяется: строка 1/);
    // ФИО разные — не повтор.
    expect(out[0].fields[col('person.lastName')].status).toBe('warn');
  });

  it('значение есть в базе людей у другого человека — ошибка; у того же — нет', () => {
    const rec = (last: string): PersonRecord => ({ id: last, source: 't', savedAt: '', fields: { 'person.lastName': last, 'person.firstName': 'Иван', 'person.middleName': 'Иванович', 'person.inn': SAMPLE[col('person.inn')] } });
    const withOther = ctx({}, [rec('Петров')]);
    const out = applyUniqueness([checkPerson(0, SAMPLE, COLUMNS, withOther)], [SAMPLE], COLUMNS, [''], withOther);
    expect(out[0].fields[col('person.inn')].issues.map((i) => i.text).join()).toMatch(/Петров Иван Иванович/);
    const withSame = ctx({}, [rec('Иванов')]);
    const out2 = applyUniqueness([checkPerson(0, SAMPLE, COLUMNS, withSame)], [SAMPLE], COLUMNS, [''], withSame);
    expect(out2[0].fields[col('person.inn')].status).toBe('warn');
  });

  it('«Проверить с актуальной информацией»: совпало / не совпало / нет такого', () => {
    const rec: PersonRecord = {
      id: '1',
      source: 't',
      savedAt: '',
      fields: { 'person.lastName': 'иванов', 'person.firstName': 'Иван', 'person.middleName': 'Иванович', 'person.inn': '123456789012', 'person.phone': '8(900)000-00-00' },
    };
    const m = matchWithPeople(SAMPLE, COLUMNS, [rec])!;
    expect(m.matched).toContain(col('person.inn'));
    expect(m.differ).toEqual([
      { col: col('person.lastName'), base: 'иванов' },
      { col: col('person.phone'), base: '8(900)000-00-00' },
    ]);
    expect(matchWithPeople(other, COLUMNS, [rec])).toBeNull();
  });
});
