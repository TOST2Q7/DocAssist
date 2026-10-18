import { useSyncExternalStore } from 'react';
import { getDevice, makeStamp, type Stamp } from '../device/device';
import type { Conflict, ConflictChoice } from '../device/sync';
import { drive, getAuthState, type DriveFile } from '../google';
import { mergeSeen } from '../registry/badges';
import { APPS } from '../registry/apps';
import type { SyncGroupDef } from '../registry/types';
import { setThemePref, type ThemePref } from '../theme';
import { keyFromPhrase, lockWithKey, rememberedKey, rememberKey, forgetKey, sameSalt, unlock, unlockWithKey, VaultError, type VaultKey } from '../vault/vault';
import { flushDocStores, reloadDocStore } from '../workspace/docStore';
import type { Workspace } from '../workspace/workspace';
import { applyPlan, conflictsFor, planSync, type LocalItem, type SyncBase, type SyncPayload } from './plan';

/*
 * Личные настройки на личном Google Диске человека — по желанию, чтобы запускать DocAssist на других устройствах
 * с теми же настройками. Один файл в «Моём диске», закрытый контрольной фразой (src/core/vault): без фразы его
 * не открыть никому, восстановить фразу нельзя. Что переносить — выбирает человек (группы ниже).
 * Расхождения решает человек по меткам «дата, время, устройство».
 */

const MARK_KEY = 'docassist';
const MARK_VALUE = 'personal-sync';
const FILE_NAME = 'DocAssist — личные настройки';
const PREFS_KEY = 'docassist.sync.prefs';
const BASE_KEY = 'docassist.sync.base';

interface Group extends SyncGroupDef {
  /** Файлы, которые появляются сами (например, древа базы данных): всё внутри папки. */
  folder?: string;
}

/** Что можно переносить. Настройки приложений (settingsFiles) — первая группа, остальное — по выбору. */
export function syncGroups(ws: Workspace | null): Group[] {
  const sys = (p: string) => (ws ? ws.systemPath(p) : `.docassist/${p}`);
  const groups: Group[] = [
    {
      id: 'settings',
      title: 'Настройки приложений и оформление',
      hint: 'Шаблоны, правила проверки, тексты документов, тема.',
      files: [sys('prefs.json'), ...APPS.flatMap((a) => a.settingsFiles ?? [])],
      default: true,
    },
    { id: 'variables', title: 'Глобальные переменные', hint: 'Значения, которые подставляются по Ctrl+Пробел.', files: [sys('variables.json')], default: true },
    { id: 'base', title: 'База данных (древа)', hint: 'Адреса, должности и другие списки.', files: [], folder: sys('base'), default: true },
    ...APPS.flatMap((a) => a.syncGroups ?? []),
    { id: 'people', title: 'База людей', hint: 'Паспортные и другие данные людей.', files: [sys('people.json')], personal: true },
    { id: 'suggest', title: 'Словарь подсказок', hint: 'Что вводили в поля (в том числе имена).', files: [sys('suggest.json')], personal: true },
  ];
  return groups;
}

// ---------- Настройки этого устройства ----------

export interface DeviceSyncPrefs {
  /** Включено на этом устройстве. */
  enabled: boolean;
  /** Подтягивать при входе в Google. */
  auto: boolean;
  /** Выбранные группы (null — по умолчанию). */
  groups: string[] | null;
  lastSync?: Stamp;
  account?: string;
}

const listeners = new Set<() => void>();
let prefsCache: DeviceSyncPrefs | null = null;

export function getSyncPrefs(): DeviceSyncPrefs {
  if (prefsCache) return prefsCache;
  let v: Partial<DeviceSyncPrefs> = {};
  try {
    v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<DeviceSyncPrefs>;
  } catch {
    /* нет памяти браузера */
  }
  prefsCache = { enabled: !!v.enabled, auto: v.auto ?? true, groups: v.groups ?? null, lastSync: v.lastSync, account: v.account };
  return prefsCache;
}

export function setSyncPrefs(patch: Partial<DeviceSyncPrefs>): void {
  prefsCache = { ...getSyncPrefs(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache));
  } catch {
    /* без памяти браузера — до перезагрузки */
  }
  for (const fn of [...listeners]) fn();
}

export function useSyncPrefs(): DeviceSyncPrefs {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, getSyncPrefs);
}

export function selectedGroups(ws: Workspace | null): Group[] {
  const all = syncGroups(ws);
  const chosen = getSyncPrefs().groups;
  return all.filter((g) => (chosen ? chosen.includes(g.id) : g.default));
}

function baseKey(): string {
  return `${BASE_KEY}.${getAuthState().email ?? getSyncPrefs().account ?? 'anon'}`;
}
function readBase(): SyncBase {
  try {
    const v = JSON.parse(localStorage.getItem(baseKey()) ?? '{}') as Partial<SyncBase>;
    return { hashes: v.hashes ?? {}, dismissed: v.dismissed ?? {} };
  } catch {
    return { hashes: {}, dismissed: {} };
  }
}
function writeBase(b: SyncBase) {
  try {
    localStorage.setItem(baseKey(), JSON.stringify(b));
  } catch {
    /* сверка просто будет спрашивать чаще */
  }
}

