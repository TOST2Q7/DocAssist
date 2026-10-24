import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../google/drive';

/*
 * Перенос грамоток через Google Диск — на подставном Диске в памяти (настоящий Google не нужен).
 */

interface Fake {
  file: DriveFile;
  data: Uint8Array;
}
const disk = new Map<string, Fake>();
let seq = 0;
const meta = (f: Fake) => ({ ...f.file, size: String(f.data.length) });

vi.mock('../google', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../google')>();
  const { md5 } = await import('../google/md5');
  const fake = {
    findByAppProperty: async (k: string, v: string) => [...disk.values()].filter((f) => !f.file.trashed && f.file.appProperties?.[k] === v).map(meta),
    createFolder: async (name: string, _p: string, _c?: string, appProperties?: Record<string, string>) => {
      const id = `f${++seq}`;
      disk.set(id, { file: { id, name, mimeType: 'folder', appProperties }, data: new Uint8Array() });
      return disk.get(id)!.file;
    },
    uploadFile: async (i: { name: string; parentId: string; data: Uint8Array; appProperties?: Record<string, string> }) => {
      const id = `f${++seq}`;
      disk.set(id, { file: { id, name: i.name, mimeType: 'application/octet-stream', parents: [i.parentId], appProperties: i.appProperties, md5Checksum: md5(i.data), modifiedTime: new Date(Date.now() + seq).toISOString() }, data: i.data });
      return meta(disk.get(id)!);
    },
    updateContent: async (id: string, data: Uint8Array, _m: string, m: { appProperties?: Record<string, string> } = {}) => {
      const f = disk.get(id)!;
      f.data = data;
      f.file = { ...f.file, md5Checksum: md5(data), appProperties: { ...f.file.appProperties, ...m.appProperties }, modifiedTime: new Date(Date.now() + ++seq).toISOString() };
      return meta(f);
    },
    updateMeta: async (id: string, m: { appProperties?: Record<string, string> }) => {
      const f = disk.get(id)!;
      f.file = { ...f.file, appProperties: { ...f.file.appProperties, ...m.appProperties } };
      return meta(f);
    },
    downloadFile: async (id: string) => disk.get(id)!.data,
    trashFile: async (id: string) => {
      disk.get(id)!.file.trashed = true;
      return meta(disk.get(id)!);
    },
  };
  return { ...actual, drive: fake, getAuthState: () => ({ email: 'test@example.com', signedIn: true }) };
});

const PHRASE = 'лампа ворона северный компот гитара';
const PERSON = { 'person.lastName': 'Фамилия', 'person.firstName': 'Имя', 'person.birthDate': '01.01.2000' };

async function device() {
  const { MemoryAdapter } = await import('../storage/memoryAdapter');
  const { Workspace } = await import('../workspace/workspace');
  const { GramotkiStore } = await import('../gramotka/store');
  const ws = new Workspace(new MemoryAdapter());
  await ws.init();
  const store = new GramotkiStore(ws);
  await store.init();
  return { ws, store };
}

/** У каждого «устройства» — своя история сверки (в браузере она в памяти устройства). */
const memory = new Map<string, Map<string, string>>();
function useDeviceMemory(name: string) {
  const m = memory.get(name) ?? new Map<string, string>();
  memory.set(name, m);
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
}

