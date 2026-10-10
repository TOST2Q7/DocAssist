import { lauxlib, lua, lualib, to_luastring, type LuaState } from 'fengari';

/*
 * Lua в браузере (fengari — Lua 5.3 на чистом JavaScript: работает офлайн и в одном HTML-файле).
 *
 * Песочница: только base, string, table, math, utf8 — без файлов, сети и os. Бесконечный цикл
 * обрывается по счётчику инструкций. Ошибки в коде переводятся на русский и указывают строку.
 *
 * Каждый скрипт компилируется один раз; при каждом запуске получает свежее окружение (_ENV):
 * свои переменные скрипта не переходят от строки к строке. Всё, чего нет в окружении, берётся
 * из «библиотеки» (свои функции пользователя), а дальше — из API приложения.
 */

export type LuaValue = null | undefined | boolean | number | string | LuaValue[] | { [k: string]: LuaValue } | LuaFunction;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LuaFunction = (...args: any[]) => unknown;

/** Ошибка в коде: строка (если известна) и понятное сообщение. */
export interface LuaScriptError {
  line?: number;
  message: string;
  /** Как сообщил Lua — для знатоков. */
  raw: string;
}

/** Бросить из JS-функции API — станет ошибкой Lua с этим текстом. */
export class LuaUserError extends Error {}

/** stop(): прервать скрипт без ошибки. */
export class LuaStop extends Error {}

/** Несколько результатов из JS-функции: return multi(a, b). */
export class Multi {
  constructor(readonly values: unknown[]) {}
}
export const multi = (...values: unknown[]) => new Multi(values);

export type RunResult = { ok: true; stopped: boolean } | { ok: false; error: LuaScriptError };

const STOP = '\u0000docassist-stop';
const LIMIT = 'Код выполняется слишком долго — возможно, бесконечный цикл (while/repeat без выхода)';
const REG = lua.LUA_REGISTRYINDEX;

/** Строки Lua; короткие (ключи, имена) кэшируются — они повторяются в каждом запуске. */
const keyCache = new Map<string, Uint8Array>();
const S = (s: string) => {
  if (s.length > 48) return to_luastring(s);
  let b = keyCache.get(s);
  if (!b) {
    if (keyCache.size > 5000) keyCache.clear();
    b = to_luastring(s);
    keyCache.set(s, b);
  }
  return b;
};

