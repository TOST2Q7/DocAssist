import { describe, expect, it } from 'vitest';
import { fromUtf8, utf8 } from '../util/bytes';
import { attempt, pauseFor, waitLeft } from './attempts';
import { isOwners, makeKeyFile, ownerKeys, ownerOpen, ownerSeal, readKeyFile } from './owner';
import {
  digest,
  newDataKey,
  newDeveloperPair,
  newTransferCode,
  openCodePass,
  openData,
  openDeveloperPass,
  openForDeveloper,
  openOwnerPass,
  passForDeveloper,
  passForOwner,
  passWithCode,
  sealData,
  sealForDeveloper,
} from './pass';
import { VaultError } from './vault';

const PHRASE = 'лампа ворона северный компот гитара';

describe('ключ владельца', () => {
  it('одна соль — один расчёт на все куски; фраза без учёта регистра и «ё»', async () => {
    const keys = await ownerKeys(PHRASE);
    const a = await ownerSeal(keys, utf8('первое'), 'g1');
    const b = await ownerSeal(keys, utf8('второе'), 'g2');
    expect(isOwners(a, keys) && isOwners(b, keys)).toBe(true);
    const again = await ownerKeys('Лампа  ворона СЕВЕРНЫЙ компот гитара', keys.salt);
    expect(fromUtf8(await ownerOpen(again, a, 'g1'))).toBe('первое');
    // Кусок от одной грамотки к другой не подходит.
    await expect(ownerOpen(again, a, 'g2')).rejects.toBeInstanceOf(VaultError);
  }, 30_000);

  it('чужая фраза не подходит; другой владелец виден по соли', async () => {
    const keys = await ownerKeys(PHRASE);
    const sealed = await ownerSeal(keys, utf8('секрет'));
    const wrong = await ownerKeys('совсем другая фраза из слов', keys.salt);
    await expect(ownerOpen(wrong, sealed)).rejects.toMatchObject({ kind: 'wrong-phrase' });
    const other = await ownerKeys(PHRASE);
    expect(isOwners(sealed, other)).toBe(false);
  }, 30_000);

  it('файл ключа хранит фразу и выглядит случайными байтами', async () => {
    const file = await makeKeyFile(PHRASE);
    expect(new TextDecoder('latin1').decode(file)).not.toMatch(/лампа|docassist|AES/i);
    expect(await readKeyFile(file)).toBe(PHRASE);
    expect(await readKeyFile(utf8('просто текст, а не ключ'))).toBeNull();
  });
});

describe('ключ данных и пропуска', () => {
  it('кусок пришит к своему месту', async () => {
    const dk = await newDataKey();
    const sealed = await sealData(dk, utf8('скан'), 'g1/p1');
    expect(fromUtf8(await openData(dk, sealed, 'g1/p1'))).toBe('скан');
    await expect(openData(dk, sealed, 'g1/p2')).rejects.toMatchObject({ kind: 'damaged' });
    const other = await newDataKey();
    await expect(openData(other, sealed, 'g1/p1')).rejects.toBeInstanceOf(VaultError);
  });

  it('пропуск владельца: ключ данных и сведения', async () => {
    const keys = await ownerKeys(PHRASE);
    const dk = await newDataKey();
    const pass = await passForOwner(keys, dk, { status: 'own', gen: 1 }, 'g1');
    const r = await openOwnerPass<{ status: string; gen: number }>(keys, pass, 'g1');
    expect(r.meta).toEqual({ status: 'own', gen: 1 });
    const back = await openData(r.dk, await sealData(dk, utf8('x'), 'a'), 'a');
    expect(fromUtf8(back)).toBe('x');
  }, 20_000);

  it('временный ключ: 6 цифр, пробелы не важны, срок нельзя подменить', async () => {
    const code = newTransferCode();
    expect(code).toMatch(/^\d{6}$/);
    const dk = await newDataKey();
    const pass = await passWithCode(code, dk, { until: '2026-01-04T00:00:00.000Z' }, 'g1');
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect((await openCodePass<{ until: string }>(spaced, pass, 'g1')).meta.until).toBe('2026-01-04T00:00:00.000Z');
    const wrong = code === '000000' ? '000001' : '000000';
    await expect(openCodePass(wrong, pass, 'g1')).rejects.toMatchObject({ kind: 'wrong-phrase' });
    const tampered = pass.slice();
    tampered[tampered.length - 1] ^= 1;
    await expect(openCodePass(code, tampered, 'g1')).rejects.toBeInstanceOf(VaultError);
  }, 20_000);

  it('замок разработчика: закрыть может любой, открыть — только ключ разработчика', async () => {
    const dev = await newDeveloperPair();
    const sealed = await sealForDeveloper(utf8('запись журнала'), 'g1', dev.lock);
    expect(fromUtf8(await openForDeveloper(sealed, dev.key, 'g1'))).toBe('запись журнала');
    const stranger = await newDeveloperPair();
    await expect(openForDeveloper(sealed, stranger.key, 'g1')).rejects.toBeInstanceOf(VaultError);
    const dk = await newDataKey();
    const pass = await passForDeveloper(dk, { sealedAt: 'x' }, 'g1', dev.lock);
    expect((await openDeveloperPass<{ sealedAt: string }>(pass, dev.key, 'g1')).meta.sealedAt).toBe('x');
  });

  it('отпечаток меняется от одного байта', async () => {
    expect(await digest(utf8('а'))).not.toBe(await digest(utf8('б')));
    expect(await digest(utf8('а'))).toBe(await digest(utf8('а')));
  });
});

describe('пауза после неверных попыток', () => {
  it('три ошибки подряд — пауза, успех — сброс', async () => {
    let now = 1_000_000;
    const clock = () => now;
    const wrong = () => Promise.reject(new VaultError('wrong-phrase', 'нет'));
    for (let i = 0; i < 3; i++) await expect(attempt('тест', wrong, clock)).rejects.toMatchObject({ kind: 'wrong-phrase' });
    await expect(attempt('тест', () => Promise.resolve(1), clock)).rejects.toMatchObject({ kind: 'too-many' });
    expect(waitLeft('тест', now)).toBe(30);
    now += 31_000;
    expect(await attempt('тест', () => Promise.resolve(1), clock)).toBe(1);
    expect(waitLeft('тест', now)).toBe(0);
    expect(pauseFor(4)).toBe(60_000);
    expect(pauseFor(100)).toBe(3_600_000);
  });
});
