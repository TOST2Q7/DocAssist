/**
 * Абстракция хранилища рабочей папки.
 *
 * Приложения никогда не работают с диском напрямую — только через этот интерфейс.
 * Поэтому одна и та же логика работает и с настоящей папкой на ПК
 * (File System Access API), и с хранилищем браузера (IndexedDB) на телефонах.
 *
 * Пути — относительные, с разделителем «/»: "Проверка анкет/rules.json".
 */
export type StorageKind = 'fs-access' | 'browser';

export interface FsEntry {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  lastModified?: number;
}

export interface FileStat {
  size: number;
  lastModified: number;
}

export interface StorageAdapter {
  readonly kind: StorageKind;
  /** Отображаемое имя: имя папки или «Хранилище браузера». */
  readonly label: string;
  list(path: string): Promise<FsEntry[]>;
  readFile(path: string): Promise<Uint8Array | null>;
  stat(path: string): Promise<FileStat | null>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export function splitPath(path: string): string[] {
  return path.split('/').filter((p) => p.length > 0 && p !== '.');
}

export function joinPath(...parts: string[]): string {
  return parts.flatMap(splitPath).join('/');
}

export function parentPath(path: string): string {
  const parts = splitPath(path);
  parts.pop();
  return parts.join('/');
}

export function baseName(path: string): string {
  const parts = splitPath(path);
  return parts[parts.length - 1] ?? '';
}

export function extName(path: string): string {
  const name = baseName(path);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

const encoder = new TextEncoder();
export function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? encoder.encode(data) : data;
}