/** Сообщения Lua → по-русски. Неизвестные оставляются как есть. */
const MESSAGES: [RegExp, (...m: string[]) => string][] = [
  [/^attempt to call a nil value \((?:global|field|method) '([^']+)'\)/, (n) => `нет такой функции «${n}» — проверьте название (подсказки: Ctrl+Пробел)`],
  [/^attempt to call a (\w+) value \((?:global|local|field) '([^']+)'\)/, (t, n) => `«${n}» — это ${typeName(t)}, а не функция`],
  [/^attempt to index a nil value \((?:global|local|field|upvalue) '([^']+)'\)/, (n) => `«${n}» не существует (nil) — нельзя взять «${n}.что-то»`],
  [/^attempt to index a (\w+) value \((?:global|local|field) '([^']+)'\)/, (t, n) => `«${n}» — это ${typeName(t)}, у него нет полей через точку`],
  [/^attempt to concatenate a nil value \((?:global|local|field|upvalue) '([^']+)'\)/, (n) => `нельзя склеить текст с «${n}»: значения нет (nil)`],
  [/^attempt to concatenate a (\w+) value/, (t) => `нельзя склеить текст (..) с ${typeName(t, true)}`],
  [/^attempt to perform arithmetic on a nil value \((?:global|local|field|upvalue) '([^']+)'\)/, (n) => `нельзя считать с «${n}»: значения нет (nil)`],
  [/^attempt to perform arithmetic on a (\w+) value/, (t) => `нельзя считать (+ - * /) с ${typeName(t, true)} — для текста-числа используйте lib.number(...)`],
  [/^attempt to compare (\w+) with (\w+)/, (a, b) => `нельзя сравнить ${typeName(a, true)} и ${typeName(b, true)} — сначала приведите к одному виду (lib.number)`],
  [/^attempt to compare two (\w+) values/, (t) => `нельзя сравнивать ${typeName(t, true)} на больше/меньше`],
  [/^'end' expected \(to close '(\w+)' at line (\d+)\) near (.+)$/, (w, l, n) => `не хватает «end», чтобы закрыть «${w}» из строки ${l} (рядом с ${near(n)})`],
  [/^'end' expected near (.+)$/, (n) => `не хватает «end» (рядом с ${near(n)})`],
  [/^'then' expected near (.+)$/, (n) => `после условия «if … » нужно «then» (рядом с ${near(n)})`],
  [/^'do' expected near (.+)$/, (n) => `после «for/while … » нужно «do» (рядом с ${near(n)})`],
  [/^'=' expected near (.+)$/, (n) => `ожидалось «=» (рядом с ${near(n)})`],
  [/^'\)' expected(?: \(to close '\(' at line (\d+)\))? near (.+)$/, (l, n) => `не хватает закрывающей скобки «)»${l ? ` для скобки из строки ${l}` : ''} (рядом с ${near(n)})`],
  [/^'}' expected(?: \(to close '{' at line (\d+)\))? near (.+)$/, (l, n) => `не хватает «}»${l ? ` для «{» из строки ${l}` : ''} (рядом с ${near(n)})`],
  [/^unfinished string near (.+)$/, (n) => `строка не закрыта — нет второй кавычки (рядом с ${near(n)})`],
  [/^unexpected symbol near (.+)$/, (n) => `непонятный символ рядом с ${near(n)}`],
  [/^'<eof>' expected near (.+)$/, (n) => `лишнее «${near(n, true)}» — возможно, лишний «end»`],
  [/^malformed number near (.+)$/, (n) => `неправильное число рядом с ${near(n)}`],
  [/^bad argument #(\d+) to '([^']+)' \((.+)\)$/, (i, f, why) => `функция «${f}»: неправильный ${i}-й аргумент (${argWhy(why)})`],
];

const typeName = (t: string, gen = false) =>
  ({ nil: gen ? 'пустым значением (nil)' : 'пустое значение (nil)', boolean: gen ? 'да/нет (boolean)' : 'да/нет (boolean)', number: gen ? 'числом' : 'число', string: gen ? 'текстом' : 'текст', table: gen ? 'таблицей' : 'таблица', function: gen ? 'функцией' : 'функция' })[t] ?? t;
const near = (n: string, bare = false) => {
  const v = n === '<eof>' ? 'концом кода' : n.replace(/^'(.*)'$/, '$1');
  return bare || n === '<eof>' ? v : `«${v}»`;
};
const argWhy = (why: string) =>
  why
    .replace(/(\w+) expected, got (\w+)/, (_m, a: string, b: string) => `нужно ${typeName(a, false)}, а передано ${typeName(b, false)}`)
    .replace('no value', 'ничего не передано');

/** «Курс:5: attempt to …» → строка 5 и сообщение по-русски. */
export function translateError(raw: string): LuaScriptError {
  const m = /^(?:[^:\n]*):(\d+): ([\s\S]*)$/.exec(raw);
  const line = m ? Number(m[1]) : undefined;
  let text = (m ? m[2] : raw).trim();
  for (const [re, fn] of MESSAGES) {
    const x = re.exec(text);
    if (x) {
      text = fn(...x.slice(1));
      break;
    }
  }
  return { line, message: text, raw };
}

const isLuaThrow = (e: unknown) => !!e && typeof e === 'object' && !(e instanceof Error) && 'status' in e;

export class LuaVM {
  private readonly L: LuaState;
  private readonly apiRef: number;
  private libRef: number;
  /** Ссылки на функции Lua, переданные в JS во время текущего вызова. */
  private temp: number[] = [];
  private budget = 0;
  /** Сообщения print() текущего запуска. */
  printed: string[] = [];

  constructor(
    api: Record<string, unknown>,
    private readonly limit = 2_000_000,
  ) {
    const L = (this.L = lauxlib.luaL_newstate());
    for (const [name, open] of [
      ['_G', lualib.luaopen_base],
      ['string', lualib.luaopen_string],
      ['table', lualib.luaopen_table],
      ['math', lualib.luaopen_math],
      ['utf8', lualib.luaopen_utf8],
    ] as const) {
      lauxlib.luaL_requiref(L, S(name), open, 1);
      lua.lua_pop(L, 1);
    }
    // Ничего, что читает файлы или загружает чужой код.
    for (const name of ['dofile', 'loadfile', 'load', 'require', 'collectgarbage']) {
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, S(name));
    }
    lua.lua_sethook(
      L,
      (l) => {
        this.budget -= 1000;
        if (this.budget < 0) lauxlib.luaL_error(l, S(LIMIT));
      },
      lua.LUA_MASKCOUNT,
      1000,
    );
    // API: глобальная таблица Lua (string, math…) + функции приложения.
    lua.lua_getglobal(L, S('_G'));
    for (const [k, v] of Object.entries({ ...api, print: (...a: unknown[]) => void this.printed.push(a.map(show).join('\t')) })) {
      this.push(v);
      lua.lua_setfield(L, -2, S(k));
    }
    this.apiRef = lauxlib.luaL_ref(L, REG);
    this.libRef = this.apiRef;
  }

  // ---------- JS → Lua ----------

  private push(v: unknown, depth = 0): void {
    const L = this.L;
    if (v === null || v === undefined) lua.lua_pushnil(L);
    else if (typeof v === 'string') lua.lua_pushstring(L, S(v));
    else if (typeof v === 'number') {
      if (Number.isInteger(v)) lua.lua_pushinteger(L, v);
      else lua.lua_pushnumber(L, v);
    } else if (typeof v === 'boolean') lua.lua_pushboolean(L, v);
    else if (typeof v === 'function') lua.lua_pushjsfunction(L, this.wrap(v as LuaFunction));
    else if (Array.isArray(v)) {
      lua.lua_newtable(L);
      v.forEach((x, i) => {
        this.push(x, depth + 1);
        lua.lua_seti(L, -2, i + 1);
      });
    } else if (typeof v === 'object' && depth < 20) {
      lua.lua_newtable(L);
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (x === undefined) continue;
        this.push(x, depth + 1);
        lua.lua_setfield(L, -2, S(k));
      }
    } else lua.lua_pushnil(L);
  }

  // ---------- Lua → JS ----------

  private pull(idx: number, depth = 0): LuaValue {
    const L = this.L;
    const t = lua.lua_type(L, idx);
    if (t === lua.LUA_TNIL) return null;
    if (t === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, idx);
    if (t === lua.LUA_TNUMBER) return lua.lua_tonumber(L, idx);
    if (t === lua.LUA_TSTRING) return lua.lua_tojsstring(L, idx);
    if (t === lua.LUA_TFUNCTION) {
      lua.lua_pushvalue(L, idx);
      const ref = lauxlib.luaL_ref(L, REG);
      this.temp.push(ref);
      return (...args: unknown[]) => {
        lua.lua_rawgeti(L, REG, ref);
        args.forEach((a) => this.push(a));
        lua.lua_call(L, args.length, 1);
        const r = this.pull(-1);
        lua.lua_pop(L, 1);
        return r;
      };
    }
    if (t === lua.LUA_TTABLE && depth < 20) {
      const abs = idx < 0 ? lua.lua_gettop(L) + idx + 1 : idx;
      const obj: Record<string, LuaValue> = {};
      const keys: (string | number)[] = [];
      lua.lua_pushnil(L);
      while (lua.lua_next(L, abs) !== 0) {
        const kt = lua.lua_type(L, -2);
        const key = kt === lua.LUA_TNUMBER ? lua.lua_tonumber(L, -2) : kt === lua.LUA_TSTRING ? lua.lua_tojsstring(L, -2) : null;
        if (key !== null) {
          keys.push(key);
          obj[String(key)] = this.pull(-1, depth + 1);
        }
        lua.lua_pop(L, 1);
      }
      const n = keys.length;
      const isList = n > 0 && keys.every((k) => typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= n);
      if (isList) return Array.from({ length: n }, (_, i) => obj[String(i + 1)]);
      return obj;
    }
    return null;
  }

  /** JS-функция → функция Lua: аргументы переводятся в JS, результат обратно; исключения → ошибки Lua. */
  private wrap(fn: LuaFunction) {
    return (L: LuaState): number => {
      const n = lua.lua_gettop(L);
      let result: unknown;
      try {
        const args: LuaValue[] = [];
        for (let i = 1; i <= n; i++) args.push(this.pull(i));
        result = fn(...args);
      } catch (e) {
        if (isLuaThrow(e)) throw e;
        if (e instanceof LuaStop) {
          lua.lua_pushstring(L, S(STOP));
          return lua.lua_error(L);
        }
        // Как luaL_error: «Курс:5: сообщение» — со строкой кода, откуда вызвали функцию.
        lauxlib.luaL_where(L, 1);
        lua.lua_pushstring(L, S(e instanceof Error ? e.message : String(e)));
        lua.lua_concat(L, 2);
        return lua.lua_error(L);
      }
      if (result instanceof Multi) {
        result.values.forEach((v) => this.push(v));
        return result.values.length;
      }
      if (result === undefined) return 0;
      this.push(result);
      return 1;
    };
  }

  // ---------- Скрипты ----------

  /** Скомпилировать код. name — для сообщений об ошибках («Курс»). */
  compile(code: string, name: string): { ok: true; ref: number } | { ok: false; error: LuaScriptError } {
    const L = this.L;
    const status = lauxlib.luaL_loadbuffer(L, S(code), null, S(`=${name}`));
    if (status !== lua.LUA_OK) {
      const raw = lua.lua_tojsstring(L, -1);
      lua.lua_pop(L, 1);
      return { ok: false, error: translateError(raw) };
    }
    return { ok: true, ref: lauxlib.luaL_ref(L, REG) };
  }

  /**
   * Своя библиотека пользователя: код выполняется один раз, его глобальные функции и значения
   * видны всем скриптам. Возвращает имена определённых функций.
   */
  defineLibrary(code: string, name = 'Моя библиотека'): { ok: true; functions: string[] } | { ok: false; error: LuaScriptError } {
    const L = this.L;
    const c = this.compile(code, name);
    if (!c.ok) return c;
    // Таблица библиотеки: всё, что не найдено в ней, берётся из API.
    lua.lua_newtable(L);
    lua.lua_newtable(L);
    lua.lua_rawgeti(L, REG, this.apiRef);
    lua.lua_setfield(L, -2, S('__index'));
    lua.lua_setmetatable(L, -2);
    const lib = lauxlib.luaL_ref(L, REG);
    lua.lua_rawgeti(L, REG, c.ref);
    lua.lua_rawgeti(L, REG, lib);
    lua.lua_setupvalue(L, -2, 1);
    const r = this.protectedCall(0);
    if (!r.ok) return r;
    this.libRef = lib;
    lua.lua_rawgeti(L, REG, lib);
    const table = this.pull(-1) as Record<string, LuaValue>;
    lua.lua_pop(L, 1);
    this.releaseTemp();
    return { ok: true, functions: Object.keys(table ?? {}).filter((k) => typeof table[k] === 'function') };
  }

  /** Вызвать функцию из библиотеки пользователя (например, проверку части ячейки). */
  callLibrary(name: string, ...args: unknown[]): { ok: true; value: LuaValue } | { ok: false; error: LuaScriptError } {
    const L = this.L;
    const top = lua.lua_gettop(L);
    lua.lua_rawgeti(L, REG, this.libRef);
    lua.lua_getfield(L, -1, S(name));
    if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) {
      lua.lua_settop(L, top);
      return { ok: false, error: { message: `нет функции «${name}» в библиотеке`, raw: '' } };
    }
    args.forEach((a) => this.push(a));
    const outer = this.budget > 0;
    if (!outer) this.budget = this.limit;
    const status = lua.lua_pcall(L, args.length, 1, 0);
    let out: { ok: true; value: LuaValue } | { ok: false; error: LuaScriptError };
    if (status !== lua.LUA_OK) out = { ok: false, error: translateError(lua.lua_tojsstring(L, -1)) };
    else out = { ok: true, value: this.pull(-1) };
    lua.lua_settop(L, top);
    if (!outer) {
      this.releaseTemp();
      this.budget = 0;
    }
    return out;
  }

  /** Запустить скомпилированный скрипт со своим окружением: env — переменные только этого запуска. */
  run(ref: number, env: Record<string, unknown>): RunResult {
    const L = this.L;
    lua.lua_rawgeti(L, REG, ref);
    lua.lua_newtable(L);
    for (const [k, v] of Object.entries(env)) {
      this.push(v);
      lua.lua_setfield(L, -2, S(k));
    }
    lua.lua_newtable(L);
    lua.lua_rawgeti(L, REG, this.libRef);
    lua.lua_setfield(L, -2, S('__index'));
    lua.lua_setmetatable(L, -2);
    lua.lua_setupvalue(L, -2, 1);
    return this.protectedCall(0);
  }

  private protectedCall(nargs: number): RunResult {
    const L = this.L;
    const outer = this.budget > 0;
    if (!outer) {
      this.budget = this.limit;
      this.printed = [];
    }
    const top = lua.lua_gettop(L) - nargs - 1;
    const status = lua.lua_pcall(L, nargs, 0, 0);
    let result: RunResult = { ok: true, stopped: false };
    if (status !== lua.LUA_OK) {
      const raw = lua.lua_type(L, -1) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, -1) : 'ошибка без текста';
      if (raw.endsWith(STOP)) result = { ok: true, stopped: true };
      else result = { ok: false, error: raw.includes(LIMIT) ? { message: LIMIT, raw } : translateError(raw) };
    }
    lua.lua_settop(L, top);
    if (!outer) {
      this.releaseTemp();
      this.budget = 0;
    }
    return result;
  }

  private releaseTemp() {
    for (const ref of this.temp) lauxlib.luaL_unref(this.L, REG, ref);
    this.temp = [];
  }
}

/** Как показать значение в print(). */
function show(v: unknown): string {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'function') return 'функция';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
