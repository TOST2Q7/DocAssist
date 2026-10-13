import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { MemoryAdapter } from '@/core/storage/memoryAdapter';
import { PERSON_FIELDS } from '@/core/schema/fields';
import { readZip, writeZip } from '@/core/util/zip';
import { Workspace } from '@/core/workspace/workspace';
import { folderNameFor, moveFolder, newCase, safeName, uniqueName, type PersonCase } from './cases';
import { FIELD_GROUPS } from './groups';
import { declineFio, guessGender, shortFio, signFio } from './names';
import { fillText, makeResolver, placeholderValues } from './placeholders';
import { DEFAULT_TEMPLATES, isModified, mergeTemplates, templateBlocks } from './templates';
import { applyTransfer, buildTransferPackage, DEFAULT_OPTIONS, emptyTransferForm, fileName, TABLE_HEADERS, type PackageOptions } from './transfer';
import { checkField, findDuplicates, splitFio } from './validate';

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const NOW = new Date(2026, 8, 1);

const IVANOV: Record<string, string> = {
  'person.lastName': 'Иванов',
  'person.firstName': 'Иван',
  'person.middleName': 'Иванович',
  'person.gender': 'Мужской',
  'person.birthDate': '01.01.2005',
  'person.phone': '8(000)000-00-00',
  'rso.squad': '«Прежний»',
  'rso.branch': 'РО Примерное',
  'rso.joinDate': '01.10.2024',
};

describe('ФИО для документов', () => {
  it.each([
    ['Иванов Иван Иванович', 'gen', 'Иванова Ивана Ивановича'],
    ['Иванов Иван Иванович', 'dat', 'Иванову Ивану Ивановичу'],
    ['Петрова Анна Сергеевна', 'gen', 'Петровой Анны Сергеевны'],
    ['Петрова Анна Сергеевна', 'dat', 'Петровой Анне Сергеевне'],
    ['Кузнецова Ольга Игоревна', 'gen', 'Кузнецовой Ольги Игоревны'],
    ['Троицкий Андрей Ильич', 'gen', 'Троицкого Андрея Ильича'],
    ['Троицкая Мария Павловна', 'dat', 'Троицкой Марии Павловне'],
    ['Шевченко Пётр Львович', 'gen', 'Шевченко Петра Львовича'],
    ['Черных Никита Игоревич', 'dat', 'Черных Никите Игоревичу'],
    ['Шмидт Любовь Ивановна', 'gen', 'Шмидт Любови Ивановны'],
    ['Гоголь Лев Павлович', 'gen', 'Гоголя Льва Павловича'],
    ['Петров П. П.', 'dat', 'Петрову П. П.'],
    ['П. П. Петрова', 'dat', 'П. П. Петровой'],
  ] as const)('%s → %s', (fio, c, expected) => {
    expect(declineFio(fio, c)).toBe(expected);
  });

  it('пол: по отчеству, имени, фамилии', () => {
    expect(guessGender({ middle: 'Ивановна' })).toBe('f');
    expect(guessGender({ first: 'Никита' })).toBe('m');
    expect(guessGender({ last: 'Петрова' })).toBe('f');
    expect(guessGender({})).toBeNull();
  });

  it('краткие формы', () => {
    expect(shortFio('Иванов Иван Иванович')).toBe('Иванов И. И.');
    expect(signFio('Иванов Иван Иванович')).toBe('И. И. Иванов');
    expect(signFio('Петров П. П.')).toBe('П. П. Петров');
    expect(shortFio('Иванов')).toBe('Иванов');
  });
});

