import { describe, expect, it } from 'vitest';
import { BaseTree, type BaseEntry, type Step } from '@/core/base/tree';
import type { PersonRecord } from '@/core/people/people';
import { PERSON_FIELDS } from '@/core/schema/fields';
import { AnketaChecker } from '../lua/checker';
import { DEFAULT_EXAMPLES, resolveChecks, type AnketaChecks } from '../model/checks';
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
  '000000000000',
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

const DEFAULT_CHECKER = new AnketaChecker(resolveChecks(undefined));

function ctx(trees: Record<string, Step[][]> = {}, people: PersonRecord[] = [], checks?: AnketaChecks): CheckContext {
  return {
    checker: checks ? new AnketaChecker(resolveChecks(checks)) : DEFAULT_CHECKER,
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

  it('формат: кавычки, «00.00.0000» — ошибки с исправлением; почта с заглавной — только совет', () => {
    expect(f('person.email')).toMatchObject({ status: 'warn', fix: 'ivanov@example.com' });
    expect(f('person.email').issues.find((i) => i.level === 'info')?.text).toMatch(/строчными/);
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
    expect(checkPerson(0, SAMPLE, COLUMNS, base, { [c]: '111-111-111 11' }).fields[c].status).toBe('warn');
  });
});

describe('уникальность и база людей', () => {
  const c = ctx();
  const other = [...SAMPLE];
  other[col('person.lastName')] = 'Петров';

  it('повтор в таблице — ошибка у обоих', () => {
    const rows = [SAMPLE, other];
    const results = rows.map((v, i) => checkPerson(i, v, COLUMNS, c));
    const out = applyUniqueness(results, rows, COLUMNS, ['Иванов Иван', 'Петров Иван'], c);
    expect(out[0].fields[col('person.snils')].status).toBe('error');
    expect(out[1].fields[col('person.snils')].issues.map((i) => i.text).join()).toMatch(/Повторяется: строка 1/);
    // ФИО разные — не повтор.
    expect(out[0].fields[col('person.lastName')].status).toBe('warn');
  });

  it('значение есть в базе людей у другого человека — ошибка; у того же — нет', () => {
    const rec = (last: string): PersonRecord => ({ id: last, source: 't', savedAt: '', fields: { 'person.lastName': last, 'person.firstName': 'Иван', 'person.middleName': 'Иванович', 'person.inn': SAMPLE[col('person.inn')] } });
    const withOther = ctx({}, [rec('Сидоров')]);
    const out = applyUniqueness([checkPerson(0, SAMPLE, COLUMNS, withOther)], [SAMPLE], COLUMNS, [''], withOther);
    expect(out[0].fields[col('person.inn')].issues.map((i) => i.text).join()).toMatch(/Сидоров Иван Иванович/);
    const withSame = ctx({}, [rec('Иванов')]);
    const out2 = applyUniqueness([checkPerson(0, SAMPLE, COLUMNS, withSame)], [SAMPLE], COLUMNS, [''], withSame);
    expect(out2[0].fields[col('person.inn')].status).toBe('warn');
  });

  it('«Проверить с актуальной информацией»: совпало / не совпало / нет такого', () => {
    const rec: PersonRecord = {
      id: '1',
      source: 't',
      savedAt: '',
      fields: { 'person.lastName': 'иванов', 'person.firstName': 'Иван', 'person.middleName': 'Иванович', 'person.inn': '000000000000', 'person.phone': '8(900)111-11-11' },
    };
    const m = matchWithPeople(SAMPLE, COLUMNS, [rec])!;
    expect(m.matched).toContain(col('person.inn'));
    expect(m.differ).toEqual([
      { col: col('person.lastName'), base: 'иванов' },
      { col: col('person.phone'), base: '8(900)111-11-11' },
    ]);
    expect(matchWithPeople(other, COLUMNS, [rec])).toBeNull();
  });
});

describe('примеры по умолчанию', () => {
  it('есть у каждого столбца и проходят его проверку без ошибок', () => {
    const checks = resolveChecks(undefined);
    for (const f of PERSON_FIELDS) {
      expect(checks.fields[f.id].example, f.label).toBe(DEFAULT_EXAMPLES[f.id]);
      const { result } = DEFAULT_CHECKER.test(f.id, DEFAULT_EXAMPLES[f.id], { trees: new Map() });
      expect(result.issues.filter((i) => i.level === 'error'), f.label).toEqual([]);
    }
  });
  it('показываются при ошибке', () => {
    const v = [...SAMPLE];
    v[col('person.phone')] = '123';
    const f = checkPerson(0, v, COLUMNS, ctx()).fields[col('person.phone')];
    expect(f).toMatchObject({ status: 'error', example: '8(000)000-00-00' });
  });
});

