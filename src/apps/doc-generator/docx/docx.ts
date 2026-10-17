import { escapeXml, fromUtf8, unescapeXml, utf8 } from '@/core/docx/xml';
import { readZip, writeZip, type ZipEntry } from '@/core/util/zip';

/*
 * Заполнение бланка Word (.docx) без сторонних библиотек.
 * Бланк — таблица: в ячейки-«пустышки» рядом с подписями («ФИО», «Серия»…) вписывается текст.
 * Таблица, её сетка и оформление не меняются — меняется только содержимое нужных ячеек.
 * (Бланки с метками {ФИО} заполняет core/docx/fill.ts.)
 */

const DOCUMENT = 'word/document.xml';

export interface Docx {
  entries: ZipEntry[];
  /** Содержимое word/document.xml. */
  xml: string;
}

export async function openDocx(bytes: Uint8Array): Promise<Docx> {
  const entries = await readZip(bytes);
  const doc = entries.find((e) => e.path === DOCUMENT);
  if (!doc) throw new Error('Это не документ Word (.docx): нет word/document.xml');
  return { entries, xml: fromUtf8(doc.data) };
}

export function saveDocx(doc: Docx): Uint8Array {
  return writeZip(doc.entries.map((e) => (e.path === DOCUMENT ? { path: e.path, data: utf8(doc.xml) } : { path: e.path, data: e.data })));
}

/** Шаблон, встроенный в приложение как data:-адрес, — в байты. */
export function dataUrlToBytes(url: string): Uint8Array {
  const comma = url.indexOf(',');
  const head = url.slice(0, comma);
  const body = url.slice(comma + 1);
  if (!head.endsWith(';base64')) return utf8(decodeURIComponent(body));
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── Поиск элементов в XML ───────────────────────────────────────────────────

export interface Span {
  start: number;
  end: number;
}

const isNameEnd = (c: string | undefined) => c === ' ' || c === '>' || c === '/' || c === '\n' || c === '\r' || c === '\t';

/** Начало следующего открывающего тега <tag (не <tagPr и т. п.) с позиции from. */
function nextOpen(xml: string, tag: string, from: number, to: number): number {
  let p = from;
  for (;;) {
    p = xml.indexOf(`<${tag}`, p);
    if (p < 0 || p >= to) return -1;
    if (isNameEnd(xml[p + tag.length + 1])) return p;
    p += tag.length + 1;
  }
}

/** Конец элемента, который начинается в start (с учётом вложенных элементов с тем же именем). */
function elementEnd(xml: string, tag: string, start: number): number {
  const gt = xml.indexOf('>', start);
  if (xml[gt - 1] === '/') return gt + 1;
  const close = `</${tag}>`;
  let depth = 1;
  let p = gt + 1;
  while (depth > 0) {
    const c = xml.indexOf(close, p);
    if (c < 0) throw new Error(`Документ повреждён: не закрыт <${tag}>`);
    const o = nextOpen(xml, tag, p, c);
    if (o >= 0) {
      const g = xml.indexOf('>', o);
      if (xml[g - 1] !== '/') depth++;
      p = g + 1;
    } else {
      depth--;
      p = c + close.length;
    }
  }
  return p;
}

/** Элементы tag внутри [from, to) верхнего уровня — вложенные в них такие же не считаются. */
export function findElements(xml: string, tag: string, from = 0, to = xml.length): Span[] {
  const out: Span[] = [];
  let p = from;
  for (;;) {
    const s = nextOpen(xml, tag, p, to);
    if (s < 0) break;
    const e = elementEnd(xml, tag, s);
    if (e > to) break;
    out.push({ start: s, end: e });
    p = e;
  }
  return out;
}

/** Видимый текст фрагмента: содержимое всех <w:t>. */
export function textOf(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) out += m[1];
  return unescapeXml(out);
}

// ─── Ячейки таблиц ───────────────────────────────────────────────────────────

export interface Cell extends Span {
  /** Номер строки среди всех строк всех таблиц документа (с нуля). */
  row: number;
  /** Номер ячейки в строке (с нуля). */
  col: number;
  text: string;
  /** Ширина ячейки в twips (1/20 пункта). */
  width: number;
}

