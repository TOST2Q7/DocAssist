import { useMemo } from 'react';
import { defineDocType } from '../schema/docType';
import { getDocStore, useDocStore } from '../workspace/docStore';
import { useWorkspace } from '../workspace/WorkspaceContext';
import type { Workspace } from '../workspace/workspace';

/*
 * Словарь подсказок — то, что человек сам вводил в поля. Запоминается при выходе из поля
 * и подсказывается при наборе в таком же поле (в любом приложении): «Имя» — в полях имени,
 * адрес — в полях адреса. Поле объявляет себя атрибутами:
 *   data-field="person.firstName" — точное поле общего языка (подсказки в первую очередь отсюда);
 *   data-kind="name" — тип значения (подсказки из других полей того же типа).
 * Файл: .docassist/suggest.json. В «Предложения в базу» не попадает.
 */

export interface SuggestItem {
  /** Поле, где значение вводили: id поля (person.firstName) или тип (name). */
  key: string;
  kind?: string;
  value: string;
  /** Сколько раз вводили или выбирали. */
  count: number;
  last: string;
}

export interface SuggestDoc {
  /** Запоминать вводимые значения и подсказывать. */
  enabled: boolean;
  items: SuggestItem[];
}

export const suggestDocType = defineDocType<SuggestDoc>({
  type: 'docassist/suggest',
  version: 1,
  migrations: {},
  empty: () => ({ enabled: true, items: [] }),
});

/** Сколько значений хранить на одно поле. */
const PER_KEY = 300;
const MAX_LEN = 300;

export function suggestStore(ws: Workspace) {
  return getDocStore(ws, ws.systemPath('suggest.json'), suggestDocType);
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** Добавить значение (или поднять его счётчик). */
export function learnValue(doc: SuggestDoc, key: string, kind: string | undefined, raw: string): SuggestDoc {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (!doc.enabled || !key || !value || value.length > MAX_LEN) return doc;
  const now = new Date().toISOString();
  const i = doc.items.findIndex((x) => x.key === key && x.value === value);
  let items = i >= 0 ? doc.items.map((x, j) => (j === i ? { ...x, kind: kind ?? x.kind, count: x.count + 1, last: now } : x)) : [...doc.items, { key, ...(kind ? { kind } : {}), value, count: 1, last: now }];
  const own = items.filter((x) => x.key === key);
  if (own.length > PER_KEY) {
    const drop = new Set([...own].sort((a, b) => a.count - b.count || a.last.localeCompare(b.last)).slice(0, own.length - PER_KEY));
    items = items.filter((x) => !drop.has(x));
  }
  return { ...doc, items };
}

export interface SuggestQuery {
  key?: string;
  kind?: string;
  /** Что уже набрано. */
  text: string;
  limit?: number;
}

/**
 * Лучшие совпадения для поля: сначала начинающиеся с набранного, потом с совпадением начала слова,
 * потом содержащие его; среди равных — из этого же поля, затем из полей того же типа; чаще и недавно — выше.
 */
export function rankSuggestions(items: SuggestItem[], q: SuggestQuery): SuggestItem[] {
  const text = norm(q.text);
  const scored: { item: SuggestItem; score: number[] }[] = [];
  for (const item of items) {
    const same = q.key && item.key === q.key ? 2 : q.kind && item.kind === q.kind ? 1 : 0;
    if (!same) continue;
    const v = norm(item.value);
    if (v === text) continue;
    let match = 1;
    if (text) {
      if (v.startsWith(text)) match = 3;
      else if (v.split(/[\s,.()«»"-]+/).some((w) => w.startsWith(text))) match = 2;
      else if (v.includes(text)) match = 1;
      else continue;
    }
    scored.push({ item, score: [match, same, item.count, Date.parse(item.last) || 0] });
  }
  scored.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) if (a.score[i] !== b.score[i]) return b.score[i] - a.score[i];
    return 0;
  });
  const seen = new Set<string>();
  const out: SuggestItem[] = [];
  for (const { item } of scored) {
    if (seen.has(item.value)) continue;
    seen.add(item.value);
    out.push(item);
    if (out.length >= (q.limit ?? 5)) break;
  }
  return out;
}

export function useSuggestions() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? suggestStore(workspace) : null), [workspace]);
  const state = useDocStore(store);
  const doc = state?.data;
  return useMemo(
    () => ({
      ready: !!state?.loaded,
      readOnly: !!state?.tooNew || !!state?.broken,
      enabled: doc?.enabled ?? true,
      items: doc?.items ?? [],
      learn(key: string, kind: string | undefined, value: string) {
        if (!store) return;
        // Только после загрузки файла — иначе запись затёрла бы уже сохранённый словарь.
        void store.load().then(() => {
          const s = store.get();
          if (s.tooNew || s.broken || !s.data.enabled) return;
          store.update((d) => learnValue(d, key, kind, value));
        });
      },
      remove(key: string, value: string) {
        store?.update((d) => ({ ...d, items: d.items.filter((x) => !(x.key === key && x.value === value)) }));
      },
      clear() {
        store?.update((d) => ({ ...d, items: [] }));
      },
      setEnabled(enabled: boolean) {
        store?.update((d) => ({ ...d, enabled }));
      },
    }),
    [doc, state?.loaded, state?.tooNew, state?.broken, store],
  );
}
