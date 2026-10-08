import { describe, expect, it } from 'vitest';
import { checkDate } from './dates';
import { describeHunk, diffHunks } from './diff';
import { checkEnum } from './enum';
import { finalize } from './finalize';
import { fillMask, maskDigits, showMask } from './mask';

const msgs = (value: string, canonical: string) => finalize(value, { canonical, issues: [] }).issues.map((i) => i.message);

describe('строгий вердикт: любое отличие от шаблона — ошибка', () => {
  it('совпадение — ошибок нет', () => {
    expect(finalize('abc', { canonical: 'abc', issues: [] }).issues).toEqual([]);
  });

  it('лишнее слово', () => {
    expect(msgs('ул. Ленина Привет', 'ул. Ленина')).toEqual(['Лишнее: «Привет»']);
  });

  it('лишние знаки и пробелы', () => {
    expect(msgs('Респ.. Хакасия', 'Респ. Хакасия')).toEqual(['Лишний знак «.»']);
    expect(msgs('19-00 000 ', '19-00 000')).toEqual(['Лишний пробел']);
    expect(msgs('с.  Аскиз', 'с. Аскиз')).toEqual(['Лишний пробел']);
    expect(msgs('МВД!!', 'МВД')).toEqual(['Лишнее: «!!»']);
  });

  it('недостающая запятая и пробел', () => {
    expect(msgs('Респ. Хакасия с. Аскиз', 'Респ. Хакасия, с. Аскиз')).toEqual(['Не хватает запятой']);
    expect(msgs('д.1', 'д. 1')).toEqual(['Не хватает пробела']);
  });

  it('регистр, сокращения, латиница, неразрывный пробел', () => {
    expect(msgs('хакасия', 'Хакасия')).toEqual(['Регистр: «хакасия» → «Хакасия»']);
    expect(msgs('село Аскиз', 'с. Аскиз')).toEqual(['«село» → «с.»']);
    expect(msgs('Ивaнов', 'Иванов')).toEqual(['Латинские буквы вместо русских в «Ивaнов»']);
    expect(msgs('с. Аскиз', 'с. Аскиз')).toEqual(['Лишний символ: неразрывный пробел']);
  });

  it('подсветка указывает на место отличия', () => {
    const h = diffHunks('ул. Ленина Привет', 'ул. Ленина');
    expect(h).toHaveLength(1);
    expect('ул. Ленина Привет'.slice(h[0].start, h[0].end)).toBe(' Привет');
    expect(describeHunk({ del: '', ins: ', ', start: 5, end: 5 }).message).toBe('Не хватает запятой');
  });

  it('если правильную форму построить нельзя — ошибка', () => {
    expect(finalize('что-то', { issues: [] }).issues[0].code).toBe('template');
  });

  it('уже объяснённые отличия не дублируются', () => {
    const r = finalize('ул.Ленина', {
      canonical: 'ул. Ленина',
      issues: [{ code: 'glued', level: 'error', category: 'glued', message: 'Слиплось', span: [0, 13] }],
    });
    expect(r.issues.map((i) => i.code)).toEqual(['glued']);
  });
});

describe('маски', () => {
  it('подстановка цифр', () => {
    expect(fillMask('9000000000', '8(999)999-99-99')).toBe('8(900)000-00-00');
    expect(fillMask('190000', '99-99 999')).toBeNull();
    expect(fillMask('1900000', '99-99 999')).toBe('19-00 000');
    expect(maskDigits('999-999-999 99')).toBe(11);
    expect(showMask('8(999)999-99-99')).toBe('8(XXX)XXX-XX-XX');
  });
});

describe('даты', () => {
  const now = { y: 2026, m: 10, d: 8 };
  const v = (value: string, extra: Partial<Parameters<typeof checkDate>[1]> = {}) =>
    finalize(value, checkDate(value, { required: true, future: 'error', now, ...extra }));

  it('правильная дата', () => expect(v('01.01.2000').issues).toEqual([]));
  it('без ведущих нулей — ошибка с исправлением', () => {
    const r = v('8.3.2007');
    expect(r.issues[0].level).toBe('error');
    expect(r.canonical).toBe('01.01.2000');
  });
  it('год из двух цифр', () => expect(v('08.03.07').issues.map((i) => i.message)).toEqual(['«07» → «2007»']));
  it('несуществующая и будущая даты', () => {
    expect(v('31.02.2007').issues[0].code).toBe('date-invalid');
    expect(v('08.03.2030').issues[0].code).toBe('date-future');
  });
  it('заглушка «нет даты»', () => {
    expect(v('00.00.0000', { required: false, placeholder: '00.00.0000' }).issues).toEqual([]);
    expect(v('', { required: false, placeholder: '00.00.0000' }).issues[0].fix).toBe('00.00.0000');
  });
  it('отметка времени', () => {
    const r = v('7.11.2025 17:50', { withTime: true });
    expect(r.canonical).toBe('01.09.2025 17:50:00');
    expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe('списки', () => {
  const gender = { id: 'g', title: 'Пол', values: ['Мужской', 'Женский'], aliases: { м: 'Мужской' }, closed: true };
  const pos = { id: 'p', title: 'Должность', values: ['Кандидат', 'Боец'], closed: false };
  const f = (value: string, src: typeof gender | typeof pos) => finalize(value, checkEnum(value, src));

  it('точное значение', () => expect(f('Мужской', gender).issues).toEqual([]));
  it('регистр — ошибка', () => expect(f('мужской', gender).issues[0].message).toBe('Регистр: «мужской» → «Мужской»'));
  it('сокращение — ошибка с исправлением', () => expect(f('м', gender).issues[0].fix).toBe('Мужской'));
  it('закрытый список: чужое значение — ошибка', () => expect(f('Другое', gender).issues[0].level).toBe('error'));
  it('открытый список: новое значение — подтвердить', () => {
    const r = f('Завхоз', pos);
    expect(r.issues[0].level).toBe('confirm');
    expect(r.issues[0].action?.kind).toBe('add-word');
  });
  it('опечатка', () => expect(f('Кандидад', pos).issues[0].fix).toBe('Кандидат'));
});