/** Все ячейки всех таблиц документа по порядку. Вложенные таблицы не разбираются. */
export function tableCells(xml: string): Cell[] {
  const cells: Cell[] = [];
  let row = 0;
  for (const tbl of findElements(xml, 'w:tbl')) {
    for (const tr of findElements(xml, 'w:tr', tbl.start, tbl.end)) {
      findElements(xml, 'w:tc', tr.start, tr.end).forEach((tc, col) => {
        const body = xml.slice(tc.start, tc.end);
        const w = /<w:tcW\b[^>]*\bw:w="(\d+)"/.exec(body);
        cells.push({ ...tc, row, col, text: textOf(body), width: w ? Number(w[1]) : 0 });
      });
      row++;
    }
  }
  return cells;
}

/** Подпись для сравнения: без регистра, «ё», лишних пробелов и двоеточия; латинские двойники — кириллицей. */
export function normLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[eopacxy]/g, (c) => 'еорасху'['eopacxy'.indexOf(c)])
    .replace(/\s+/g, ' ')
    .replace(/[\s:]+$/, '')
    .trim();
}

/** Ячейка с подписью label (n-я по счёту, с нуля). */
export function findLabel(cells: Cell[], label: string, n = 0): Cell | undefined {
  const want = normLabel(label);
  return cells.filter((c) => normLabel(c.text) === want)[n];
}

/** Соседняя ячейка в той же строке (по умолчанию — следующая). */
export function cellAfter(cells: Cell[], cell: Cell, step = 1): Cell | undefined {
  return cells.find((c) => c.row === cell.row && c.col === cell.col + step);
}

/** Первая ячейка следующей строки. */
export function nextRowCell(cells: Cell[], cell: Cell): Cell | undefined {
  return cells.find((c) => c.row === cell.row + 1 && c.col === 0);
}

// ─── Запись текста ───────────────────────────────────────────────────────────

export interface RunStyle {
  font?: string;
  /** Кегль в пунктах. */
  size?: number;
}

/** Times New Roman 12 — так требует методичка. */
export const DEFAULT_STYLE: Required<RunStyle> = { font: 'Times New Roman', size: 12 };

/** В ячейке бланка — одна строка: переводы строк и табуляция становятся пробелами. */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ');

export function runXml(text: string, style: RunStyle = {}): string {
  const { font, size } = { ...DEFAULT_STYLE, ...style };
  const f = escapeXml(font);
  const sz = Math.round(size * 2);
  return (
    `<w:r><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(oneLine(text))}</w:t></w:r>`
  );
}

/** Заменить содержимое первого абзаца ячейки на runs (оформление абзаца сохраняется). */
function setCellRuns(cellXml: string, runs: string): string {
  const p = findElements(cellXml, 'w:p')[0];
  if (!p) return cellXml.replace(/<\/w:tc>$/, `<w:p>${runs}</w:p></w:tc>`);
  const para = cellXml.slice(p.start, p.end);
  let next: string;
  if (para.endsWith('/>')) {
    next = `${para.slice(0, -2)}>${runs}</w:p>`;
  } else {
    const openEnd = para.indexOf('>') + 1;
    const pPr = findElements(para, 'w:pPr')[0];
    const head = pPr ? pPr.end : openEnd;
    // Старый текст абзаца убираем, служебные метки (закладки, проверка орфографии) остаются.
    let rest = para.slice(head, para.length - '</w:p>'.length);
    for (const tag of ['w:r', 'w:hyperlink', 'w:fldSimple']) {
      for (const r of findElements(rest, tag).reverse()) rest = rest.slice(0, r.start) + rest.slice(r.end);
    }
    next = para.slice(0, head) + runs + rest + '</w:p>';
  }
  return cellXml.slice(0, p.start) + next + cellXml.slice(p.end);
}

export interface CellWrite {
  cell: Cell;
  /** Готовые <w:r> (см. runXml). */
  runs: string;
}

/** Записать текст в ячейки. Позиции ячеек — из tableCells() того же xml; в одну ячейку — последняя запись. */
export function writeCells(xml: string, writes: CellWrite[]): string {
  const byCell = new Map(writes.map((w) => [w.cell.start, w]));
  let out = xml;
  for (const w of [...byCell.values()].sort((a, b) => b.cell.start - a.cell.start)) {
    out = out.slice(0, w.cell.start) + setCellRuns(out.slice(w.cell.start, w.cell.end), w.runs) + out.slice(w.cell.end);
  }
  return out;
}
