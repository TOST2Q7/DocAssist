import { useEffect, useSyncExternalStore } from 'react';
import type { DocType } from '../schema/docType';
import { ReadOnlyDocError, type Workspace } from './workspace';

/**
 * Живой документ рабочей папки: загружается один раз, изменения сохраняются автоматически
 * (с небольшой задержкой), все подписчики видят одно и то же состояние.
 */

export interface DocState<T> {
  data: T;
  loaded: boolean;
  tooNew: boolean;
  /** Файл не удалось прочитать (повреждён) — перезаписывать его нельзя, чтобы не потерять данные. */
  broken: boolean;
  error?: string;
  saving: boolean;
}

export class DocStore<T> {
  private state: DocState<T>;
  private listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly ws: Workspace,
    readonly path: string,
    readonly dt: DocType<T>,
  ) {
    this.state = { data: dt.empty(), loaded: false, tooNew: false, broken: false, saving: false };
  }

  get = (): DocState<T> => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<DocState<T>>) {
    this.state = { ...this.state, ...patch };
    for (const fn of [...this.listeners]) fn();
  }

  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.ws
        .readDoc(this.path, this.dt)
        .then((r) => this.set({ data: r.data, loaded: true, tooNew: r.tooNew, error: undefined }))
        .catch((e: unknown) =>
          this.set({ loaded: true, broken: true, error: `Не удалось прочитать «${this.path}»: ${e instanceof Error ? e.message : String(e)}` }),
        );
    }
    return this.loading;
  }

  /** Загрузить, если ещё не загружено, и вернуть данные. */
  async read(): Promise<T> {
    await this.load();
    return this.state.data;
  }

  update(fn: (data: T) => T): void {
    if (this.state.tooNew) throw new ReadOnlyDocError(this.path);
    if (this.state.broken) {
      console.warn(`DocAssist: «${this.path}» повреждён — изменения не сохраняются`);
      return;
    }
    this.set({ data: fn(this.state.data) });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 300);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.set({ saving: true });
    try {
      await this.ws.writeDoc(this.path, this.dt, this.state.data);
      this.set({ saving: false, error: undefined });
    } catch (e) {
      this.set({ saving: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

const stores = new WeakMap<Workspace, Map<string, DocStore<unknown>>>();

export function getDocStore<T>(ws: Workspace, path: string, dt: DocType<T>): DocStore<T> {
  let map = stores.get(ws);
  if (!map) {
    map = new Map();
    stores.set(ws, map);
  }
  let s = map.get(path) as DocStore<T> | undefined;
  if (!s) {
    s = new DocStore(ws, path, dt);
    map.set(path, s as DocStore<unknown>);
  }
  return s;
}

/** React-хук: подписка на живой документ. */
export function useDocStore<T>(store: DocStore<T> | null): DocState<T> | null {
  useEffect(() => {
    void store?.load();
  }, [store]);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.get : nullGet,
  ) as DocState<T> | null;
}

const noopSubscribe = () => () => {};
const nullGet = () => null;
