/** Минимальная обёртка над IndexedDB без внешних зависимостей. */

const DB_NAME = 'docassist';
const DB_VERSION = 1;
export const STORE_FILES = 'files';
export const STORE_KV = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES, { keyPath: 'path' });
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  const t = db.transaction(store, mode);
  const result = await promisify(fn(t.objectStore(store)));
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return result;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await tx(STORE_KV, 'readonly', (s) => s.get(key))) as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await tx(STORE_KV, 'readwrite', (s) => s.put(value, key));
}

export async function kvDelete(key: string): Promise<void> {
  await tx(STORE_KV, 'readwrite', (s) => s.delete(key));
}
