import { STORE_FILES, tx } from './idb';
import { splitPath, toBytes, type FileStat, type FsEntry, type StorageAdapter } from './types';

/*
 * «Хранилище браузера»: виртуальная папка внутри IndexedDB.
 * Работает везде, включая iOS и Android. Файлы попадают сюда через «Загрузить»,
 * а наружу выходят через «Скачать».
 */

interface FileRecord {
  path: string;
  kind: 'file' | 'directory';
  data?: Uint8Array;
  size?: number;
  lastModified: number;
}

const norm = (path: string) => splitPath(path).join('/');

export class BrowserAdapter implements StorageAdapter {
  readonly kind = 'browser' as const;
  readonly label = 'Хранилище браузера';

  async list(path: string): Promise<FsEntry[]> {
    const dir = norm(path);
    const all = (await tx(STORE_FILES, 'readonly', (s) => s.getAll())) as FileRecord[];
    const prefix = dir ? dir + '/' : '';
    const seen = new Map<string, FsEntry>();
    for (const rec of all) {
      if (!rec.path.startsWith(prefix) || rec.path === dir) continue;
      const rest = rec.path.slice(prefix.length);
      const [first, ...more] = rest.split('/');
      const p = prefix + first;
      if (more.length > 0 || rec.kind === 'directory') {
        if (!seen.has(p)) seen.set(p, { name: first, path: p, kind: 'directory' });
      } else {
        seen.set(p, { name: first, path: p, kind: 'file', size: rec.size, lastModified: rec.lastModified });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const rec = (await tx(STORE_FILES, 'readonly', (s) => s.get(norm(path)))) as FileRecord | undefined;
    return rec?.kind === 'file' && rec.data ? rec.data : null;
  }

  async stat(path: string): Promise<FileStat | null> {
    const rec = (await tx(STORE_FILES, 'readonly', (s) => s.get(norm(path)))) as FileRecord | undefined;
    return rec?.kind === 'file' ? { size: rec.size ?? 0, lastModified: rec.lastModified } : null;
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    const bytes = toBytes(data);
    const rec: FileRecord = { path: norm(path), kind: 'file', data: bytes, size: bytes.byteLength, lastModified: Date.now() };
    await tx(STORE_FILES, 'readwrite', (s) => s.put(rec));
  }

  async remove(path: string): Promise<void> {
    const p = norm(path);
    const all = (await tx(STORE_FILES, 'readonly', (s) => s.getAllKeys())) as string[];
    for (const key of all) {
      if (key === p || key.startsWith(p + '/')) await tx(STORE_FILES, 'readwrite', (s) => s.delete(key));
    }
  }

  async mkdir(path: string): Promise<void> {
    const p = norm(path);
    if (!p) return;
    const rec: FileRecord = { path: p, kind: 'directory', lastModified: Date.now() };
    await tx(STORE_FILES, 'readwrite', (s) => s.put(rec));
  }
}
