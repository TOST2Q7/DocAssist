import { useEffect, useState, useSyncExternalStore } from 'react';
import { drive, getAuthState, md5, runQueue, type DriveFile } from '../google';
import type { MergeChoice } from '../gramotka/compare';
import { ensureOpen } from '../gramotka/react';
import { gramotkiStore, type GramotkiStore, type Prepared } from '../gramotka/store';
import { Emitter } from '../util/events';
import type { Workspace } from '../workspace/workspace';

/*
 * Грамотки на личном Google Диске — по желанию (переключатель «Грамотки» в личных настройках). Каждая грамотка —
 * один файл «Грамотка 7KQ2.gramotka» в папке «DocAssist — грамотки»: на Диске он такой же закрытый, как на устройстве
 * (открывается только фразой грамоток). Сверка — по ревизии (счёту правок), которая записана в метке файла:
 * совпадает — ничего не делаем; изменилась только одна сторона — переносим; обе — решает человек.
 * Удалённое на одной стороне без спроса не удаляется и не воссоздаётся — спрашиваем.
 */

const MARK_KEY = 'docassist';
const FILE_MARK = 'gramotka';
const FOLDER_MARK = 'gramotki-folder';
const FOLDER_NAME = 'DocAssist — грамотки';
const PREFS_KEY = 'docassist.gramotki.drive';
const BASE_KEY = 'docassist.gramotki.base';

// ---------- Включено ли на этом устройстве ----------

const listeners = new Set<() => void>();
let enabledCache: boolean | null = null;

export function gramotkiSyncEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  try {
    enabledCache = localStorage.getItem(PREFS_KEY) === '1';
  } catch {
    enabledCache = false;
  }
  return enabledCache;
}

export function setGramotkiSync(on: boolean): void {
  enabledCache = on;
  try {
    localStorage.setItem(PREFS_KEY, on ? '1' : '0');
  } catch {
    /* до перезагрузки */
  }
  for (const fn of [...listeners]) fn();
}

export function useGramotkiSync(): boolean {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, gramotkiSyncEnabled);
}

// ---------- История сверки (у каждого устройства и аккаунта своя) ----------

type Base = Record<string, string>;
const baseKey = () => `${BASE_KEY}.${getAuthState().email ?? 'anon'}`;

function readBase(): Base {
  try {
    return JSON.parse(localStorage.getItem(baseKey()) ?? '{}') as Base;
  } catch {
    return {};
  }
}

function writeBase(b: Base) {
  try {
    localStorage.setItem(baseKey(), JSON.stringify(b));
  } catch {
    /* сверка будет спрашивать чаще */
  }
}

// ---------- Диск ----------

async function folderId(): Promise<string> {
  const found = await drive.findByAppProperty(MARK_KEY, FOLDER_MARK);
  if (found[0]) return found[0].id;
  return (await drive.createFolder(FOLDER_NAME, 'root', undefined, { [MARK_KEY]: FOLDER_MARK })).id;
}

async function remoteFiles(): Promise<Map<string, DriveFile>> {
  const out = new Map<string, DriveFile>();
  for (const f of await drive.findByAppProperty(MARK_KEY, FILE_MARK)) {
    const id = f.appProperties?.gid;
    if (!id || !/^[0-9a-f]{32}$/.test(id)) continue;
    const prev = out.get(id);
    if (!prev || (f.modifiedTime ?? '') > (prev.modifiedTime ?? '')) out.set(id, f);
  }
  return out;
}

async function upload(store: GramotkiStore, id: string, rev: string, file: DriveFile | undefined, parent: () => Promise<string>): Promise<void> {
  const bundle = await store.rawBundle(id);
  const props = { [MARK_KEY]: FILE_MARK, gid: id, rev };
  if (file) {
    // То же содержимое уже на Диске (связь оборвалась после загрузки) — только метка.
    if (file.md5Checksum && file.md5Checksum === md5(bundle.data)) await drive.updateMeta(file.id, { appProperties: props });
    else await drive.updateContent(file.id, bundle.data, 'application/octet-stream', { appProperties: props });
  } else {
    await drive.uploadFile({ name: bundle.name, parentId: await parent(), data: bundle.data, appProperties: props });
  }
}

// ---------- Сверка ----------

export type GramotkaConflict =
  /** Правили и здесь, и на другом устройстве. */
  | { kind: 'diverged'; id: string; title: string; prepared: Prepared; file: DriveFile }
  /** Удалена здесь, а на Диске осталась. */
  | { kind: 'deleted-here'; id: string; title: string; file: DriveFile }
  /** Пропала с Диска (удалили с другого устройства?), а здесь есть. */
  | { kind: 'deleted-there'; id: string; title: string }
  /** На другом устройстве бойца передали (копия запечатана), а здесь его правили после последней сверки. */
  | { kind: 'sealed-there'; id: string; title: string; file: DriveFile; data: Uint8Array };

