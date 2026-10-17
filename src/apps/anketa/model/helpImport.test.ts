import { describe, expect, it } from 'vitest';
import { BaseTree, type Step } from '@/core/base/tree';
import { ALL_INSTITUTIONS, INSTITUTIONS } from '@/content/help/institutions';
import { AnketaChecker } from '../lua/checker';
import { resolveChecks, type AnketaChecks } from './checks';
import { planHelpImport } from './helpImport';

const checker = (checks?: AnketaChecks) => new AnketaChecker(resolveChecks(checks));
const specialtySettings = (settings: Record<string, boolean>): AnketaChecks => ({ fields: { 'edu.specialty': { settings } } });

describe('учебные заведения из справки', () => {
  it('приложения 1–5: пять городов, у каждого заведения есть направления, без повторов', () => {
    expect(INSTITUTIONS.map((c) => c.city)).toEqual(['Абакан', 'Красноярск', 'Минусинск', 'Саяногорск', 'Черногорск']);
    expect(new Set(ALL_INSTITUTIONS.map((i) => i.short)).size).toBe(ALL_INSTITUTIONS.length);
    for (const i of ALL_INSTITUTIONS) {
      expect(i.specialties.length, i.short).toBeGreaterThan(0);
      expect(new Set(i.specialties).size, i.short).toBe(i.specialties.length);
      for (const s of i.specialties) expect(s, s).not.toMatch(/[.;]$|\s{2}|^\s|\s$/);
    }
  });

  it('по умолчанию: направления — внутри своего заведения в древе «Место учебы»', () => {
    const plan = planHelpImport(checker(), ALL_INSTITUTIONS);
    expect([...plan.trees.keys()]).toEqual(['Место учебы']);
    expect(plan.unused).toEqual([]);
    expect(plan.institutions).toBe(ALL_INSTITUTIONS.length);
    const paths = plan.trees.get('Место учебы')!;
    expect(paths).toContainEqual([{ k: 'edu.institution', v: 'ФГБОУ ВО «ХГУ им. Н.Ф. Катанова», ИТИ' }]);
    expect(paths).toContainEqual([
      { k: 'edu.institution', v: 'ГБПОУ РХ «ЧТОТ»' },
      { k: 'edu.specialty', v: '13249 Кухонный рабочий' },
    ]);
    // Неполный код в пособии — не проходит проверку и не попадает в базу.
    expect(plan.skipped.map((s) => s.value)).toEqual(['3.02.1 Гостиничное дело']);
  });

  it('без «своё для каждого места учебы» — направления отдельным списком', () => {
    const plan = planHelpImport(checker(specialtySettings({ 'Своё для каждого места учебы': false })), ALL_INSTITUTIONS);
    const flat = plan.trees.get('Направление обучения (с кодом специальности)')!;
    expect(flat).toContainEqual([{ k: 'edu.specialty', v: '42.03.02 Журналистика' }]);
    expect(plan.trees.get('Место учебы')!.every((p) => p.length === 1)).toBe(true);
  });

  it('без кодов профессий — «00000 Название» не проходит', () => {
    const plan = planHelpImport(checker(specialtySettings({ 'Код профессии из 5 цифр («00000 Название»)': false })), ALL_INSTITUTIONS);
    expect(plan.skipped.map((s) => s.value)).toEqual(expect.arrayContaining(['13249 Кухонный рабочий', '19601 Швея']));
  });
});

describe('проверка «Направление обучения»', () => {
  const run = (value: string, institution: string, trees: Record<string, Step[][]> = {}) =>
    checker().test('edu.specialty', value, { trees: new Map(Object.entries(trees).map(([n, p]) => [n, new BaseTree(p.map((path, i) => ({ id: String(i), path, addedAt: '', source: 'test' })))])) }, { 'edu.institution': institution })
      .result;

  it('код специальности или код профессии; иначе — ошибка', () => {
    expect(run('09.02.07 Информационные системы и программирование', 'ГБПОУ РХ «ХПК»').status).toBe('warn');
    expect(run('19601 Швея', 'ГБПОУ РХ «ЧТОТ»').status).toBe('warn');
    expect(run('09.02.07 информационные системы', 'ГБПОУ РХ «ХПК»').status).toBe('error');
    expect(run('Информационные системы', 'ГБПОУ РХ «ХПК»').status).toBe('error');
  });

  it('сверяется со списком своего учебного заведения', () => {
    const trees = { 'Место учебы': [[{ k: 'edu.institution', v: 'ГБПОУ РХ «ХПК»' }, { k: 'edu.specialty', v: '35.02.03 Технология деревообработки' }]] };
    expect(run('35.02.03 Технология деревообработки', 'ГБПОУ РХ «ХПК»', trees).status).toBe('ok');
    const other = run('35.02.03 Технология деревообработки', 'ГБПОУ РХ «ХМТ»', trees);
    expect(other.status).toBe('warn');
    expect(other.confirm?.base).toMatchObject({ tree: 'Место учебы', path: [{ k: 'edu.institution', v: 'ГБПОУ РХ «ХМТ»' }, { k: 'edu.specialty', v: '35.02.03 Технология деревообработки' }] });
  });
});
