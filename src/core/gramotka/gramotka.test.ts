import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../storage/memoryAdapter';
import { fromUtf8, utf8 } from '../util/bytes';
import { makeKeyFile } from '../vault/owner';
import { newDeveloperPair, openDeveloperPass, openData, openForDeveloper } from '../vault/pass';
import { Workspace } from '../workspace/workspace';
import { compareEdits, diffKey, mergeEdits } from './compare';
import { readBundle, readHead, shortCode, HEAD_FILE } from './format';
import { gramotkaPath, GramotkiStore, GRAMOTKI_FOLDER } from './store';
import type { GramotkaIndex, JournalEntry, PassMeta } from './types';

const PHRASE = 'лампа ворона северный компот гитара';
const OTHER = 'пингвин маяк сосна ракета чайник';
const PERSON = { 'person.lastName': 'Фамилия', 'person.firstName': 'Имя', 'person.birthDate': '01.01.2000' };

async function workspace() {
  const adapter = new MemoryAdapter();
  const ws = new Workspace(adapter);
  await ws.init();
  return { ws, adapter };
}

async function storeFor(ws: Workspace, lock?: string) {
  const s = new GramotkiStore(ws);
  s.developerLock = lock;
  await s.init();
  return s;
}

/** Байты рабочей папки как текст (latin1) — чтобы искать там открытые данные. */
const dump = (a: MemoryAdapter) => [...a.files.values()].map((f) => new TextDecoder('latin1').decode(f.data)).join('\n') + [...a.files.keys()].join('\n');

describe('грамотка: создать, открыть, файлы', () => {
  it('первая фраза создаёт мастера; данные и файлы на диске закрыты', async () => {
    const { ws, adapter } = await workspace();
    const s = await storeFor(ws);
    expect(s.snapshot().status).toBe('new');
    await s.createOwner(PHRASE, 'Мастер М. М.', false);
    expect(s.snapshot().status).toBe('open');
    const id = await s.create(PERSON, 'test');
    await ws.writeBytes(`${gramotkaPath(id)}/Сканы/Паспорт.jpg`, utf8('СКАН-ПАСПОРТА'));
    await s.flushAll();
    expect(fromUtf8((await ws.readBytes(`${gramotkaPath(id)}/Сканы/Паспорт.jpg`))!)).toBe('СКАН-ПАСПОРТА');
    expect((await ws.list(gramotkaPath(id))).map((e) => e.name)).toEqual(['Сканы']);
    expect((await ws.list(`${gramotkaPath(id)}/Сканы`))[0]).toMatchObject({ name: 'Паспорт.jpg', kind: 'file', size: utf8('СКАН-ПАСПОРТА').length });
    // В рабочей папке — ни ФИО, ни имён файлов, ни содержимого.
    const text = dump(adapter);
    expect(text).not.toMatch(/Фамилия|Паспорт|СКАН|Сканы|Мастер|person\./);
    expect([...adapter.files.keys()].some((k) => k.startsWith(`${GRAMOTKI_FOLDER}/Грамотка ${shortCode(id)}/`))).toBe(true);
    // Виртуальная папка не видна в списке рабочей папки.
    expect((await ws.list('')).some((e) => e.name.startsWith('@'))).toBe(false);
  }, 30_000);

  it('открывается той же фразой (и файлом ключа), чужая фраза — нет; после закрытия папки человека нет', async () => {
    const { ws } = await workspace();
    const s = await storeFor(ws);
    await s.createOwner(PHRASE, 'Мастер', false);
    const id = await s.create(PERSON, 'test');
    s.setSection(id, 'app', { note: 'заметка' });
    await ws.writeBytes(`${gramotkaPath(id)}/a.txt`, utf8('файл'));
    await s.lock();
    expect(s.snapshot().status).toBe('locked');
    await expect(ws.readBytes(`${gramotkaPath(id)}/a.txt`)).rejects.toThrow(/закрыта/);

    const again = await storeFor(ws);
    expect(again.snapshot().status).toBe('locked');
    await expect(again.unlock(OTHER, false)).rejects.toMatchObject({ kind: 'wrong-phrase' });
    await again.unlockWithKeyFile(await makeKeyFile(PHRASE), false);
    expect(again.snapshot().people).toHaveLength(1);
    expect(again.snapshot().people[0].fields['person.lastName']).toBe('Фамилия');
    expect(again.snapshot().owner?.name).toBe('Мастер');
    expect(again.section(id, 'app')).toEqual({ note: 'заметка' });
    expect(fromUtf8((await ws.readBytes(`${gramotkaPath(id)}/a.txt`))!)).toBe('файл');
  }, 30_000);

  it('замена и удаление файлов; старые куски удаляются', async () => {
    const { ws, adapter } = await workspace();
    const s = await storeFor(ws);
    await s.createOwner(PHRASE, 'Мастер', false);
    const id = await s.create(PERSON, 'test');
    const p = `${gramotkaPath(id)}/Фотографии/фото.jpg`;
    await ws.writeBytes(p, utf8('первое'));
    await ws.writeBytes(p, utf8('второе'));
    await s.flushAll();
    const pieces = () => [...adapter.files.keys()].filter((k) => k.startsWith(GRAMOTKI_FOLDER) && !k.endsWith(`/${HEAD_FILE}`));
    expect(pieces()).toHaveLength(1);
    expect(fromUtf8((await ws.readBytes(p))!)).toBe('второе');
    await ws.moveFile(p, `${gramotkaPath(id)}/Сканы/фото.jpg`);
    await ws.remove(`${gramotkaPath(id)}/Сканы`);
    await s.flushAll();
    expect(pieces()).toHaveLength(0);
    expect(await ws.list(gramotkaPath(id))).toEqual([{ name: 'Фотографии', path: `${gramotkaPath(id)}/Фотографии`, kind: 'directory' }]);
  }, 30_000);

  it('сменить фразу: старая больше не подходит, данные на месте', async () => {
    const { ws } = await workspace();
    const s = await storeFor(ws);
    await s.createOwner(PHRASE, 'Мастер', false);
    const id = await s.create(PERSON, 'test');
    await s.changePhrase(OTHER, false);
    await s.lock();
    const again = await storeFor(ws);
    await expect(again.unlock(PHRASE, false)).rejects.toMatchObject({ kind: 'wrong-phrase' });
    await again.unlock(OTHER, false);
    expect(again.item(id)?.fields['person.lastName']).toBe('Фамилия');
  }, 40_000);

  it('карточку мастера удалили — фраза всё равно открывает (соль из грамотки)', async () => {
    const { ws, adapter } = await workspace();
    const s = await storeFor(ws);
    await s.createOwner(PHRASE, 'Мастер', false);
    await s.create(PERSON, 'test');
    await s.lock();
    adapter.files.delete('.docassist/owner.bin');
    const again = await storeFor(ws);
    await again.unlock(PHRASE, false);
    expect(again.snapshot().people).toHaveLength(1);
    expect(again.snapshot().owner?.name).toBe('Мастер');
  }, 30_000);
});

