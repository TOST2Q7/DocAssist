import { describe, expect, it } from 'vitest';
import { isPersonField, learnValue, peopleSuggestions, rankSuggestions, suggestDocType, type SuggestDoc } from './suggest';

const learnAll = (pairs: [string, string | undefined, string][]): SuggestDoc => pairs.reduce((d, [k, kind, v]) => learnValue(d, k, kind, v), suggestDocType.empty());

describe('словарь подсказок', () => {
  it('запоминает, считает повторы, убирает лишние пробелы', () => {
    const d = learnAll([
      ['commander.name', 'name', 'Имя'],
      ['commander.name', 'name', '  Имя '],
      ['commander.name', 'name', 'Имяслав'],
    ]);
    expect(d.items).toHaveLength(2);
    expect(d.items[0]).toMatchObject({ value: 'Имя', count: 2 });
  });

  it('выключен — ничего не запоминает', () => {
    expect(learnValue({ enabled: false, items: [] }, 'k', undefined, 'x').items).toEqual([]);
  });

  it('подсказывает лучшие совпадения: своё поле, начало, частота', () => {
    const d = learnAll([
      ['commander.first', 'name', 'Мария'],
      ['commander.first', 'name', 'Марина'],
      ['commander.first', 'name', 'Марина'],
      ['commander.last', 'name', 'Марков'],
      ['staff.phone', 'phone', '8(000)000-00-00'],
    ]);
    const r = rankSuggestions(d.items, { key: 'commander.first', kind: 'name', text: 'мар' }).map((x) => x.value);
    expect(r).toEqual(['Марина', 'Мария', 'Марков']);
    // Телефон в поле имени не подсказывается.
    expect(rankSuggestions(d.items, { key: 'commander.first', kind: 'name', text: '8' })).toEqual([]);
    // То, что уже набрано целиком, не предлагается.
    expect(rankSuggestions(d.items, { key: 'commander.first', kind: 'name', text: 'Мария' }).map((x) => x.value)).not.toContain('Мария');
  });

  it('совпадение с началом слова: «Примерн» находит адрес', () => {
    const d = learnAll([['staff.address', 'address', '000000, Респ. Регион, с. Примерное, ул. Примерная, д. 1']]);
    expect(rankSuggestions(d.items, { key: 'person.factAddress', kind: 'address', text: 'примерн' })).toHaveLength(1);
  });

  it('поля людей в словарь не пишутся — подсказки для них берутся из грамоток', () => {
    expect(isPersonField('person.firstName')).toBe(true);
    expect(isPersonField('work.place')).toBe(true);
    expect(isPersonField('commander.name')).toBe(false);
    expect(learnAll([['person.firstName', 'name', 'Имя']]).items).toEqual([]);
    const items = peopleSuggestions([
      { id: 'g1', fields: { 'person.firstName': 'Имя', 'person.phone': '8(000)000-00-01', 'просто.поле': 'x' }, savedAt: '2026-01-01', source: '' },
      { id: 'g2', fields: { 'person.firstName': ' Имя ', 'person.lastName': 'Фамилия' }, savedAt: '2026-02-01', source: '' },
    ]);
    expect(items).toContainEqual({ key: 'person.firstName', kind: 'name', value: 'Имя', count: 2, last: '2026-02-01' });
    expect(items.some((x) => x.key === 'просто.поле')).toBe(false);
    // Имя подсказывается и в другом поле имён (по типу), телефон — нет.
    expect(rankSuggestions(items, { key: 'commander.first', kind: 'name', text: 'им' }).map((x) => x.value)).toEqual(['Имя']);
  });
});