describe('метки шаблонов', () => {
  const values = placeholderValues({ fields: IVANOV }, { characteristic: 'Хороший боец.', achievements: [{ id: '1', date: '2025', title: 'Грамота', level: 'Штаб' }] }, { toSquad: '«Новый»', commanderTo: 'Петров Пётр Петрович' }, NOW);
  const r = makeResolver(values, 'm', [{ id: 'v', key: 'штаб', label: 'Штаб', value: 'Штаб РО', kind: 'text', createdAt: '', updatedAt: '' }]);

  it('поля, падежи, пол, переменные, сегодня', () => {
    expect(fillText('{ФИО:кого}, {ФИО:кратко}, {Отряд} → {Новый отряд}', r.resolve)).toBe('Иванова Ивана Ивановича, Иванов И. И., «Прежний» → «Новый»');
    expect(fillText('{Командир нового отряда:кому}', r.resolve)).toBe('Петрову Петру Петровичу');
    expect(fillText('{зарекомендовал|зарекомендовала} {Он|Она}', r.resolve)).toBe('зарекомендовал Он');
    expect(fillText('{Контактный телефон} {телефон}', r.resolve)).toBe('8(000)000-00-00 8(000)000-00-00');
    expect(fillText('{штаб}, {Сегодня}, {Возраст}', r.resolve)).toBe('Штаб РО, 01.09.2026, 21');
    expect(fillText('{Достижения}', r.resolve)).toBe('2025 — Грамота (Штаб)');
  });

  it('неизвестные остаются, пустые отмечаются', () => {
    expect(fillText('{Нет такого} {Дата перевода}', r.resolve)).toBe('{Нет такого} ');
    expect([...r.unknown]).toContain('Нет такого');
    expect([...r.empty]).toContain('Дата перевода');
    // Пустое РО в переводе — как сейчас.
    expect(fillText('{Новое РО}', r.resolve)).toBe('РО Примерное');
  });

  it('пол неизвестен — обе формы', () => {
    expect(makeResolver(new Map(), null).resolve('он|она')).toBe('он/она');
  });
});

describe('проверки ручного ввода', () => {
  it('форматы с исправлениями', () => {
    expect(checkField('person.phone', '+7 900 000 00 00')).toEqual([{ level: 'warn', text: 'По шаблону 8(000)000-00-00', fix: '8(900)000-00-00' }]);
    expect(checkField('person.birthDate', '1.2.2005')[0]).toMatchObject({ level: 'error', fix: '01.02.2005' });
    expect(checkField('person.lastName', 'иванов')[0]).toMatchObject({ fix: 'Иванов' });
    expect(checkField('rso.squad', 'Прежний')[0]).toMatchObject({ fix: '«Прежний»' });
    expect(checkField('person.email', 'Name@Mail.ru')[0]).toMatchObject({ level: 'warn', fix: 'name@mail.ru' });
    expect(checkField('person.lastName', 'Ивaнов')[0]).toMatchObject({ level: 'error', fix: 'Иванов' });
    expect(checkField('person.lastName', 'Иванов')).toEqual([]);
    expect(checkField('person.phone', '')).toEqual([]);
  });

  it('контрольные числа СНИЛС и ИНН', () => {
    expect(checkField('person.snils', '112-233-445 95')).toEqual([]);
    expect(checkField('person.snils', '112-233-445 96')[0].level).toBe('error');
    expect(checkField('person.inn', '500100732259')).toEqual([]);
    expect(checkField('person.inn', '500100732250')[0].level).toBe('error');
  });

  it('связанные даты', () => {
    expect(checkField('passport.issueDate', '01.01.2000', { 'person.birthDate': '01.01.2005' })[0].text).toMatch(/раньше даты рождения/);
  });

  it('повторы у других людей', () => {
    const records = [{ id: 'a', fields: { ...IVANOV, 'person.snils': '112-233-445 95' }, savedAt: '', source: '' }];
    expect(findDuplicates({ 'person.snils': '112-233-445 95' }, records, 'b')).toEqual({ 'person.snils': 'Иванов Иван Иванович' });
    expect(findDuplicates({ 'person.snils': '112-233-445 95' }, records, 'a')).toEqual({});
  });

  it('ФИО одной строкой', () => {
    expect(splitFio('  Иванов  Иван Иванович ')).toEqual({ 'person.lastName': 'Иванов', 'person.firstName': 'Иван', 'person.middleName': 'Иванович' });
  });

  it('все 35 полей есть в разделах формы ровно по разу', () => {
    const ids = FIELD_GROUPS.flatMap((g) => g.ids);
    expect(ids.sort()).toEqual(PERSON_FIELDS.map((f) => f.id).sort());
  });
});

