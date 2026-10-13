import { useMemo } from 'react';
import { fioText } from '@/core/people/people';
import { defineDocType } from '@/core/schema/docType';
import { baseName, joinPath } from '@/core/storage/types';
import { uid } from '@/core/util/id';
import { listAllFiles } from '@/core/workspace/backup';
import { getDocStore, useDocStore } from '@/core/workspace/docStore';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import type { Workspace } from '@/core/workspace/workspace';
import { APP_FOLDER, CASES_FILE, SECTIONS, TRANSFERS_FOLDER, WORD_TEMPLATES_FOLDER } from '../constants';

/*
 * Личные дела. Данные человека (35 полей анкеты) живут в общей базе людей (.docassist/people.json) —
 * их видят все приложения. Здесь — то, что относится к личному делу:
 *
 *   Личные дела/
 *     cases.json                      ← этот файл: достижения, характеристика, подписи файлов, переводы
 *     Иванов Иван Иванович/           ← личная папка
 *       Фотографии/  Сканы/  Достижения/  Характеристика/
 *       Перевод 2026-09-01/           ← пакет перевода (документы, таблица, фото и сканы)
 */

export interface Achievement {
  id: string;
  /** ДД.ММ.ГГГГ или как удобно («2025»). */
  date: string;
  title: string;
  level?: string;
  /** Файл в личной папке (грамота, диплом). */
  file?: string;
}

export interface TransferSide {
  squad: string;
  branch: string;
  direction: string;
  position: string;
}

export type TransferStatus = 'prepared' | 'done';

export interface TransferRecord {
  id: string;
  createdAt: string;
  /** Дата перевода (ДД.ММ.ГГГГ). */
  date: string;
  reason: string;
  from: TransferSide;
  to: TransferSide;
  status: TransferStatus;
  doneAt?: string;
  /** Папка с пакетом документов (путь в рабочей папке). */
  folder?: string;
  /** Сколько человек переводилось вместе. */
  group?: number;
}

/** Подпись файла личной папки: что это за документ. */
export interface FileNote {
  kind?: string;
  title?: string;
}

export interface PersonCase {
  /** Запись в базе людей. */
  personId: string;
  /** Личная папка (путь в рабочей папке). */
  folder: string;
  /** ФИО на момент последнего сохранения — если запись удалят из базы людей, дело не потеряется. */
  fio: string;
  /** Основное фото (путь внутри личной папки) — для личной карточки и пакета перевода. */
  photo?: string;
  characteristic: string;
  achievements: Achievement[];
  /** Подписи файлов: путь внутри личной папки → что это. */
  files: Record<string, FileNote>;
  transfers: TransferRecord[];
  createdAt: string;
  updatedAt: string;
}

/** Последние данные перевода — подставляются в следующий раз. */
export interface TransferDefaults {
  toSquad?: string;
  toBranch?: string;
  toDirection?: string;
  commanderFrom?: string;
  commanderTo?: string;
  reason?: string;
}

export interface CasesDoc {
  cases: PersonCase[];
  lastTransfer?: TransferDefaults;
}

export const casesDocType = defineDocType<CasesDoc>({
  type: 'lichnye-dela/cases',
  version: 1,
  migrations: {},
  empty: () => ({ cases: [] }),
});

export function casesStore(ws: Workspace) {
  return getDocStore(ws, CASES_FILE, casesDocType);
}

/** Имена, которые нельзя занять личной папкой. */
const RESERVED = new Set([baseName(WORD_TEMPLATES_FOLDER), baseName(TRANSFERS_FOLDER)].map((s) => s.toLowerCase()));

/** Имя файла или папки без запрещённых в Windows символов. */
export function safeName(s: string, max = 80): string {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/, '');
}

/** Имя личной папки по ФИО. */
export function folderNameFor(fields: Record<string, string>): string {
  const name = safeName(fioText(fields)) || 'Без имени';
  return RESERVED.has(name.toLowerCase()) ? `${name} (боец)` : name;
}

/** Свободное имя: «Иванов Иван», «Иванов Иван (2)»… */
export function uniqueName(base: string, taken: Set<string>): string {
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const name = `${base} (${i})`;
    if (!lower.has(name.toLowerCase())) return name;
  }
}

/** Путь внутри личной папки → путь в рабочей папке. */
export const casePath = (c: Pick<PersonCase, 'folder'>, rel: string) => joinPath(c.folder, rel);

export function newCase(personId: string, folder: string, fio: string): PersonCase {
  const now = new Date().toISOString();
  return { personId, folder, fio, characteristic: '', achievements: [], files: {}, transfers: [], createdAt: now, updatedAt: now };
}

/** Создать подпапки разделов. */
export async function ensureSections(ws: Workspace, folder: string): Promise<void> {
  for (const s of SECTIONS) await ws.mkdir(joinPath(folder, s.folder));
}

/** Перенести папку целиком (у хранилищ нет переименования — копируем и удаляем старую). */
export async function moveFolder(ws: Workspace, from: string, to: string): Promise<void> {
  const files = await listAllFiles(ws, from);
  for (const f of files) {
    const data = await ws.readBytes(f.path);
    if (data) await ws.writeBytes(joinPath(to, f.path.slice(from.length + 1)), data);
  }
  await ensureSections(ws, to);
  await ws.remove(from);
}

