/* Типы для fengari (Lua 5.3 на чистом JavaScript). Описано только то, чем пользуется DocAssist. */
declare module 'fengari' {
  export type LuaState = { readonly __lua: unique symbol };
  export type LuaString = Uint8Array;
  export type JsFunction = (L: LuaState) => number;

  export function to_luastring(s: string): LuaString;
  export function to_jsstring(s: LuaString): string;

  export const lua: {
    LUA_OK: number;
    LUA_ERRSYNTAX: number;
    LUA_REGISTRYINDEX: number;
    LUA_MULTRET: number;
    LUA_MASKCOUNT: number;
    LUA_TNIL: number;
    LUA_TBOOLEAN: number;
    LUA_TNUMBER: number;
    LUA_TSTRING: number;
    LUA_TTABLE: number;
    LUA_TFUNCTION: number;
    lua_gettop(L: LuaState): number;
    lua_settop(L: LuaState, idx: number): void;
    lua_pop(L: LuaState, n: number): void;
    lua_type(L: LuaState, idx: number): number;
    lua_pushnil(L: LuaState): void;
    lua_pushboolean(L: LuaState, b: boolean): void;
    lua_pushinteger(L: LuaState, n: number): void;
    lua_pushnumber(L: LuaState, n: number): void;
    lua_pushstring(L: LuaState, s: LuaString): void;
    lua_pushvalue(L: LuaState, idx: number): void;
    lua_pushjsfunction(L: LuaState, f: JsFunction): void;
    lua_toboolean(L: LuaState, idx: number): boolean;
    lua_tonumber(L: LuaState, idx: number): number;
    lua_isinteger(L: LuaState, idx: number): boolean;
    lua_tojsstring(L: LuaState, idx: number): string;
    lua_newtable(L: LuaState): void;
    lua_setfield(L: LuaState, idx: number, k: LuaString): void;
    lua_getfield(L: LuaState, idx: number, k: LuaString): number;
    lua_seti(L: LuaState, idx: number, n: number): void;
    lua_rawgeti(L: LuaState, idx: number, n: number): number;
    lua_rawlen(L: LuaState, idx: number): number;
    lua_next(L: LuaState, idx: number): number;
    lua_setmetatable(L: LuaState, idx: number): void;
    lua_setglobal(L: LuaState, name: LuaString): void;
    lua_getglobal(L: LuaState, name: LuaString): number;
    lua_setupvalue(L: LuaState, funcindex: number, n: number): LuaString | null;
    lua_pcall(L: LuaState, nargs: number, nresults: number, msgh: number): number;
    lua_call(L: LuaState, nargs: number, nresults: number): void;
    lua_error(L: LuaState): never;
    lua_concat(L: LuaState, n: number): void;
    lua_sethook(L: LuaState, f: ((L: LuaState, ar: unknown) => void) | null, mask: number, count: number): void;
  };

  export const lauxlib: {
    luaL_newstate(): LuaState;
    luaL_requiref(L: LuaState, name: LuaString, f: JsFunction, glb: number): void;
    luaL_loadbuffer(L: LuaState, buff: LuaString, sz: number | null, name: LuaString): number;
    luaL_ref(L: LuaState, t: number): number;
    luaL_unref(L: LuaState, t: number, ref: number): void;
    luaL_error(L: LuaState, fmt: LuaString): never;
    luaL_where(L: LuaState, lvl: number): void;
    luaL_traceback(L: LuaState, L1: LuaState, msg: LuaString | null, level: number): void;
  };

  export const lualib: {
    luaopen_base: JsFunction;
    luaopen_string: JsFunction;
    luaopen_table: JsFunction;
    luaopen_math: JsFunction;
    luaopen_utf8: JsFunction;
  };
}
