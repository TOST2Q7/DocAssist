import { describe, expect, it } from 'vitest';
import { candidateFileNames, fullFio, shortFio } from './manual';

describe('названия файлов кандидата', () => {
  it('ФИО полностью и с инициалами', () => {
    expect(fullFio('  иванов  иван иванович ')).toBe('Иванов Иван Иванович');
    expect(shortFio('Иванов Иван Иванович')).toBe('Иванов И.И.');
    expect(shortFio('Петров петр')).toBe('Петров П.');
    expect(shortFio('Сергеев')).toBe('Сергеев');
    expect(shortFio('   ')).toBe('');
  });

  it('как на рисунках пособия', () => {
    const names = candidateFileNames('Иванов Иван Иванович', 2024).map((n) => n.name);
    expect(names).toContain('Иванов Иван Иванович');
    expect(names).toContain('1.1. Иванов И.И. - Паспорт');
    expect(names).toContain('5. Иванов И.И. - Справка с места учебы 2024');
    expect(names).toContain('Иванов И.И. - Учетная карточка члена организации');
    expect(candidateFileNames('', 2024)).toEqual([]);
  });
});