export interface GramotkiSyncSummary {
  uploaded: number;
  downloaded: number;
  removed: number;
  failed: string[];
  conflicts: GramotkaConflict[];
}

export type GramotkaDecision =
  | { kind: 'diverged'; id: string; choice: MergeChoice }
  /** Удалённое: true — удалить и на другой стороне, false — вернуть (оставить). */
  | { kind: 'deleted-here' | 'deleted-there'; id: string; remove: boolean }
  /** Передачу с другого устройства: true — принять (запечатать здесь), false — оставить здесь и вернуть на Диск. */
  | { kind: 'sealed-there'; id: string; accept: boolean };

/**
 * Сверить грамотки с Google Диском. Бесспорное — сразу (по 3 файла одновременно), спорное — списком для человека.
 * Грамотки должны быть открыты. Вызывать после входа в Google.
 */
export async function syncGramotki(store: GramotkiStore, onProgress?: (done: number, total: number) => void): Promise<GramotkiSyncSummary> {
  const base = readBase();
  const remote = await remoteFiles();
  let folder: Promise<string> | null = null;
  const parent = () => (folder ??= folderId());
  const ids = [...new Set([...store.ids(), ...remote.keys()])];
  const summary: GramotkiSyncSummary = { uploaded: 0, downloaded: 0, removed: 0, failed: [], conflicts: [] };

  const results = await runQueue(
    ids,
    async (id) => {
      const local = await store.revision(id);
      const file = remote.get(id);
      const rrev = file?.appProperties?.rev;
      const known = base[id];
      if (local && !file) {
        if (known !== undefined) summary.conflicts.push({ kind: 'deleted-there', id, title: store.title(id) });
        else {
          await upload(store, id, local, undefined, parent);
          base[id] = local;
          summary.uploaded++;
        }
        return;
      }
      if (!local && file) {
        if (known !== undefined) {
          summary.conflicts.push({ kind: 'deleted-here', id, title: file.name.replace(/\.gramotka$/, ''), file });
          return;
        }
        await download(store, id, file, base, summary);
        return;
      }
      if (!local || !file) return;
      if (local === rrev) {
        base[id] = local;
        return;
      }
      if (known === rrev) {
        await upload(store, id, local, file, parent);
        base[id] = local;
        summary.uploaded++;
        return;
      }
      if (known === local && rrev) {
        await download(store, id, file, base, summary);
        return;
      }
      // Изменились обе стороны (или сверяем впервые): открыть пришедшую и сравнить по счёту правок.
      const data = await drive.downloadFile(file.id);
      const label = await store.sealedLabelOf(data);
      if (label) {
        if (store.isSealed(id)) base[id] = (await store.revision(id)) ?? '';
        else summary.conflicts.push({ kind: 'sealed-there', id, title: store.title(id), file, data });
        return;
      }
      const prepared = await store.prepare(data);
      if (prepared.order === 'older') {
        await upload(store, id, local, file, parent);
        base[id] = local;
        summary.uploaded++;
      } else if (prepared.order === 'newer') {
        await store.accept(prepared);
        base[id] = (await store.revision(id)) ?? '';
        summary.downloaded++;
      } else if (prepared.order === 'same') {
        base[id] = local;
      } else summary.conflicts.push({ kind: 'diverged', id, title: store.title(id), prepared, file });
    },
    { concurrency: 3, onProgress },
  );
  results.forEach((r, i) => !r.ok && summary.failed.push(`${store.title(ids[i])}: ${r.error instanceof Error ? r.error.message : String(r.error)}`));
  writeBase(base);
  return summary;
}

async function download(store: GramotkiStore, id: string, file: DriveFile, base: Base, summary: GramotkiSyncSummary) {
  const data = await drive.downloadFile(file.id);
  if (await store.sealedLabelOf(data)) await store.importSealed(data);
  else await store.accept(await store.prepare(data));
  base[id] = (await store.revision(id)) ?? '';
  summary.downloaded++;
}

