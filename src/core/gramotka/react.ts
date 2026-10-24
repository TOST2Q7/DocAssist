import { useMemo, useSyncExternalStore } from 'react';
import { Emitter } from '../util/events';
import { useWorkspace } from '../workspace/WorkspaceContext';
import type { Workspace } from '../workspace/workspace';
import { gramotkiStore, type GramotkiSnapshot, type GramotkiStore } from './store';

/*
 * Грамотки для экранов: состояние (закрыты, открываются, открыты) и просьба открыть. Окно ввода фразы одно на весь
 * сайт (src/ui/GramotkiDialog.tsx): приложение просит «откройте грамотки» и ждёт, пока человек введёт фразу.
 */

const STARTING: GramotkiSnapshot = { status: 'starting', owner: null, progress: null, people: [], sealed: [], foreign: 0, damaged: [], brokenJournal: [], remembered: false, error: null, rev: 0 };
const noop = () => () => {};

export function useGramotki(): { store: GramotkiStore | null; snap: GramotkiSnapshot } {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? gramotkiStore(workspace) : null), [workspace]);
  const snap = useSyncExternalStore(store ? store.subscribe : noop, store ? store.snapshot : () => STARTING);
  return { store, snap };
}

export interface OpenRequest {
  /** Зачем открыть (показывается в окне). */
  reason?: string;
  resolve: (ok: boolean) => void;
}

/** Просьбы открыть грамотки — их слушает окно ввода фразы. */
export const openRequests = new Emitter<OpenRequest>();

/**
 * Открыть грамотки, если закрыты: покажется окно фразы (или создания фразы, если её ещё нет).
 * true — открыты; false — человек отказался.
 */
export async function ensureOpen(ws: Workspace, reason?: string): Promise<boolean> {
  const store = gramotkiStore(ws);
  const st = store.snapshot().status;
  if (st === 'open') return true;
  if (st === 'opening') return store.whenOpen();
  return new Promise((resolve) => openRequests.emit({ reason, resolve }));
}

export class GramotkiClosedError extends Error {
  constructor() {
    super('Грамотки закрыты — данные людей не сохранены. Откройте грамотки и повторите.');
    this.name = 'GramotkiClosedError';
  }
}
