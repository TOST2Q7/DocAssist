import { describe, expect, it } from 'vitest';
import {
  blocksMask,
  checkBlocks,
  describeBlocks,
  describeFormat,
  findPreset,
  FORMAT_PRESETS,
  matcher,
  matches,
  newBlock,
  PART_PRESETS,
  presetBlocks,
  realDate,
  sampleOf,
  type Block,
} from './blocks';
import { regexToBlocks } from './legacy';

const ok = (blocks: Block[], ...vals: string[]) => vals.forEach((v) => expect(matches(blocks, v), `«${v}» должно подходить`).toBe(true));
const bad = (blocks: Block[], ...vals: string[]) => vals.forEach((v) => expect(matches(blocks, v), `«${v}» не должно подходить`).toBe(false));

describe('блоки: проверка значения', () => {
  it('нет блоков — подходит любое значение', () => {
    expect(matcher([]).any).toBe(true);
    ok([], '', 'что угодно  ');
  });

  it('курс от 1 до 11 — то, что в regex «[1-11]» не работало', () => {
    const b: Block[] = [{ type: 'number', from: 1, to: 11 }];
    ok(b, '1', '6', '10', '11');
    bad(b, '0', '12', '01', ' 6', '6 ');
  });

  it('готовые форматы: что подходит и что нет', () => {
    const table: Record<string, [string[], string[]]> = {
      date: [['01.01.2000', '29.02.2008'], ['1.1.2000', '29.02.2007', '31.04.2007', '00.00.0000', '01.01.1899']],
      datetime: [['01.01.2025 00:00:00', '31.12.2025 23:59:59'], ['01.01.2025 24:00:00', '01.01.2025 0:00:00', '01.01.2025  00:00:00']],
      phone: [['8(000)111-22-33'], ['8(000)000-0000', '8 (000) 000-00-00', '80001112233']],
      email: [['name@example.com', 'a.b-c@mail.example.ru'], ['Name@example.com', 'name@mail', 'name@@example.com']],
      snils: [['000-000-000 00'], ['000-000-00000', '000000000 00']],
      inn: [['000000000000'], ['00000000000', '0000000000000']],
      code: [['000-000'], ['000000']],
      card: [['00-00 000'], ['00-00-000']],
      vk: [['https://vk.com/username', 'https://vk.ru/user_1'], ['vk.com/x', 'https://vk.com/', 'https://vk.org/x']],
      name: [['Иван', 'Петрова-Водкина'], ['иван', 'Иван ', 'Ivan', 'Петрова-водкина']],
      text: [['Текст', 'Два слова'], [' лишний', 'два  пробела', 'конец ']],
      quoted: [['ГБПОУ «Название»'], ['ГБПОУ "Название"', ' ГБПОУ']],
      squad: [['«Название»', '«Два слова»'], ['Название', '"Название"', '«Название']],
      specialty: [['00.00.00 Название специальности'], ['00.00.00 название', '00.00.0 Название']],
      course: [['1', '6'], ['7', '0', '11']],
      group: [['ГР-01', 'ИС-21/1'], ['ГР 01']],
      gender: [['Мужской', 'Женский'], ['мужской', 'М']],
      form: [['очная', 'заочная', 'очно-заочная'], ['Очная']],
      yesno: [['Да', 'Нет'], ['да']],
    };
    for (const [id, [good, wrong]] of Object.entries(table)) {
      ok(presetBlocks(id), ...good);
      bad(presetBlocks(id), ...wrong);
    }
  });

  it('дата: настоящая дата календаря и диапазон лет; необязательная дата', () => {
    expect(realDate(29, 2, 2000)).toBe(true);
    expect(realDate(29, 2, 1900)).toBe(false);
    expect(realDate(31, 12, 2025)).toBe(true);
    const birth: Block[] = [{ type: 'date', yearFrom: 1950, yearTo: 2015 }];
    ok(birth, '01.01.1950', '31.12.2015');
    bad(birth, '31.12.1949', '01.01.2016');
    const opt: Block[] = [{ type: 'text', text: 'с ' }, { type: 'date', yearFrom: 1900, yearTo: 2099, optional: true }];
    ok(opt, 'с ', 'с 01.01.2000');
    bad(opt, 'с 31.02.2000');
  });

  it('символы: с заглавной, латиница, свои символы, количество', () => {
    const name: Block = { type: 'chars', ru: true, en: false, digits: false, extra: '', case: 'cap', count: { min: 2, max: null } };
    ok([name], 'Иванов');
    bad([name], 'иванов', 'И');
    const login: Block = { type: 'chars', ru: false, en: true, digits: true, extra: '_.-]', case: 'lower', count: { min: 3, max: 8 } };
    ok([login], 'a.b_c-]');
    bad([login], 'ab', 'ABC');
  });

  it('любой текст: с заглавной, только русские, кавычки', () => {
    ok([{ type: 'anytext', cap: true }], 'Название', '1-й Отряд', 'Name');
    bad([{ type: 'anytext', cap: true }], 'название');
    ok([{ type: 'anytext', ru: true, cap: true }], 'Примерное', '50 лет Октября', 'Ново-Примерное');
    bad([{ type: 'anytext', ru: true, cap: true }], 'им. Примерного', 'Primer', 'примерное');
    ok([{ type: 'anytext', quotes: 'guillemets' }], 'ГБПОУ «Название»');
    bad([{ type: 'anytext', quotes: 'guillemets' }], 'ГБПОУ "Название"', "ГБПОУ 'Название'");
    bad([{ type: 'anytext', quotes: 'none' }], 'ГБПОУ «Название»');
  });

  it('слово, номер дома, время, почта', () => {
    bad([{ type: 'word', hyphen: false }], 'Петрова-Водкина');
    ok([{ type: 'house', slash: true }], '1', '12а', '12/3', '12а/1б');
    bad([{ type: 'house', slash: false }], '12/3', '12А');
    ok([{ type: 'time', seconds: false }], '00:00', '23:59');
    bad([{ type: 'time', seconds: false }], '24:00', '00:00:00', '7:00');
    ok([{ type: 'email' }], 'name@example.com');
  });

  it('необязательный блок', () => {
    const b: Block[] = [{ type: 'digits', count: { min: 2, max: 2 } }, { type: 'text', text: '-кв', optional: true }, { type: 'digits', count: { min: 3, max: 3 }, optional: true }];
    ok(b, '12', '12-кв', '12-кв345', '12345');
    bad(b, '1', '12-к', '1234');
  });

  it('спецсимволы в тексте — просто символы', () => {
    ok([{ type: 'text', text: 'a.b(c)+[x]' }], 'a.b(c)+[x]');
    bad([{ type: 'text', text: 'a.b' }], 'axb');
  });

  it('пустые варианты и символы ничему не соответствуют', () => {
    bad([{ type: 'oneof', options: ['', ' '] }], '', 'x');
    bad([{ ...newBlock('chars'), ru: false } as Block], 'А');
  });
});

