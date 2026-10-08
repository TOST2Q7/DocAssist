import { describe, expect, it } from 'vitest';
import { matchColumns } from '@/core/schema/fields';
import { Gazetteer } from '@/shared/address/gazetteer';
import { DEFAULT_RULES } from '../model/rules';
import { checkDate } from './dates';
import { checkInn, checkPassportNumber, checkSnils, snilsChecksum } from './documents';
import { checkEmail, checkPhone, checkVk } from './contacts';
import { genderFromPatronymic, mentionedRegions } from './cross';
import { checkPerson, findDuplicates, type CheckContext } from './index';
import { checkEnum, checkName, checkQuoted, checkRegionField, checkSpecialty } from './text';

const HEADERS =
  'Отметка времени\tРегион\tФамилия\tИмя\tОтчество\tДолжность в СО\tРегиональное отделение\tПол\tДата рождения\tСНИЛС, ПСС\tНомер ИНН\tКонтактный телефон\tЭлектронная почта\tСерия Паспорта\tНомер Паспорта\tГород рождения\tКем выдан паспорт\tДата выдачи паспорта\tКод подразделения\tМесто регистрации по паспорту (с индексом)\tАдрес фактического проживания\tДата вступления\tДата исключения\tНомер членского билета\tНаправление ЛСО\tНазвание отряда\tОпыт работы на объектах РСО\tМесто учебы\tНаправление обучения (с кодом специальности) \tКурс \tГруппа\tФорма обучения\tСсылка на страницу в ВК'.split('\t');
const ROW =
  '01.09.2025 12:00:00\tРеспублика Хакасия\tИванов\tИван\tИванович\tКандидат\tХакасское РО\tМужской\t01.01.2000\t000-000-000 00\t123456789012\t8(900)000-00-00\tIvanov@example.com\t0000\t000000\tс. Аскиз Аскизский р-н Республика Хакасия Россия\tМВД по Республике Хакасия\t15.01.2014\t190-000\t655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1\tРесп. Хакасия, с. Аскиз, ул. Ленина, д. 1\t01.10.2025\t00.00.0000\t19-00 000\tстуденческие сервисные отряды\t"Название"\tНе имею\tГБПОУ "Колледж»\t09.02.07 Информационные системы и программирование\t2\tИС-21\tочная\thttps://vk.com/username\t\t01.09.2025'.split('\t');

const ctx: CheckContext = { gaz: new Gazetteer(), rules: DEFAULT_RULES, enums: {}, now: { y: 2026, m: 10, d: 8 } };

describe('сопоставление столбцов', () => {
  it('все столбцы формы распознаны', () => {
    const cols = matchColumns(HEADERS);
    expect(cols.every(Boolean)).toBe(true);
    expect(new Set(cols).size).toBe(cols.length);
  });
});

describe('строка из ТЗ', () => {
  const cols = [...matchColumns(HEADERS), null, null];
  const result = checkPerson(0, ROW, cols, ctx);
  const issuesOf = (id: string) => result.fields.find((f) => f.fieldId === id)?.issues.map((i) => i.code) ?? [];

  it('нет ошибок — только мелкие замечания по оформлению', () => {
    const errors = result.fields.flatMap((f) => f.issues.filter((i) => i.severity === 'error').map((i) => `${f.fieldId}: ${i.message}`));
    expect(errors).toEqual([]);
  });

  it('находит разные кавычки в месте учёбы', () => {
    expect(issuesOf('edu.institution')).toContain('quotes-mixed');
    const f = result.fields.find((x) => x.fieldId === 'edu.institution')!;
    expect(f.suggestion).toBe('ГБПОУ «Колледж»');
  });

  it('адреса и место рождения соответствуют шаблонам', () => {
    expect(issuesOf('person.regAddress')).toEqual([]);
    expect(issuesOf('person.factAddress')).toEqual([]);
    expect(issuesOf('person.birthPlace')).toEqual([]);
  });

  it('возраст и регион в подсказках', () => {
    expect(result.fields.find((f) => f.fieldId === 'person.birthDate')?.meta).toBe('19 лет');
    expect(result.fields.find((f) => f.fieldId === 'passport.divisionCode')?.meta).toBe('Респ. Хакасия');
  });
});

