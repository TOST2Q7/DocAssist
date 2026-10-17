import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { MemoryAdapter } from '@/core/storage/memoryAdapter';
import { PERSON_FIELDS } from '@/core/schema/fields';
import { readZip, writeZip } from '@/core/util/zip';
import { Workspace } from '@/core/workspace/workspace';
import { folderNameFor, moveFolder, newCase, renamedFile, safeName, uniqueName, type PersonCase } from './cases';
import { FIELD_GROUPS } from './groups';
import { declineFio, guessGender, shortFio, signFio } from './names';
import { fillText, makeResolver, placeholderValues } from './placeholders';
import { DEFAULT_SCAN_NAME, planNames } from './scanNames';
import { DEFAULT_TEMPLATES, isModified, mergeTemplates, templateBlocks } from './templates';
import { applyTransfer, buildTransferPackage, DEFAULT_OPTIONS, emptyTransferForm, fileName, TABLE_HEADERS, type PackageOptions } from './transfer';
import { checkField, findDuplicates, splitFio } from './validate';

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const NOW = new Date(2026, 8, 1);

const IVANOV: Record<string, string> = {
  'person.lastName': 'Примеров',
  'person.firstName': 'Пример',
  'person.middleName': 'Примерович',
  'person.gender': 'Мужской',
  'person.birthDate': '01.01.2005',
  'person.phone': '8(000)000-00-00',
  'rso.squad': '«Прежний»',
  'rso.branch': 'РО Примерное',
  'rso.joinDate': '01.10.2024',
};

describe('ФИО для документов', () => {
  it.each([
    ['Примеров Пример Примерович', 'gen', 'Примерова Примера Примеровича'],
    ['Примеров Пример Примерович', 'dat', 'Примерову Примеру Примеровичу'],
    ['Петрова Анна Сергеевна', 'gen', 'Петровой Анны Сергеевны'],
    ['Петрова Анна Сергеевна', 'dat', 'Петровой Анне Сергеевне'],
    ['Кузнецова Ольга Игоревна', 'gen', 'Кузнецовой Ольги Игоревны'],
    ['Троицкий Андрей Ильич', 'gen', 'Троицкого Андрея Ильича'],
    ['Троицкая Мария Павловна', 'dat', 'Троицкой Марии Павловне'],
    ['Шевченко Пётр Львович', 'gen', 'Шевченко Петра Львовича'],
    ['Черных Никита Игоревич', 'dat', 'Черных Никите Игоревичу'],
    ['Шмидт Любовь Примеровна', 'gen', 'Шмидт Любови Примеровны'],
    ['Гоголь Лев Павлович', 'gen', 'Гоголя Льва Павловича'],
    ['Командиров К. К.', 'dat', 'Командирову К. К.'],
    ['К. К. Командирова', 'dat', 'К. К. Командировой'],
  ] as const)('%s → %s', (fio, c, expected) => {
    expect(declineFio(fio, c)).toBe(expected);
  });

  it('пол: по отчеству, имени, фамилии', () => {
    expect(guessGender({ middle: 'Примеровна' })).toBe('f');
    expect(guessGender({ first: 'Никита' })).toBe('m');
    expect(guessGender({ last: 'Петрова' })).toBe('f');
    expect(guessGender({})).toBeNull();
  });

  it('краткие формы', () => {
    expect(shortFio('Примеров Пример Примерович')).toBe('Примеров П. П.');
    expect(signFio('Примеров Пример Примерович')).toBe('П. П. Примеров');
    expect(signFio('Командиров К. К.')).toBe('К. К. Командиров');
    expect(shortFio('Примеров')).toBe('Примеров');
  });
});