describe('личная папка', () => {
  it('имя папки по ФИО: без запрещённых символов, занятые — с номером', () => {
    expect(safeName('Иванов: "Иван"? ')).toBe('Иванов_ _Иван__');
    expect(folderNameFor(IVANOV)).toBe('Иванов Иван Иванович');
    expect(folderNameFor({})).toBe('Без имени');
    expect(folderNameFor({ 'person.lastName': 'Шаблоны' })).toBe('Шаблоны (боец)');
    expect(uniqueName('Иванов', new Set(['иванов', 'Иванов (2)']))).toBe('Иванов (3)');
  });

  it('перенос папки со всеми файлами', async () => {
    const ws = new Workspace(new MemoryAdapter());
    await ws.writeBytes('Личные дела/Старое/Сканы/a.pdf', 'pdf');
    await ws.writeBytes('Личные дела/Старое/Фотографии/b.jpg', 'jpg');
    await moveFolder(ws, 'Личные дела/Старое', 'Личные дела/Новое');
    expect(await ws.readBytes('Личные дела/Старое/Сканы/a.pdf')).toBeNull();
    expect(text((await ws.readBytes('Личные дела/Новое/Сканы/a.pdf'))!)).toBe('pdf');
    expect(text((await ws.readBytes('Личные дела/Новое/Фотографии/b.jpg'))!)).toBe('jpg');
  });
});

describe('шаблоны документов', () => {
  it('хранится только изменённое; свои шаблоны — целиком', () => {
    const list = mergeTemplates({ templates: { 'transfer-request': { heading: 'ЗАЯВЛЕНИЕ' }, t_own: { title: 'Справка', body: 'Текст' } } });
    expect(list.find((t) => t.id === 'transfer-request')).toMatchObject({ heading: 'ЗАЯВЛЕНИЕ', builtin: true });
    expect(isModified(list[0])).toBe(true);
    expect(isModified(list[1])).toBe(false);
    expect(list.at(-1)).toMatchObject({ id: 't_own', title: 'Справка', builtin: false });
  });

  it('заявление: шапка справа, заголовок по центру, абзацы, подпись', () => {
    const r = makeResolver(placeholderValues({ fields: IVANOV }, undefined, { toSquad: '«Новый»', date: '01.09.2026', reason: 'переездом', commanderTo: 'Петров П. П.' }, NOW), 'm');
    const blocks = templateBlocks(DEFAULT_TEMPLATES[0], r.resolve);
    expect(blocks[0]).toMatchObject({ type: 'p', text: 'Командиру отряда «Новый»', indentLeft: 85 });
    expect(blocks).toContainEqual(expect.objectContaining({ text: 'Петрову П. П.' }));
    expect(blocks).toContainEqual(expect.objectContaining({ text: 'Иванова Ивана Ивановича' }));
    expect(blocks).toContainEqual(expect.objectContaining({ text: 'Заявление', align: 'center', bold: true }));
    expect(blocks).toContainEqual(expect.objectContaining({ text: 'Прошу перевести меня из отряда «Прежний» в отряд «Новый» с 01.09.2026 в связи с переездом.', firstLine: 12.5 }));
    expect(blocks.at(-1)).toMatchObject({ type: 'table', rows: [[{ text: '01.09.2026' }, { text: '__________ / И. И. Иванов', align: 'right' }]] });
  });
});

