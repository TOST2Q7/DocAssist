import { describe, expect, it } from 'vitest';
import { GramotkiStore, gramotkaPath } from '../gramotka/store';
import { MemoryAdapter } from '../storage/memoryAdapter';
import { syncGroups } from '../sync/personal';
import { Workspace } from '../workspace/workspace';
import type { Variable } from './types';
import { findVarTokens, resolveVars, suggestKey, validateKey, variablesStore } from './variables';

const v = (key: string, value: string, kind: Variable['kind'] = 'text', id = key): Variable => ({ id, key, label: key, value, kind, createdAt: '', updatedAt: '' });

describe('глобальные переменные', () => {
  const items = [v('fio', 'Мастеров Мастер Мастерович', 'fio'), v('адрес_штаба', '000000, Респ. Регион, ул. Примерная, д. 1', 'address'), v('Phone', '8(000)000-00-00', 'phone')];

  it('подстановка <ключ>: без учёта регистра, кириллица, неизвестное остаётся', () => {
    expect(resolveVars('Мастер: <fio>, тел. <phone>, штаб: <адрес_штаба>', items)).toBe('Мастер: Мастеров Мастер Мастерович, тел. 8(000)000-00-00, штаб: 000000, Респ. Регион, ул. Примерная, д. 1');
    expect(resolveVars('<нет_такой> и <FIO>', items)).toBe('<нет_такой> и Мастеров Мастер Мастерович');
    expect(resolveVars('без меток', items)).toBe('без меток');
    expect(resolveVars('a < b > c', items)).toBe('a < b > c');
  });

  it('метки в тексте', () => {
    expect(findVarTokens('<fio> <адрес_штаба> <a b> <x.y-z>')).toEqual(['fio', 'адрес_штаба', 'x.y-z']);
  });

  it('ключи: допустимые символы, без повторов (без учёта регистра), себя не считать повтором', () => {
    expect(validateKey('адрес штаба', items)).toMatch(/без пробелов/);
    expect(validateKey('FIO', items)).toBe('Такой ключ уже есть');
    expect(validateKey('fio', items, 'fio')).toBeNull();
    expect(validateKey('новый.ключ-1', items)).toBeNull();
  });

  it('ключ по умолчанию: следующий свободный', () => {
    expect(suggestKey('fio', items)).toBe('fio2');
    expect(suggestKey('email', items)).toBe('email');
    expect(suggestKey('phone', items)).toBe('phone2');
  });

  it('хранятся в .docassist/variables.json — рядом с открытыми грамотками и вне их; переносятся с личными настройками', async () => {
    const adapter = new MemoryAdapter();
    const ws = new Workspace(adapter);
    await ws.init();
    const g = new GramotkiStore(ws);
    await g.init();
    await g.createOwner('лампа ворона северный компот гитара', 'Мастер', false);
    const id = await g.create({ 'person.lastName': 'Фамилия' }, 'test');
    const store = variablesStore(ws);
    await store.load();
    store.update(() => ({ items }));
    await store.flush();
    expect(adapter.files.has('.docassist/variables.json')).toBe(true);
    // Переменные не попадают в грамотку и наоборот.
    expect((await ws.list(gramotkaPath(id))).length).toBe(0);
    const fresh = new Workspace(adapter);
    const again = variablesStore(fresh);
    expect((await again.read()).items.map((x) => x.key)).toEqual(['fio', 'адрес_штаба', 'Phone']);
    const group = syncGroups(ws).find((x) => x.id === 'variables');
    expect(group?.files).toEqual(['.docassist/variables.json']);
    // База людей больше не переносится файлом: люди — в грамотках.
    expect(syncGroups(ws).some((x) => x.files.includes('.docassist/people.json'))).toBe(false);
  }, 30_000);
});