describe('отдельные проверки', () => {
  it('СНИЛС: контрольная сумма', () => {
    expect(snilsChecksum('112233445')).toBe('95');
    expect(checkSnils('000-000-000 00').issues).toEqual([]);
    expect(checkSnils('1-233-445 94').issues[0].code).toBe('snils-checksum');
    expect(checkSnils('00000000000').suggestion).toBe('000-000-000 00');
  });

  it('ИНН: контрольные цифры', () => {
    expect(checkInn('123456789012').issues).toEqual([]);
    expect(checkInn('123456789013').issues[0].code).toBe('inn-checksum');
    expect(checkInn('1234567890').issues[0].code).toBe('inn-org');
  });

  it('номер паспорта: потерянный ноль', () => {
    expect(checkPassportNumber('39691').suggestion).toBe('000000');
  });

  it('телефон приводится к шаблону', () => {
    expect(checkPhone('+7 983 262 31 89', 'eight-compact').suggestion).toBe('8(900)000-00-00');
    expect(checkPhone('9000000000', 'plus7').suggestion).toBe('+7 (983) 000-00-00');
    expect(checkPhone('000-00-00', 'plus7').issues[0].code).toBe('phone-length');
  });

  it('почта: опечатки домена и русские буквы', () => {
    expect(checkEmail('ivanov@gmial.com', true).suggestion).toBe('ivanov@gmail.com');
    expect(checkEmail('ivanоv@mail.ru', true).issues[0].code).toBe('email-cyrillic');
    expect(checkEmail('ivanоv@mail.ru', true).suggestion).toBe('ivanov@mail.ru');
  });

  it('ВК: короткая форма → полная ссылка', () => {
    expect(checkVk('vk.com/username').suggestion).toBe('https://vk.com/username');
    expect(checkVk('@username').suggestion).toBe('https://vk.com/username');
  });

  it('даты: разные форматы и несуществующие даты', () => {
    const now = { y: 2026, m: 10, d: 8 };
    expect(checkDate('8.3.2007', { required: true, now }).suggestion).toBe('01.01.2000');
    expect(checkDate('2007-03-08', { required: true, now }).suggestion).toBe('01.01.2000');
    expect(checkDate('31.02.2007', { required: true, now }).issues[0].code).toBe('date-invalid');
    expect(checkDate('08.03.2030', { required: true, now }).issues[0].code).toBe('date-future');
  });

  it('ФИО: регистр и латиница', () => {
    expect(checkName('иванов', true, 'Фамилия').suggestion).toBe('Иванов');
    expect(checkName('Иванoв', true, 'Фамилия').suggestion).toBe('Иванов');
    expect(checkName('иванова - петрова', true, 'Фамилия').suggestion).toBe('Иванова-Петрова');
  });

  it('пол по отчеству', () => {
    expect(genderFromPatronymic('Иванович')).toBe('Мужской');
    expect(genderFromPatronymic('Евгеньевна')).toBe('Женский');
  });

  it('списки: регистр, сокращения, опечатки, неизвестные значения', () => {
    expect(checkEnum('мужской', 'person.gender', [], [], 'Пол').suggestion).toBe('Мужской');
    expect(checkEnum('м', 'person.gender', [], [], 'Пол').suggestion).toBe('Мужской');
    expect(checkEnum('Кандидад', 'rso.position', [], [], 'Должность').suggestion).toBe('Кандидат');
    const unknown = checkEnum('Завхоз', 'rso.position', [], [], 'Должность');
    expect(unknown.issues[0].action).toEqual({ kind: 'add-enum', dict: 'rso.position', value: 'Завхоз' });
    expect(checkEnum('Завхоз', 'rso.position', ['Завхоз'], [], 'Должность').issues).toEqual([]);
  });

  it('кавычки в названии отряда', () => {
    expect(checkQuoted('"Название"', 'guillemets', { requireQuotes: true, label: 'Отряд' }).suggestion).toBe('«Название»');
    expect(checkQuoted('Название', 'guillemets', { requireQuotes: true, label: 'Отряд' }).suggestion).toBe('«Название»');
  });

  it('специальность: слипшийся код', () => {
    const r = checkSpecialty('09.02.07Информационные системы');
    expect(r.issues[0].category).toBe('glued');
    expect(r.suggestion).toBe('09.02.07 Информационные системы');
  });

  it('регион: разные написания', () => {
    expect(checkRegionField('Хакасия', ctx.gaz).suggestion).toBe('Республика Хакасия');
    expect(checkRegionField('Респ. Хакасия', ctx.gaz).suggestion).toBe('Республика Хакасия');
    expect(checkRegionField('Красноярский край', ctx.gaz).issues).toEqual([]);
  });

  it('упоминание региона в тексте', () => {
    expect(mentionedRegions('МВД по Республике Хакасия').map((r) => r.name)).toEqual(['Хакасия']);
    expect(mentionedRegions('Хакасское РО').map((r) => r.name)).toEqual(['Хакасия']);
  });
});

describe('перекрёстные проверки', () => {
  const cols = matchColumns(HEADERS);
  const row = (patch: Record<string, string>) => {
    const r = [...ROW.slice(0, HEADERS.length)];
    for (const [id, v] of Object.entries(patch)) r[cols.indexOf(id)] = v;
    return checkPerson(0, r, cols, ctx);
  };
  const codes = (res: ReturnType<typeof checkPerson>, id: string) => res.fields.find((f) => f.fieldId === id)!.issues.map((i) => i.code);

  it('паспорт выдан до 14 лет', () => {
    expect(codes(row({ 'passport.issueDate': '01.01.2020' }), 'passport.issueDate')).toContain('issue-before-14');
  });

  it('пол не совпадает с отчеством', () => {
    expect(codes(row({ 'person.gender': 'Женский' }), 'person.gender')).toContain('gender-mismatch');
  });

  it('серия и код подразделения из разных регионов', () => {
    expect(codes(row({ 'passport.divisionCode': '240-007' }), 'passport.divisionCode')).toContain('series-division-region');
  });

  it('паспорт старше 20 лет не заменён', () => {
    expect(codes(row({ 'person.birthDate': '08.03.2000', 'passport.issueDate': '26.08.2016', 'passport.series': '9516' }), 'passport.issueDate')).toContain('passport-expired-20');
  });

  it('номер билета из другого региона', () => {
    expect(codes(row({ 'rso.cardNumber': '24-00 000' }), 'rso.cardNumber')).toContain('card-region');
  });

  it('дубли между строками', () => {
    const d = findDuplicates([ROW, ROW], cols, ['Иванов', 'Иванов 2']);
    expect(d.get(0)?.size).toBeGreaterThan(0);
  });
});
