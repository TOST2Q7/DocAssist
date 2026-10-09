import { describe, expect, it } from 'vitest';
import { blocksMask, blocksToRegex, checkBlocks, describeBlocks, newBlock, PRESET_BLOCKS, type Block } from './blocks';
import { PRESET_BY_ID } from './format';

const re = (blocks: Block[]) => new RegExp(blocksToRegex(blocks), 'u');

describe('блоки → regex', () => {
  it('курс от 1 до 11', () => {
    const r = re([{ type: 'number', from: 1, to: 11 }]);
    expect(['1', '6', '10', '11'].every((v) => r.test(v))).toBe(true);
    expect(['0', '12', '01', ' 6'].some((v) => r.test(v))).toBe(false);
  });

  it('телефон из блоков', () => {
    const r = re(PRESET_BLOCKS.phone);
    expect(r.test('8(000)111-22-33')).toBe(true);
    expect(r.test('80001112233')).toBe(false);
  });

  it('готовые форматы из блоков ведут себя как их regex', () => {
    const samples: Record<string, string[]> = {
      phone: ['8(000)000-00-00', '8(000)000-0000', '8 (000) 000-00-00'],
      snils: ['000-000-000 00', '000-000-00000', '000000000 00'],
      inn: ['000000000000', '00000000000', '0000000000000'],
      series: ['0000', '000'],
      number: ['000000', '00000'],
      code: ['000-000', '000000'],
      card: ['00-00 000', '00-00-000'],
      course: ['1', '6', '7', '0', '11'],
      gender: ['Мужской', 'Женский', 'мужской', 'М'],
      form: ['очная', 'заочная', 'очно-заочная', 'Очная'],
      yesno: ['Да', 'Нет', 'да'],
      vk: ['https://vk.com/username', 'https://vk.ru/user_1', 'vk.com/x', 'https://vk.com/'],
      text: ['Текст', 'Два слова', ' лишний', 'два  пробела'],
    };
    for (const [id, vals] of Object.entries(samples)) {
      const preset = new RegExp(PRESET_BY_ID.get(id)!.regex, 'u');
      const blocks = re(PRESET_BLOCKS[id]);
      for (const v of vals) expect(blocks.test(v), `${id}: ${v}`).toBe(preset.test(v));
    }
  });

  it('символы: с заглавной, латиница, свои символы, количество', () => {
    const name: Block = { type: 'chars', ru: true, en: false, digits: false, extra: '', case: 'cap', count: { min: 2, max: null } };
    expect(re([name]).test('Иванов')).toBe(true);
    expect(re([name]).test('иванов')).toBe(false);
    expect(re([name]).test('И')).toBe(false);
    const login: Block = { type: 'chars', ru: false, en: true, digits: true, extra: '_.-]', case: 'lower', count: { min: 3, max: 8 } };
    expect(re([login]).test('a.b_c-]')).toBe(true);
    expect(re([login]).test('ab')).toBe(false);
    expect(re([login]).test('ABC')).toBe(false);
  });

  it('необязательный блок', () => {
    const r = re([{ type: 'digits', count: { min: 2, max: 2 } }, { type: 'text', text: '-кв', optional: true }, { type: 'digits', count: { min: 3, max: 3 }, optional: true }]);
    expect(['12', '12-кв', '12-кв345', '12345'].every((v) => r.test(v))).toBe(true);
    expect(['1', '12-к', '1234'].some((v) => r.test(v))).toBe(false);
  });

  it('спецсимволы в тексте экранируются', () => {
    expect(re([{ type: 'text', text: 'a.b(c)+' }]).test('a.b(c)+')).toBe(true);
    expect(re([{ type: 'text', text: 'a.b' }]).test('axb')).toBe(false);
  });

  it('маска для исправления из блоков', () => {
    expect(blocksMask(PRESET_BLOCKS.phone)).toBe('8(999)999-99-99');
    expect(blocksMask(PRESET_BLOCKS.snils)).toBe('999-999-999 99');
    expect(blocksMask(PRESET_BLOCKS.course)).toBeUndefined();
  });

  it('описание и проверка блоков', () => {
    expect(describeBlocks(PRESET_BLOCKS.code)).toBe('3 цифры + «-» + 3 цифры');
    expect(describeBlocks([{ type: 'number', from: 1, to: 11 }])).toBe('число от 1 до 11');
    expect(checkBlocks([{ ...newBlock('chars'), ru: false } as Block])).toEqual(['Блок 1: не выбрано, какие символы']);
    expect(checkBlocks([{ type: 'text', text: '' }])).toHaveLength(1);
  });
});
