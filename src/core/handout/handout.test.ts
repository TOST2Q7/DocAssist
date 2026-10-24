import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../storage/memoryAdapter';
import { uniqueFileName, Workspace } from '../workspace/workspace';
import { handoutStore, putToHandout, removeFromHandout, takeBack } from './handout';

const text = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null);

async function setup() {
  const ws = new Workspace(new MemoryAdapter());
  await ws.writeBytes('Личные дела/Фамилия Имя/Сканы/скан.jpg', 'скан');
  await ws.writeBytes('Для выдачи/Паспорт.jpg', 'уже лежит');
  return ws;
}

describe('папка «Для выдачи»', () => {
  it('свободное имя: занятые — с номером, запрещённые символы — «_»', () => {
    expect(uniqueFileName('скан.jpg', new Set(['скан.jpg', 'скан (2).jpg']))).toBe('скан (3).jpg');
    expect(uniqueFileName('a/b:c.pdf', new Set())).toBe('a_b_c.pdf');
    expect(uniqueFileName('без расширения', new Set(['без расширения']))).toBe('без расширения (2)');
  });

  it('перемещение: файл уходит из папки, запоминается откуда; занятое имя — с номером', async () => {
    const ws = await setup();
    const item = await putToHandout(ws, 'Личные дела/Фамилия Имя/Сканы/скан.jpg', { name: 'Паспорт.jpg', move: true, label: 'Паспорт', meta: { personId: 'p1' } });
    expect(item).toMatchObject({ name: 'Паспорт (2).jpg', from: 'Личные дела/Фамилия Имя/Сканы/скан.jpg', moved: true, label: 'Паспорт' });
    expect(await ws.readBytes('Личные дела/Фамилия Имя/Сканы/скан.jpg')).toBeNull();
    expect(text(await ws.readBytes('Для выдачи/Паспорт (2).jpg'))).toBe('скан');
    expect(text(await ws.readBytes('Для выдачи/Паспорт.jpg'))).toBe('уже лежит');
    expect(handoutStore(ws).get().data.items).toHaveLength(1);
  });

  it('копирование оставляет файл на месте', async () => {
    const ws = await setup();
    await putToHandout(ws, 'Личные дела/Фамилия Имя/Сканы/скан.jpg', { move: false });
    expect(text(await ws.readBytes('Личные дела/Фамилия Имя/Сканы/скан.jpg'))).toBe('скан');
    expect(text(await ws.readBytes('Для выдачи/скан.jpg'))).toBe('скан');
  });

  it('вернуть на место под исходным именем; удалить', async () => {
    const ws = await setup();
    const item = await putToHandout(ws, 'Личные дела/Фамилия Имя/Сканы/скан.jpg', { name: 'Новое.jpg', move: true });
    expect(await takeBack(ws, item)).toBe('Личные дела/Фамилия Имя/Сканы/скан.jpg');
    expect(text(await ws.readBytes('Личные дела/Фамилия Имя/Сканы/скан.jpg'))).toBe('скан');
    expect(await ws.readBytes('Для выдачи/Новое.jpg')).toBeNull();
    expect(handoutStore(ws).get().data.items).toEqual([]);
    await removeFromHandout(ws, ['Паспорт.jpg']);
    expect(await ws.readBytes('Для выдачи/Паспорт.jpg')).toBeNull();
  });
});

describe('«Для выдачи» и грамотки', () => {
  it('скан из личной папки (грамотки) — в «Для выдачи» открытым файлом и обратно; готовый документ — сразу туда', async () => {
    const { GramotkiStore, gramotkaPath } = await import('../gramotka/store');
    const { addToHandout } = await import('./handout');
    const ws = new Workspace(new MemoryAdapter());
    await ws.init();
    const g = new GramotkiStore(ws);
    await g.init();
    await g.createOwner('лампа ворона северный компот гитара', 'Мастер', false);
    const id = await g.create({ 'person.lastName': 'Фамилия' }, 'test');
    const from = `${gramotkaPath(id)}/Сканы/скан.jpg`;
    await ws.writeBytes(from, 'скан');
    const item = await putToHandout(ws, from, { name: 'Паспорт.jpg', move: true });
    expect(text(await ws.readBytes('Для выдачи/Паспорт.jpg'))).toBe('скан');
    expect(await ws.readBytes(from)).toBeNull();
    const back = await takeBack(ws, item);
    expect(back).toBe(from);
    expect(text(await ws.readBytes(from))).toBe('скан');
    const name = await addToHandout(ws, 'Учетная карточка.docx', new TextEncoder().encode('docx'), { source: 'doc-generator', label: 'Учетная карточка', who: 'Фамилия' });
    expect(name).toBe('Учетная карточка.docx');
    expect(handoutStore(ws).get().data.items.find((x) => x.name === name)).toMatchObject({ from: '', moved: false, label: 'Учетная карточка' });
  }, 30_000);
});
