import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCsv, parseTsv, readTable, writeXlsx } from './tables';

describe('таблицы', () => {
  it('CSV с кавычками и «;»', () => {
    const rows = parseCsv('a;b;c\n1;"x;y";"say ""hi"""\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x;y', 'say "hi"'],
    ]);
  });

  it('XLSX: даты без сдвига, ведущие нули, длинные числа', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Дата', 'Номер', 'ИНН', 'Текст']]);
    ws['A2'] = { t: 'n', v: 36526, z: 'dd.mm.yyyy' }; // 01.01.2000
    ws['B2'] = { t: 'n', v: 12345, z: '000000', w: '012345' };
    ws['C2'] = { t: 'n', v: 123456789012 };
    ws['D2'] = { t: 's', v: 'Абакан' };
    ws['A3'] = { t: 'n', v: 45901.5, z: 'dd.mm.yyyy hh:mm:ss' };
    ws['!ref'] = 'A1:D3';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Лист1');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    const t = readTable(bytes, 'test.xlsx');
    expect(t.headers).toEqual(['Дата', 'Номер', 'ИНН', 'Текст']);
    expect(t.rows[0]).toEqual(['01.01.2000', '012345', '123456789012', 'Абакан']);
    expect(t.rows[1][0]).toBe('01.09.2025 12:00:00');
    expect(t.sourceRows).toEqual([2, 3]);
  });

  it('вставка из буфера: кавычки — часть значения, если не экранируют', () => {
    expect(parseTsv('"Еноты"\tДа\n')).toEqual([['"Еноты"', 'Да']]);
    expect(parseTsv('ГБПОУ "Колледж»\t"Отряд"')).toEqual([['ГБПОУ "Колледж»', '"Отряд"']]);
    // Excel/Google экранируют ячейку с кавычками или переводом строки — снимаем.
    expect(parseTsv('"""Еноты"""\t2\r\n')).toEqual([['"Еноты"', '2']]);
    expect(parseTsv('А\t"строка 1\nстрока 2"\tБ\n')).toEqual([['А', 'строка 1\nстрока 2', 'Б']]);
    // Пустые ячейки и хвостовая табуляция.
    expect(parseTsv('a\t\tc\t\nd')).toEqual([['a', '', 'c', ''], ['d']]);
    expect(parseTsv('"')).toEqual([['"']]);
  });

  it('запись XLSX сохраняет текст как есть', () => {
    const bytes = writeXlsx(['Номер'], [['012345']]);
    const t = readTable(bytes, 'out.xlsx');
    expect(t.rows[0][0]).toBe('012345');
  });
});