describe('перевод', () => {
  it('новый отряд в данные — только заполненное', () => {
    expect(applyTransfer(IVANOV, { squad: '«Новый»', branch: '', direction: ' ', position: 'Боец' })).toMatchObject({ 'rso.squad': '«Новый»', 'rso.branch': 'РО Примерное', 'rso.position': 'Боец' });
  });

  it('имя файла без точки перед расширением', () => {
    expect(fileName('01 Заявление', 'Иванов И. И.', 'docx')).toBe('01 Заявление — Иванов И. И.docx');
  });

  async function setup() {
    const ws = new Workspace(new MemoryAdapter());
    const c: PersonCase = { ...newCase('p1', 'Личные дела/Иванов Иван Иванович', 'Иванов Иван Иванович'), characteristic: 'Ответственный.', files: { 'Сканы/p1.jpg': { kind: 'Паспорт (разворот с фото)' } } };
    await ws.writeBytes('Личные дела/Иванов Иван Иванович/Сканы/p1.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    await ws.writeBytes('Личные дела/Иванов Иван Иванович/Сканы/снилс.pdf', '%PDF');
    await ws.writeBytes('Личные дела/Иванов Иван Иванович/Фотографии/фото.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    // Свой шаблон Word с меткой.
    const doc = '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Справка на {ФИО:кого}</w:t></w:r></w:p></w:body></w:document>';
    await ws.writeBytes('Личные дела/Шаблоны/Справка.docx', writeZip([{ path: 'word/document.xml', data: new TextEncoder().encode(doc) }]));
    return { ws, c };
  }

  it('пакет одного бойца: документы, карточка, фото, сканы, таблица, опись', async () => {
    const { ws, c } = await setup();
    const options: PackageOptions = { ...DEFAULT_OPTIONS, templates: DEFAULT_TEMPLATES.map((t) => t.id), word: ['Справка.docx'] };
    const form = { ...emptyTransferForm(NOW), toSquad: '«Новый»', reason: 'переездом', commanderFrom: 'Сидоров С. С.', commanderTo: 'Петров П. П.' };
    // Подготовка картинок «как в браузере»: возвращает новый JPEG.
    const prepared: { maxSide: number; crop34?: boolean }[] = [];
    const prepareImage = async (_d: Uint8Array, o: { maxSide: number; crop34?: boolean }) => {
      prepared.push(o);
      return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    };
    const r = await buildTransferPackage({ ws, people: [{ record: { id: 'p1', fields: IVANOV, savedAt: '', source: '' }, case: c }], form, options, templates: DEFAULT_TEMPLATES, prepareImage, now: NOW });
    expect(r.name).toBe('Перевод 2026-09-01');
    expect(r.files.map((f) => f.path)).toEqual([
      '01 Заявление о переводе — Иванов И. И.docx',
      '02 Ходатайство о переводе — Иванов И. И.docx',
      '03 Характеристика — Иванов И. И.docx',
      '04 Справка — Иванов И. И.docx',
      '05 Личная карточка — Иванов И. И.docx',
      'Фото 3×4 — Иванов И. И.jpg',
      'Сканы/01 Паспорт (разворот с фото) — Иванов И. И.jpg',
      'Сканы/02 снилс — Иванов И. И.pdf',
      'Данные — Иванов И. И.xlsx',
      'Опись документов.docx',
    ]);
    expect(prepared).toContainEqual({ maxSide: 1200, crop34: true });
    const word = (await readZip(r.files[3].data)).find((e) => e.path === 'word/document.xml')!;
    expect(text(word.data)).toContain('Справка на Иванова Ивана Ивановича');
    const xlsx = XLSX.read(r.files[8].data, { type: 'array' });
    expect(xlsx.SheetNames).toEqual(['Бойцы', 'Карточка', 'Документы']);
    const rows = XLSX.utils.sheet_to_json<string[]>(xlsx.Sheets['Бойцы'], { header: 1 });
    expect(rows[0]).toEqual(TABLE_HEADERS);
    expect(rows[1]).toContain('«Новый»');
    // Пустое «Новое РО» — как сейчас.
    expect(rows[1][TABLE_HEADERS.indexOf('Новое РО')]).toBe('РО Примерное');
    expect(r.warnings).toEqual(['Иванов И. И., «Ходатайство о переводе»: пусто — {Членский билет}']);
  });

  it('несколько бойцов — по папкам, общая таблица; без личной папки — предупреждение', async () => {
    const { ws, c } = await setup();
    const options: PackageOptions = { ...DEFAULT_OPTIONS, templates: ['transfer-request'], word: [], card: false };
    const petrova = { id: 'p2', fields: { 'person.lastName': 'Петрова', 'person.firstName': 'Анна' }, savedAt: '', source: '' };
    const r = await buildTransferPackage({ ws, people: [{ record: { id: 'p1', fields: IVANOV, savedAt: '', source: '' }, case: c }, { record: petrova }], form: emptyTransferForm(NOW), options, templates: DEFAULT_TEMPLATES, now: NOW });
    expect(r.name).toBe('Перевод 2026-09-01 — 2 чел');
    expect(r.files.map((f) => f.path)).toContain('Иванов И. И/01 Заявление о переводе — Иванов И. И.docx');
    expect(r.files.map((f) => f.path)).toContain('Петрова А/01 Заявление о переводе — Петрова А.docx');
    // Без подготовки картинок — исходные файлы.
    expect(r.files.map((f) => f.path)).toContain('Иванов И. И/Фото — Иванов И. И.jpg');
    expect(r.files.map((f) => f.path)).toContain('Данные бойцов.xlsx');
    expect(r.warnings).toContain('Петрова А.: личной папки нет — фото и сканов в пакете не будет');
  });
});
