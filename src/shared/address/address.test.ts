import { describe, expect, it } from 'vitest';
import { finalize } from '../check/finalize';
import { checkAddress } from './check';
import { Gazetteer, nodeKey, type AddressDictValue } from './gazetteer';
import { findGlues } from './glue';
import { parseAddress } from './parse';
import { BUILTIN_TEMPLATES, migrateTemplateV1 } from './template';

const HAKAS = ['country:россия', 'resp:хакасия'];
const BIRIK = [...HAKAS, 'rn:аскизский', 's:аскиз'];
// Справочник «после подтверждения»: улица и индекс Аскиза, улица Ленина в Абакане.
const user: AddressDictValue[] = [
  { name: 'Ленина', type: 'ul', parentPath: BIRIK },
  { op: 'postal', path: BIRIK, index: '655700' },
  { name: 'Ленина', type: 'ul', parentPath: [...HAKAS, 'g:абакан'] },
];
const gaz = new Gazetteer(user);
const bare = new Gazetteer();
const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;
const check = (v: string, id = 'registration', g = gaz) => finalize(v, checkAddress(v, tpl(id), g));
const codes = (v: string, id?: string, g?: Gazetteer) => check(v, id, g).issues.map((i) => i.code);
const messages = (v: string, id?: string) => check(v, id).issues.map((i) => i.message);

describe('разбор', () => {
  it('части адреса', () => {
    const r = parseAddress('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1', gaz);
    expect(r.components.map((c) => [c.level, c.name])).toEqual([
      ['index', '655700'],
      ['region', 'Хакасия'],
      ['settlement', 'Аскиз'],
      ['street', 'Ленина'],
      ['house', '1'],
    ]);
  });
});

describe('эталоны из ТЗ проходят', () => {
  it('адрес регистрации', () => expect(check('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1').issues).toEqual([]));
  it('адрес проживания', () => expect(check('Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1', 'residence').issues).toEqual([]));
  it('место рождения', () => expect(check('с. Аскиз Аскизский р-н Республика Хакасия Россия', 'birthplace').issues).toEqual([]));
});

describe('шаг влево/вправо — ошибка', () => {
  it('лишнее слово в улице и в селе', () => {
    expect(messages('655700, Респ. Хакасия, с. Аскиз, ул. Ленина Привет, д. 1')).toEqual(['Лишнее: «Привет»']);
    expect(messages('655700, Респ. Хакасия, с. Аскиз Мир, ул. Ленина, д. 1')).toContain('Лишнее: «Мир»');
  });
  it('лишние знаки', () => {
    expect(messages('655700, Респ.. Хакасия, с. Аскиз, ул. Ленина, д. 1.')).toEqual(['Лишний знак «.»', 'Лишний знак «.»']);
    expect(messages('655700, Респ. Хакасия,, с. Аскиз, ул. Ленина, д. 1')).toEqual(['Лишний знак «,»']);
  });
  it('запрещённая часть: район в адресе регистрации', () => {
    const r = check('655700, Респ. Хакасия, Аскизский р-н, с. Аскиз, ул. Ленина, д. 1');
    expect(r.issues.map((i) => i.code)).toEqual(['extra-part']);
    expect(r.canonical).toBe('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1');
  });
  it('запрещённая часть: индекс в адресе проживания', () => {
    expect(codes('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1', 'residence')).toEqual(['extra-part']);
  });
  it('место рождения без района — ошибка с исправлением', () => {
    const r = check('с. Аскиз Республика Хакасия Россия', 'birthplace');
    expect(r.issues.map((i) => i.code)).toEqual(['missing-district']);
    expect(r.issues[0].fix).toBe('с. Аскиз Аскизский р-н Республика Хакасия Россия');
  });
  it('плохой адрес из ТЗ', () => {
    const v = 'Респ. хакасия ул. Ленина, село Аскиз,  дом 1';
    const r = check(v, 'residence');
    expect(r.canonical).toBe('Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1');
    const m = r.issues.map((i) => i.message);
    expect(m).toContain('Регистр: «хакасия» → «Хакасия»');
    expect(m).toContain('«село» → «с.»');
    expect(m).toContain('«дом» → «д.»');
    expect(m).toContain('Лишний пробел');
    expect(m).toContain('Не хватает запятой');
    expect(r.issues.some((i) => i.code === 'order')).toBe(true);
  });
  it('конфликт с деревом', () => {
    const r = check('Респ. Тыва, г. Абакан, ул. Ленина, д. 1', 'residence');
    expect(r.issues.map((i) => i.code)).toContain('tree-conflict');
    expect(r.canonical).toBe('Респ. Хакасия, г. Абакан, ул. Ленина, д. 1');
  });
  it('тип по справочнику', () => {
    const r = check('655700, Респ. Хакасия, п. Аскиз, ул. Ленина, д. 1');
    expect(r.issues.map((i) => i.code)).toContain('type-mismatch');
    expect(r.canonical).toBe('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1');
  });
  it('буква дома и номер', () => {
    expect(check('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1 А').canonical).toBe('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1а');
    expect(codes('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1/а/б')).toEqual(['number-format']);
  });
  it('индекс не того региона', () => {
    expect(codes('125000, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1')).toContain('index-region');
  });
  it('нет обязательных частей', () => {
    expect(codes('Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1')).toContain('missing-index');
    expect(codes('655700, Респ. Хакасия, с. Аскиз, д. 1')).toContain('missing-street');
    expect(codes('655700, Респ. Хакасия, с. Аскиз, ул. Ленина')).toContain('missing-house');
  });
  it('слипшиеся слова — отдельная категория', () => {
    const r = check('655700, Респ. Хакасия, с.Аскиз, ул. Ленина, д.1');
    expect(r.issues.map((i) => i.category)).toEqual(['glued', 'glued']);
  });
});