describe('метки шаблонов', () => {
  const values = placeholderValues({ fields: IVANOV }, { characteristic: 'Хороший боец.', achievements: [{ id: '1', date: '2025', title: 'Грамота', level: 'Штаб' }] }, { toSquad: '«Новый»', commanderTo: 'Командиров Командир Командирович' }, NOW);
  const r = makeResolver(values, 'm', [{ id: 'v', key: 'штаб', label: 'Штаб', value: 'Штаб РО', kind: 'text', createdAt: '', updatedAt: '' }]);

  it('поля, падежи, пол, переменные, сегодня', () => {
    expect(fillText('{ФИО:кого}, {ФИО:кратко}, {Отряд} → {Новый отряд}', r.resolve)).toBe('Примерова Примера Примеровича, Примеров П. П., «Прежний» → «Новый»');
    expect(fillText('{Командир нового отряда:кому}', r.resolve)).toBe('Командирову Командиру Командировичу');
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
    expect(checkField('person.lastName', 'примеров')[0]).toMatchObject({ fix: 'Примеров' });
    expect(checkField('rso.squad', 'Прежний')[0]).toMatchObject({ fix: '«Прежний»' });
    expect(checkField('person.email', 'Name@Mail.ru')[0]).toMatchObject({ level: 'warn', fix: 'name@mail.ru' });
    expect(checkField('person.lastName', 'Примeров')[0]).toMatchObject({ level: 'error', fix: 'Примеров' });
    expect(checkField('person.lastName', 'Примеров')).toEqual([]);
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
    expect(findDuplicates({ 'person.snils': '112-233-445 95' }, records, 'b')).toEqual({ 'person.snils': 'Примеров Пример Примерович' });
    expect(findDuplicates({ 'person.snils': '112-233-445 95' }, records, 'a')).toEqual({});
  });

  it('ФИО одной строкой', () => {
    expect(splitFio('  Примеров  Пример Примерович ')).toEqual({ 'person.lastName': 'Примеров', 'person.firstName': 'Пример', 'person.middleName': 'Примерович' });
  });

  it('все 35 полей есть в разделах формы ровно по разу', () => {
    const ids = FIELD_GROUPS.flatMap((g) => g.ids);
    expect(ids.sort()).toEqual(PERSON_FIELDS.map((f) => f.id).sort());
  });
});

describe('личная папка', () => {
  it('имя папки по ФИО: без запрещённых символов, занятые — с номером', () => {
    expect(safeName('Фамилия: "Имя"? ')).toBe('Фамилия_ _Имя__');
    expect(folderNameFor(IVANOV)).toBe('Примеров Пример Примерович');
    expect(folderNameFor({})).toBe('Без имени');
    expect(folderNameFor({ 'person.lastName': 'Шаблоны' })).toBe('Шаблоны (боец)');
    expect(uniqueName('Примеров', new Set(['примеров', 'Примеров (2)']))).toBe('Примеров (3)');
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
    const r = makeResolver(placeholderValues({ fields: IVANOV }, undefined, { toSquad: '«Новый»', date: '01.09.2026', reason: 'переездом', commanderTo: 'Командиров К. К.' }, NOW), 'm');
    const blocks = templateBlocks(DEFAULT_TEMPLATES[0], r.resolve);
    expect(blocks[0]).toMatchObject({ type: 'p', text: 'Командиру отряда «Новый»', indentLeft: 85 });
    expect(blocks).toContainEqual(expect.objectContaining({ text: 'Командирову К. К.' }));
    expect(blocks).toContainEqual(expect.objectContaining({ text: 'Примерова Примера Примеровича' }));
    expect(blocks).toContainEqual(expect.objectContaining({ text: 'Заявление', align: 'center', bold: true }));
    expect(blocks).toContainEqual(expect.objectContaining({ text: 'Прошу перевести меня из отряда «Прежний» в отряд «Новый» с 01.09.2026 в связи с переездом.', firstLine: 12.5 }));
    expect(blocks.at(-1)).toMatchObject({ type: 'table', rows: [[{ text: '01.09.2026' }, { text: '__________ / П. П. Примеров', align: 'right' }]] });
  });
});

