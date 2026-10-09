import { describe, expect, it } from 'vitest';
import { PERSON_FIELDS } from '@/core/schema/fields';
import type { TableData } from '@/core/tables/tables';
import { withFormHeaders } from './hooks';
import { isTableText, parseClipboardTable, toTable } from './PasteTable';

describe('вставка таблицы из буфера', () => {
  it('строки без заголовков — столбцы по порядку анкеты', () => {
    const text = '01.09.2025 12:00:00\tРеспублика Хакасия\tИванов\tИван\r\n01.09.2025 12:30:00\tРеспублика Хакасия\tИванова\tАнна\r\n';
    const t = toTable(parseClipboardTable(text));
    expect(t.hadHeader).toBe(false);
    expect(t.headers.slice(0, 4)).toEqual(['Отметка времени', 'Регион', 'Фамилия', 'Имя']);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[1][2]).toBe('Иванова');
  });

  it('с заголовками; ячейка с переводом строки в кавычках (как копирует Excel)', () => {
    const text = 'Фамилия\tИмя\tМесто регистрации по паспорту (с индексом)\nИванова\tАнна\t"655700, Респ. Хакасия,\nс. Аскиз"\n';
    const t = toTable(parseClipboardTable(text));
    expect(t.hadHeader).toBe(true);
    expect(t.rows).toEqual([['Иванова', 'Анна', '655700, Респ. Хакасия,\nс. Аскиз']]);
  });

  it('строка данных со словами «Фамилия», «Имя» — не заголовок', () => {
    const t = toTable(parseClipboardTable('01.01.2025 00:00:00\tРеспублика Регион\tФамилия\tИмя\tОтчество\tКандидат\tОтделение\tМужской\t01.01.2000\t000-000-000 00\n'));
    expect(t.hadHeader).toBe(false);
    expect(t.rows).toHaveLength(1);
  });

  it('одно значение — не таблица', () => {
    expect(isTableText('Абакан')).toBe(false);
    expect(isTableText('a\tb')).toBe(true);
  });

  it('файл без строки заголовков читается по порядку формы', () => {
    const table: TableData = { sheetName: 'Л', sheetNames: ['Л'], headers: ['01.09.2025 12:00:00', 'Республика Хакасия', 'Иванов'], rows: [['1', '2', '3']], sourceRows: [2] };
    const t = withFormHeaders(table);
    expect(t.headers).toEqual(PERSON_FIELDS.slice(0, 3).map((f) => f.label));
    expect(t.rows).toEqual([['01.09.2025 12:00:00', 'Республика Хакасия', 'Иванов'], ['1', '2', '3']]);
  });
});
