import { describe, expect, it } from 'vitest';
import { checkPhrase, generatePhrase, keyFromPhrase, lock, lockWithKey, PHRASE_WORDS_COUNT, sameSalt, saltOf, unlock, unlockWithKey, VaultError } from './vault';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe('сейф', () => {
  it('закрывает и открывает фразой; регистр и пробелы не важны', async () => {
    const sealed = await lock(enc('{"тема":"тёмная"}'), 'Лампа  ворона северный компот');
    const { data } = await unlock(sealed, 'лампа ворона  северный компот ');
    expect(dec(data)).toBe('{"тема":"тёмная"}');
  }, 20_000);

  it('чужая фраза не подходит', async () => {
    const sealed = await lock(enc('секрет'), 'лампа ворона северный компот');
    await expect(unlock(sealed, 'лампа ворона южный компот')).rejects.toBeInstanceOf(VaultError);
  }, 20_000);

  it('в закрытых данных нет ни открытого текста, ни меток способа', async () => {
    const sealed = await lock(enc('Фамилия Имя Отчество'), 'лампа ворона северный компот');
    const text = new TextDecoder('latin1').decode(sealed);
    expect(text).not.toMatch(/AES|GCM|PBKDF|SHA|DocAssist|Фамилия/i);
    // Одинаковые данные дают разные байты (новая соль и одноразовый номер).
    const again = await lock(enc('Фамилия Имя Отчество'), 'лампа ворона северный компот');
    expect(Buffer.from(again).equals(Buffer.from(sealed))).toBe(false);
  }, 20_000);

  it('запомненный ключ подходит к своим данным', async () => {
    const vk = await keyFromPhrase('лампа ворона северный компот');
    const sealed = await lockWithKey(enc('настройки'), vk);
    expect(sameSalt(sealed, vk)).toBe(true);
    expect(dec(await unlockWithKey(sealed, vk))).toBe('настройки');
  }, 20_000);

  it('испорченный файл — понятная ошибка', () => {
    expect(() => saltOf(new Uint8Array(10))).toThrow(VaultError);
  });
});

describe('фраза', () => {
  it('оценивает надёжность', () => {
    expect(checkPhrase('qwerty').ok).toBe(false);
    expect(checkPhrase('кот пес мышь').ok).toBe(false);
    expect(checkPhrase('лампа ворона северный компот').ok).toBe(true);
    expect(checkPhrase('лампа ворона северный компот гитара').level).toBe(3);
  });
  it('придумывает фразу из случайных слов', () => {
    const p = generatePhrase();
    expect(p.split(' ')).toHaveLength(6);
    expect(checkPhrase(p).ok).toBe(true);
    expect(PHRASE_WORDS_COUNT).toBe(256);
  });
});
