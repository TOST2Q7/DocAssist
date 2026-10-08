import { describe, expect, it } from 'vitest';
import { matchColumns } from '@/core/schema/fields';
import { Gazetteer, type AddressDictValue } from '@/shared/address/gazetteer';
import { upgrade } from '@/core/schema/docType';
import { DEFAULT_RULES, rulesDocType } from '../model/rules';
import { sessionDocType } from '../model/session';
import { buildContext, EMPTY_USER_DICTIONARIES, type UserDictionaries } from './context';
import { applyTableLevel, checkPerson, findDuplicates } from './engine';

const HEADERS =
  'Отметка времени\tРегион\tФамилия\tИмя\tОтчество\tДолжность в СО\tРегиональное отделение\tПол\tДата рождения\tСНИЛС, ПСС\tНомер ИНН\tКонтактный телефон\tЭлектронная почта\tСерия Паспорта\tНомер Паспорта\tГород рождения\tКем выдан паспорт\tДата выдачи паспорта\tКод подразделения\tМесто регистрации по паспорту (с индексом)\tАдрес фактического проживания\tДата вступления\tДата исключения\tНомер членского билета\tНаправление ЛСО\tНазвание отряда\tОпыт работы на объектах РСО\tМесто учебы\tНаправление обучения (с кодом специальности) \tКурс \tГруппа\tФорма обучения\tСсылка на страницу в ВК'.split('\t');
const ROW =
  '01.09.2025 12:00:00\tРеспублика Хакасия\tИванов\tИван\tИванович\tКандидат\tХакасское РО\tМужской\t01.01.2000\t000-000-000 00\t123456789012\t8(900)000-00-00\tIvanov@example.com\t0000\t000000\tс. Аскиз Аскизский р-н Республика Хакасия Россия\tМВД по Республике Хакасия\t15.01.2014\t190-000\t655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1\tРесп. Хакасия, с. Аскиз, ул. Ленина, д. 1\t01.10.2025\t00.00.0000\t19-00 000\tстуденческие сервисные отряды\t"Название"\tНе имею\tГБПОУ "Колледж»\t09.02.07 Информационные системы и программирование\t2\tИС-21\tочная\thttps://vk.com/username'.split('\t');

const BIRIK = ['country:россия', 'resp:хакасия', 'rn:аскизский', 's:аскиз'];
const NOW = { y: 2026, m: 10, d: 8 };
const cols = matchColumns(HEADERS);

// «Подтверждённый» справочник: то, что пользователь один раз подтвердил по строке из ТЗ.
const confirmedAddress: AddressDictValue[] = [
  { name: 'Ленина', type: 'ul', parentPath: BIRIK },
  { op: 'postal', path: BIRIK, index: '655700' },
];
const confirmedUser: UserDictionaries = {
  ...EMPTY_USER_DICTIONARIES,
  issuedBy: [{ code: '190-000', text: 'МВД по Республике Хакасия' }],
  squads: ['«Название»'],
};
const ctxNew = buildContext(new Gazetteer(), DEFAULT_RULES, EMPTY_USER_DICTIONARIES, NOW);
const ctx = buildContext(new Gazetteer(confirmedAddress), DEFAULT_RULES, confirmedUser, NOW);

const person = (patch: Record<string, string> = {}, c = ctx) => {
  const r = [...ROW];
  for (const [id, v] of Object.entries(patch)) r[cols.indexOf(id)] = v;
  return checkPerson(0, r, cols, c);
};
const issuesOf = (res: ReturnType<typeof checkPerson>, id: string) => res.fields.find((f) => f.fieldId === id)!.issues;
const one = (id: string, v: string, c = ctx) => issuesOf(person({ [id]: v }, c), id);

