import { describe, expect, it } from 'vitest';
import { candidateFileNames, fullFio, shortFio } from './manual';

describe('названия файлов кандидата', () => {
  it('ФИО полностью и с инициалами', () => {
    expect(fullFio('  примеров  пример примерович ')).toBe('Примеров Пример Примерович');
    expect(shortFio('Примеров Пример Примерович')).toBe('Примеров П.П.');
    expect(shortFio('Фамилия имя')).toBe('Фамилия И.');
    expect(shortFio('Фамилия')).toBe('Фамилия');
    expect(shortFio('   ')).toBe('');
  });

  it('как на рисунках пособия', () => {
    const names = candidateFileNames('Примеров Пример Примерович', 2024).map((n) => n.name);
    expect(names).toContain('Примеров Пример Примерович');
    expect(names).toContain('1.1. Примеров П.П. - Паспорт');
    expect(names).toContain('5. Примеров П.П. - Справка с места учебы 2024');
    expect(names).toContain('Примеров П.П. - Учетная карточка члена организации');
    expect(candidateFileNames('', 2024)).toEqual([]);
  });
});
