import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '../storage/memoryAdapter';
import { utf8 } from '../util/bytes';
import { newDeveloperPair } from '../vault/pass';
import { Workspace } from '../workspace/workspace';
import { readBundle, writeBundle } from './format';
import { gramotkaPath, GramotkiStore } from './store';

/*
 * Инструмент разработчика (tools/journal.mjs, `da` → «Журнал грамоток») читает то, что пишет приложение:
 * журнал любой грамотки и запечатанную копию — ключом разработчика.
 */

const TOOL = join(process.cwd(), 'tools/journal.mjs');

describe('журнал грамоток: инструмент разработчика', () => {
  it('читает журнал («кто кому и когда»), видит вырезанную запись и распечатывает запечатанную копию', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    const dev = await newDeveloperPair();
    const keyFile = join(dir, 'key.json');
    writeFileSync(keyFile, JSON.stringify({ keys: [{ lock: dev.lock, key: dev.key, createdAt: '' }] }));
    const env = { ...process.env, DOCASSIST_JOURNAL_KEY: keyFile };
    const run = (...args: string[]) => execFileSync(process.execPath, [TOOL, ...args], { env, encoding: 'utf8' });

    const ws = new Workspace(new MemoryAdapter());
    await ws.init();
    const store = new GramotkiStore(ws);
    store.developerLock = dev.lock;
    await store.init();
    await store.createOwner('лампа ворона северный компот гитара', 'Прежний мастер', false);
    const id = await store.create({ 'person.lastName': 'Фамилия', 'person.firstName': 'Имя' }, 'test');
    await ws.writeBytes(`${gramotkaPath(id)}/Сканы/снилс.jpg`, utf8('СНИЛС'));
    const { files } = await store.transfer([id], () => 'Фамилия И.');
    const sent = join(dir, 'перевод.gramotka');
    writeFileSync(sent, files[0].data);

    const log = run('read', sent);
    expect(log).toContain('создана: Прежний мастер');
    expect(log).toContain('передана (выдан временный ключ): Прежний мастер');
    expect(log).toContain('Цепочка записей в порядке.');
    expect(log).not.toContain('Фамилия');

    // Запись вырезали — видно.
    const b = readBundle(files[0].data);
    const cut = join(dir, 'вырезано.gramotka');
    writeFileSync(cut, writeBundle({ head: { ...b.head, journal: b.head.journal.slice(1) }, pieces: b.pieces }));
    expect(run('read', cut)).toContain('цепочка разорвана');

    // Запечатанная копия у прежнего мастера — распечатывается в папку.
    const sealed = await store.rawBundle(id);
    const sealedFile = join(dir, 'запечатанная.gramotka');
    writeFileSync(sealedFile, sealed.data);
    const out = join(dir, 'распечатано');
    expect(run('unseal', sealedFile, out)).toContain('файлов — 1');
    expect(readFileSync(join(out, 'файлы', 'Сканы', 'снилс.jpg'), 'utf8')).toBe('СНИЛС');
    expect(JSON.parse(readFileSync(join(out, 'данные.json'), 'utf8')).человек.fields['person.lastName']).toBe('Фамилия');
    // Не запечатанную (перевод под временным ключом) распечатать нельзя.
    expect(() => run('unseal', sent, join(dir, 'нет'))).toThrow();
  }, 60_000);
});