// ---------- Файл на Диске ----------

/** Файл личных настроек на Диске этого человека (или null). */
export async function findRemote(): Promise<DriveFile | null> {
  const files = await drive.findByAppProperty(MARK_KEY, MARK_VALUE);
  files.sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''));
  return files[0] ?? null;
}

async function readRemote(file: DriveFile, opts: { key?: VaultKey | null; phrase?: string }): Promise<{ payload: SyncPayload; key: VaultKey } | null> {
  const bytes = await drive.downloadFile(file.id);
  let data: Uint8Array;
  let key: VaultKey;
  if (opts.key && sameSalt(bytes, opts.key)) {
    data = await unlockWithKey(bytes, opts.key);
    key = opts.key;
  } else if (opts.phrase) {
    const r = await unlock(bytes, opts.phrase);
    data = r.data;
    key = r.key;
  } else return null;
  const payload = JSON.parse(new TextDecoder().decode(data)) as SyncPayload;
  if (payload?.$type !== 'docassist/personal-sync') throw new Error('Это не файл личных настроек DocAssist.');
  return { payload, key };
}

async function writeRemote(file: DriveFile | null, payload: SyncPayload, key: VaultKey): Promise<DriveFile> {
  const bytes = await lockWithKey(new TextEncoder().encode(JSON.stringify(payload)), key);
  if (file) return drive.updateContent(file.id, bytes, 'application/octet-stream');
  return drive.uploadFile({ name: FILE_NAME, parentId: 'root', data: bytes, mimeType: 'application/octet-stream', appProperties: { [MARK_KEY]: MARK_VALUE } });
}

// ---------- Сверка ----------

async function pathsOf(ws: Workspace, groups: Group[], remote: SyncPayload | null): Promise<string[]> {
  const out = new Set<string>();
  for (const g of groups) {
    g.files.forEach((f) => out.add(f));
    if (g.folder) {
      for (const e of await ws.list(g.folder).catch(() => [])) if (e.kind === 'file' && e.name.endsWith('.json')) out.add(e.path);
      // Пути из файла на Диске — только «папка группы/имя.json», без вложенных папок и «..».
      for (const p of Object.keys(remote?.items ?? {})) if (p.startsWith(`${g.folder}/`) && /^[^/\\.][^/\\]*\.json$/.test(p.slice(g.folder.length + 1))) out.add(p);
    }
  }
  return [...out];
}

async function readLocal(ws: Workspace, paths: string[]): Promise<Record<string, LocalItem | undefined>> {
  const device = getDevice();
  const out: Record<string, LocalItem | undefined> = {};
  for (const p of paths) {
    const data = await ws.readJson(p).catch(() => undefined);
    if (data === undefined) continue;
    const st = await ws.stat(p).catch(() => null);
    out[p] = { data, stamp: { at: new Date(st?.lastModified || Date.now()).toISOString(), device: device.name, deviceId: device.id } };
  }
  return out;
}

/** Понятное название файла для окна расхождений. */
export function syncTitle(ws: Workspace | null, path: string): string {
  for (const g of syncGroups(ws)) {
    if (g.files.includes(path)) {
      const app = APPS.find((a) => a.settingsFiles?.includes(path) || a.syncGroups?.some((x) => x.files.includes(path)));
      if (path.endsWith('prefs.json')) return 'Оформление (тема)';
      return app && g.id === 'settings' ? `${app.title}: настройки` : app ? `${app.title}: ${g.title}` : g.title;
    }
    if (g.folder && path.startsWith(`${g.folder}/`)) return `${g.title}: ${path.slice(g.folder.length + 1).replace(/\.json$/, '')}`;
  }
  return path;
}

export interface SyncSummary {
  pushed: number;
  pulled: number;
  /** Отложено человеком. */
  postponed: number;
  at: Stamp;
}

export type SyncStep =
  | { kind: 'need-phrase'; exists: boolean }
  | { kind: 'conflicts'; conflicts: Conflict[]; resolve: (choices: ConflictChoice[]) => Promise<SyncSummary> }
  | { kind: 'done'; summary: SyncSummary };

export interface SyncOptions {
  /** Контрольная фраза (если ключ не запомнен или файла ещё нет). */
  phrase?: string;
  /** Запомнить ключ на этом устройстве. */
  remember?: boolean;
}

/**
 * Один проход сверки: прочитать Диск и устройство, применить бесспорное (и решения человека по спорному).
 * Спорное без решения остаётся как есть и возвращается списком.
 */