describe('справочник: неизвестное — подтвердить', () => {
  it('новая улица и индекс', () => {
    const r = check('655700, Респ. Хакасия, с. Аскиз, ул. Ленина, д. 1', 'registration', bare);
    expect(r.issues.map((i) => [i.code, i.level])).toEqual([
      ['street-unknown', 'confirm'],
      ['index-unknown', 'confirm'],
    ]);
    const street = r.issues[0].action;
    expect(street).toMatchObject({ kind: 'add-place', name: 'Ленина', type: 'ul', parentPath: BIRIK });
  });
  it('новое село: улица и индекс будут привязаны к нему', () => {
    const r = check('655730, Респ. Хакасия, Аскизский р-н, с. Новоселово, ул. Мира, д. 3', 'full-words', bare);
    const kinds = r.issues.filter((i) => i.level === 'confirm').map((i) => i.code);
    expect(kinds).toEqual(['locality-unknown', 'street-unknown', 'index-unknown']);
    const streetAction = r.issues.find((i) => i.code === 'street-unknown')!.action as { parentPath: string[] };
    expect(streetAction.parentPath).toEqual([...HAKAS, 'rn:аскизский', nodeKey('s', 'Новоселово')]);
  });
  it('после подтверждения всё проходит (многопроходная загрузка)', () => {
    const g = new Gazetteer([
      { name: 'Мира', type: 'ul', parentPath: [...HAKAS, 'rn:аскизский', 's:новоселово'] },
      { op: 'postal', path: [...HAKAS, 'rn:аскизский', 's:новоселово'], index: '655730' },
      { name: 'Новоселово', type: 's', parentPath: [...HAKAS, 'rn:аскизский'] },
    ]);
    expect(check('655730, Республика Хакасия, Аскизский район, село Новоселово, улица Мира, дом 3', 'full-words', g).issues).toEqual([]);
  });
});

describe('шаблоны', () => {
  it('перенос шаблона из версии 0.1', () => {
    const t = migrateTemplateV1({
      id: 'x', name: 'Мой', order: 'big-to-small', separator: ', ', typeStyle: 'short', regionStyle: 'short',
      index: 'optional', country: 'never', region: 'required', district: 'keep', house: 'required',
    });
    expect(t.parts).toMatchObject({ index: 'optional', district: 'optional', street: 'required', house: 'required' });
  });
});

describe('слипшиеся слова', () => {
  it('находит разные виды', () => {
    const g = findGlues('РеспубликаХакасия, с.Аскиз,ул. Ленина1, д.1', { isKnownName: (w) => gaz.hasName(w) });
    expect(g.map((x) => x.fixed)).toEqual(['Республика Хакасия', 'с. Аскиз', ', ', 'Ленина 1', 'д. 1']);
  });
  it('не трогает «г.о.» и нормальный текст', () => expect(findGlues('г.о. Абакан, ул. 8 Марта, д. 12а')).toEqual([]));
});
