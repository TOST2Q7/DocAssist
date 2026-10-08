import { describe, expect, it } from 'vitest';
import { checkAddress } from './check';
import { Gazetteer } from './gazetteer';
import { findGlues } from './glue';
import { parseAddress } from './parse';
import { BUILTIN_TEMPLATES } from './template';

const gaz = new Gazetteer();
const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;
const codes = (r: ReturnType<typeof checkAddress>) => r.issues.map((i) => i.code);

describe('разбор адреса', () => {
  it('правильный адрес регистрации', () => {
    const r = parseAddress('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1', gaz);
    expect(r.components.map((c) => [c.level, c.name])).toEqual([
      ['index', '655700'],
      ['region', 'Хакасия'],
      ['settlement', 'Аскиз'],
      ['street', 'Ленина'],
      ['house', '1'],
    ]);
  });

  it('место рождения без запятых, от мелкого к крупному', () => {
    const r = parseAddress('с. Аскиз Аскизский р-н Республика Хакасия Россия', gaz);
    expect(r.components.map((c) => [c.level, c.name])).toEqual([
      ['settlement', 'Аскиз'],
      ['district', 'Аскизский'],
      ['region', 'Хакасия'],
      ['country', 'Россия'],
    ]);
  });
});

describe('проверка адреса', () => {
  it('эталон из ТЗ проходит без замечаний', () => {
    const v = '655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1';
    const r = checkAddress(v, tpl('registration'), gaz);
    expect(r.issues).toEqual([]);
    expect(r.suggestion).toBe(v);
  });

  it('место рождения из ТЗ проходит без замечаний', () => {
    const v = 'с. Аскиз Аскизский р-н Республика Хакасия Россия';
    const r = checkAddress(v, tpl('birthplace'), gaz);
    expect(r.issues).toEqual([]);
  });

  it('плохой адрес из ТЗ: находим все огрехи и предлагаем исправление', () => {
    const r = checkAddress('Респ. хакасия ул. Ленина, село Аскиз,  дом 1', tpl('residence'), gaz);
    expect(r.suggestion).toBe('Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1');
    const c = codes(r);
    expect(c).toContain('double-space');
    expect(c).toContain('name-case');
    expect(c).toContain('type-form'); // село → с., дом → д.
    expect(c).toContain('order');
    expect(c).toContain('missing-comma');
  });

  it('для адреса регистрации индекс обязателен', () => {
    const r = checkAddress('Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1', tpl('registration'), gaz);
    expect(codes(r)).toContain('missing-index');
  });

  it('город из другого региона — ошибка дерева', () => {
    const r = checkAddress('Респ. Тыва, г. Абакан, ул. Ленина, д. 1', tpl('residence'), gaz);
    const conflict = r.issues.find((i) => i.code === 'tree-conflict');
    expect(conflict?.severity).toBe('error');
    expect(conflict?.message).toContain('Хакасия');
    expect(r.suggestion).toBe('Респ. Хакасия, г. Абакан, ул. Ленина, д. 1');
  });

  it('регион не указан — берём из дерева', () => {
    const r = checkAddress('г. Абакан, ул. Ленина, д. 1', tpl('residence'), gaz);
    expect(codes(r)).toContain('missing-region');
    expect(r.suggestion).toBe('Респ. Хакасия, г. Абакан, ул. Ленина, д. 1');
  });

  it('тип без точки и слипшиеся слова', () => {
    const r = checkAddress('Респ. Хакасия, г.Абакан, ул Ленина, д.1', tpl('residence'), gaz);
    expect(r.issues.filter((i) => i.category === 'glued')).toHaveLength(2);
    expect(codes(r)).toContain('type-dot');
    expect(r.suggestion).toBe('Респ. Хакасия, г. Абакан, ул. Ленина, д. 1');
  });

  it('тип по справочнику отличается («п.» вместо «с.»)', () => {
    const r = checkAddress('Респ. Хакасия, п. Аскиз, ул. Ленина, д. 1', tpl('residence'), gaz);
    expect(codes(r)).toContain('type-mismatch');
    expect(r.suggestion).toBe('Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1');
  });

  it('латинская буква в названии', () => {
    const r = checkAddress('Респ. Хакасия, г. Aбакан, ул. Ленина, д. 1', tpl('residence'), gaz);
    expect(codes(r)).toContain('mixed-script');
    expect(r.suggestion).toBe('Респ. Хакасия, г. Абакан, ул. Ленина, д. 1');
  });

  it('неизвестный населённый пункт — предложение добавить в справочник', () => {
    const r = checkAddress('Респ. Хакасия, Аскизский р-н, с. Новоселово, ул. Мира, д. 3', tpl('residence'), gaz);
    const add = r.issues.find((i) => i.action?.kind === 'add-to-dictionary');
    expect(add?.action?.parentLabel).toBe('Аскизский р-н, Респ. Хакасия');
    expect(add?.action?.type).toBe('s');
  });

  it('прилагательные регионы и «- Кузбасс»', () => {
    const r = checkAddress('Кемеровская область - Кузбасс, г. Новокузнецк, ул. Кирова, д. 5', tpl('residence'), gaz);
    expect(r.suggestion).toBe('Кемеровская обл. - Кузбасс, г. Новокузнецк, ул. Кирова, д. 5');
    expect(codes(r)).not.toContain('tree-conflict');
  });

  it('индекс не из региона', () => {
    const r = checkAddress('125000, Респ. Хакасия, г. Абакан, ул. Ленина, д. 1', tpl('registration'), gaz);
    expect(codes(r)).toContain('index-region');
  });
});

describe('слипшиеся слова', () => {
  it('находит разные виды', () => {
    const g = findGlues('РеспубликаХакасия, с.Аскиз,ул. Ленина1, д.1', { isKnownName: (w) => gaz.hasName(w) });
    expect(g.map((x) => x.fixed)).toEqual(['Республика Хакасия', 'с. Аскиз', ', ', 'Ленина 1', 'д. 1']);
  });

  it('не трогает «г.о.» и нормальный текст', () => {
    expect(findGlues('г.о. Абакан, ул. 8 Марта, д. 12а')).toEqual([]);
  });
});