describe('перевод', () => {
  it('файл и временный ключ: новый мастер принимает, ключ меняется, своя копия запечатана для разработчика', async () => {
    const dev = await newDeveloperPair();
    const a = await workspace();
    const old = await storeFor(a.ws, dev.lock);
    await old.createOwner(PHRASE, 'Прежний мастер', false);
    const id = await old.create(PERSON, 'test');
    await a.ws.writeBytes(`${gramotkaPath(id)}/Сканы/снилс.jpg`, utf8('СНИЛС'));
    old.setSection(id, 'lichnye-dela', { achievements: ['грамота'] });

    const { code, until, files } = await old.transfer([id], () => 'Фамилия И.');
    expect(code).toMatch(/^\d{6}$/);
    expect(files[0].name).toBe(`Грамотка ${shortCode(id)}.gramotka`);
    expect(new TextDecoder('latin1').decode(files[0].data)).not.toMatch(/Фамилия|СНИЛС|Сканы/);
    // У прежнего мастера: грамотка запечатана (ярлык виден), открыть её нельзя.
    expect(old.snapshot().people).toHaveLength(0);
    expect(old.snapshot().sealed[0]).toMatchObject({ id, label: { fio: 'Фамилия И.', until } });
    await expect(a.ws.readBytes(`${gramotkaPath(id)}/Сканы/снилс.jpg`)).rejects.toThrow();

    // Новый мастер — своя рабочая папка, своя фраза.
    const b = await workspace();
    const neu = await storeFor(b.ws, dev.lock);
    await neu.createOwner(OTHER, 'Новый мастер', false);
    expect(neu.inspect(files[0].data)).toMatchObject({ id, own: false, existing: null });
    await expect(neu.prepare(files[0].data, '000000' === code ? '111111' : '000000')).rejects.toMatchObject({ kind: 'wrong-phrase' });
    const prepared = await neu.prepare(files[0].data, code);
    expect(prepared.order).toBe('new');
    expect(await neu.accept(prepared)).toEqual({ id, how: 'added' });
    expect(neu.item(id)?.fields['person.lastName']).toBe('Фамилия');
    expect(neu.item(id)?.pass).toMatchObject({ kind: 'own', gen: 2, owner: { name: 'Новый мастер' }, from: { name: 'Прежний мастер' } });
    expect(fromUtf8((await b.ws.readBytes(`${gramotkaPath(id)}/Сканы/снилс.jpg`))!)).toBe('СНИЛС');
    expect(neu.section(id, 'lichnye-dela')).toEqual({ achievements: ['грамота'] });
    expect(neu.snapshot().brokenJournal).toEqual([]);

    // Новая копия у нового мастера закрыта новым ключом: временный ключ к ней уже не подходит.
    const mine = await neu.bundle(id);
    const otherSide = await storeFor((await workspace()).ws, dev.lock);
    await otherSide.createOwner('третий мастер чужая фраза', 'Третий', false);
    await expect(otherSide.prepare(mine.data, code)).rejects.toBeTruthy();

    // Разработчик: журнал и запечатанная копия открываются его ключом.
    const sealedHead = readHead((await a.adapter.readFile(`${old.snapshot().sealed[0].folder}/${HEAD_FILE}`))!);
    const { dk, meta } = await openDeveloperPass<PassMeta>(sealedHead.pass, dev.key, id);
    expect(meta.kind).toBe('sealed');
    const index = JSON.parse(fromUtf8(await openData(dk, sealedHead.index, `${id}/index`))) as GramotkaIndex;
    expect(index.person.fields['person.lastName']).toBe('Фамилия');
    const journal = await Promise.all(readBundle(mine.data).head.journal.map(async (j) => JSON.parse(fromUtf8(await openForDeveloper(j, dev.key, id))) as JournalEntry));
    expect(journal.map((j) => [j.event, j.by.name])).toEqual([
      ['created', 'Прежний мастер'],
      ['transfer', 'Прежний мастер'],
      ['accepted', 'Новый мастер'],
    ]);
    expect(JSON.stringify(journal)).not.toMatch(/Фамилия/);
  }, 60_000);

  it('срок временного ключа вышел — не принимается', async () => {
    const a = await workspace();
    const old = await storeFor(a.ws);
    await old.createOwner(PHRASE, 'Прежний', false);
    const id = await old.create(PERSON, 'test');
    const { code, files } = await old.transfer([id], () => 'Ф', new Date(Date.now() - 4 * 86_400_000));
    const neu = await storeFor((await workspace()).ws);
    await neu.createOwner(OTHER, 'Новый', false);
    await expect(neu.prepare(files[0].data, code)).rejects.toMatchObject({ kind: 'expired' });
  }, 40_000);

  it('копии разошлись: различия показываются, выбранное берётся из пришедшей', async () => {
    const a = await workspace();
    const s = await storeFor(a.ws);
    await s.createOwner(PHRASE, 'Мастер', false);
    const id = await s.create(PERSON, 'test');
    await s.flushAll();
    const copy = await s.bundle(id);
    // Здесь поправили одно, в копии (на другом устройстве) — другое.
    s.setPerson(id, { ...PERSON, 'person.phone': '8(000)000-00-01' }, 'test');
    await s.flushAll();

    const b = await workspace();
    for (const [k, v] of a.adapter.files) if (k.startsWith('.docassist/owner')) b.adapter.files.set(k, v);
    const other = await storeFor(b.ws);
    await other.unlock(PHRASE, false);
    const p0 = await other.prepare(copy.data);
    expect(p0.order).toBe('new');
    await other.accept(p0);
    other.setPerson(id, { ...PERSON, 'person.email': 'mail@example.com' }, 'test');
    await b.ws.writeBytes(`${gramotkaPath(id)}/скан.pdf`, utf8('PDF'));
    await other.flushAll();
    const theirs = await other.bundle(id);

    const p = await s.prepare(theirs.data);
    expect(p.order).toBe('diverged');
    const keys = p.diff.map(diffKey).sort();
    expect(keys).toEqual(['field:person.email', 'field:person.phone', 'file:скан.pdf']);
    const r = await s.accept(p, { 'field:person.email': 'theirs', 'file:скан.pdf': 'theirs' });
    expect(r.how).toBe('merged');
    const g = s.item(id)!;
    expect(g.fields).toMatchObject({ 'person.phone': '8(000)000-00-01', 'person.email': 'mail@example.com' });
    expect(fromUtf8((await a.ws.readBytes(`${gramotkaPath(id)}/скан.pdf`))!)).toBe('PDF');
    // После слияния своя копия новее пришедшей.
    expect(compareEdits(g.index.edits, (await other.prepare(await s.bundle(id).then((x) => x.data))).received.index.edits)).toBe('same');
  }, 60_000);
});

describe('счёт правок', () => {
  it('новее, старше, разошлись', () => {
    expect(compareEdits({ a: 2 }, { a: 1 })).toBe('newer');
    expect(compareEdits({ a: 1 }, { a: 1, b: 1 })).toBe('older');
    expect(compareEdits({ a: 2 }, { a: 1, b: 1 })).toBe('diverged');
    expect(compareEdits({}, {})).toBe('same');
    expect(mergeEdits({ a: 2 }, { a: 1, b: 3 })).toEqual({ a: 2, b: 3 });
  });
});
