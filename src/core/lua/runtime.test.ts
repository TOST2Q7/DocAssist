import { describe, expect, it } from 'vitest';
import { LuaStop, LuaUserError, LuaVM, multi } from './runtime';

describe('Lua: среда выполнения', () => {
  const out: string[] = [];
  const vm = new LuaVM({
    report: (t: string) => void out.push(t),
    upper: (s: string) => s.toUpperCase(),
    pair: () => multi('а', 'б'),
    fail: () => {
      throw new LuaUserError('нельзя так');
    },
    stop: () => {
      throw new LuaStop();
    },
    lib: { twice: (f: (x: number) => number, x: number) => f(f(x)) },
    info: () => ({ name: 'Курс', list: ['a', 'b'], n: 2 }),
  });

  it('запуск с переменными, вызовы JS, русский текст', () => {
    const c = vm.compile('report(upper(value) .. " " .. #list .. " " .. tostring(n))', 'Тест');
    expect(c.ok).toBe(true);
    out.length = 0;
    expect(vm.run((c as { ref: number }).ref, { value: 'ёжик', list: [1, 2, 3], n: 5 })).toEqual({ ok: true, stopped: false });
    expect(out).toEqual(['ЁЖИК 3 5']);
  });

  it('свои переменные скрипта не переходят между запусками', () => {
    const c = vm.compile('count = (count or 0) + 1; report(tostring(count))', 'Счёт') as { ref: number };
    out.length = 0;
    vm.run(c.ref, {});
    vm.run(c.ref, {});
    expect(out).toEqual(['1', '1']);
  });

  it('таблицы, функции Lua в JS, несколько результатов', () => {
    const c = vm.compile('local t = info(); local a, b = pair(); report(t.name .. t.list[2] .. a .. b .. lib.twice(function(x) return x * 3 end, 2))', 'Т') as { ref: number };
    out.length = 0;
    expect(vm.run(c.ref, {})).toMatchObject({ ok: true });
    expect(out).toEqual(['Курсbаб18']);
  });

  it('ошибки по-русски со строкой', () => {
    const syntax = vm.compile('if value == "1"\n  report("x")\nend', 'Курс');
    expect(syntax).toMatchObject({ ok: false, error: { line: 2 } });
    expect((syntax as { error: { message: string } }).error.message).toMatch(/нужно «then»/);
    const c = vm.compile('\nreprot("x")', 'Курс') as { ref: number };
    const r = vm.run(c.ref, {});
    expect(r).toMatchObject({ ok: false, error: { line: 2 } });
    expect((r as { error: { message: string } }).error.message).toMatch(/нет такой функции «reprot»/);
    const f = vm.compile('fail()', 'Ф') as { ref: number };
    expect((vm.run(f.ref, {}) as { error: { message: string } }).error.message).toMatch('нельзя так');
  });

  it('stop() — без ошибки; бесконечный цикл обрывается', () => {
    const s = vm.compile('stop(); report("не дойдёт")', 'С') as { ref: number };
    out.length = 0;
    expect(vm.run(s.ref, {})).toEqual({ ok: true, stopped: true });
    expect(out).toEqual([]);
    const loop = vm.compile('while true do end', 'Цикл') as { ref: number };
    const r = vm.run(loop.ref, {});
    expect(r.ok).toBe(false);
    expect((r as { error: { message: string } }).error.message).toMatch(/бесконечный цикл/);
  });

  it('нет доступа к файлам и загрузке кода', () => {
    const c = vm.compile('report(type(io) .. type(os) .. type(load) .. type(require) .. type(string.upper))', 'П') as { ref: number };
    out.length = 0;
    vm.run(c.ref, {});
    expect(out).toEqual(['nilnilnilnilfunction']);
  });

  it('библиотека пользователя видна всем скриптам', () => {
    const lib = vm.defineLibrary('function is_even(n) return n % 2 == 0 end\nLIMIT = 3');
    expect(lib).toEqual({ ok: true, functions: ['is_even'] });
    const c = vm.compile('report(tostring(is_even(4)) .. LIMIT)', 'Б') as { ref: number };
    out.length = 0;
    vm.run(c.ref, {});
    expect(out).toEqual(['true3']);
    expect(vm.callLibrary('is_even', 3)).toEqual({ ok: true, value: false });
  });

  it('print собирается для показа', () => {
    const c = vm.compile('print("значение:", value, 1.5, nil)', 'P') as { ref: number };
    vm.run(c.ref, { value: 'x' });
    expect(vm.printed).toEqual(['значение:\tx\t1.5\tnil']);
  });
});