export function useCases() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? casesStore(workspace) : null), [workspace]);
  const state = useDocStore(store);
  const doc = state?.data;

  return useMemo(() => {
    const cases = doc?.cases ?? [];
    const byPerson = new Map(cases.map((c) => [c.personId, c]));
    const touch = (c: PersonCase): PersonCase => ({ ...c, updatedAt: new Date().toISOString() });
    const update = (personId: string, fn: (c: PersonCase) => PersonCase) =>
      store?.update((d) => ({ ...d, cases: d.cases.map((c) => (c.personId === personId ? touch(fn(c)) : c)) }));

    return {
      loaded: !!state?.loaded,
      readOnly: !!state?.tooNew || !!state?.broken,
      error: state?.error,
      cases,
      lastTransfer: doc?.lastTransfer ?? {},
      get: (personId: string) => byPerson.get(personId),

      /** Личное дело человека: создаёт папку с разделами, если её ещё нет. */
      async ensure(personId: string, fields: Record<string, string>): Promise<PersonCase> {
        if (!workspace || !store) throw new Error('Рабочая папка не открыта');
        await store.load();
        const existing = store.get().data.cases.find((c) => c.personId === personId);
        if (existing) {
          await ensureSections(workspace, existing.folder);
          return existing;
        }
        const taken = new Set([...(await workspace.list(APP_FOLDER)).map((e) => e.name), ...store.get().data.cases.map((c) => baseName(c.folder))]);
        const folder = joinPath(APP_FOLDER, uniqueName(folderNameFor(fields), taken));
        await ensureSections(workspace, folder);
        const c = newCase(personId, folder, fioText(fields));
        store.update((d) => ({ ...d, cases: [...d.cases.filter((x) => x.personId !== personId), c] }));
        return c;
      },
      update,
      /** Запомнить ФИО (если человек переименован в базе людей). */
      syncFio(personId: string, fields: Record<string, string>) {
        const c = byPerson.get(personId);
        const fio = fioText(fields);
        if (c && fio && c.fio !== fio) update(personId, (x) => ({ ...x, fio }));
      },
      addAchievement(personId: string, a: Omit<Achievement, 'id'>) {
        update(personId, (c) => ({ ...c, achievements: [...c.achievements, { ...a, id: uid('a_') }] }));
      },
      removeAchievement(personId: string, id: string) {
        update(personId, (c) => ({ ...c, achievements: c.achievements.filter((a) => a.id !== id) }));
      },
      setFileNote(personId: string, rel: string, note: FileNote | null) {
        update(personId, (c) => {
          const files = { ...c.files };
          if (note && (note.kind || note.title)) files[rel] = note;
          else delete files[rel];
          return { ...c, files };
        });
      },
      /** Файл удалён: убрать подпись, основное фото и ссылки достижений. */
      forgetFile(personId: string, rel: string) {
        update(personId, (c) => {
          const files = { ...c.files };
          delete files[rel];
          return { ...c, files, photo: c.photo === rel ? undefined : c.photo, achievements: c.achievements.map((a) => (a.file === rel ? { ...a, file: undefined } : a)) };
        });
      },
      addTransfer(personId: string, t: TransferRecord) {
        update(personId, (c) => ({ ...c, transfers: [...c.transfers, t] }));
      },
      setTransferStatus(personId: string, id: string, status: TransferStatus) {
        update(personId, (c) => ({ ...c, transfers: c.transfers.map((t) => (t.id === id ? { ...t, status, doneAt: status === 'done' ? new Date().toISOString() : undefined } : t)) }));
      },
      removeTransfer(personId: string, id: string) {
        update(personId, (c) => ({ ...c, transfers: c.transfers.filter((t) => t.id !== id) }));
      },
      setLastTransfer(t: TransferDefaults) {
        store?.update((d) => ({ ...d, lastTransfer: t }));
      },
      /** Переименовать личную папку по ФИО. */
      async renameFolder(personId: string, fields: Record<string, string>): Promise<string | null> {
        const c = byPerson.get(personId);
        if (!workspace || !c) return null;
        const taken = new Set((await workspace.list(APP_FOLDER)).map((e) => e.name).filter((n) => n !== baseName(c.folder)));
        const folder = joinPath(APP_FOLDER, uniqueName(folderNameFor(fields), taken));
        if (folder === c.folder) return folder;
        await moveFolder(workspace, c.folder, folder);
        update(personId, (x) => ({ ...x, folder, fio: fioText(fields) }));
        return folder;
      },
      /** Удалить личное дело (и, если нужно, папку со всеми файлами). */
      async remove(personId: string, withFolder: boolean) {
        const c = byPerson.get(personId);
        if (!c) return;
        if (withFolder && workspace) await workspace.remove(c.folder);
        store?.update((d) => ({ ...d, cases: d.cases.filter((x) => x.personId !== personId) }));
      },
    };
  }, [doc, state?.loaded, state?.tooNew, state?.broken, state?.error, store, workspace]);
}

export type CasesApi = ReturnType<typeof useCases>;
