import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../storage/memoryAdapter';
import { defineDocType } from '../schema/docType';
import { DocStore } from './docStore';
import { ReadOnlyDocError, Workspace } from './workspace';

const dt = defineDocType<{ items: string[] }>({ type: 'test/list', version: 1, migrations: { 0: (raw: string[]) => ({ items: raw }) }, empty: () => ({ items: [] }) });
const text = (ws: Workspace, path: string) => (ws.adapter as MemoryAdapter).files.get(path) && new TextDecoder().decode((ws.adapter as MemoryAdapter).files.get(path)!.data);

describe('рабочая папка', () => {
  it('создаёт паспорт папки при первом открытии', async () => {
    const ws = new Workspace(new MemoryAdapter());
    await ws.init();
    expect(ws.info?.id).toMatch(/^ws_/);
    expect(JSON.parse(text(ws, '.docassist/workspace.json')!).$type).toBe('docassist/workspace');
  });

  it('старый формат поднимается миграцией и сохраняется в новом', async () => {
    const ws = new Workspace(new MemoryAdapter());
    await ws.writeBytes('list.json', JSON.stringify(['a', 'b']));
    const store = new DocStore(ws, 'list.json', dt);
    expect(await store.read()).toEqual({ items: ['a', 'b'] });
    store.update((d) => ({ items: [...d.items, 'c'] }));
    await store.flush();
    expect(JSON.parse(text(ws, 'list.json')!)).toMatchObject({ $type: 'test/list', $version: 1, data: { items: ['a', 'b', 'c'] } });
  });

  it('файл из более новой версии не перезаписывается', async () => {
    const ws = new Workspace(new MemoryAdapter());
    await ws.writeBytes('list.json', JSON.stringify({ $type: 'test/list', $version: 5, data: { future: true } }));
    const store = new DocStore(ws, 'list.json', dt);
    await store.load();
    expect(store.get().tooNew).toBe(true);
    expect(() => store.update((d) => d)).toThrow(ReadOnlyDocError);
    await expect(ws.writeDoc('list.json', dt, { items: [] })).rejects.toThrow(ReadOnlyDocError);
  });

  it('повреждённый файл не перезаписывается', async () => {
    const ws = new Workspace(new MemoryAdapter());
    await ws.writeBytes('list.json', '{ это не JSON');
    const store = new DocStore(ws, 'list.json', dt);
    await store.load();
    expect(store.get().broken).toBe(true);
    store.update(() => ({ items: ['x'] }));
    await new Promise((r) => setTimeout(r, 400));
    expect(text(ws, 'list.json')).toBe('{ это не JSON');
  });
});
