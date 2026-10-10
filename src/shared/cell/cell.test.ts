import { describe, expect, it } from 'vitest';
import { BaseTree, removeNodeFromEntries, type BaseEntry, type Step } from '@/core/base/tree';
import { findAbbreviations } from './abbr';
import { textlib as lib } from '@/core/lua/textlib';
import { fillMask, suggestFix } from './format';
import { parseCell } from './parse';
import { birthplaceTemplate, parseOrder, registrationTemplate, residenceTemplate, type CellTemplate } from './template';
import { walk, type Level } from './walk';

const REG = registrationTemplate();
const RES = residenceTemplate();
const BIRTH = birthplaceTemplate();

const levels = (t: CellTemplate, steps: (Step | null)[]): Level[] =>
  parseOrder(t.order, t.keys.length).order.map((i) => ({ k: t.keys[i].id, step: steps[i], single: t.keys[i].single }));

const entry = (path: Step[]): BaseEntry => ({ id: Math.random().toString(36), path, addedAt: '', source: 'test' });

describe('порядок древа', () => {
  it('«2, 1, 3, *» — регион, индекс, район и дальше по порядку', () => {
    expect(parseOrder('2, 1, 3, *', 7).order).toEqual([1, 0, 2, 3, 4, 5, 6]);
  });
  it('«*» берёт всё после предыдущего числа', () => {
    expect(parseOrder('*', 3).order).toEqual([0, 1, 2]);
    expect(parseOrder('3, 1, *', 5).order).toEqual([2, 0, 1, 3, 4]);
  });
  it('без «*» лишние части в древо не идут', () => {
    expect(parseOrder('2, 1', 7).order).toEqual([1, 0]);
  });
  it('ошибки: повтор, нет такой части, не число', () => {
    expect(parseOrder('1, 1', 3).error).toMatch(/дважды/);
    expect(parseOrder('9', 3).error).toMatch(/нет/i);
    expect(parseOrder('a', 3).error).toMatch(/число/);
  });
});

describe('разбор ячейки через запятую', () => {
  it('правильный адрес — без замечаний, части по ключам', () => {
    const r = parseCell('655700, Респ. Хакасия, р-н Аскизский, с. Аскиз, ул. Ленина, д. 18', REG);
    expect(r.issues).toEqual([]);
    expect(r.steps.map((s) => s?.v ?? null)).toEqual(['655700', 'Хакасия', 'Аскизский', 'Аскиз', 'Ленина', '18', null]);
    expect(r.steps[1]).toMatchObject({ k: 'region', t: 'Респ.' });
    expect(r.canonical).toBe('655700, Респ. Хакасия, р-н Аскизский, с. Аскиз, ул. Ленина, д. 18');
  });

  it('«д.» в начале — деревня, после улицы — дом', () => {
    const r = parseCell('655700, Респ. Хакасия, д. Иваново, ул. Ленина, д. 18', REG);
    expect(r.issues).toEqual([]);
    expect(r.steps[3]).toMatchObject({ k: 'locality', v: 'Иваново', t: 'д.' });
    expect(r.steps[5]).toMatchObject({ k: 'house', v: '18' });
  });

  it('точка в конце, слипшиеся слова, неправильные приписки и порядок — исправляются', () => {
    const r = parseCell('Респ хакасия, 655700, ул.Ленина, село Аскиз,  дом 1.', REG);
    expect(r.issues.every((i) => i.fixable)).toBe(true);
    expect(r.canonical).toBe('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1');
  });

  it('приписка после названия там, где она пишется до, — ошибка с исправлением', () => {
    const r = parseCell('655700, Респ. Хакасия, Аскизский р-н, с. Аскиз, д. 18', REG);
    expect(r.issues.map((i) => i.text)).toContain('«р-н» пишется перед названием');
    expect(r.canonical).toBe('655700, Респ. Хакасия, р-н Аскизский, с. Аскиз, д. 18');
  });

  it('«край» пишется после названия', () => {
    const r = parseCell('660000, Красноярский край, г. Красноярск, ул. Мира, д. 1', REG);
    expect(r.issues).toEqual([]);
    expect(r.steps[1]).toMatchObject({ v: 'Красноярский', t: 'край', a: true });
  });

  it('лишние слова и пропуски — ошибки без автоисправления', () => {
    expect(parseCell('655700, Респ. Хакасия, с. Аскиз, ул. Ленина Привет, д. 1', REG).issues.some((i) => !i.fixable)).toBe(false);
    const noTag = parseCell('655700, Хакасия, с. Аскиз, д. 1', REG);
    expect(noTag.issues.map((i) => i.text).join()).toMatch(/Нет приписки у «Хакасия»/);
    expect(noTag.canonical).toBeUndefined();
    const missing = parseCell('Респ. Хакасия, с. Аскиз, д. 1', REG);
    expect(missing.issues.map((i) => i.text)).toContain('Нет части «Индекс»');
    expect(parseCell('Респ. Хакасия, с. Аскиз, д. 1', RES).issues).toEqual([]);
  });

  it('пустые части, пробелы у запятых', () => {
    const r = parseCell('655700 , Респ. Хакасия,,с. Аскиз, д. 1', REG);
    expect(r.issues.map((i) => i.text)).toEqual(expect.arrayContaining(['Лишний пробел перед запятой', 'Пустая часть между запятыми', 'После запятой нужен пробел']));
    expect(r.canonical).toBe('655700, Респ. Хакасия, с. Аскиз, д. 1');
  });

  it('сокращение не из шаблона — ошибка', () => {
    const r = parseCell('655700, Респ. Хакасия, г. Абакан, ул. Ленина, д. 1, оф. 5', REG);
    expect(r.issues.map((i) => i.text).join()).toMatch(/«оф\.» .*не предусмотрена/);
  });

  it('повтор части — ошибка', () => {
    const r = parseCell('655700, Респ. Хакасия, г. Абакан, г. Черногорск, д. 1', REG);
    expect(r.issues.map((i) => i.text)).toContain('Часть «Населённый пункт» повторяется');
  });
});

