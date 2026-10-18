import { describe, expect, it } from 'vitest';
import type { TableData } from '@/core/tables/tables';
import { remapSession, type AnketaSession } from '../model/session';
import { isSnapshotPath, mapRows, planWrite, rowKey } from './sheetLink';

const columns = ['person.lastName', 'person.firstName', 'person.middleName', 'person.birthDate', 'contact.phone'];
const headers = ['Фамилия', 'Имя', 'Отчество', 'Дата рождения', 'Телефон'];
const table: TableData = {
  sheetName: 'Лист1',
  sheetNames: ['Лист1'],
  headers,
  rows: [
    ['Иванов', 'Иван', 'Иванович', '01.01.2000', '8900'],
    ['Петров', 'Пётр', 'Петрович', '02.02.2001', '8911'],
  ],
  sourceRows: [2, 3],
};
const edit = (orig: string, value: string) => ({ orig, value });

describe('Google Таблица: запись исправлений', () => {
  it('пишет только изменённые ячейки и находит строку по ФИО, даже если строки сдвинулись', () => {
    const current = [headers, ['Новый', 'Человек', '', '', ''], ['Иванов', 'Иван', 'Иванович', '01.01.2000', '8900'], ['Петров', 'Пётр', 'Петрович', '02.02.2001', '8911']];
    const plan = planWrite(table, columns, { edits: { 0: { 4: edit('8900', '+7 900') }, 1: { 4: edit('8911', '+7 911') } } }, current);
    expect(plan.writes).toEqual([
      { row: 3, col: 4, value: '+7 900', tableRow: 0 },
      { row: 4, col: 4, value: '+7 911', tableRow: 1 },
    ]);
    expect(plan.conflicts).toEqual([]);
  });

  it('не затирает то, что успели изменить в таблице, и не пишет повторно', () => {
    const current = [headers, ['Иванов', 'Иван', 'Иванович', '01.01.2000', '8999'], ['Петров', 'Пётр', 'Петрович', '02.02.2001', '+7 911']];
    const plan = planWrite(table, columns, { edits: { 0: { 4: edit('8900', '+7 900') }, 1: { 4: edit('8911', '+7 911') } } }, current);
    expect(plan.writes).toEqual([]);
    expect(plan.already).toBe(1);
    expect(plan.conflicts).toMatchObject([{ tableRow: 0, sheetRow: 2, col: 4, mine: '+7 900', theirs: '8999' }]);
  });

  it('исправленная фамилия тоже узнаётся; удалённого человека — не пишет', () => {
    const current = [headers, ['Иванов', 'Иван', 'Иванович', '01.01.2000', '8900']];
    const plan = planWrite(table, columns, { edits: { 0: { 0: edit('Иванов', 'Иванова') }, 1: { 4: edit('8911', '1') } } }, current);
    expect(plan.writes).toEqual([{ row: 2, col: 0, value: 'Иванова', tableRow: 0 }]);
    expect(plan.missing).toEqual([1]);
  });
});

describe('обновление из Google: пометки остаются у тех же людей', () => {
  it('сопоставляет строки по ФИО и переносит сеанс', () => {
    const next = [['Новый', 'Человек', '', '', ''], ...table.rows];
    const map = mapRows(table.rows, next, columns);
    expect([...map.entries()]).toEqual([
      [0, 1],
      [1, 2],
    ]);
    const s: AnketaSession = {
      source: { name: '', size: 0, lastModified: 0, sheet: '' },
      edits: { 0: { 4: edit('8900', '1') } },
      reviewed: [1],
      confirmed: {},
      notes: { 1: { 4: 'уточнить телефон' } },
    };
    const moved = remapSession(s, map);
    expect(moved.edits).toEqual({ 1: { 4: edit('8900', '1') } });
    expect(moved.reviewed).toEqual([2]);
    expect(moved.notes).toEqual({ 2: { 4: 'уточнить телефон' } });
  });

  it('ключ строки — ФИО и дата рождения, регистр и «ё» не важны', () => {
    expect(rowKey(['Пётр', 'Иван', '', '', ''], columns)).toBe(rowKey(['петр ', 'ИВАН', '', '', ''], columns));
    expect(rowKey(['', '', '', '', '8900'], columns)).toBeNull();
  });
});

describe('пути снимков', () => {
  it('только в папке «Google Таблицы»', () => {
    expect(isSnapshotPath('Проверка анкет/Google Таблицы/Анкеты — Лист1.xlsx')).toBe(true);
    expect(isSnapshotPath('Проверка анкет/Google Таблицы/../checks.json')).toBe(false);
    expect(isSnapshotPath('.docassist/people.json')).toBe(false);
    expect(isSnapshotPath('Проверка анкет/Google Таблицы/a/b.xlsx')).toBe(false);
  });
});
