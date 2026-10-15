import { useEffect, useState } from 'react';
import { baseName, extName, joinPath, type FsEntry } from '@/core/storage/types';
import { mimeFor } from '@/core/util/download';
import { useWorkspace, useWorkspaceRevision } from '@/core/workspace/WorkspaceContext';
import type { Workspace } from '@/core/workspace/workspace';

/** Файлы папки (без подпапок); обновляется при изменениях в ней. */
export function useFolderFiles(folder: string | null): FsEntry[] | null {
  const { workspace } = useWorkspace();
  const rev = useWorkspaceRevision(folder ?? '');
  const [files, setFiles] = useState<FsEntry[] | null>(null);
  useEffect(() => {
    if (!workspace || !folder) {
      setFiles(null);
      return;
    }
    let alive = true;
    workspace.list(folder).then((list) => alive && setFiles(list.filter((e) => e.kind === 'file')));
    return () => {
      alive = false;
    };
  }, [workspace, folder, rev]);
  return files;
}

/** Ссылка на файл рабочей папки для <img> (освобождается сама). */
export function useObjectUrl(path: string | null): string | null {
  const { workspace } = useWorkspace();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!workspace || !path) return;
    let alive = true;
    let made: string | null = null;
    workspace.readBytes(path).then((bytes) => {
      if (!alive || !bytes) return;
      made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeFor(path) }));
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [workspace, path]);
  return url;
}

/** Свободное имя файла в папке: «скан.jpg», «скан (2).jpg»… */
export async function freeFileName(ws: Workspace, folder: string, name: string): Promise<string> {
  const taken = new Set((await ws.list(folder)).map((e) => e.name.toLowerCase()));
  const clean = name.replace(/[\\/:*?"<>|]/g, '_');
  if (!taken.has(clean.toLowerCase())) return clean;
  const ext = extName(clean);
  const stem = ext ? clean.slice(0, -(ext.length + 1)) : clean;
  for (let i = 2; ; i++) {
    const next = `${stem} (${i})${ext ? `.${ext}` : ''}`;
    if (!taken.has(next.toLowerCase())) return next;
  }
}

/** Сохранить выбранные файлы в папку. Возвращает имена сохранённых файлов. */
export async function saveFiles(ws: Workspace, folder: string, files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    const name = await freeFileName(ws, folder, baseName(f.name) || 'файл');
    await ws.writeBytes(joinPath(folder, name), new Uint8Array(await f.arrayBuffer()));
    out.push(name);
  }
  return out;
}

/** Открыть файл в новой вкладке (PDF, картинка) — или скачать, если браузер не покажет. */
export async function openFile(ws: Workspace, path: string): Promise<void> {
  const bytes = await ws.readBytes(path);
  if (!bytes) return;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeFor(path) }));
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url;
    a.download = baseName(path);
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