async function cycle(ws: Workspace, key: VaultKey, onlyPaths: string[] | null, choices: ConflictChoice[]): Promise<{ summary: SyncSummary; conflicts: Conflict[]; conflictPaths: string[] }> {
  const file = await findRemote();
  const payload = file ? ((await readRemote(file, { key }))?.payload ?? null) : null;
  if (file && !payload) throw new VaultError('wrong-phrase', 'Файл на Диске закрыт другой фразой — введите её заново.');
  const paths = onlyPaths ?? (await pathsOf(ws, selectedGroups(ws), payload));
  const local = await readLocal(ws, paths);
  const base = readBase();
  const plan = planSync(paths, local, payload?.items ?? {}, base);
  const now = makeStamp();
  const res = applyPlan(plan, local, payload, choices, base, now);
  for (const [p, data] of Object.entries(res.writeLocal)) {
    await ws.writeBytes(p, JSON.stringify(data, null, 2));
    await reloadDocStore(ws, p);
    if (p.endsWith('prefs.json')) applyPrefs(data);
  }
  if (res.payload) await writeRemote(file, res.payload, key);
  writeBase(res.base);
  setSyncPrefs({ enabled: true, lastSync: now, account: getAuthState().email ?? getSyncPrefs().account });
  const decided = (p: string) => choices.find((c) => c.id === p);
  const open = plan.conflicts.filter((p) => !decided(p));
  return {
    summary: {
      pushed: plan.push.length + choices.filter((c) => c.keep === 'local' && c.overwrite && plan.conflicts.includes(c.id)).length,
      pulled: Object.keys(res.writeLocal).length,
      postponed: plan.conflicts.filter((p) => decided(p) && !decided(p)!.overwrite).length,
      at: now,
    },
    conflicts: conflictsFor(open, local, payload?.items ?? {}, (p) => syncTitle(ws, p)),
    conflictPaths: open,
  };
}

/** Сверить устройство с личным Диском. Вызывать после входа в Google (из обработчика нажатия). */
export async function runSync(ws: Workspace, opts: SyncOptions = {}): Promise<SyncStep> {
  await flushDocStores(ws);
  const file = await findRemote();
  const remembered = await rememberedKey();
  let key: VaultKey;
  if (file) {
    const r = await readRemote(file, { key: remembered, phrase: opts.phrase });
    if (!r) return { kind: 'need-phrase', exists: true };
    key = r.key;
  } else {
    if (!opts.phrase) return { kind: 'need-phrase', exists: false };
    key = await keyFromPhrase(opts.phrase);
  }
  if (opts.remember) await rememberKey(key);

  // Бесспорное — сразу; спорное — человеку.
  const first = await cycle(ws, key, null, []);
  if (!first.conflicts.length) return { kind: 'done', summary: first.summary };
  return {
    kind: 'conflicts',
    conflicts: first.conflicts,
    resolve: async (choices) => {
      await flushDocStores(ws);
      const r = await cycle(ws, key, first.conflictPaths, choices);
      return { ...r.summary, pushed: r.summary.pushed + first.summary.pushed, pulled: r.summary.pulled + first.summary.pulled };
    },
  };
}

function applyPrefs(data: unknown) {
  const d = (data as { data?: { theme?: ThemePref; seen?: Record<string, string> } } | undefined)?.data;
  if (d?.theme) setThemePref(d.theme);
  if (d?.seen) mergeSeen(d.seen);
}

/** Сменить контрольную фразу: файл перешифровывается новой фразой. */
export async function changePhrase(oldPhrase: string | null, newPhrase: string, remember: boolean): Promise<void> {
  const file = await findRemote();
  if (!file) throw new Error('На Google Диске ещё нет личных настроек.');
  const r = await readRemote(file, { key: await rememberedKey(), phrase: oldPhrase ?? undefined });
  if (!r) throw new Error('Введите нынешнюю фразу.');
  const key = await keyFromPhrase(newPhrase);
  await writeRemote(file, { ...r.payload, savedAt: makeStamp() }, key);
  await forgetKey();
  if (remember) await rememberKey(key);
}

/** Удалить личные настройки с Google Диска насовсем и забыть ключ на этом устройстве. */
export async function removeRemote(): Promise<boolean> {
  const file = await findRemote();
  if (file) await drive.deleteForever(file.id);
  await forgetKey();
  try {
    localStorage.removeItem(baseKey());
  } catch {
    /* нечего чистить */
  }
  setSyncPrefs({ enabled: false, lastSync: undefined });
  return !!file;
}

/** Забыть фразу (ключ) на этом устройстве и выключить сверку здесь. Файл на Диске остаётся. */
export async function forgetHere(): Promise<void> {
  await forgetKey();
  setSyncPrefs({ enabled: false });
}

export async function hasRememberedKey(): Promise<boolean> {
  return !!(await rememberedKey());
}

// ---------- Отложенное решение (расхождения, найденные при входе) ----------

let pendingStep: Extract<SyncStep, { kind: 'conflicts' }> | null = null;
const pendingListeners = new Set<() => void>();

export function setPendingConflicts(step: Extract<SyncStep, { kind: 'conflicts' }> | null): void {
  pendingStep = step;
  for (const fn of [...pendingListeners]) fn();
}

export function usePendingConflicts(): Extract<SyncStep, { kind: 'conflicts' }> | null {
  return useSyncExternalStore(
    (fn) => {
      pendingListeners.add(fn);
      return () => pendingListeners.delete(fn);
    },
    () => pendingStep,
  );
}