describe('строка из ТЗ', () => {
  it('все столбцы распознаны', () => expect(cols.every(Boolean)).toBe(true));

  it('впервые: только то, что нужно подтвердить, и три ошибки оформления', () => {
    const r = person({}, ctxNew);
    const all = r.fields.flatMap((f) => f.issues.map((i) => `${f.fieldId}:${i.level}:${i.code}`));
    expect(all.filter((x) => x.includes(':error:'))).toEqual([
      'person.email:error:template', // заглавная буква в почте
      'rso.squad:error:template', // прямые кавычки
      'rso.squad:error:template',
      'edu.institution:error:template', // кавычки разного вида
    ]);
    expect(all.filter((x) => x.includes(':confirm:'))).toEqual([
      'passport.issuedBy:confirm:issued-by-unknown',
      'person.regAddress:confirm:street-unknown',
      'person.regAddress:confirm:index-unknown',
      'person.factAddress:confirm:street-unknown',
      'rso.squad:confirm:squad-unknown',
    ]);
  });

  it('после подтверждения и исправления — анкета готова', () => {
    const r = person({
      'person.email': 'ivanov@example.com',
      'rso.squad': '«Название»',
      'edu.institution': 'ГБПОУ «Колледж»',
    });
    expect(r.fields.flatMap((f) => f.issues.map((i) => `${f.fieldId}: ${i.message}`))).toEqual([]);
    expect(r.ready).toBe(true);
  });
});

describe('шаг влево/вправо — ошибка', () => {
  const cases: [string, string][] = [
    ['person.regAddress', '655700, Респ. Хакасия, с. Аскиз, ул. Ленина Привет, д. 1'],
    ['person.regAddress', '655700, Респ.. Хакасия, с. Аскиз, ул. Ленина, д. 1.'],
    ['person.regAddress', '655700, Респ. Хакасия,, с. Аскиз, ул. Ленина, д. 1'],
    ['person.regAddress', '655700, Респ. Хакасия, с. Аскиз Мир, ул. Ленина, д. 1'],
    ['person.regAddress', '655700, Респ. Хакасия, Аскизский р-н, с. Аскиз, ул. Ленина, д. 1'],
    ['person.factAddress', '655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1'],
    ['person.birthPlace', 'с. Аскиз Республика Хакасия Россия'],
    ['person.lastName', 'Иванов1'],
    ['passport.issuedBy', 'МВД по Республике Хакасия!!'],
    ['passport.issuedBy', 'мвд по республике хакасия'],
    ['edu.group', 'ИС-21'],
    ['edu.group', '24 - ТП - 21'],
    ['rso.squad', '«еноты»'],
    ['rso.squad', '«Название».'],
    ['edu.institution', 'ГБПОУ «Колледж»»'],
    ['edu.specialty', '09.02.07 Информационные системы и программирование.'],
    ['edu.specialty', '09.02.07 Информационные системы'],
    ['rso.branch', 'Красноярское РО'],
    ['person.email', 'danil@gmal.com'],
    ['passport.divisionCode', '199-007'],
    ['rso.cardNumber', '19-00 000 '],
    ['rso.cardNumber', '1900000'],
    ['meta.timestamp', '7.11.2025 17:50'],
    ['person.phone', '+7 983 000-00-00'],
    ['person.snils', '00000000000'],
    ['person.gender', 'мужской'],
    ['edu.form', 'Очная'],
    ['edu.course', '2 курс'],
    ['person.vk', 'vk.com/username'],
    ['person.birthDate', '8.3.2007'],
    ['rso.leaveDate', ''],
  ];
  for (const [id, v] of cases) {
    it(`${id}: «${v}»`, () => {
      const issues = one(id, v);
      expect(issues.some((i) => i.level === 'error')).toBe(true);
    });
  }

  it('опечатки в имени и отчестве — подтвердить', () => {
    expect(one('person.firstName', 'Ивн')[0].level).toBe('confirm');
    expect(one('person.middleName', 'Иваноевич')[0].level).toBe('confirm');
  });

  it('много мелких отличий в маске — одно понятное сообщение', () => {
    expect(one('person.phone', '+7 983 262 31 89').map((i) => i.message)).toEqual(['Не по шаблону 8(XXX)XXX-XX-XX: «8(900)000-00-00»']);
    expect(one('person.phone', '8(900)000-00-00 ').map((i) => i.message)).toEqual(['Лишний пробел']);
  });

  it('кавычки называются понятно', () => {
    const m = one('rso.squad', 'Название').map((i) => i.message);
    expect(m).toContain('Не хватает открывающей кавычки «');
    expect(m).toContain('Не хватает закрывающей кавычки »');
  });

  it('неизвестный почтовый домен — подтвердить', () => {
    expect(one('person.email', 'danil@mymail.org')[0].code).toBe('email-domain-unknown');
  });
});

