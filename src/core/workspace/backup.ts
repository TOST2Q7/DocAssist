import { writeZip, readZip, type ZipEntry } from '../util/zip';
import type { Workspace } from './workspace';

/*
 * Копия рабочей папки в один файл (.zip) и восстановление из него.
 * Особенно нужно для «Хранилища браузера»: там данные живут только в браузере и пропадут,
 * если очистить данные сайта. В копии — всё: таблицы, правки, проверки, база, переменные, словарь.
 */

/** Все файлы рабочей папки (вместе со служебной .docassist). */
export async function listAllFiles(ws: Workspace, dir = ''): Promise<{ path: string; lastModified?: number }[]> {
  const out: { path: string; lastModified?: number }[] = [];
  for (const e of await ws.list(dir)) {
    if (e.kind === 'directory') out.push(...(await listAllFiles(ws, e.path)));
    else out.push({ path: e.path, lastModified: e.lastModified });
  }
  return out;
}

export const BACKUP_META = 'backup.json';

export async function backupWorkspace(ws: Workspace): Promise<{ zip: Uint8Array; count: number }> {
  const at = new Date().toISOString();
  await ws.writeBytes(ws.systemPath(BACKUP_META), JSON.stringify({ lastBackupAt: at }, null, 2));
  const files = await listAllFiles(ws);
  const entries: ZipEntry[] = [];
  for (const f of files) {
    const data = await ws.readBytes(f.path);
    if (data) entries.push({ path: f.path, data, modified: f.lastModified ? new Date(f.lastModified) : undefined });
  }
  return { zip: writeZip(entries), count: entries.length };
}

/** Когда последний раз сохраняли копию (null — ни разу). */
export async function lastBackupAt(ws: Workspace): Promise<string | null> {
  const meta = (await ws.readJson(ws.systemPath(BACKUP_META)).catch(() => undefined)) as { lastBackupAt?: string } | undefined;
  return meta?.lastBackupAt ?? null;
}

/** Восстановить из копии: файлы с теми же путями заменяются, остальные остаются. */
export async function restoreWorkspace(ws: Workspace, bytes: Uint8Array): Promise<number> {
  const entries = await readZip(bytes);
  if (!entries.length) throw new Error('Архив пустой');
  for (const e of entries) {
    const path = e.path.replace(/^\/+/, '');
    if (!path || path.split('/').includes('..')) continue;
    await ws.writeBytes(path, e.data);
  }
  return entries.length;
}