describe('разбор ячейки через пробел (место рождения)', () => {
  it('пример из анкеты', () => {
    const r = parseCell('с. Аскиз Аскизский р-н Республика Хакасия Россия', BIRTH);
    expect(r.issues).toEqual([]);
    expect(r.steps.map((s) => s?.v ?? null)).toEqual(['Аскиз', 'Аскизский', 'Хакасия', 'Россия']);
  });
  it('название из двух слов', () => {
    const r = parseCell('с. Белый Яр Алтайский р-н Республика Хакасия Россия', BIRTH);
    expect(r.issues).toEqual([]);
    expect(r.steps[0]?.v).toBe('Белый Яр');
  });
  it('только город', () => {
    const r = parseCell('г. Абакан', BIRTH);
    expect(r.issues).toEqual([]);
    expect(r.steps.map((s) => s?.v ?? null)).toEqual(['Абакан', null, null, null]);
  });
  it('запятые и «район» вместо «р-н» — исправляются', () => {
    const r = parseCell('с. Аскиз, Аскизский район, Республика Хакасия', BIRTH);
    expect(r.canonical).toBe('с. Аскиз Аскизский р-н Республика Хакасия');
  });
});

describe('древо', () => {
  const tree = new BaseTree([
    entry([
      { k: 'region', v: 'Хакасия', t: 'Респ.' },
      { k: 'index', v: '655700' },
      { k: 'locality', v: 'Аскиз', t: 'с.' },
      { k: 'street', v: 'Ленина', t: 'ул.' },
      { k: 'house', v: '1', t: 'д.' },
    ]),
  ]);

  it('известный адрес', () => {
    const r = parseCell('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1', REG);
    const w = walk(tree, levels(REG, r.steps));
    expect(w.issues).toEqual([]);
    expect(w.addPath).toEqual([]);
  });

  it('без индекса уровень пропускается', () => {
    const r = parseCell('Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1', RES);
    expect(walk(tree, levels(RES, r.steps)).addPath).toEqual([]);
  });

  it('новый дом добавляется внутрь найденного', () => {
    const r = parseCell('Респ. Хакасия, с. Аскиз, ул. Ленина, д. 5', RES);
    const w = walk(tree, levels(RES, r.steps));
    expect(w.addPath.map((s) => s.v)).toEqual(['Хакасия', '655700', 'Аскиз', 'Ленина', '5']);
    expect(w.status.filter((s) => s === 'new')).toHaveLength(1);
  });

  it('тот же индекс в другом регионе — ошибка (можно подтвердить)', () => {
    const r = parseCell('655700, Красноярский край, г. Абакан, ул. Ленина, д. 1', REG);
    const w = walk(tree, levels(REG, r.steps));
    expect(w.issues.find((i) => i.text.includes('655700'))).toMatchObject({ level: 'error', confirmable: true });
  });

  it('другая приписка, чем в базе, — ошибка с исправлением', () => {
    const r = parseCell('655700, Хакасия край, с. Аскиз, ул. Ленина, д. 1', REG);
    const w = walk(tree, levels(REG, r.steps));
    expect(w.issues[0]).toMatchObject({ level: 'error', fix: { t: 'Респ.' } });
  });

  it('путь без индекса находится внутри пути с индексом (не плодим двойников)', () => {
    const r = tree.resolve([
      { k: 'region', v: 'Хакасия' },
      { k: 'locality', v: 'Аскиз' },
      { k: 'street', v: 'Новая' },
    ]);
    expect(r.matched).toBe(2);
    expect(tree.pathOf(r.node).map((s) => s.v)).toEqual(['Хакасия', '655700', 'Аскиз']);
  });

  it('удаление узла не удаляет то, что выше', () => {
    const entries = removeNodeFromEntries(tree.entries, tree.entries[0].path.slice(0, 3));
    const t2 = new BaseTree(entries);
    expect(t2.size).toBe(2);
  });
});

