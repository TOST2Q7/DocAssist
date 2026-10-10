import { describe, expect, it } from 'vitest';
import { textlib } from '@/core/lua/textlib';
import { resolveChecks } from '../model/checks';
import { AnketaChecker } from './checker';
import { API } from './docs';

describe('справка по Lua', () => {
  it('описывает все функции lib.* и только существующие', () => {
    const documented = API.filter((e) => e.name.startsWith('lib.')).map((e) => e.name.slice(4));
    expect(documented.sort()).toEqual(Object.keys(textlib).sort());
  });

  it('все функции среды из справки есть в Lua', () => {
    const checker = new AnketaChecker(resolveChecks(undefined));
    const names = API.filter((e) => e.group !== 'lua' && e.group !== 'lib' && /^[a-z_.]+$/.test(e.name) && !['value', 'field', 'confirmed', 'row'].includes(e.name)).map((e) => e.name);
    const code = names.map((n) => `assert(type(${n}) == "function", "${n}")`).join('\n');
    const c = checker.vm.compile(code, 'Справка');
    expect(c.ok).toBe(true);
    const r = checker.vm.run((c as { ref: number }).ref, {});
    expect(r).toEqual({ ok: true, stopped: false });
  });

  it('примеры кода в справке компилируются', () => {
    const checker = new AnketaChecker(resolveChecks(undefined));
    for (const e of API.filter((x) => x.example && !x.example.includes('…'))) {
      const c = checker.vm.compile(e.example!, e.name);
      expect(c.ok, `${e.name}: ${JSON.stringify(c)}`).toBe(true);
    }
  });
});
