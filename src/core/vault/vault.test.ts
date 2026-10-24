import { describe, expect, it } from 'vitest';
import { checkPassword, checkPhrase, generatePhrase, keyFromPassword, lock, lockWithKey, PHRASE_WORDS_COUNT, sameSalt, saltOf, unlock, unlockWithKey, VaultError } from './vault';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe('сейф', () => {
  it('закрывает и открывает паролем; пробелы по краям не важны, регистр важен', async () => {
    const sealed = await lock(enc('{"тема":"тёмная"}'), ' Пароль1234');
    const { data } = await unlock(sealed, 'Пароль1234 ');
    expect(dec(data)).toBe('{"тема":"тёмная"}');
    await expect(unlock(sealed, 'пароль1234')).rejects.toBeInstanceOf(VaultError);
  }, 20_000);

  it('чужой пароль не подходит', async () => {
    const sealed = await lock(enc('секрет'), '1234');
    await expect(unlock(sealed, '1235')).rejects.toBeInstanceOf(VaultError);
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
    const vk = await keyFromPassword('1234');
    const sealed = await lockWithKey(enc('настройки'), vk);
    expect(sameSalt(sealed, vk)).toBe(true);
    expect(dec(await unlockWithKey(sealed, vk))).toBe('настройки');
  }, 20_000);

  it('испорченный файл — понятная ошибка', () => {
    expect(() => saltOf(new Uint8Array(10))).toThrow(VaultError);
  });
});

describe('пароль', () => {
  it('не короче 4 знаков; короткий — со словами «легко подобрать»', () => {
    expect(checkPassword('123').ok).toBe(false);
    expect(checkPassword('1234')).toMatchObject({ ok: true, level: 1 });
    expect(checkPassword('1234567').level).toBe(2);
    expect(checkPassword('Длинный пароль 2026').level).toBe(3);
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
