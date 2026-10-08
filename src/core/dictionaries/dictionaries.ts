import { useMemo } from 'react';
import { addContribution } from '../outbox/outbox';
import { defineDocType } from '../schema/docType';
import { uid } from '../util/id';
import { getDocStore, useDocStore } from '../workspace/docStore';
import { useWorkspace } from '../workspace/WorkspaceContext';
import type { Workspace } from '../workspace/workspace';

/*
 * Пользовательские справочники (дополнения к встроенным).
 *
 * Встроенные справочники живут в коде и обновляются вместе с приложением.
 * Всё, что добавил пользователь, хранится в .docassist/dictionaries/<имя>.json,
 * доступно всем приложениям и автоматически попадает в «Предложения в базу».
 */

export interface DictEntry<V = unknown> {
  id: string;
  value: V;
  addedAt: string;
  origin: 'user' | 'import';
}

export interface DictDoc<V = unknown> {
  entries: DictEntry<V>[];
  /** Встроенные значения, которые пользователь скрыл. */
  hidden: string[];
}

export const dictDocType = defineDocType<DictDoc>({
  type: 'docassist/dictionary',
  version: 1,
  migrations: {},
  empty: () => ({ entries: [], hidden: [] }),
});

export function dictionaryStore<V>(ws: Workspace, name: string) {
  return getDocStore(ws, ws.systemPath('dictionaries', `${name}.json`), dictDocType) as ReturnType<
    typeof getDocStore<DictDoc<V>>
  >;
}

export interface AddOptions {
  /** Человекочитаемое описание для «Предложений в базу». */
  label: string;
  source: string;
  origin?: DictEntry['origin'];
  /** Не отправлять в предложения (например, при импорте). */
  share?: boolean;
}

export function addDictEntry<V>(ws: Workspace, name: string, value: V, opts: AddOptions): DictEntry<V> {
  const entry: DictEntry<V> = { id: uid('d_'), value, addedAt: new Date().toISOString(), origin: opts.origin ?? 'user' };
  const store = dictionaryStore<V>(ws, name);
  void store.load().then(() => store.update((d) => ({ ...d, entries: [...d.entries, entry] })));
  if (opts.share !== false) {
    addContribution(ws, { source: opts.source, dictionary: name, label: opts.label, entry: value });
  }
  return entry;
}

export function useDictionary<V>(name: string) {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? dictionaryStore<V>(workspace, name) : null), [workspace, name]);
  const state = useDocStore(store);
  const entries = (state?.data.entries ?? []) as DictEntry<V>[];
  const hidden = state?.data.hidden ?? [];
  return useMemo(
    () => ({
      loaded: !!state?.loaded,
      entries,
      hidden,
      add(value: V, opts: AddOptions) {
        if (!workspace) return;
        return addDictEntry(workspace, name, value, opts);
      },
      remove(id: string) {
        store?.update((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
      },
      setHidden(key: string, isHidden: boolean) {
        store?.update((d) => ({
          ...d,
          hidden: isHidden ? [...new Set([...d.hidden, key])] : d.hidden.filter((h) => h !== key),
        }));
      },
    }),
    [entries, hidden, state?.loaded, store, workspace, name],
  );
}
