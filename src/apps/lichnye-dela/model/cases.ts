import { useMemo } from 'react';
import { gramotkaPath } from '@/core/gramotka/store';
import { useGramotki } from '@/core/gramotka/react';
import { fioText } from '@/core/people/people';
import { defineDocType } from '@/core/schema/docType';
import { joinPath } from '@/core/storage/types';
import { uid } from '@/core/util/id';
import { getDocStore, useDocStore } from '@/core/workspace/docStore';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import type { Workspace } from '@/core/workspace/workspace';
import { APP_ID, SECTIONS, TRANSFER_FILE } from '../constants';

/*
 * Личные дела. Каждый боец — своя грамотка (src/core/gramotka): данные (35 полей анкеты) — в ней же, их видят все
 * приложения. Здесь — то, что относится к личному делу: раздел «Личных дел» внутри грамотки (достижения,
 * характеристика, подписи файлов, переводы) и личная папка — виртуальная папка «@грамотки/<номер>»:
 *
 *   Фотографии/  Сканы/  Достижения/  Характеристика/   ← разделы личной папки (файлы закрыты в грамотке)
 *
 *   Личные дела/transfer.json   ← последние данные перевода (подставляются в следующий раз)
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

/** Раздел «Личных дел» в грамотке. */
export interface CaseData {
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

export interface PersonCase extends CaseData {
  /** Номер грамотки (он же id в базе людей). */
  personId: string;
  /** Личная папка (виртуальный путь в рабочей папке). */
  folder: string;
  /** ФИО (из данных человека). */
  fio: string;
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

export interface TransferDoc {
  lastTransfer?: TransferDefaults;
}

export const transferDocType = defineDocType<TransferDoc>({
  type: 'lichnye-dela/transfer',
  version: 1,
  migrations: {},
  empty: () => ({}),
});

export function transferStore(ws: Workspace) {
  return getDocStore(ws, TRANSFER_FILE, transferDocType);
}

/** Имя файла или папки без запрещённых в Windows символов. */
export function safeName(s: string, max = 80): string {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/, '');
}

/** Путь внутри личной папки → путь в рабочей папке. */
export const casePath = (c: Pick<PersonCase, 'folder'>, rel: string) => joinPath(c.folder, rel);

export function emptyCase(now = new Date().toISOString()): CaseData {
  return { characteristic: '', achievements: [], files: {}, transfers: [], createdAt: now, updatedAt: now };
}

/** Дело человека: раздел «Личных дел» из грамотки (или пустой) и его личная папка. */
export function caseOf(personId: string, fields: Record<string, string>, data: Partial<CaseData> | undefined): PersonCase {
  const base = emptyCase('');
  return { ...base, ...data, personId, folder: gramotkaPath(personId), fio: fioText(fields) };
}

/** Только то, что хранится в грамотке. */
export function caseData(c: PersonCase): CaseData {
  const { personId: _p, folder: _f, fio: _n, ...data } = c;
  return data;
}

/** Дело после переименования файла: подпись, основное фото и ссылки достижений переходят на новое имя. */
export function renamedFile(c: PersonCase, from: string, to: string): PersonCase {
  if (from === to) return c;
  const files = { ...c.files };
  if (files[from]) {
    files[to] = files[from];
    delete files[from];
  }
  return { ...c, files, photo: c.photo === from ? to : c.photo, achievements: c.achievements.map((a) => (a.file === from ? { ...a, file: to } : a)) };
}

/** Создать подпапки разделов. */
export async function ensureSections(ws: Workspace, folder: string): Promise<void> {
  for (const s of SECTIONS) await ws.mkdir(joinPath(folder, s.folder));
}

export function useCases() {
  const { workspace } = useWorkspace();
  const { store, snap } = useGramotki();
  const tStore = useMemo(() => (workspace ? transferStore(workspace) : null), [workspace]);
  const tState = useDocStore(tStore);
  const people = snap.people;

  return useMemo(() => {
    const cases = people.map((p) => caseOf(p.id, p.fields, store?.section<CaseData>(p.id, APP_ID)));
    const byPerson = new Map(cases.map((c) => [c.personId, c]));
    const update = (personId: string, fn: (c: PersonCase) => PersonCase) => {
      const c = byPerson.get(personId) ?? (store?.item(personId) ? caseOf(personId, store.item(personId)!.fields, store.section<CaseData>(personId, APP_ID)) : null);
      if (!c || !store) return;
      const next = fn(c);
      store.setSection(personId, APP_ID, { ...caseData(next), createdAt: c.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
    };
    const open = snap.status === 'open';

    return {
      loaded: open || snap.status === 'locked' || snap.status === 'new',
      readOnly: !open,
      cases,
      lastTransfer: tState?.data.lastTransfer ?? {},
      get: (personId: string) => byPerson.get(personId),

      /** Личное дело человека: разделы личной папки на месте. */
      async ensure(personId: string, fields: Record<string, string>): Promise<PersonCase> {
        if (!workspace || !store?.item(personId)) throw new Error('Грамотка закрыта или её нет.');
        const c = caseOf(personId, fields, store.section<CaseData>(personId, APP_ID));
        await ensureSections(workspace, c.folder);
        if (!store.section(personId, APP_ID)) store.setSection(personId, APP_ID, caseData({ ...c, ...emptyCase() }));
        return c;
      },
      update,
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
      /** Файл переименован: подпись, основное фото и ссылки достижений — за ним. */
      renameFile(personId: string, from: string, to: string) {
        update(personId, (c) => renamedFile(c, from, to));
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
        tStore?.update((d) => ({ ...d, lastTransfer: t }));
      },
    };
  }, [people, snap.status, snap.rev, store, workspace, tState?.data, tStore]);
}

export type CasesApi = ReturnType<typeof useCases>;
