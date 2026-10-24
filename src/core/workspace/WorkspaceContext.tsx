import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { gramotkiStore } from '../gramotka/store';
import { BrowserAdapter } from '../storage/browserAdapter';
import { ensurePermission, FsAccessAdapter, isFsAccessSupported, pickDirectory, type DirectoryHandle } from '../storage/fsAccess';
import { kvDelete, kvGet, kvSet } from '../storage/idb';
import { Workspace } from './workspace';

type Saved = { kind: 'fs-access'; handle: DirectoryHandle } | { kind: 'browser' };

export type WorkspaceStatus =
  | { state: 'loading' }
  | { state: 'none' }
  | { state: 'needs-permission'; name: string }
  | { state: 'ready'; ws: Workspace }
  | { state: 'error'; message: string };

interface Ctx {
  status: WorkspaceStatus;
  workspace: Workspace | null;
  fsSupported: boolean;
  openFolder(): Promise<void>;
  useBrowserStorage(): Promise<void>;
  restorePermission(): Promise<void>;
  close(): Promise<void>;
}

const WorkspaceCtx = createContext<Ctx | null>(null);
const KEY = 'workspace';

async function requestPersistentStorage() {
  // Просим браузер не удалять данные при нехватке места (особенно важно для iOS).
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* не критично */
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WorkspaceStatus>({ state: 'loading' });
  const [pending, setPending] = useState<DirectoryHandle | null>(null);
  const fsSupported = isFsAccessSupported();

  const activate = useCallback(async (saved: Saved) => {
    const adapter = saved.kind === 'fs-access' ? new FsAccessAdapter(saved.handle) : new BrowserAdapter();
    const ws = new Workspace(adapter);
    await ws.init();
    // Грамотки: прочитать папку, а если ключ запомнен — открыть в фоне, пока человек смотрит главную.
    void gramotkiStore(ws).init();
    setStatus({ state: 'ready', ws });
  }, []);

  // Уходят со страницы — сохранить грамотки.
  useEffect(() => {
    if (status.state !== 'ready') return;
    const store = gramotkiStore(status.ws);
    const flush = () => void store.flushAll();
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [status]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await kvGet<Saved>(KEY);
        if (!saved) return setStatus({ state: 'none' });
        if (saved.kind === 'fs-access') {
          if (await ensurePermission(saved.handle, false)) return activate(saved);
          setPending(saved.handle);
          return setStatus({ state: 'needs-permission', name: saved.handle.name });
        }
        await activate(saved);
      } catch (e) {
        setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [activate]);

  const openFolder = useCallback(async () => {
    try {
      const handle = await pickDirectory();
      if (!(await ensurePermission(handle, true))) return;
      await kvSet(KEY, { kind: 'fs-access', handle } satisfies Saved);
      await activate({ kind: 'fs-access', handle });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // пользователь закрыл окно выбора
      setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [activate]);

  const useBrowserStorage = useCallback(async () => {
    await requestPersistentStorage();
    await kvSet(KEY, { kind: 'browser' } satisfies Saved);
    await activate({ kind: 'browser' });
  }, [activate]);

  const restorePermission = useCallback(async () => {
    if (!pending) return;
    if (await ensurePermission(pending, true)) {
      setPending(null);
      await activate({ kind: 'fs-access', handle: pending });
    }
  }, [pending, activate]);

  const close = useCallback(async () => {
    if (status.state === 'ready') await gramotkiStore(status.ws).lock();
    await kvDelete(KEY);
    setPending(null);
    setStatus({ state: 'none' });
  }, [status]);

  const value = useMemo<Ctx>(
    () => ({
      status,
      workspace: status.state === 'ready' ? status.ws : null,
      fsSupported,
      openFolder,
      useBrowserStorage,
      restorePermission,
      close,
    }),
    [status, fsSupported, openFolder, useBrowserStorage, restorePermission, close],
  );

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error('useWorkspace вне WorkspaceProvider');
  return ctx;
}

/** Подписка на изменения файлов рабочей папки: возвращает счётчик, который растёт при каждом изменении. */
export function useWorkspaceRevision(prefix = ''): number {
  const { workspace } = useWorkspace();
  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (!workspace) return;
    return workspace.changes.on((e) => {
      if (!prefix || e.path.startsWith(prefix)) setRev((r) => r + 1);
    });
  }, [workspace, prefix]);
  return rev;
}
