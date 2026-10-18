import { useMemo } from 'react';
import { makeStamp, type Stamp } from '@/core/device/device';
import { pick, sheets } from '@/core/google';
import { defineDocType } from '@/core/schema/docType';
import { joinPath } from '@/core/storage/types';
import { readTable, writeXlsx, type TableData } from '@/core/tables/tables';
import { getDocStore, useDocStore } from '@/core/workspace/docStore';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import type { Workspace } from '@/core/workspace/workspace';
import { APP_FOLDER } from '../constants';
import { withFormHeaders } from '../ui/hooks';
import type { AnketaSession } from '../model/session';

/*
 * «Проверка анкет» ↔ Google Таблицы.
 * Таблица читается одним запросом и сохраняется снимком (.xlsx) в рабочей папке — дальше с ним работает обычная
 * проверка, а правки и пометки, как и для файлов, хранятся только на устройстве (сеанс). Исправления записываются
 * обратно в ту же Google Таблицу одним пакетом: только изменённые ячейки, строка ищется по ФИО (номера строк
 * могут сдвинуться), ячейку, которую успели изменить в таблице, приложение не затирает — спрашивает.
 */

export const GOOGLE_LINKS = `${APP_FOLDER}/google.json`;
export const GOOGLE_FOLDER = `${APP_FOLDER}/Google Таблицы`;

export interface SheetLink {
  spreadsheetId: string;
  title: string;
  sheetTitle: string;
  url: string;
  /** Когда и откуда прочитана последний раз. */
  readAt: Stamp;
  /** Когда записывали исправления. */
  lastWrite?: Stamp;
  written?: number;
}

export interface LinksDoc {
  /** Путь снимка в рабочей папке → таблица Google. */
  links: Record<string, SheetLink>;
}

export const linksDocType = defineDocType<LinksDoc>({ type: 'anketa/google-links', version: 1, migrations: {}, empty: () => ({ links: {} }) });

export function linksStore(ws: Workspace) {
  return getDocStore(ws, GOOGLE_LINKS, linksDocType);
}

/** Снимок может лежать только в папке «Google Таблицы» (файл связей мог прийти с другого устройства). */
export function isSnapshotPath(path: string): boolean {
  return path.startsWith(`${GOOGLE_FOLDER}/`) && !path.slice(GOOGLE_FOLDER.length + 1).includes('/') && path.endsWith('.xlsx');
}

export function useSheetLinks() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? linksStore(workspace) : null), [workspace]);
  const state = useDocStore(store);
  const raw = state?.data.links;
  const links = useMemo(() => Object.fromEntries(Object.entries(raw ?? {}).filter(([p]) => isSnapshotPath(p))), [raw]);
  return { store, links, loaded: !!state?.loaded };
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Таблица';

/** Выбрать Google Таблицу в окне Google (вызывать из нажатия). */
export async function pickSpreadsheet(): Promise<sheets.SpreadsheetInfo | null> {
  const [p] = await pick({ kind: 'spreadsheets', title: 'Выберите Google Таблицу с анкетами' });
  return p ? sheets.getSpreadsheet(p.id) : null;
}

/** Лист → снимок .xlsx: первая строка листа — первая строка файла, номера строк совпадают с таблицей. */
function snapshot(matrix: string[][], sheetTitle: string): Uint8Array {
  return writeXlsx(matrix[0] ?? [], matrix.slice(1), sheetTitle.slice(0, 31) || 'Лист1');
}

/** Прочитать лист и сохранить снимок; вернуть путь снимка. */
export async function importSheet(ws: Workspace, info: sheets.SpreadsheetInfo, sheetTitle: string): Promise<string> {
  const matrix = await sheets.readSheet(info.spreadsheetId, sheetTitle);
  const path = joinPath(GOOGLE_FOLDER, `${safe(info.title)} — ${safe(sheetTitle)}.xlsx`);
  await ws.writeBytes(path, snapshot(matrix, sheetTitle));
  linksStore(ws).update((d) => ({
    links: { ...d.links, [path]: { spreadsheetId: info.spreadsheetId, title: info.title, sheetTitle, url: info.url, readAt: makeStamp(), lastWrite: d.links[path]?.lastWrite, written: d.links[path]?.written } },
  }));
  return path;
}

