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

describe('виртуальные папки (папка человека в грамотке)', () => {
  async function setup() {
    const ws = new Workspace(new MemoryAdapter());
    await ws.init();
    const inner = new MemoryAdapter();
    ws.mount('@грамотки/g1', inner);
    return { ws, inner };
  }

  it('пути «@грамотки/<номер>/…» ведут в подключённую папку; в списке рабочей папки её нет', async () => {
    const { ws, inner } = await setup();
    await ws.writeBytes('@грамотки/g1/Сканы/a.jpg', 'скан');
    expect(inner.files.has('Сканы/a.jpg')).toBe(true);
    expect((ws.adapter as MemoryAdapter).files.has('@грамотки/g1/Сканы/a.jpg')).toBe(false);
    expect(await ws.list('@грамотки/g1')).toEqual([{ name: 'Сканы', path: '@грамотки/g1/Сканы', kind: 'directory' }]);
    expect((await ws.list('@грамотки/g1/Сканы'))[0]).toMatchObject({ name: 'a.jpg', path: '@грамотки/g1/Сканы/a.jpg', kind: 'file' });
    expect(await ws.list('@грамотки')).toEqual([{ name: 'g1', path: '@грамотки/g1', kind: 'directory' }]);
    expect((await ws.list('')).map((e) => e.name)).toEqual(['.docassist']);
  });

  it('перенос между рабочей папкой и виртуальной, удаление, события изменений с полным путём', async () => {
    const { ws, inner } = await setup();
    const events: string[] = [];
    ws.changes.on((e) => events.push(`${e.action}:${e.path}`));
    await ws.writeBytes('Для выдачи/x.pdf', 'pdf');
    await ws.moveFile('Для выдачи/x.pdf', '@грамотки/g1/x.pdf');
    expect(await ws.readBytes('Для выдачи/x.pdf')).toBeNull();
    expect(new TextDecoder().decode((await ws.readBytes('@грамотки/g1/x.pdf'))!)).toBe('pdf');
    await ws.remove('@грамотки/g1/x.pdf');
    expect(inner.files.size).toBe(0);
    expect(events).toContain('write:@грамотки/g1/x.pdf');
    expect(events).toContain('remove:@грамотки/g1/x.pdf');
    expect(await ws.freeName('@грамотки/g1', 'x.pdf')).toBe('x.pdf');
  });

  it('закрытая (отключённая) грамотка — понятная ошибка, а не запись в рабочую папку', async () => {
    const { ws } = await setup();
    ws.unmount('@грамотки/g1');
    await expect(ws.writeBytes('@грамотки/g1/a.txt', 'x')).rejects.toThrow(/откройте грамотки/);
    await expect(ws.readBytes('@грамотки/g2/a.txt')).rejects.toThrow(/закрыта/);
    expect((ws.adapter as MemoryAdapter).files.has('@грамотки/g1/a.txt')).toBe(false);
  });
});