describe('перевод', () => {
  it('новый отряд в данные — только заполненное', () => {
    expect(applyTransfer(IVANOV, { squad: '«Новый»', branch: '', direction: ' ', position: 'Боец' })).toMatchObject({ 'rso.squad': '«Новый»', 'rso.branch': 'РО Примерное', 'rso.position': 'Боец' });
  });

  it('имя файла без точки перед расширением', () => {
    expect(fileName('01 Заявление', 'Примеров П. П.', 'docx')).toBe('01 Заявление — Примеров П. П.docx');
  });

  async function setup() {
    const ws = new Workspace(new MemoryAdapter());
    const c: PersonCase = { ...newCase('p1', 'Личные дела/Примеров Пример Примерович', 'Примеров Пример Примерович'), characteristic: 'Ответственный.', files: { 'Сканы/p1.jpg': { kind: 'Паспорт (разворот с фото)' } } };
    await ws.writeBytes('Личные дела/Примеров Пример Примерович/Сканы/p1.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    await ws.writeBytes('Личные дела/Примеров Пример Примерович/Сканы/снилс.pdf', '%PDF');
    await ws.writeBytes('Личные дела/Примеров Пример Примерович/Фотографии/фото.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    // Свой шаблон Word с меткой.
    const doc = '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Справка на {ФИО:кого}</w:t></w:r></w:p></w:body></w:document>';
    await ws.writeBytes('Личные дела/Шаблоны/Справка.docx', writeZip([{ path: 'word/document.xml', data: new TextEncoder().encode(doc) }]));
    return { ws, c };
  }

  it('пакет одного бойца: документы, карточка, фото, сканы, таблица, опись', async () => {
    const { ws, c } = await setup();
    const options: PackageOptions = { ...DEFAULT_OPTIONS, templates: DEFAULT_TEMPLATES.map((t) => t.id), word: ['Справка.docx'] };
    const form = { ...emptyTransferForm(NOW), toSquad: '«Новый»', reason: 'переездом', commanderFrom: 'Начальников Н. Н.', commanderTo: 'Командиров К. К.' };
    // Подготовка картинок «как в браузере»: возвращает новый JPEG.
    const prepared: { maxSide: number; crop34?: boolean }[] = [];
    const prepareImage = async (_d: Uint8Array, o: { maxSide: number; crop34?: boolean }) => {
      prepared.push(o);
      return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    };
    const r = await buildTransferPackage({ ws, people: [{ record: { id: 'p1', fields: IVANOV, savedAt: '', source: '' }, case: c }], form, options, templates: DEFAULT_TEMPLATES, prepareImage, now: NOW });
    expect(r.name).toBe('Перевод 2026-09-01');
    expect(r.files.map((f) => f.path)).toEqual([
      '01 Заявление о переводе — Примеров П. П.docx',
      '02 Ходатайство о переводе — Примеров П. П.docx',
      '03 Характеристика — Примеров П. П.docx',
      '04 Справка — Примеров П. П.docx',
      '05 Личная карточка — Примеров П. П.docx',
      'Фото 3×4 — Примеров П. П.jpg',
      'Сканы/01 Паспорт (разворот с фото) — Примеров П. П.jpg',
      'Сканы/02 снилс — Примеров П. П.pdf',
      'Данные — Примеров П. П.xlsx',
      'Опись документов.docx',
    ]);
    expect(prepared).toContainEqual({ maxSide: 1200, crop34: true });
    const word = (await readZip(r.files[3].data)).find((e) => e.path === 'word/document.xml')!;
    expect(text(word.data)).toContain('Справка на Примерова Примера Примеровича');
    const xlsx = XLSX.read(r.files[8].data, { type: 'array' });
    expect(xlsx.SheetNames).toEqual(['Бойцы', 'Карточка', 'Документы']);
    const rows = XLSX.utils.sheet_to_json<string[]>(xlsx.Sheets['Бойцы'], { header: 1 });
    expect(rows[0]).toEqual(TABLE_HEADERS);
    expect(rows[1]).toContain('«Новый»');
    // Пустое «Новое РО» — как сейчас.
    expect(rows[1][TABLE_HEADERS.indexOf('Новое РО')]).toBe('РО Примерное');
    expect(r.warnings).toEqual(['Примеров П. П., «Ходатайство о переводе»: пусто — {Членский билет}']);
  });

  it('несколько бойцов — по папкам, общая таблица; без личной папки — предупреждение', async () => {
    const { ws, c } = await setup();
    const options: PackageOptions = { ...DEFAULT_OPTIONS, templates: ['transfer-request'], word: [], card: false };
    const second = { id: 'p2', fields: { 'person.lastName': 'Фамилия', 'person.firstName': 'Имя' }, savedAt: '', source: '' };
    const r = await buildTransferPackage({ ws, people: [{ record: { id: 'p1', fields: IVANOV, savedAt: '', source: '' }, case: c }, { record: second }], form: emptyTransferForm(NOW), options, templates: DEFAULT_TEMPLATES, now: NOW });
    expect(r.name).toBe('Перевод 2026-09-01 — 2 чел');
    expect(r.files.map((f) => f.path)).toContain('Примеров П. П/01 Заявление о переводе — Примеров П. П.docx');
    expect(r.files.map((f) => f.path)).toContain('Фамилия И/01 Заявление о переводе — Фамилия И.docx');
    // Без подготовки картинок — исходные файлы.
    expect(r.files.map((f) => f.path)).toContain('Примеров П. П/Фото — Примеров П. П.jpg');
    expect(r.files.map((f) => f.path)).toContain('Данные бойцов.xlsx');
    expect(r.warnings).toContain('Фамилия И.: личной папки нет — фото и сканов в пакете не будет');
  });
});

describe('имена сканов по шаблону', () => {
  const ctx = { values: placeholderValues({ fields: IVANOV }, undefined, undefined, NOW), gender: 'm' as const };
  const items = [
    { rel: 'Сканы/IMG_001.jpg', doc: 'Паспорт (разворот с фото)' },
    { rel: 'Сканы/scan.pdf', doc: 'СНИЛС' },
  ];

  it('по умолчанию: документ и ФИО кратко, расширение сохраняется', () => {
    const r = planNames(DEFAULT_SCAN_NAME, items, ['IMG_001.jpg', 'scan.pdf'], ctx);
    expect(r.map((x) => x.to)).toEqual(['Паспорт (разворот с фото) — Примеров П. П.jpg', 'СНИЛС — Примеров П. П.pdf']);
  });

  it('свой текст вокруг, номер, исходное имя, неизвестные и пустые метки', () => {
    const r = planNames('{№} Скан для штаба {Фамилия} {Имя файла} {Группа} {Нет такой}', items, [], ctx);
    expect(r[0].to).toBe('01 Скан для штаба Примеров IMG_001 {Нет такой}.jpg');
    expect(r[0].unknown).toEqual(['Нет такой']);
    expect(r[0].empty).toEqual(['Группа']);
    expect(r[1].to).toMatch(/^02 Скан для штаба Примеров scan/);
  });

  it('одинаковые имена — с номером; занятые в папке — тоже', () => {
    const r = planNames('{Фамилия}', items.map((x) => ({ ...x, rel: x.rel.replace('.pdf', '.jpg') })), ['Примеров.jpg', 'IMG_001.jpg', 'scan.jpg'], ctx);
    expect(r.map((x) => x.to)).toEqual(['Примеров (2).jpg', 'Примеров (3).jpg']);
    // В другую папку: свои старые имена не освобождаются — там их нет.
    const other = planNames('{Имя файла}', items, ['IMG_001.jpg'], ctx, false);
    expect(other[0].to).toBe('IMG_001 (2).jpg');
  });

  it('имя не изменилось — остаётся как есть; запрещённые символы убираются', () => {
    expect(planNames('{Имя файла}', items, ['IMG_001.jpg', 'scan.pdf'], ctx)[0].to).toBe('IMG_001.jpg');
    expect(planNames('Скан: {Документ}?', items.slice(1), [], ctx)[0].to).toBe('Скан_ СНИЛС_.pdf');
    // Пустой результат — исходное имя.
    expect(planNames('{Группа}', items.slice(1), [], ctx)[0].to).toBe('scan.pdf');
  });

  it('переименование файла переносит подпись, основное фото и ссылку достижения', () => {
    const c = { ...newCase('p', 'x', 'x'), photo: 'Сканы/a.jpg', files: { 'Сканы/a.jpg': { kind: 'СНИЛС' } }, achievements: [{ id: '1', date: '', title: 't', file: 'Сканы/a.jpg' }] };
    const r = renamedFile(c, 'Сканы/a.jpg', 'Сканы/b.jpg');
    expect(r.files).toEqual({ 'Сканы/b.jpg': { kind: 'СНИЛС' } });
    expect(r.photo).toBe('Сканы/b.jpg');
    expect(r.achievements[0].file).toBe('Сканы/b.jpg');
  });
});
