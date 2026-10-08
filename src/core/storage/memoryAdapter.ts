import { splitPath, toBytes, type FileStat, type FsEntry, type StorageAdapter } from './types';

/** Хранилище в памяти — для тестов. */
export class MemoryAdapter implements StorageAdapter {
  readonly kind = 'browser' as const;
  readonly label = 'Память';
  readonly files = new Map<string, { data: Uint8Array; lastModified: number }>();

  async list(path: string): Promise<FsEntry[]> {
    const dir = splitPath(path).join('/');
    const prefix = dir ? dir + '/' : '';
    const seen = new Map<string, FsEntry>();
    for (const [p, f] of this.files) {
      if (!p.startsWith(prefix)) continue;
      const [first, ...more] = p.slice(prefix.length).split('/');
      const full = prefix + first;
      seen.set(full, more.length
        ? { name: first, path: full, kind: 'directory' }
        : { name: first, path: full, kind: 'file', size: f.data.byteLength, lastModified: f.lastModified });
    }
    return [...seen.values()];
  }
  async readFile(path: string) {
    return this.files.get(splitPath(path).join('/'))?.data ?? null;
  }
  async stat(path: string): Promise<FileStat | null> {
    const f = this.files.get(splitPath(path).join('/'));
    return f ? { size: f.data.byteLength, lastModified: f.lastModified } : null;
  }
  async writeFile(path: string, data: Uint8Array | string) {
    this.files.set(splitPath(path).join('/'), { data: toBytes(data), lastModified: Date.now() });
  }
  async remove(path: string) {
    const p = splitPath(path).join('/');
    for (const key of [...this.files.keys()]) if (key === p || key.startsWith(p + '/')) this.files.delete(key);
  }
  async mkdir() {}
}