describe('проверки на Lua: связи ячеек, регулировки, буквы', () => {
  it('дата исключения раньше даты вступления — ошибка (сравнение с другой ячейкой)', () => {
    const v = [...SAMPLE];
    v[col('rso.joinDate')] = '01.10.2025';
    v[col('rso.leaveDate')] = '01.09.2025';
    const f = checkPerson(0, v, COLUMNS, ctx()).fields[col('rso.leaveDate')];
    expect(f.status).toBe('error');
    expect(f.issues[0].text).toMatch(/раньше даты вступления \(01\.10\.2025\)/);
  });

  it('регулировка «Курс до» из настроек: 10 подходит при «до 11»', () => {
    const v = [...SAMPLE];
    v[col('edu.course')] = '10';
    expect(checkPerson(0, v, COLUMNS, ctx()).fields[col('edu.course')].status).toBe('error');
    const custom = ctx({}, [], { fields: { 'edu.course': { settings: { 'Курс до': 11 } } } });
    expect(checkPerson(0, v, COLUMNS, custom).fields[col('edu.course')].status).toBe('warn');
  });

  it('«й» из двух символов и латиница в русском слове — ошибка с исправлением', () => {
    const v = [...SAMPLE];
    v[col('person.firstName')] = 'Андреи\u0306';
    v[col('person.lastName')] = 'Ивaнов';
    const r = checkPerson(0, v, COLUMNS, ctx());
    expect(r.fields[col('person.firstName')]).toMatchObject({ status: 'error', fix: 'Андрей' });
    expect(r.fields[col('person.lastName')]).toMatchObject({ status: 'error', fix: 'Иванов' });
    expect(r.fields[col('person.lastName')].issues[0].text).toMatch(/Смешаны русские и латинские буквы: Ивaнов/);
  });

  it('только пробелы — одна ошибка, код столбца не запускается', () => {
    const v = [...SAMPLE];
    v[col('person.phone')] = '   ';
    const f = checkPerson(0, v, COLUMNS, ctx()).fields[col('person.phone')];
    expect(f.issues.map((i) => i.text)).toEqual(['Только пробелы — ячейка выглядит пустой']);
    expect(f.fix).toBe('');
  });

  it('cell(): значение, галочка и запомненное другой ячейкой', () => {
    const checks: AnketaChecks = {
      fields: {
        'edu.group': { script: 'remember("курс в группе", lib.sub(value, 4, 4))' },
        'edu.course': {
          script: `local g = cell("Группа")
if not g.confirmed then warning("Сначала проверьте группу «" .. g.value .. "»") end
if g.vars["курс в группе"] ~= value then problem("Курс не совпадает с группой") end`,
        },
      },
    };
    const v = [...SAMPLE];
    v[col('edu.group')] = 'ИС-21';
    v[col('edu.course')] = '2';
    const c = ctx({}, [], checks);
    const before = checkPerson(0, v, COLUMNS, c).fields[col('edu.course')];
    expect(before.issues.map((i) => i.text)).toEqual(['Сначала проверьте группу «ИС-21»']);
    const after = checkPerson(0, v, COLUMNS, c, { [col('edu.group')]: 'ИС-21' }).fields[col('edu.course')];
    expect(after.status).toBe('ok');
    v[col('edu.course')] = '3';
    expect(checkPerson(0, v, COLUMNS, c).fields[col('edu.course')].issues.map((i) => i.text)).toContain('Курс не совпадает с группой');
  });

  it('ошибка в коде — понятное сообщение у ячейки, остальные проверяются', () => {
    const c = ctx({}, [], { fields: { 'edu.group': { script: 'if value == "x" problem("a") end' } } });
    const r = checkPerson(0, SAMPLE, COLUMNS, c);
    const f = r.fields[col('edu.group')];
    expect(f.status).toBe('error');
    expect(f.issues[0]).toMatchObject({ script: true });
    expect(f.issues[0].text).toMatch(/Ошибка в коде проверки «Группа», строка 1: после условия «if … » нужно «then»/);
    expect(r.fields[col('person.phone')].status).toBe('warn');
  });

  it('регулировки и базы находятся пробным запуском', () => {
    const course = DEFAULT_CHECKER.discover('edu.course');
    expect(course.controls.map((x) => [x.kind, x.label, x.value])).toEqual([
      ['toggle', 'Обязательное — пустое будет ошибкой', true],
      ['number', 'Курс от', 1],
      ['number', 'Курс до', 6],
      ['toggle', 'Галочка у каждого человека', true],
    ]);
    expect(DEFAULT_CHECKER.discover('passport.issuedBy').bases).toEqual([
      { tree: 'Код подразделения', key: 'passport.issuedBy', title: 'Кем выдан паспорт', inside: { key: 'passport.divisionCode', title: 'Код подразделения' } },
    ]);
    expect(DEFAULT_CHECKER.discover('person.regAddress').parts).toBe(true);
    expect(DEFAULT_CHECKER.treeNames().sort()).toContain('Адреса');
  });

  it('скорость: 300 анкет', () => {
    const t0 = performance.now();
    const c = ctx();
    for (let i = 0; i < 300; i++) checkPerson(i, SAMPLE, COLUMNS, c);
    const ms = performance.now() - t0;
    console.log(`300 анкет: ${Math.round(ms)} мс`);
    expect(ms).toBeLessThan(20000);
  });
});

describe('игнорирование замечаний', () => {
  it('замечание, анкета, таблица; исправление у проигнорированного не предлагается', async () => {
    const { applyIgnores } = await import('../model/session');
    const v = [...SAMPLE];
    v[col('edu.group')] = 'ИС 21';
    const res = [checkPerson(0, v, COLUMNS, ctx())];
    const g = col('edu.group');
    expect(res[0].fields[g]).toMatchObject({ status: 'error', fix: 'ИС21' });
    const text = res[0].fields[g].issues[0].text;
    const one = applyIgnores(res, { ignored: { 0: { [g]: { value: 'ИС 21', texts: [text] } } } });
    expect(one[0].fields[g].status).toBe('ok');
    expect(one[0].fields[g].fix).toBeUndefined();
    expect(one[0].counts.ignored).toBe(1);
    // Значение изменилось — игнор не действует.
    expect(applyIgnores(res, { ignored: { 0: { [g]: { value: 'другое', texts: [text] } } } })[0].fields[g].status).toBe('error');
    const row = applyIgnores(res, { ignoredRows: [0] });
    expect(row[0].ready).toBe(true);
    expect(applyIgnores(res, { ignoreAll: true })[0].ready).toBe(true);
  });
});
