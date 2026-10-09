import { describe, expect, it } from 'vitest';
import { learnValue, rankSuggestions, suggestDocType, type SuggestDoc } from './suggest';

const learnAll = (pairs: [string, string | undefined, string][]): SuggestDoc => pairs.reduce((d, [k, kind, v]) => learnValue(d, k, kind, v), suggestDocType.empty());

describe('словарь подсказок', () => {
  it('запоминает, считает повторы, убирает лишние пробелы', () => {
    const d = learnAll([
      ['person.firstName', 'name', 'Имя'],
      ['person.firstName', 'name', '  Имя '],
      ['person.firstName', 'name', 'Имяслав'],
    ]);
    expect(d.items).toHaveLength(2);
    expect(d.items[0]).toMatchObject({ value: 'Имя', count: 2 });
  });

  it('выключен — ничего не запоминает', () => {
    expect(learnValue({ enabled: false, items: [] }, 'k', undefined, 'x').items).toEqual([]);
  });

  it('подсказывает лучшие совпадения: своё поле, начало, частота', () => {
    const d = learnAll([
      ['person.firstName', 'name', 'Мария'],
      ['person.firstName', 'name', 'Марина'],
      ['person.firstName', 'name', 'Марина'],
      ['person.lastName', 'name', 'Марков'],
      ['person.phone', 'phone', '8(000)000-00-00'],
    ]);
    const r = rankSuggestions(d.items, { key: 'person.firstName', kind: 'name', text: 'мар' }).map((x) => x.value);
    expect(r).toEqual(['Марина', 'Мария', 'Марков']);
    // Телефон в поле имени не подсказывается.
    expect(rankSuggestions(d.items, { key: 'person.firstName', kind: 'name', text: '8' })).toEqual([]);
    // То, что уже набрано целиком, не предлагается.
    expect(rankSuggestions(d.items, { key: 'person.firstName', kind: 'name', text: 'Мария' }).map((x) => x.value)).not.toContain('Мария');
  });

  it('совпадение с началом слова: «Примерн» находит адрес', () => {
    const d = learnAll([['person.regAddress', 'address', '000000, Респ. Регион, с. Примерное, ул. Примерная, д. 1']]);
    expect(rankSuggestions(d.items, { key: 'person.factAddress', kind: 'address', text: 'примерн' })).toHaveLength(1);
  });
});
