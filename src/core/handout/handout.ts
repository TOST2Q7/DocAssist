import { useMemo } from 'react';
import { defineDocType } from '../schema/docType';
import { baseName, joinPath, parentPath } from '../storage/types';
import { getDocStore, useDocStore } from '../workspace/docStore';
import { useWorkspace } from '../workspace/WorkspaceContext';
import type { Workspace } from '../workspace/workspace';

/*
 * «Для выдачи» — временная папка в рабочей папке для файлов, которые нужно куда-то отдать или загрузить
 * (сканы для штаба, готовые документы, пакеты перевода). Файлы здесь не закрыты (в отличие от грамоток):
 * отдали — очистили.
 *
 *   <Рабочая папка>/Для выдачи/…               ← сами файлы (видны в Проводнике)
 *   <Рабочая папка>/.docassist/handout.json    ← откуда каждый файл пришёл, чтобы его можно было вернуть
 */

export const HANDOUT_FOLDER = 'Для выдачи';

export interface HandoutItem {
  /** Имя файла в «Для выдачи». */
  name: string;
  /** Откуда взят (путь в рабочей папке; пусто — файл создан сразу здесь, например готовый документ). */
  from: string;
  /** Перемещён (в исходном месте его больше нет) или скопирован. */
  moved: boolean;
  at: string;
  /** Приложение, которое положило файл. */
  source?: string;
  /** Что это: «Паспорт (разворот с фото)». */
  label?: string;
  /** Чей файл: «Фамилия И. О.». */
  who?: string;
  /** Данные приложения — чтобы вернуть файл на место со всеми подписями. */
  meta?: Record<string, string>;
}

export interface HandoutDoc {
  items: HandoutItem[];
}

export const handoutDocType = defineDocType<HandoutDoc>({
  type: 'docassist/handout',
  version: 1,
  migrations: {},
  empty: () => ({ items: [] }),
});

export function handoutStore(ws: Workspace) {
  return getDocStore(ws, ws.systemPath('handout.json'), handoutDocType);
}

export interface PutOptions extends Omit<HandoutItem, 'name' | 'from' | 'moved' | 'at'> {
  /** Имя в «Для выдачи» (если занято — добавится номер). */
  name?: string;
  move: boolean;
}

/** Положить файл в «Для выдачи». */
export async function putToHandout(ws: Workspace, from: string, opts: PutOptions): Promise<HandoutItem> {
  const { name: wanted, move, ...rest } = opts;
  const data = await ws.readBytes(from);
  if (!data) throw new Error(`Файл не найден: ${from}`);
  const name = await ws.freeName(HANDOUT_FOLDER, wanted || baseName(from));
  await ws.writeBytes(joinPath(HANDOUT_FOLDER, name), data);
  if (move) await ws.remove(from);
  const item: HandoutItem = { name, from, moved: move, at: new Date().toISOString(), ...rest };
  const store = handoutStore(ws);
  await store.load();
  store.update((d) => ({ items: [...d.items.filter((x) => x.name !== name), item] }));
  return item;
}

/** Положить в «Для выдачи» новый файл (готовый документ). Возвращает имя (если занято — с номером). */
export async function addToHandout(ws: Workspace, name: string, data: Uint8Array, opts: Pick<HandoutItem, 'source' | 'label' | 'who'> = {}): Promise<string> {
  const free = await ws.freeName(HANDOUT_FOLDER, name);
  await ws.writeBytes(joinPath(HANDOUT_FOLDER, free), data);
  const item: HandoutItem = { name: free, from: '', moved: false, at: new Date().toISOString(), ...opts };
  const store = handoutStore(ws);
  await store.load();
  store.update((d) => ({ items: [...d.items.filter((x) => x.name !== free), item] }));
  return free;
}

/**
 * Вернуть перемещённый файл на место (или в папку `toFolder`) под исходным именем.
 * Возвращает путь, куда файл вернулся.
 */
export async function takeBack(ws: Workspace, item: HandoutItem, toFolder = parentPath(item.from)): Promise<string> {
  const name = await ws.freeName(toFolder, baseName(item.from));
  const to = joinPath(toFolder, name);
  await ws.moveFile(joinPath(HANDOUT_FOLDER, item.name), to);
  await forget(ws, [item.name]);
  return to;
}

/** Удалить файлы из «Для выдачи». */
export async function removeFromHandout(ws: Workspace, names: string[]): Promise<void> {
  for (const n of names) await ws.remove(joinPath(HANDOUT_FOLDER, n));
  await forget(ws, names);
}

async function forget(ws: Workspace, names: string[]) {
  const set = new Set(names);
  const store = handoutStore(ws);
  // Сначала прочитать файл — иначе запись затёрла бы сведения о других файлах.
  await store.load();
  store.update((d) => ({ items: d.items.filter((x) => !set.has(x.name)) }));
}

/** Сведения о файлах «Для выдачи» (откуда пришли). */
export function useHandoutIndex() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? handoutStore(workspace) : null), [workspace]);
  const state = useDocStore(store);
  const items = state?.data.items;
  return useMemo(() => new Map((items ?? []).map((x) => [x.name, x])), [items]);
}
