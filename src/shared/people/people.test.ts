import { describe, expect, it } from 'vitest';
import { finalize } from '../check/finalize';
import { checkNamePart } from './check';
import { builtinPatronymic, genderByPatronymicEnding, patronymicsOf, surnameGenderForm } from './names';

const dicts = { firstNames: new Set<string>(), patronymics: new Set<string>() };
const f = (v: string, p: 'last' | 'first' | 'middle') => finalize(v, checkNamePart(v, p, dicts));

describe('отчества', () => {
  it('строятся по правилам', () => {
    expect(patronymicsOf('Евгений')[0]).toEqual(['Иванович', 'Евгеньевна']);
    expect(patronymicsOf('Дмитрий').flat()).toContain('Дмитриевич');
    expect(patronymicsOf('Сергей')[0]).toEqual(['Сергеевич', 'Сергеевна']);
    expect(patronymicsOf('Николай')[0]).toEqual(['Николаевич', 'Николаевна']);
    expect(patronymicsOf('Игорь')[0]).toEqual(['Игоревич', 'Игоревна']);
    expect(patronymicsOf('Иван')[0]).toEqual(['Иванович', 'Ивановна']);
    expect(patronymicsOf('Илья')[0]).toEqual(['Ильич', 'Ильинична']);
  });
  it('пол по отчеству', () => {
    expect(builtinPatronymic('Иванович')).toBe('Мужской');
    expect(builtinPatronymic('Петровна')).toBe('Женский');
    expect(genderByPatronymicEnding('Гусейн оглы')).toBe('Мужской');
  });
  it('форма фамилии', () => {
    expect(surnameGenderForm('Иванов')).toBe('Мужской');
    expect(surnameGenderForm('Иванова')).toBe('Женский');
    expect(surnameGenderForm('Шевченко')).toBeNull();
  });
});

describe('строгая проверка ФИО', () => {
  it('правильные значения', () => {
    expect(f('Иванов', 'last').issues).toEqual([]);
    expect(f('Иван', 'first').issues).toEqual([]);
    expect(f('Иванович', 'middle').issues).toEqual([]);
    expect(f('Иванова-Петрова', 'last').issues).toEqual([]);
  });
  it('опечатки в имени и отчестве — подтвердить', () => {
    expect(f('Ивн', 'first').issues[0].level).toBe('confirm');
    expect(f('Иваноевич', 'middle').issues[0].level).toBe('confirm');
  });
  it('подтверждённое имя проходит', () => {
    const r = finalize('Айдыр', checkNamePart('Айдыр', 'first', { firstNames: new Set(['айдыр']), patronymics: new Set() }));
    expect(r.issues).toEqual([]);
  });
  it('регистр, пробелы, латиница, цифры', () => {
    expect(f('иванов', 'last').issues[0].message).toBe('Регистр: «иванов» → «Иванов»');
    expect(f('Иванова - Петрова', 'last').canonical).toBe('Иванова-Петрова');
    expect(f('Ивaнов', 'last').issues[0].category).toBe('chars');
    expect(f('Иванов1', 'last').issues[0].message).toContain('«1»');
    expect(f('Иван ', 'first').issues[0].message).toBe('Лишний пробел');
  });
  it('пустое отчество — подтвердить', () => expect(f('', 'middle').issues[0].level).toBe('confirm'));
});