// ---------- Строки: поиск по ФИО ----------

const KEY_FIELDS = ['person.lastName', 'person.firstName', 'person.middleName', 'person.birthDate'];
const norm = (v: string | undefined) => (v ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** Ключ строки: ФИО и дата рождения (null — нечем узнать человека). */
export function rowKey(values: string[], columns: (string | null)[]): string | null {
  const parts = KEY_FIELDS.map((id) => norm(values[columns.indexOf(id)]));
  return parts[0] || parts[1] ? parts.join('|') : null;
}

/** Старая строка снимка → строка нового снимка (по ФИО, а без ФИО — по совпадению всей строки). */
export function mapRows(oldRows: string[][], newRows: string[][], columns: (string | null)[]): Map<number, number> {
  const map = new Map<number, number>();
  const byKey = new Map<string, number[]>();
  newRows.forEach((r, i) => {
    const k = rowKey(r, columns) ?? `row:${r.join('\u0001')}`;
    byKey.set(k, [...(byKey.get(k) ?? []), i]);
  });
  oldRows.forEach((r, i) => {
    const k = rowKey(r, columns) ?? `row:${r.join('\u0001')}`;
    const hit = byKey.get(k);
    if (hit?.length === 1) map.set(i, hit[0]);
  });
  return map;
}

// ---------- Запись обратно ----------

export interface CellConflict {
  /** Строка снимка (анкета). */
  tableRow: number;
  /** Строка в Google Таблице (с 1). */
  sheetRow: number;
  col: number;
  orig: string;
  mine: string;
  theirs: string;
  at?: string;
}

export interface WritePlan {
  writes: (sheets.CellWrite & { tableRow: number })[];
  conflicts: CellConflict[];
  /** Анкеты, которых больше нет в таблице (или их не узнать). */
  missing: number[];
  /** Уже записано раньше. */
  already: number;
}

/** Что записать в таблицу: сверка правок с тем, что в Google Таблице сейчас. */
export function planWrite(table: TableData, columns: (string | null)[], session: Pick<AnketaSession, 'edits'>, current: string[][]): WritePlan {
  const plan: WritePlan = { writes: [], conflicts: [], missing: [], already: 0 };
  const cur = (sheetRow: number) => current[sheetRow - 1] ?? [];
  for (const [rowStr, cols] of Object.entries(session.edits)) {
    const r = Number(rowStr);
    const orig = table.rows[r];
    if (!orig) continue;
    const edited = orig.map((v, c) => cols[c]?.value ?? v);
    const keys = new Set([rowKey(orig, columns), rowKey(edited, columns)].filter((k): k is string => !!k));
    const same = (vals: string[]) => (keys.size ? keys.has(rowKey(vals, columns) ?? '') : orig.every((v, c) => !!cols[c] || (vals[c] ?? '') === v));
    let sheetRow = table.sourceRows[r];
    if (!same(cur(sheetRow))) {
      const found = current.map((v, i) => (same(v) ? i + 1 : 0)).filter(Boolean);
      if (found.length !== 1) {
        plan.missing.push(r);
        continue;
      }
      sheetRow = found[0];
    }
    for (const [colStr, e] of Object.entries(cols)) {
      const col = Number(colStr);
      const now = cur(sheetRow)[col] ?? '';
      if (now === e.value) plan.already++;
      else if (now === e.orig) plan.writes.push({ row: sheetRow, col, value: e.value, tableRow: r });
      else plan.conflicts.push({ tableRow: r, sheetRow, col, orig: e.orig, mine: e.value, theirs: now, at: e.at });
    }
  }
  return plan;
}

/** Перечитать таблицу из Google, сохранить новый снимок и вернуть его (для переноса правок и пометок). */
export async function refreshSnapshot(ws: Workspace, path: string, link: SheetLink): Promise<TableData> {
  const info = await sheets.getSpreadsheet(link.spreadsheetId);
  const matrix = await sheets.readSheet(link.spreadsheetId, link.sheetTitle);
  const bytes = snapshot(matrix, link.sheetTitle);
  await ws.writeBytes(path, bytes);
  linksStore(ws).update((d) => ({ links: { ...d.links, [path]: { ...link, title: info.title, url: info.url, readAt: makeStamp() } } }));
  return withFormHeaders(readTable(bytes, path));
}
