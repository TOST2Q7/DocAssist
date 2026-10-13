import type { CSSProperties, ReactNode } from 'react';
import type { DocBlock, Run, TableCell } from '@/core/docx/write';

/*
 * Предпросмотр документа «на листе» — те же блоки, из которых собирается .docx.
 * Метки, которые не удалось заполнить ({Нет такой}), подсвечиваются.
 */

/** Ширина текста на листе A4 с полями 30/15 мм. */
const TEXT_MM = 165;

function marked(text: string): ReactNode[] {
  return text.split(/(\{[^{}\n]{1,80}\}|\n)/).map((part, i) =>
    part === '\n' ? <br key={i} /> : /^\{[^{}]+\}$/.test(part) ? <mark key={i} className="dela-unknown" title="Метка не заполнена">{part}</mark> : part,
  );
}

function runs(list: Run[] | undefined, text: string | undefined): ReactNode {
  if (list)
    return list.map((r, i) => (
      <span key={i} style={{ fontWeight: r.bold ? 700 : undefined, fontStyle: r.italic ? 'italic' : undefined, textDecoration: r.underline ? 'underline' : undefined }}>
        {marked(r.text)}
      </span>
    ));
  return text ? marked(text) : ' ';
}

const alignCss = (a?: string): CSSProperties['textAlign'] => (a === 'both' ? 'justify' : (a as CSSProperties['textAlign']) ?? 'left');

function cell(c: TableCell, i: number) {
  const x = typeof c === 'string' ? { text: c } : c;
  return (
    <td key={i} colSpan={x.span} style={{ textAlign: alignCss(x.align), fontWeight: x.bold ? 700 : undefined }}>
      {x.image ? <span className="dela-paper__img">фото</span> : runs(x.runs, x.text)}
    </td>
  );
}

export function DocPreview({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="dela-paper" aria-label="Предпросмотр документа">
      {blocks.map((b, i) => {
        if (b.type === 'p')
          return (
            <p
              key={i}
              style={{
                textAlign: alignCss(b.align),
                marginLeft: b.indentLeft ? `${(b.indentLeft / TEXT_MM) * 100}%` : undefined,
                textIndent: b.firstLine ? `${(b.firstLine / TEXT_MM) * 100}%` : undefined,
                fontWeight: b.bold ? 700 : undefined,
              }}
            >
              {runs(b.runs, b.text)}
            </p>
          );
        if (b.type === 'table')
          return (
            <table key={i} className={`dela-paper__tbl ${b.borders === false ? 'dela-paper__tbl--plain' : ''}`}>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>{row.map(cell)}</tr>
                ))}
              </tbody>
            </table>
          );
        if (b.type === 'image')
          return (
            <p key={i} style={{ textAlign: alignCss(b.align) }}>
              <span className="dela-paper__img">фото</span>
            </p>
          );
        return <hr key={i} className="dela-paper__break" />;
      })}
    </div>
  );
}
