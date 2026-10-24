import { describe, expect, it } from 'vitest';
import { GramotkiStore } from '../gramotka/store';
import { outboxStore } from '../outbox/outbox';
import { MemoryAdapter } from '../storage/memoryAdapter';
import { Workspace } from '../workspace/workspace';
import { addPath, addPaths, baseStore, listTrees } from './base';
import { BaseTree, chainText, removeNodeFromEntries, type Step } from './tree';

const REGION: Step = { k: 'region', v: 'Регион', t: 'Респ.' };
const INDEX: Step = { k: 'index', v: '000000' };
const PLACE: Step = { k: 'locality', v: 'Примерное', t: 'с.' };
const PLACE2: Step = { k: 'locality', v: 'Другое', t: 'с.' };

async function workspace() {
  const adapter = new MemoryAdapter();
  const ws = new Workspace(adapter);
  await ws.init();
  return { ws, adapter };
}

describe('база данных (древа)', () => {
  it('путь добавляется один раз; файл древа — в .docassist/base; добавленное уходит в «Предложения в базу»', async () => {
    const { ws, adapter } = await workspace();
    expect(await addPath(ws, 'Адреса', [REGION, INDEX, PLACE], { source: 'test' })).toBe(true);
    expect(await addPath(ws, 'Адреса', [REGION, INDEX, PLACE], { source: 'test' })).toBe(false);
    await baseStore(ws, 'Адреса').flush();
    expect(adapter.files.has('.docassist/base/Адреса.json')).toBe(true);
    expect(await listTrees(ws)).toEqual(['Адреса']);
    const outbox = outboxStore(ws);
    await outbox.load();
    expect(outbox.get().data.items.map((x) => x.label)).toEqual([chainText([REGION, INDEX, PLACE])]);
  });

  it('новое прикрепляется к тому, что уже есть, — без двойников', async () => {
    const { ws } = await workspace();
    await addPath(ws, 'Адреса', [REGION, INDEX, PLACE], { source: 'test' });
    // Тот же населённый пункт без индекса — уже есть (индекс пропускается).
    expect(await addPath(ws, 'Адреса', [REGION, PLACE], { source: 'test' })).toBe(false);
    // Другой пункт в том же регионе — пристраивается к региону.
    expect(await addPaths(ws, 'Адреса', [[REGION, PLACE2], [REGION, INDEX, PLACE]], { source: 'test', share: false })).toBe(1);
    const tree = new BaseTree(baseStore(ws, 'Адреса').get().data.entries);
    const region = tree.resolve([REGION]).node;
    expect(region.children.map((c) => c.v).sort()).toEqual(['000000', 'Другое']);
    expect(tree.resolve([REGION, INDEX, PLACE]).matched).toBe(3);
  });

  it('удаление узла убирает всё внутри, но не то, что выше', async () => {
    const { ws } = await workspace();
    await addPaths(ws, 'Адреса', [[REGION, INDEX, PLACE], [REGION, PLACE2]], { source: 'test', share: false });
    const entries = removeNodeFromEntries(baseStore(ws, 'Адреса').get().data.entries, [REGION, INDEX]);
    const tree = new BaseTree(entries);
    expect(tree.resolve([REGION, INDEX]).matched).toBe(1);
    expect(tree.resolve([REGION, PLACE2]).matched).toBe(2);
  });

  it('открытые грамотки не мешают базе: древа читаются и пишутся, список рабочей папки без виртуальных папок', async () => {
    const { ws } = await workspace();
    const g = new GramotkiStore(ws);
    await g.init();
    await g.createOwner('лампа ворона северный компот гитара', 'Мастер', false);
    await g.create({ 'person.lastName': 'Фамилия', 'person.firstName': 'Имя' }, 'test');
    await addPath(ws, 'Должность в СО', [{ k: 'rso.position', v: 'Боец' }], { source: 'test' });
    await baseStore(ws, 'Должность в СО').flush();
    expect(await listTrees(ws)).toEqual(['Должность в СО']);
    expect((await ws.list('')).map((e) => e.name).sort()).toEqual(['.docassist', 'Грамотки']);
  }, 30_000);
});