describe('перекрёстные проверки', () => {
  it('паспорт выдан до 14 лет', () => expect(one('passport.issueDate', '01.01.2020').map((i) => i.code)).toContain('issue-before-14'));
  it('пол не совпадает с отчеством', () => expect(one('person.gender', 'Женский').map((i) => i.code)).toContain('gender-patronymic'));
  it('серия и код подразделения из разных регионов', () => {
    expect(issuesOf(person({ 'passport.divisionCode': '240-007', 'passport.issuedBy': 'ГУ МВД России по Красноярскому краю' }), 'passport.divisionCode').map((i) => i.code)).toContain('series-division-region');
  });
  it('«Кем выдан» расходится со справочником подразделений', () => {
    const i = one('passport.issuedBy', 'Отделом УФМС по Республике Хакасия');
    expect(i.map((x) => x.code)).toContain('issued-by-dictionary');
    expect(i.find((x) => x.code === 'issued-by-dictionary')!.fix).toBe('МВД по Республике Хакасия');
  });
  it('регион в «Кем выдан» не совпадает с кодом', () => {
    expect(one('passport.issuedBy', 'МВД по Республике Тыва').map((i) => i.code)).toContain('issued-by-region');
  });
  it('паспорт старше 20 лет не заменён', () => {
    expect(issuesOf(person({ 'person.birthDate': '08.03.2000', 'passport.issueDate': '26.08.2016', 'passport.series': '9516' }), 'passport.issueDate').map((i) => i.code)).toContain('passport-expired');
  });
  it('номер билета из другого региона', () => expect(one('rso.cardNumber', '24-00 000').map((i) => i.code)).toContain('card-region'));
  it('курс не бывает для уровня', () => expect(one('edu.course', '6').map((i) => i.code)).toContain('course-level'));
  it('фамилия в другой форме', () => {
    const r = person({ 'person.firstName': 'Мария', 'person.middleName': 'Петровна', 'person.gender': 'Женский' });
    expect(issuesOf(r, 'person.lastName').map((i) => i.code)).toEqual(['surname-gender']);
  });
  it('дубли между строками', () => {
    const d = findDuplicates([ROW, ROW], cols, ['А', 'Б']);
    const snilsCol = cols.indexOf('person.snils');
    expect(d.get(0)?.get(snilsCol)?.level).toBe('error');
  });
});

describe('принятие «как есть»', () => {
  it('снимает замечания, пока значение не изменилось', () => {
    const base = person({ 'person.email': 'Danil@Gmail.com' });
    const col = cols.indexOf('person.email');
    const accepted = applyTableLevel(base, undefined, [{ col, value: 'Danil@Gmail.com', at: '' }]);
    expect(accepted.counts.accepted).toBe(1);
    expect(accepted.fields[col].accepted).toBe(true);
    const changed = applyTableLevel(person({ 'person.email': 'Danil@Gmail.ru' }), undefined, [{ col, value: 'Danil@Gmail.com', at: '' }]);
    expect(changed.fields[col].accepted).toBeUndefined();
  });
});

describe('перенос данных из версии 0.1', () => {
  it('правила', () => {
    const r = upgrade(rulesDocType, { $type: 'anketa/rules', $version: 1, data: { phoneStyle: 'plus7', quoteStyle: 'keep', addressTemplates: { 'person.regAddress': 'registration' }, customTemplates: [], ageMin: 14, ageMax: 30, cardPattern: '', emptyDate: '00.00.0000', emailLowercase: true, squadQuotes: true } });
    expect(r.data.phoneMask).toBe('+7 (999) 999-99-99');
    expect(r.data.quoteStyle).toBe('guillemets');
    expect(r.data.ageMax).toBe(30);
  });
  it('сеанс: правки сохраняются, скрытые предупреждения сбрасываются', () => {
    const r = upgrade(sessionDocType, { $type: 'anketa/session', $version: 1, data: { source: { name: 'a.xlsx', size: 1, lastModified: 1, sheet: 'Л' }, edits: { 0: { 2: { orig: 'а', value: 'А' } } }, reviewed: [0], ignored: { 0: ['3:trim'] } } });
    expect(r.data.edits[0][2].value).toBe('А');
    expect(r.data.accepted).toEqual({});
    expect('ignored' in r.data).toBe(false);
  });
});
