import { describe, expect, it } from 'vitest';
import { cellAfter, findElements, findLabel, nextRowCell, runXml, tableCells, textOf, writeCells } from './docx';
import { cellCapacity, splitLines, textWidth } from './measure';

const tc = (inner: string, w = 1000) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
const p = (text = '') => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${text ? `<w:r><w:t>${text}</w:t></w:r>` : ''}</w:p>`;

describe('docx: таблицы и ячейки', () => {
  it('ячейки по строкам; вложенная таблица не путает разбор', () => {
    const nested = `<w:tbl><w:tr>${tc(p('внутри'))}</w:tr></w:tbl>`;
    const xml = `<w:body><w:tbl><w:tr>${tc(p('ФИО'), 800)}${tc(p(), 9000)}</w:tr><w:tr>${tc(p('Адрес') + nested)}${tc('<w:p/>')}</w:tr></w:tbl></w:body>`;
    const cells = tableCells(xml);
    expect(cells.map((c) => [c.row, c.col, c.text, c.width])).toEqual([
      [0, 0, 'ФИО', 800],
      [0, 1, '', 9000],
      [1, 0, 'Адресвнутри', 1000],
      [1, 1, '', 1000],
    ]);
    const fio = findLabel(cells, 'фио:')!;
    expect(cellAfter(cells, fio)?.width).toBe(9000);
    expect(nextRowCell(cells, fio)?.text).toBe('Адресвнутри');
  });

  it('запись текста: оформление абзаца остаётся, старый текст заменяется, пустой <w:p/> раскрывается', () => {
    const xml = `<w:tbl><w:tr>${tc(p('старое'))}${tc('<w:p/>')}</w:tr></w:tbl>`;
    const cells = tableCells(xml);
    const out = writeCells(xml, [
      { cell: cells[0], runs: runXml('A & B <c>') },
      { cell: cells[1], runs: runXml('второе') },
    ]);
    expect(tableCells(out).map((c) => c.text)).toEqual(['A & B <c>', 'второе']);
    expect(out).toContain('<w:jc w:val="center"/></w:pPr><w:r>');
    expect(textOf(out)).not.toContain('старое');
    expect(findElements(out, 'w:p')).toHaveLength(2);
  });

  it('переводы строк и недопустимые в XML знаки не попадают в документ', () => {
    expect(textOf(runXml('раз\nдва\u0001'))).toBe('раз два');
  });
});

describe('ширина текста и перенос', () => {
  it('ширина по метрикам Times New Roman', () => {
    expect(textWidth('01.01.2002')).toBe(8 * 500 + 2 * 250);
    expect(cellCapacity(108 + 240)).toBe(Math.floor(1000 * 0.98));
  });

  it('перенос после запятой, если строка не остаётся полупустой', () => {
    const cap = textWidth('Респ. Хакасия, г. Абакан, ул.');
    expect(splitLines('Респ. Хакасия, г. Абакан, ул. Ленина, д. 1', [cap, 100000]).lines).toEqual(['Респ. Хакасия, г. Абакан,', 'ул. Ленина, д. 1']);
    // Запятая слишком рано — перенос по пробелу.
    expect(splitLines('Абакан, улица Длинная Предлинная', [textWidth('Абакан, улица Длинная'), 100000]).lines).toEqual(['Абакан, улица Длинная', 'Предлинная']);
    expect(splitLines('коротко', [10000, 10000])).toEqual({ lines: ['коротко'], overflow: false });
    expect(splitLines('', [10000])).toEqual({ lines: [], overflow: false });
  });
});
