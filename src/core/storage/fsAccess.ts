import { splitPath, toBytes, type FileStat, type FsEntry, type StorageAdapter } from './types';

/*
 * Адаптер для настоящей папки на компьютере (File System Access API).
 * Поддерживается только в Chromium-браузерах на ПК: Chrome, Edge, Яндекс Браузер, Opera.
 */

type PermissionMode = 'read' | 'readwrite';

interface DirHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterableIterator<DirHandle | FileHandle>;
  queryPermission?(opts: { mode: PermissionMode }): Promise<PermissionState>;
  requestPermission?(opts: { mode: PermissionMode }): Promise<PermissionState>;
}

interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: BufferSource | Blob | string): Promise<void>; close(): Promise<void> }>;
}

export type DirectoryHandle = DirHandle;

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: PermissionMode; id?: string }) => Promise<DirHandle>;
  }
}

export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<DirHandle> {
  if (!window.showDirectoryPicker) throw new Error('Выбор папки не поддерживается этим браузером');
  return window.showDirectoryPicker({ mode: 'readwrite', id: 'docassist-workspace' });
}

/** Проверить (и при необходимости запросить) право на запись. Запрос — только по действию пользователя. */
export async function ensurePermission(handle: DirHandle, request: boolean): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (request && handle.requestPermission) return (await handle.requestPermission(opts)) === 'granted';
  return false;
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');
}

export class FsAccessAdapter implements StorageAdapter {
  readonly kind = 'fs-access' as const;
  constructor(private readonly root: DirHandle) {}

  get label(): string {
    return this.root.name;
  }

  private async dir(parts: string[], create: boolean): Promise<DirHandle | null> {
    let cur = this.root;
    for (const p of parts) {
      try {
        cur = await cur.getDirectoryHandle(p, { create });
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    }
    return cur;
  }

  private async file(path: string, create: boolean): Promise<FileHandle | null> {
    const parts = splitPath(path);
    const name = parts.pop();
    if (!name) return null;
    const dir = await this.dir(parts, create);
    if (!dir) return null;
    try {
      return await dir.getFileHandle(name, { create });
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async list(path: string): Promise<FsEntry[]> {
    const dir = await this.dir(splitPath(path), false);
    if (!dir) return [];
    const out: FsEntry[] = [];
    const prefix = splitPath(path).join('/');
    for await (const h of dir.values()) {
      const p = prefix ? `${prefix}/${h.name}` : h.name;
      if (h.kind === 'file') {
        const f = await h.getFile();
        out.push({ name: h.name, path: p, kind: 'file', size: f.size, lastModified: f.lastModified });
      } else {
        out.push({ name: h.name, path: p, kind: 'directory' });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const h = await this.file(path, false);
    if (!h) return null;
    const f = await h.getFile();
    return new Uint8Array(await f.arrayBuffer());
  }

  async stat(path: string): Promise<FileStat | null> {
    const h = await this.file(path, false);
    if (!h) return null;
    const f = await h.getFile();
    return { size: f.size, lastModified: f.lastModified };
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    const h = await this.file(path, true);
    if (!h) throw new Error(`Не удалось создать файл ${path}`);
    const w = await h.createWritable();
    await w.write(toBytes(data) as BufferSource);
    await w.close();
  }

  async remove(path: string): Promise<void> {
    const parts = splitPath(path);
    const name = parts.pop();
    if (!name) return;
    const dir = await this.dir(parts, false);
    if (!dir) return;
    try {
      await dir.removeEntry(name, { recursive: true });
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.dir(splitPath(path), true);
  }
}