describe('готовые функции lib.* и исправления', () => {
  const fix = (v: string, check: (x: string) => boolean, mask?: string) => suggestFix(v, check, mask);
  it('телефон без скобок — исправление по цифрам', () => {
    expect(lib.is_phone('89000000000')).toBe(false);
    expect(fix('89000000000', lib.is_phone, '8(999)999-99-99')).toBe('8(900)000-00-00');
    expect(lib.fix_phone('+7 900 000 00 00')).toBe('8(900)000-00-00');
  });
  it('даты: несуществующие не проходят, короткие дописываются', () => {
    expect(lib.is_date('29.02.2008')).toBe(true);
    expect(lib.is_date('29.02.2007')).toBe(false);
    expect(lib.is_date('31.04.2007')).toBe(false);
    expect(lib.is_date('00.00.0000')).toBe(false);
    expect(lib.is_date('01.01.1950', 1960, 2010)).toBe(false);
    expect(fix('1.1.2000', lib.is_date)).toBe('01.01.2000');
    expect(lib.fix_date('1/1/00')).toBe('01.01.2000');
    expect(lib.age('01.06.2000', '31.05.2014')).toBe(13);
    expect(lib.before('01.01.2000', '02.01.2000')).toBe(true);
  });
  it('почта: строгая — строчными, мягкая — любые', () => {
    expect(lib.is_email('Ivanov@example.com')).toBe(false);
    expect(lib.is_email_any('Ivanov@example.com')).toBe(true);
    expect(lib.is_email_any('ivanov@mail')).toBe(false);
  });
  it('ВК: только vk.ru и vk.com', () => {
    expect(lib.is_vk('https://vk.ru/username')).toBe(true);
    expect(lib.is_vk('vk.com/id1')).toBe(false);
    expect(lib.fix_vk('vk.com/id1')).toBe('https://vk.com/id1');
  });
  it('кавычки и «ёлочки»', () => {
    expect(lib.in_guillemets('«Название»')).toBe(true);
    expect(fix('"Название"', lib.in_guillemets)).toBe('«Название»');
    expect(fix('Название', lib.in_guillemets)).toBe('«Название»');
    expect(lib.fix_quotes('ГБПОУ  "Колледж»')).toBe('ГБПОУ «Колледж»');
  });
  it('лишнее вокруг цифр убирается: «2 курс» → «2», «1234 5678 9012» → ИНН', () => {
    expect(fix('2 курс', (v) => /^[1-6]$/.test(v))).toBe('2');
    expect(fix('1234 5678 9012', (v) => /^\d{12}$/.test(v))).toBe('123456789012');
  });
  it('буквы: латиница/кириллица, «й» из двух символов', () => {
    expect(lib.has_latin('Ивaнов')).toBe(true);
    expect(lib.only_cyrillic('Иванов-Петров 2')).toBe(true);
    expect(lib.only_latin('name_1')).toBe(true);
    expect(lib.mixed_words('Ивaнов Пётр IT-технологии')).toEqual(['Ивaнов']);
    expect(lib.fix_letters('Ивaнов')).toBe('Иванов');
    expect(lib.fix_letters('Ivаnov')).toBe('Ivanov');
    expect(lib.odd_letters('Андреи\u0306')).toBe(true);
    expect(lib.fix_letters('Андреи\u0306')).toBe('Андрей');
    expect(lib.odd_letters('Андрей')).toBe(false);
  });
  it('шаблоны цифр, число, текст', () => {
    expect(lib.mask('000-000-000 00', '999-999-999 99')).toBe(true);
    expect(lib.mask('000-000-00000', '999-999-999 99')).toBe(false);
    expect(lib.mask_example('8(999)999-99-99')).toBe('8(000)000-00-00');
    expect(lib.number('2,5')).toBe(2.5);
    expect(lib.number('2 курс')).toBeNull();
    expect(lib.sub('ИС-21', 4, 5)).toBe('21');
    expect(lib.sub('Привет', -3)).toBe('вет');
    expect(lib.capitalize('иВАНОВ-петров')).toBe('Иванов-Петров');
    expect(lib.len('ёжик')).toBe(4);
  });
  it('контрольные числа СНИЛС и ИНН', () => {
    expect(lib.snils_ok('112-233-445 95')).toBe(true);
    expect(lib.snils_ok('112-233-445 96')).toBe(false);
    expect(lib.inn_ok('500100732259')).toBe(true);
    expect(lib.inn_ok('500100732258')).toBe(false);
    expect(lib.inn_ok('7707083893')).toBe(true);
  });
  it('маска', () => {
    expect(fillMask('123456789 01', '999-999-999 99')).toBe('123-456-789 01');
    expect(fillMask('12', '9999')).toBeNull();
  });
  it('приписки в тексте', () => {
    expect(findAbbreviations('Респ. Хакасия')).toEqual(['Респ.']);
    expect(findAbbreviations('Аскизский район')).toEqual(['район']);
    expect(findAbbreviations('ул.Ленина')).toEqual(['ул.']);
    expect(findAbbreviations('Абакан')).toEqual([]);
  });
});