describe('блоки: описание, пример, исправление', () => {
  it('исправление по цифрам из блоков', () => {
    expect(blocksMask(presetBlocks('phone'))).toBe('8(999)999-99-99');
    expect(blocksMask(presetBlocks('snils'))).toBe('999-999-999 99');
    expect(blocksMask(presetBlocks('datetime'))).toBe('99.99.9999 99:99:99');
    expect(blocksMask(presetBlocks('course'))).toBeUndefined();
  });

  it('описание блоков и формата', () => {
    expect(describeBlocks(presetBlocks('code'))).toBe('3 цифры + «-» + 3 цифры');
    expect(describeBlocks([{ type: 'number', from: 1, to: 11 }])).toBe('число от 1 до 11');
    expect(describeFormat(presetBlocks('phone'))).toBe('телефон');
    expect(describeFormat([{ type: 'number', from: 1, to: 11 }])).toBe('число от 1 до 11');
    expect(describeFormat([])).toBe('любое значение');
  });

  it('готовый формат узнаётся, даже если свойства блока в другом порядке', () => {
    const reordered = presetBlocks('vk').map((b) => Object.fromEntries(Object.entries(b).reverse()) as Block);
    expect(findPreset(reordered)?.id).toBe('vk');
    expect(findPreset([{ type: 'number', from: 1, to: 6, optional: false }])?.id).toBe('course');
  });

  it('пример по блокам подходит под формат — у каждого готового формата', () => {
    for (const p of [...FORMAT_PRESETS, ...PART_PRESETS]) {
      const s = sampleOf(p.blocks);
      expect(s, p.id).toBeDefined();
      expect(matches(p.blocks, p.example), `${p.id}: пример ${p.example}`).toBe(true);
    }
    expect(sampleOf(presetBlocks('phone'))).toBe('8(000)000-00-00');
  });

  it('проблемы в блоках', () => {
    expect(checkBlocks([{ ...newBlock('chars'), ru: false } as Block])).toEqual(['Блок 1: не выбрано, какие символы']);
    expect(checkBlocks([{ type: 'text', text: '' }])).toHaveLength(1);
    expect(checkBlocks([{ type: 'number', from: 0, to: 100000 }])[0]).toMatch(/слишком большой диапазон/);
    expect(checkBlocks([{ type: 'space' }, { type: 'space' }])[0]).toMatch(/два пробела/);
    expect(checkBlocks([{ type: 'digits', count: { min: 1, max: 1 }, optional: true }])[0]).toMatch(/необязательные/);
    expect(checkBlocks(presetBlocks('phone'))).toEqual([]);
    expect(checkBlocks([{ type: 'time', seconds: true }, { type: 'anytext' }])[0]).toMatch(/вплотную/);
    for (const p of [...FORMAT_PRESETS, ...PART_PRESETS]) expect(checkBlocks(p.blocks), p.id).toEqual([]);
  });
});

