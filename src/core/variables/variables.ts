import { useMemo } from 'react';
import { defineDocType } from '../schema/docType';
import { getDocStore, useDocStore } from '../workspace/docStore';
import { useWorkspace } from '../workspace/WorkspaceContext';
import type { Workspace } from '../workspace/workspace';
import { uid } from '../util/id';
import { VAR_KEY_RE, VAR_KINDS, type Variable, type VarKind } from './types';

/*
 * Глобальные переменные — значения, которые часто нужны в разных местах
 * (ФИО, телефон, адрес штаба…). Хранятся в рабочей папке: .docassist/variables.json.
 * В любом поле ввода можно написать <ключ> — он заменится значением.
 */

export interface VariablesDoc {
  items: Variable[];
}

export const variablesDocType = defineDocType<VariablesDoc>({
  type: 'docassist/variables',
  version: 1,
  migrations: {},
  empty: () => ({ items: [] }),
});

export function variablesStore(ws: Workspace) {
  return getDocStore(ws, ws.systemPath('variables.json'), variablesDocType);
}

/** Заменить <ключ> на значения переменных. Неизвестные ключи остаются как есть. */
export function resolveVars(text: string, items: Variable[]): string {
  if (!text.includes('<')) return text;
  const map = new Map(items.map((v) => [v.key.toLowerCase(), v.value]));
  return text.replace(/<([\p{L}\p{N}_.-]{1,40})>/gu, (m, key: string) => map.get(key.toLowerCase()) ?? m);
}

export function findVarTokens(text: string): string[] {
  return [...text.matchAll(/<([\p{L}\p{N}_.-]{1,40})>/gu)].map((m) => m[1]);
}

export function suggestKey(kind: VarKind, items: Variable[]): string {
  const base = VAR_KINDS[kind].defaultKey;
  const keys = new Set(items.map((v) => v.key.toLowerCase()));
  if (!keys.has(base)) return base;
  for (let i = 2; ; i++) if (!keys.has(`${base}${i}`)) return `${base}${i}`;
}

export function validateKey(key: string, items: Variable[], selfId?: string): string | null {
  if (!VAR_KEY_RE.test(key)) return 'Ключ: буквы, цифры, «_», «-», «.», без пробелов (до 40 символов)';
  if (items.some((v) => v.id !== selfId && v.key.toLowerCase() === key.toLowerCase())) return 'Такой ключ уже есть';
  return null;
}

export type NewVariable = Pick<Variable, 'key' | 'label' | 'value' | 'kind'> & { source?: string };

export function useVariables() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? variablesStore(workspace) : null), [workspace]);
  const state = useDocStore(store);
  const items = state?.data.items ?? [];

  return useMemo(() => {
    const now = () => new Date().toISOString();
    return {
      ready: !!state?.loaded,
      readOnly: !!state?.tooNew || !!state?.broken,
      error: state?.error,
      items,
      add(v: NewVariable): Variable {
        const item: Variable = { ...v, id: uid('var_'), createdAt: now(), updatedAt: now() };
        store?.update((d) => ({ items: [...d.items, item] }));
        return item;
      },
      update(id: string, patch: Partial<NewVariable>) {
        store?.update((d) => ({ items: d.items.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: now() } : x)) }));
      },
      remove(id: string) {
        store?.update((d) => ({ items: d.items.filter((x) => x.id !== id) }));
      },
      replaceAll(next: Variable[]) {
        store?.update(() => ({ items: next }));
      },
      byKind(kind?: VarKind): Variable[] {
        if (!kind) return items;
        // Сначала подходящие по типу, затем остальные.
        return [...items.filter((v) => v.kind === kind), ...items.filter((v) => v.kind !== kind)];
      },
      resolve(text: string) {
        return resolveVars(text, items);
      },
    };
  }, [items, state?.loaded, state?.tooNew, state?.error, store]);
}
