import { writeZip } from '../util/zip';
import { imageInfo } from './image';
import { escapeXml, utf8 } from './xml';

/*
 * Документ Word (.docx) из простых блоков: абзацы, таблицы, картинки, разрывы страниц.
 * Без сторонних библиотек: .docx — это ZIP с несколькими XML-файлами.
 * По умолчанию — как принято в документах: A4, Times New Roman 14, поля 30/15/20/20 мм.
 */

export type Align = 'left' | 'center' | 'right' | 'both';

export interface Run {
  /** «\n» — перенос строки внутри абзаца, «\t» — табуляция. */
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Размер, пт. */
  size?: number;
}

export interface ImageSpec {
  /** JPEG или PNG. */
  data: Uint8Array;
  widthMm: number;
  /** Не задана — по пропорциям картинки. */
  heightMm?: number;
}

export interface ParagraphBlock {
  type: 'p';
  text?: string;
  runs?: Run[];
  align?: Align;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  /** Абзацный отступ первой строки, мм. */
  firstLine?: number;
  /** Отступ слева, мм (например, «шапка» заявления в правой половине листа). */
  indentLeft?: number;
  /** Интервал перед и после абзаца, пт. */
  before?: number;
  after?: number;
  /** Табуляция у правого края: текст после «\t» прижимается вправо (дата слева — подпись справа). */
  rightTab?: boolean;
  keepNext?: boolean;
}

export type TableCell =
  | string
  | {
      text?: string;
      runs?: Run[];
      bold?: boolean;
      align?: Align;
      image?: ImageSpec;
      /** Объединить столько столбцов. */
      span?: number;
      /** Объединить с ячейкой выше (продолжение). */
      vMerge?: 'start' | 'continue';
    };

export interface TableBlock {
  type: 'table';
  rows: TableCell[][];
  /** Ширины столбцов в долях (или мм) — приводятся к ширине страницы. */
  widths?: number[];
  borders?: boolean;
  /** Первая строка — заголовок: жирная и повторяется на каждой странице. */
  header?: boolean;
  size?: number;
}

export interface ImageBlock {
  type: 'image';
  image: ImageSpec;
  align?: Align;
}

export interface PageBreakBlock {
  type: 'pageBreak';
}

export type DocBlock = ParagraphBlock | TableBlock | ImageBlock | PageBreakBlock;

export interface DocOptions {
  font?: string;
  /** Размер шрифта, пт. */
  size?: number;
  /** Поля, мм. */
  margins?: { top: number; right: number; bottom: number; left: number };
}

const PAGE_W = 11906;
const PAGE_H = 16838;
const twips = (mm: number) => Math.round(mm * 56.6929);
const emu = (mm: number) => Math.round(mm * 36000);

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

class Builder {
  media: { name: string; rid: string; data: Uint8Array }[] = [];
  private drawingId = 1;

  constructor(readonly textWidth: number) {}

  run(r: Run, base: { bold?: boolean; italic?: boolean; size?: number } = {}): string {
    const bold = r.bold ?? base.bold;
    const italic = r.italic ?? base.italic;
    const size = r.size ?? base.size;
    const props = `${bold ? '<w:b/><w:bCs/>' : ''}${italic ? '<w:i/><w:iCs/>' : ''}${r.underline ? '<w:u w:val="single"/>' : ''}${size ? `<w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/>` : ''}`;
    const rPr = props ? `<w:rPr>${props}</w:rPr>` : '';
    const parts = r.text.split(/(\n|\t)/);
    const body = parts
      .map((p) => (p === '\n' ? '<w:br/>' : p === '\t' ? '<w:tab/>' : p ? `<w:t xml:space="preserve">${escapeXml(p)}</w:t>` : ''))
      .join('');
    return `<w:r>${rPr}${body}</w:r>`;
  }