describe('грамотки на Google Диске', () => {
  beforeEach(() => {
    disk.clear();
    memory.clear();
  });

  it('устройство A отправляет, новое устройство B подключается той же фразой и получает; правки ходят в обе стороны без «пинг-понга»', async () => {
    const { syncGramotki, anyRemoteGramotka } = await import('./gramotki');
    const { gramotkaPath } = await import('../gramotka/store');
    useDeviceMemory('A');
    const A = await device();
    await A.store.createOwner(PHRASE, 'Мастер', false);
    const id = await A.store.create(PERSON, 'test');
    await A.ws.writeBytes(`${gramotkaPath(id)}/Сканы/скан.jpg`, 'СКАН');
    expect(await syncGramotki(A.store)).toMatchObject({ uploaded: 1, downloaded: 0, conflicts: [] });
    // На Диске — закрытый файл, ФИО и содержимого не видно.
    const onDisk = [...disk.values()].find((f) => f.file.appProperties?.gid === id)!;
    expect(new TextDecoder('latin1').decode(onDisk.data)).not.toMatch(/Фамилия|СКАН/);

    useDeviceMemory('B');
    const B = await device();
    expect(B.store.snapshot().status).toBe('new');
    B.store.joinFrom((await anyRemoteGramotka())!);
    expect(B.store.snapshot().status).toBe('locked');
    await expect(B.store.unlock('другая фраза совсем чужая', false)).rejects.toMatchObject({ kind: 'wrong-phrase' });
    await B.store.unlock(PHRASE, false);
    expect(await syncGramotki(B.store)).toMatchObject({ downloaded: 1, uploaded: 0, conflicts: [] });
    expect(B.store.item(id)?.fields['person.lastName']).toBe('Фамилия');
    expect(new TextDecoder().decode((await B.ws.readBytes(`${gramotkaPath(id)}/Сканы/скан.jpg`))!)).toBe('СКАН');
    // Повторная сверка — ничего не переносит.
    expect(await syncGramotki(B.store)).toMatchObject({ downloaded: 0, uploaded: 0 });

    // Правка на B → на Диск → на A.
    B.store.setPerson(id, { ...PERSON, 'person.phone': '8(000)000-00-01' }, 'test');
    expect(await syncGramotki(B.store)).toMatchObject({ uploaded: 1 });
    useDeviceMemory('A');
    expect(await syncGramotki(A.store)).toMatchObject({ downloaded: 1, uploaded: 0 });
    expect(A.store.item(id)?.fields['person.phone']).toBe('8(000)000-00-01');
    expect(await syncGramotki(A.store)).toMatchObject({ downloaded: 0, uploaded: 0 });
    useDeviceMemory('B');
    expect(await syncGramotki(B.store)).toMatchObject({ downloaded: 0, uploaded: 0 });
  }, 90_000);

  it('правили на обоих устройствах — человек выбирает; удалённое не воссоздаётся без спроса', async () => {
    const { syncGramotki, resolveGramotki, anyRemoteGramotka } = await import('./gramotki');
    useDeviceMemory('A');
    const A = await device();
    await A.store.createOwner(PHRASE, 'Мастер', false);
    const id = await A.store.create(PERSON, 'test');
    await syncGramotki(A.store);
    useDeviceMemory('B');
    const B = await device();
    B.store.joinFrom((await anyRemoteGramotka())!);
    await B.store.unlock(PHRASE, false);
    await syncGramotki(B.store);

    B.store.setPerson(id, { ...PERSON, 'person.email': 'b@example.com' }, 'test');
    await syncGramotki(B.store);
    useDeviceMemory('A');
    A.store.setPerson(id, { ...PERSON, 'person.phone': '8(000)000-00-02' }, 'test');
    const s = await syncGramotki(A.store);
    expect(s.conflicts.map((c) => c.kind)).toEqual(['diverged']);
    const c = s.conflicts[0];
    const r = await resolveGramotki(A.store, s.conflicts, [{ kind: 'diverged', id, choice: { 'field:person.email': 'theirs' } }]);
    expect(r.uploaded).toBe(1);
    expect(A.store.item(id)?.fields).toMatchObject({ 'person.email': 'b@example.com', 'person.phone': '8(000)000-00-02' });
    expect(c.title).toBe('Фамилия Имя');

    // Удалили на A → на Диске осталась: спросить, не удалять молча.
    await A.store.remove(id);
    const s2 = await syncGramotki(A.store);
    expect(s2.conflicts.map((x) => x.kind)).toEqual(['deleted-here']);
    await resolveGramotki(A.store, s2.conflicts, [{ kind: 'deleted-here', id, remove: true }]);
    // На B: файла на Диске больше нет, а здесь есть — тоже спросить.
    useDeviceMemory('B');
    const s3 = await syncGramotki(B.store);
    expect(s3.conflicts.map((x) => x.kind)).toEqual(['deleted-there']);
  }, 90_000);

  it('боец передан на одном устройстве — на другом он тоже становится переданным', async () => {
    const { syncGramotki, anyRemoteGramotka } = await import('./gramotki');
    useDeviceMemory('A');
    const A = await device();
    await A.store.createOwner(PHRASE, 'Мастер', false);
    const id = await A.store.create(PERSON, 'test');
    await syncGramotki(A.store);
    useDeviceMemory('B');
    const B = await device();
    B.store.joinFrom((await anyRemoteGramotka())!);
    await B.store.unlock(PHRASE, false);
    await syncGramotki(B.store);
    useDeviceMemory('A');
    await A.store.transfer([id], () => 'Фамилия И.');
    expect(await syncGramotki(A.store)).toMatchObject({ uploaded: 1 });
    useDeviceMemory('B');
    expect(await syncGramotki(B.store)).toMatchObject({ downloaded: 1, conflicts: [] });
    expect(B.store.item(id)).toBeUndefined();
    expect(B.store.snapshot().sealed.map((x) => x.label.fio)).toEqual(['Фамилия И.']);
  }, 90_000);
});
