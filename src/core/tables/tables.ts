import * as XLSX from 'xlsx';

/*
 * Чтение и запись таблиц. Всё приводится к строкам «как видит человек»:
 * - даты → ДД.ММ.ГГГГ (и время, если есть) без сдвигов часовых поясов;
 * - числа с форматом «000000» сохраняют ведущие нули;
 * - длинные числа (ИНН, СНИЛС) не превращаются в 1,9E+11.
 * При записи все ячейки пишутся как текст, чтобы Excel ничего не «исправлял».
 */

export interface TableData {
  sheetName: string;
  sheetNames: string[];
  headers: string[];
  /** Строки данных (без заголовка). Длина каждой строки = headers.length. */
  rows: string[][];
  /** Номер строки в исходном листе (1-based, как в Excel) для каждой строки данных. */
  sourceRows: number[];
}

export { TABLE_EXTENSIONS } from './formats';

const pad = (n: number) => String(n).padStart(2, '0');

function formatDateParts(y: number, m: number, d: number, H = 0, M = 0, S = 0): string {
  const date = `${pad(d)}.${pad(m)}.${y}`;
  return H || M || S ? `${date} ${pad(H)}:${pad(M)}:${pad(S)}` : date;
}

function cellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v;
    return formatDateParts(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  }
  if (cell.t === 'n' && typeof cell.v === 'number') {
    const fmt = typeof cell.z === 'string' ? cell.z : '';
    if (fmt && XLSX.SSF.is_date(fmt)) {
      const p = XLSX.SSF.parse_date_code(cell.v);
      if (p) return formatDateParts(p.y, p.m, p.d, p.H, p.M, Math.round(p.S));
    }
    // Формат из одних нулей («000000») — значит, ведущие нули важны.
    if (/^0+$/.test(fmt) && cell.w) return cell.w;
    if (Number.isInteger(cell.v)) return String(cell.v);
    return String(cell.v).replace('.', ',');
  }
  if (cell.t === 'b') return cell.v ? 'ИСТИНА' : 'ЛОЖЬ';
  return String(cell.v);
}

function sheetToMatrix(ws: XLSX.WorkSheet): string[][] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const out: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      row.push(cellToString(ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined));
    }
    out.push(row);
  }
  return out;
}

/** Декодировать CSV: UTF-8, а если не получилось — Windows-1251 (частый случай для Excel). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [';', ',', '\t'];
  let best = ';';
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function matrixToTable(matrix: string[][], sheetName: string, sheetNames: string[]): TableData {
  const isEmpty = (r: string[]) => r.every((c) => c.trim() === '');
  const headerIdx = matrix.findIndex((r) => !isEmpty(r));
  if (headerIdx < 0) return { sheetName, sheetNames, headers: [], rows: [], sourceRows: [] };
  // Ширина таблицы — по самой длинной строке, но без пустого «хвоста».
  let width = 0;
  for (const r of matrix) {
    for (let c = r.length - 1; c >= 0; c--) {
      if (r[c].trim() !== '') {
        width = Math.max(width, c + 1);
        break;
      }
    }
  }
  const fit = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  const headers = fit(matrix[headerIdx]).map((h, i) => h.trim() || `Столбец ${i + 1}`);
  const rows: string[][] = [];
  const sourceRows: number[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    if (isEmpty(matrix[i])) continue;
    rows.push(fit(matrix[i]));
    sourceRows.push(i + 1);
  }
  return { sheetName, sheetNames, headers, rows, sourceRows };
}

export function readTable(bytes: Uint8Array, fileName: string, sheet?: string): TableData {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'csv' || ext === 'txt') {
    return matrixToTable(parseCsv(decodeText(bytes)), 'CSV', ['CSV']);
  }
  const wb = XLSX.read(bytes, { type: 'array', cellNF: true, cellText: true, dense: false });
  const name = sheet && wb.SheetNames.includes(sheet) ? sheet : wb.SheetNames[0];
  return matrixToTable(sheetToMatrix(wb.Sheets[name]), name, wb.SheetNames);
}

/** Записать таблицу в XLSX. Все значения — текстовые ячейки. */
export function writeXlsx(headers: string[], rows: string[][], sheetName = 'Лист1'): Uint8Array {
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Принудительно текстовый тип, чтобы Excel не превращал «012345» в 12345, а даты — в числа.
  for (const key of Object.keys(ws)) {
    if (key.startsWith('!')) continue;
    const cell = ws[key] as XLSX.CellObject;
    cell.t = 's';
    cell.v = cell.v === undefined || cell.v === null ? '' : String(cell.v);
    cell.z = '@';
  }
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length));
    return { wch: Math.min(60, Math.max(8, maxLen + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}

export function writeCsv(headers: string[], rows: string[][], delimiter = ';'): string {
  const esc = (v: string) => (/[";\n\r,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(delimiter)).join('\r\n');
}
