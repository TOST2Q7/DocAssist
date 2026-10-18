import { gfetch } from './http';

/*
 * Google Таблицы (Sheets API v4). Лимит — 300 запросов в минуту на всё приложение (общий для всех людей),
 * поэтому таблица читается одним запросом целиком, а сохраняется одним пакетом изменённых ячеек.
 * Запись — «как текст» (RAW): ведущие нули и даты не портятся.
 */

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SheetInfo {
  sheetId: number;
  title: string;
  index: number;
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  url: string;
  sheets: SheetInfo[];
}

/** Ссылка на таблицу: только адрес Google Таблиц (ссылку из файла или ответа не берём как есть). */
export function spreadsheetUrl(id: string, url?: string): string {
  return url && /^https:\/\/docs\.google\.com\/spreadsheets\//.test(url) ? url : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
}

export async function getSpreadsheet(id: string): Promise<SpreadsheetInfo> {
  const r = await gfetch<{
    spreadsheetId: string;
    spreadsheetUrl?: string;
    properties?: { title?: string };
    sheets?: { properties?: { sheetId?: number; title?: string; index?: number } }[];
  }>(`${API}/${encodeURIComponent(id)}`, { query: { fields: 'spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,index)' } });
  return {
    spreadsheetId: r.spreadsheetId,
    title: r.properties?.title ?? 'Таблица',
    url: spreadsheetUrl(id, r.spreadsheetUrl),
    sheets: (r.sheets ?? []).map((s) => ({ sheetId: s.properties?.sheetId ?? 0, title: s.properties?.title ?? '', index: s.properties?.index ?? 0 })),
  };
}

/** Имя листа для диапазона: 'Лист 1' (кавычки внутри удваиваются). */
export function sheetRef(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** Буквы столбца: 0 → A, 25 → Z, 26 → AA. */
export function columnLetters(col: number): string {
  let s = '';
  let n = col + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Адрес ячейки: строка с 1 (как в таблице), столбец с 0. */
export function a1(sheetTitle: string, row: number, col: number): string {
  return `${sheetRef(sheetTitle)}!${columnLetters(col)}${row}`;
}

/** Весь лист — как видит человек (форматированные значения), строки с первой. */
export async function readSheet(spreadsheetId: string, sheetTitle: string): Promise<string[][]> {
  const r = await gfetch<{ values?: unknown[][] }>(`${API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetRef(sheetTitle))}`, {
    query: { valueRenderOption: 'FORMATTED_VALUE', majorDimension: 'ROWS' },
  });
  return (r.values ?? []).map((row) => row.map((v) => (v === null || v === undefined ? '' : String(v))));
}

export interface CellWrite {
  /** Строка с 1, как в таблице. */
  row: number;
  /** Столбец с 0. */
  col: number;
  value: string;
}

/** Записать ячейки одним пакетом, как текст. */
export async function writeCells(spreadsheetId: string, sheetTitle: string, cells: CellWrite[]): Promise<number> {
  if (!cells.length) return 0;
  const r = await gfetch<{ totalUpdatedCells?: number }>(`${API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    json: { valueInputOption: 'RAW', data: cells.map((c) => ({ range: a1(sheetTitle, c.row, c.col), values: [[c.value]] })) },
    retries: 3,
  });
  return r.totalUpdatedCells ?? cells.length;
}