describe('перенос regex из версии 0.3', () => {
  it('готовые форматы 0.3 переводятся в те же блоки', () => {
    expect(regexToBlocks('^8\\(\\d{3}\\)\\d{3}-\\d{2}-\\d{2}$')).toEqual(presetBlocks('phone'));
    expect(regexToBlocks('^(1|2|3|4|5|6)$')).toEqual(presetBlocks('course'));
    expect(regexToBlocks('^\\S+( \\S+)*$')).toEqual(presetBlocks('text'));
    expect(findPreset(regexToBlocks('^(Да|Нет)$')!)?.id).toBe('yesno');
  });

  it('части конструктора: индекс, дом, квартира, названия', () => {
    expect(regexToBlocks('^\\d{6}$', true)).toEqual(presetBlocks('index', true));
    expect(regexToBlocks('^\\d+[а-я]?(/\\d+[а-я]?)?$', true)).toEqual(presetBlocks('house', true));
    expect(regexToBlocks('^[А-ЯЁ0-9][А-Яа-яЁё0-9-]*( [А-Яа-яЁё0-9-]+)*$', true)).toEqual(presetBlocks('place', true));
  });

  it('простые свои regex разбираются', () => {
    expect(regexToBlocks('^[1-11]$')).toEqual([{ type: 'number', from: 1, to: 11 }]);
    expect(regexToBlocks('^(1|2|3)$')).toEqual([{ type: 'number', from: 1, to: 3 }]);
    expect(regexToBlocks('^(?:очно|заочно)$')).toEqual([{ type: 'oneof', options: ['очно', 'заочно'] }]);
    expect(regexToBlocks('^\\d\\d\\d$')).toEqual([{ type: 'digits', count: { min: 3, max: 3 } }]);
    expect(regexToBlocks('^\\d{2,4}$')).toEqual([{ type: 'digits', count: { min: 2, max: 4 } }]);
    const tel = regexToBlocks('^\\+7 \\d{3} \\d{3}-\\d{2}-\\d{2}$')!;
    ok(tel, '+7 000 111-22-33');
    bad(tel, '+7 000 111 22 33');
    expect(regexToBlocks('')).toEqual([]);
  });

  it('сложные и незакреплённые regex не переводятся', () => {
    expect(regexToBlocks('^(?=x).+$')).toBeNull();
    expect(regexToBlocks('\\d{3}')).toBeNull();
    expect(regexToBlocks('^[a-z]+$')).toBeNull();
  });
});