  image(img: ImageSpec): string {
    const info = imageInfo(img.data);
    if (!info) return '';
    const n = this.media.length + 1;
    const name = `image${n}.${info.type}`;
    const rid = `rIdImg${n}`;
    this.media.push({ name, rid, data: img.data });
    const w = img.widthMm;
    const h = img.heightMm ?? (info.width ? (w * info.height) / info.width : w);
    const id = this.drawingId++;
    const cx = emu(w);
    const cy = emu(h);
    return (
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Рисунок ${id}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
      `<pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    );
  }

  paragraph(p: Omit<ParagraphBlock, 'type'>, inner?: string): string {
    const ppr: string[] = [];
    if (p.keepNext) ppr.push('<w:keepNext/>');
    if (p.rightTab) ppr.push(`<w:tabs><w:tab w:val="right" w:pos="${this.textWidth}"/></w:tabs>`);
    if (p.before || p.after) ppr.push(`<w:spacing w:before="${(p.before ?? 0) * 20}" w:after="${(p.after ?? 0) * 20}"/>`);
    if (p.firstLine || p.indentLeft) ppr.push(`<w:ind${p.indentLeft ? ` w:left="${twips(p.indentLeft)}"` : ''}${p.firstLine ? ` w:firstLine="${twips(p.firstLine)}"` : ''}/>`);
    if (p.align && p.align !== 'left') ppr.push(`<w:jc w:val="${p.align}"/>`);
    const runs = inner ?? (p.runs ?? (p.text ? [{ text: p.text }] : [])).map((r) => this.run(r, p)).join('');
    return `<w:p>${ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : ''}${runs}</w:p>`;
  }

  table(t: TableBlock): string {
    const cols = Math.max(1, ...t.rows.map((r) => r.reduce((n, c) => n + (typeof c === 'object' && c.span ? c.span : 1), 0)));
    const raw = t.widths && t.widths.length === cols ? t.widths : Array.from({ length: cols }, () => 1);
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const widths = raw.map((w) => Math.round((w / sum) * this.textWidth));
    const border = t.borders === false ? 'nil' : 'single';
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="${border}" w:sz="4" w:space="0" w:color="auto"/>`)
      .join('');
    const tblPr = `<w:tblPr><w:tblW w:w="${this.textWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:left w:w="85" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
    const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    const rows = t.rows
      .map((row, ri) => {
        const head = t.header && ri === 0;
        let col = 0;
        const cells = row
          .map((c) => {
            const cell = typeof c === 'string' ? { text: c } : c;
            const span = cell.span ?? 1;
            const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
            col += span;
            const tcPr = `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${cell.vMerge ? `<w:vMerge${cell.vMerge === 'start' ? ' w:val="restart"' : ''}/>` : ''}</w:tcPr>`;
            const base = { bold: cell.bold ?? head, size: t.size, align: cell.align };
            const content = cell.image
              ? this.paragraph({ align: cell.align ?? 'center' }, this.image(cell.image))
              : (cell.text ?? '')
                  .split('\n\n')
                  .map((chunk) => this.paragraph(base, (cell.runs ?? [{ text: chunk }]).map((r) => this.run(r, base)).join('')))
                  .join('');
            return `<w:tc>${tcPr}${content || '<w:p/>'}</w:tc>`;
          })
          .join('');
        return `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${cells}</w:tr>`;
      })
      .join('');
    return `<w:tbl>${tblPr}${grid}${rows}</w:tbl>`;
  }

  block(b: DocBlock): string {
    switch (b.type) {
      case 'p':
        return this.paragraph(b);
      case 'table':
        return this.table(b);
      case 'image':
        return this.paragraph({ align: b.align }, this.image(b.image));
      case 'pageBreak':
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    }
  }
}

/** Собрать .docx из блоков. */
export function buildDocx(blocks: DocBlock[], opts: DocOptions = {}): Uint8Array {
  const m = opts.margins ?? { top: 20, right: 15, bottom: 20, left: 30 };
  const textWidth = PAGE_W - twips(m.left) - twips(m.right);
  const b = new Builder(textWidth);
  let body = blocks.map((x) => b.block(x)).join('');
  // Документ должен заканчиваться абзацем (после таблицы Word его требует).
  if (!body.endsWith('</w:p>')) body += '<w:p/>';
  const sect = `<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="${twips(m.top)}" w:right="${twips(m.right)}" w:bottom="${twips(m.bottom)}" w:left="${twips(m.left)}" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>`;
  const document = `${HEAD}<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;

  const font = escapeXml(opts.font ?? 'Times New Roman');
  const size = (opts.size ?? 14) * 2;
  const styles =
    `${HEAD}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>` +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="ru-RU" w:eastAsia="ru-RU" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `</w:styles>`;

  const types =
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `</Types>`;
  const rels =
    `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;
  const docRels =
    `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    b.media.map((x) => `<Relationship Id="${x.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${x.name}"/>`).join('') +
    `</Relationships>`;

  return writeZip([
    { path: '[Content_Types].xml', data: utf8(types) },
    { path: '_rels/.rels', data: utf8(rels) },
    { path: 'word/document.xml', data: utf8(document) },
    { path: 'word/styles.xml', data: utf8(styles) },
    { path: 'word/_rels/document.xml.rels', data: utf8(docRels) },
    ...b.media.map((x) => ({ path: `word/media/${x.name}`, data: x.data })),
  ]);
}
