import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { addContribution } from '../outbox/outbox';
import { defineDocType } from '../schema/docType';
import { uid } from '../util/id';
import { getDocStore, useDocStore } from '../workspace/docStore';
import { useWorkspace } from '../workspace/WorkspaceContext';
import type { Workspace } from '../workspace/workspace';
import { BaseTree, chainText, removeNodeFromEntries, type BaseEntry, type Step } from './tree';

/*
 * База данных: набор древ «ключ:значение». Сначала база пустая — значения попадают в неё,
 * когда человек подтверждает их (в анкете или вручную). Всё добавленное уходит в «Предложения в базу».
 *
 * Каждое древо — отдельный файл: .docassist/base/<имя древа>.json («Адреса.json», «Должность в СО.json»).
 */

export interface BaseDoc {
  entries: BaseEntry[];
}

export const baseDocType = defineDocType<BaseDoc>({
  type: 'docassist/base',
  version: 1,
  migrations: {},
  empty: () => ({ entries: [] }),
});

export const BASE_DIR = 'base';

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').trim() || '_';

export function baseStore(ws: Workspace, tree: string) {
  return getDocStore(ws, ws.systemPath(BASE_DIR, `${safeName(tree)}.json`), baseDocType);
}

export interface AddPathOptions {
  source: string;
  /** Не отправлять в «Предложения в базу» (например, при импорте чужих предложений). */
  share?: boolean;
}

/** Добавить путь в древо. Возвращает false, если такой путь уже есть целиком. */
export async function addPath(ws: Workspace, tree: string, path: Step[], opts: AddPathOptions): Promise<boolean> {
  if (!path.length) return false;
  const store = baseStore(ws, tree);
  await store.load();
  // Прикрепляем к тому, что уже есть (с пропуском уровней, которых в пути нет), чтобы не плодить двойников.
  const current = new BaseTree(store.get().data.entries);
  const { node, matched } = current.resolve(path);
  if (matched === path.length) return false;
  const full = [...current.pathOf(node), ...path.slice(matched)];
  const clean = full.map((s) => ({ k: s.k, v: s.v, ...(s.t ? { t: s.t } : {}), ...(s.a ? { a: true } : {}) }));
  const entry: BaseEntry = { id: uid('b_'), path: clean, addedAt: new Date().toISOString(), source: opts.source };
  store.update((d) => ({ entries: [...d.entries, entry] }));
  if (opts.share !== false) addContribution(ws, { source: opts.source, dictionary: tree, label: chainText(clean), entry: clean });
  return true;
}

/** Список имён древ, которые есть в рабочей папке. */
export async function listTrees(ws: Workspace): Promise<string[]> {
  const files = await ws.list(ws.systemPath(BASE_DIR));
  return files.filter((f) => f.kind === 'file' && f.name.endsWith('.json')).map((f) => f.name.replace(/\.json$/, ''));
}

/** React-хук: живое древо. */
export function useBaseTree(name: string) {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? baseStore(workspace, name) : null), [workspace, name]);
  const state = useDocStore(store);
  const entries = state?.data.entries;
  const tree = useMemo(() => new BaseTree(entries ?? []), [entries]);
  return useMemo(
    () => ({
      name,
      tree,
      loaded: !!state?.loaded,
      readOnly: !!state?.tooNew || !!state?.broken,
      add(path: Step[], source: string): Promise<boolean> {
        if (!workspace) return Promise.resolve(false);
        return addPath(workspace, name, path, { source });
      },
      remove(path: Step[]) {
        store?.update((d) => ({ entries: removeNodeFromEntries(d.entries, path) }));
      },
    }),
    [tree, state?.loaded, state?.tooNew, state?.broken, store, workspace, name],
  );
}

export type BaseTreeHandle = ReturnType<typeof useBaseTree>;

export interface BaseSnapshot {
  trees: Map<string, BaseTree>;
  loaded: boolean;
}

/** React-хук: несколько древ сразу (их список может меняться — например, по правилам приложения). */
export function useBaseTrees(names: string[]): BaseSnapshot {
  const { workspace } = useWorkspace();
  const key = names.join('\u0001');
  const list = useMemo(() => [...new Set(names)], [key]);
  const stores = useMemo(() => (workspace ? list.map((n) => baseStore(workspace, n)) : []), [workspace, list]);
  useEffect(() => {
    for (const s of stores) void s.load();
  }, [stores]);
  const cache = useRef<{ parts: BaseEntry[][]; loaded: boolean; value: BaseSnapshot } | null>(null);
  const subscribe = useCallback(
    (fn: () => void) => {
      const offs = stores.map((s) => s.subscribe(fn));
      return () => offs.forEach((off) => off());
    },
    [stores],
  );
  const getSnapshot = useCallback((): BaseSnapshot => {
    const parts = stores.map((s) => s.get().data.entries);
    const loaded = stores.every((s) => s.get().loaded);
    const c = cache.current;
    if (c && c.loaded === loaded && c.parts.length === parts.length && c.parts.every((p, i) => p === parts[i])) return c.value;
    const trees = new Map<string, BaseTree>();
    list.forEach((n, i) => {
      const prev = c?.value.trees.get(n);
      trees.set(n, prev && prev.entries === parts[i] ? prev : new BaseTree(parts[i]));
    });
    const value = { trees, loaded };
    cache.current = { parts, loaded, value };
    return value;
  }, [stores, list]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
