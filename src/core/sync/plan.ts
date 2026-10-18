import type { Stamp } from '../device/device';
import { decideSync, type Conflict, type ConflictChoice } from '../device/sync';
import { md5 } from '../google/md5';

/*
 * Сверка личных данных «устройство ↔ личный Google Диск» — без побочных действий: только решает, что куда.
 * Элемент — один файл рабочей папки (путь → его JSON). У элемента на Диске — метка «дата, время, устройство».
 */

export interface SyncItem {
  data: unknown;
  stamp: Stamp;
  /** Отпечаток содержимого. */
  hash: string;
}

/** Содержимое файла личных настроек на Диске (внутри — зашифровано). */
export interface SyncPayload {
  $type: 'docassist/personal-sync';
  version: 1;
  savedAt: Stamp;
  items: Record<string, SyncItem>;
}

/** Что помнит устройство о прошлой сверке. */
export interface SyncBase {
  /** Отпечатки на момент прошлой сверки. */
  hashes: Record<string, string>;
  /** Отложенные расхождения: путь → «отпечаток здесь|отпечаток на Диске». Пока они те же — не спрашивать снова. */
  dismissed: Record<string, string>;
}

/** Отпечаток JSON без служебных полей конверта, которые меняются при каждом сохранении. */
export function hashJson(data: unknown): string {
  const clean = data && typeof data === 'object' && !Array.isArray(data) ? Object.fromEntries(Object.entries(data).filter(([k]) => k !== '$savedAt' && k !== '$app')) : data;
  return md5(new TextEncoder().encode(JSON.stringify(clean)));
}

export interface LocalItem {
  data: unknown;
  stamp: Stamp;
}

export interface SyncPlan {
  push: string[];
  pull: string[];
  same: string[];
  conflicts: string[];
}

export function planSync(paths: string[], local: Record<string, LocalItem | undefined>, remote: Record<string, SyncItem | undefined>, base: SyncBase): SyncPlan {
  const plan: SyncPlan = { push: [], pull: [], same: [], conflicts: [] };
  for (const p of paths) {
    const l = local[p] ? hashJson(local[p]!.data) : undefined;
    const r = remote[p]?.hash;
    if (l === undefined && r === undefined) continue;
    let action = decideSync(l, r, base.hashes[p]);
    if (action === 'conflict' && base.dismissed[p] === `${l}|${r}`) action = 'same';
    plan[action === 'conflict' ? 'conflicts' : action].push(p);
  }
  return plan;
}

/** Расхождения для окна выбора. */
export function conflictsFor(paths: string[], local: Record<string, LocalItem | undefined>, remote: Record<string, SyncItem | undefined>, titleOf: (path: string) => string): Conflict[] {
  return paths.map((p) => ({
    id: p,
    title: titleOf(p),
    local: { stamp: local[p]?.stamp, details: sizeText(local[p]?.data) },
    remote: { stamp: remote[p]?.stamp, details: sizeText(remote[p]?.data) },
  }));
}

function sizeText(data: unknown): string | undefined {
  if (data === undefined) return undefined;
  const n = JSON.stringify(data).length;
  return n < 1024 ? `${n} байт` : `${(n / 1024).toFixed(1)} КБ`;
}

export interface SyncResult {
  /** Новое содержимое файла на Диске (или null — менять не нужно). */
  payload: SyncPayload | null;
  /** Что записать на устройство. */
  writeLocal: Record<string, unknown>;
  base: SyncBase;
}

/** Применить план и решения человека: что записать на устройство, что — на Диск, что запомнить. */
export function applyPlan(
  plan: SyncPlan,
  local: Record<string, LocalItem | undefined>,
  remote: SyncPayload | null,
  choices: ConflictChoice[],
  base: SyncBase,
  now: Stamp,
): SyncResult {
  const items: Record<string, SyncItem> = { ...(remote?.items ?? {}) };
  const writeLocal: Record<string, unknown> = {};
  const next: SyncBase = { hashes: { ...base.hashes }, dismissed: { ...base.dismissed } };
  let changed = !remote;

  const pushOne = (p: string) => {
    const l = local[p]!;
    items[p] = { data: l.data, stamp: l.stamp, hash: hashJson(l.data) };
    next.hashes[p] = items[p].hash;
    delete next.dismissed[p];
    changed = true;
  };
  const pullOne = (p: string) => {
    const r = items[p];
    writeLocal[p] = r.data;
    next.hashes[p] = r.hash;
    delete next.dismissed[p];
  };

  plan.push.forEach(pushOne);
  plan.pull.forEach(pullOne);
  for (const p of plan.same) {
    const r = items[p];
    if (r && local[p] && hashJson(local[p]!.data) === r.hash) next.hashes[p] = r.hash;
  }
  for (const p of plan.conflicts) {
    const c = choices.find((x) => x.id === p);
    if (!c) continue;
    if (c.keep === 'local' && c.overwrite) pushOne(p);
    else if (c.keep === 'remote' && c.overwrite) pullOne(p);
    else next.dismissed[p] = `${hashJson(local[p]?.data)}|${items[p]?.hash}`;
  }
  return { payload: changed ? { $type: 'docassist/personal-sync', version: 1, savedAt: now, items } : null, writeLocal, base: next };
}