/** Решения человека по спорному. Возвращает итог (новые расхождения не появляются). */
export async function resolveGramotki(store: GramotkiStore, conflicts: GramotkaConflict[], decisions: GramotkaDecision[]): Promise<GramotkiSyncSummary> {
  const base = readBase();
  let folder: Promise<string> | null = null;
  const parent = () => (folder ??= folderId());
  const summary: GramotkiSyncSummary = { uploaded: 0, downloaded: 0, removed: 0, failed: [], conflicts: [] };
  for (const d of decisions) {
    const c = conflicts.find((x) => x.id === d.id && x.kind === d.kind);
    if (!c) continue;
    try {
      if (c.kind === 'diverged' && d.kind === 'diverged') {
        await store.accept(c.prepared, d.choice);
        const rev = (await store.revision(c.id))!;
        await upload(store, c.id, rev, c.file, parent);
        base[c.id] = rev;
        summary.uploaded++;
      } else if (c.kind === 'deleted-here' && d.kind === 'deleted-here') {
        if (d.remove) {
          await drive.trashFile(c.file.id);
          summary.removed++;
          delete base[c.id];
        } else await download(store, c.id, c.file, base, summary);
      } else if (c.kind === 'deleted-there' && d.kind === 'deleted-there') {
        if (d.remove) {
          await store.remove(c.id);
          summary.removed++;
          delete base[c.id];
        } else {
          const rev = (await store.revision(c.id))!;
          await upload(store, c.id, rev, undefined, parent);
          base[c.id] = rev;
          summary.uploaded++;
        }
      } else if (c.kind === 'sealed-there' && d.kind === 'sealed-there') {
        if (d.accept) {
          await store.importSealed(c.data);
          base[c.id] = (await store.revision(c.id)) ?? '';
          summary.downloaded++;
        } else {
          const rev = (await store.revision(c.id))!;
          await upload(store, c.id, rev, c.file, parent);
          base[c.id] = rev;
          summary.uploaded++;
        }
      }
    } catch (e) {
      summary.failed.push(`${c.title}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  writeBase(base);
  return summary;
}

/** Сколько занимают грамотки на Google Диске сейчас (файлы приложения). */
export async function remoteSize(): Promise<number> {
  return [...(await remoteFiles()).values()].reduce((n, f) => n + Number(f.size ?? 0), 0);
}

/** Забыть историю сверки грамоток на этом устройстве (при выключении). */
export function forgetGramotkiBase(): void {
  try {
    localStorage.removeItem(baseKey());
  } catch {
    /* нечего чистить */
  }
}

/** Любой файл грамотки с Диска — чтобы на новом устройстве открыть грамотки той же фразой (store.joinFrom). */
export async function anyRemoteGramotka(): Promise<Uint8Array | null> {
  const files = [...(await remoteFiles()).values()];
  return files[0] ? drive.downloadFile(files[0].id) : null;
}

// ---------- Для экранов ----------

export function gramotkiSummaryText(s: GramotkiSyncSummary): string {
  const parts = [s.downloaded && `получено ${s.downloaded}`, s.uploaded && `отправлено ${s.uploaded}`, s.removed && `удалено ${s.removed}`].filter(Boolean);
  return parts.length ? `Грамотки сверены: ${parts.join(', ')}.` : 'Грамотки сверены — всё совпадает.';
}

/** Спорное, найденное при сверке (в том числе при входе в Google), — до решения человека. */
let pending: GramotkaConflict[] = [];
const pendingEvents = new Emitter<GramotkaConflict[]>();
export function setPendingGramotki(c: GramotkaConflict[]) {
  pending = c;
  pendingEvents.emit(c);
}
export function usePendingGramotki(): GramotkaConflict[] {
  const [c, setC] = useState(pending);
  useEffect(() => pendingEvents.on(setC), []);
  return c;
}

/**
 * Сверить грамотки с Диском. На новом устройстве (здесь грамоток ещё нет, а на Диске есть) — просит ту же фразу,
 * что на другом устройстве. Вызывать после входа в Google.
 */
export async function runGramotkiSync(ws: Workspace, onProgress?: (done: number, total: number) => void): Promise<GramotkiSyncSummary | null> {
  const store = gramotkiStore(ws);
  if (store.snapshot().status === 'new') {
    const any = await anyRemoteGramotka();
    if (!any) return { uploaded: 0, downloaded: 0, removed: 0, failed: [], conflicts: [] };
    store.joinFrom(any);
    if (!(await ensureOpen(ws, 'На Google Диске есть ваши грамотки. Введите ту же фразу, что на другом устройстве'))) return null;
  } else if (!(await ensureOpen(ws, 'Чтобы сверить грамотки с Google Диском'))) return null;
  const s = await syncGramotki(store, onProgress);
  if (s.conflicts.length) setPendingGramotki(s.conflicts);
  return s;
}
