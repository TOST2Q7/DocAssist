import { kvDelete, kvGet, kvSet } from '../storage/idb';

/*
 * Сейф: закрыть и открыть данные. Отдельный блок — остальные части приложения знают только его функции
 * и ничего не знают о том, как это устроено внутри.
 *
 * - Ключ получается из пароля или фразы на устройстве; они никуда не отправляются и нигде не хранятся.
 * - Без пароля (фразы) открыть нельзя никак: ни через Google-аккаунт, ни через разработчика.
 * - Закрытые данные — только случайные на вид байты: ни подписей, ни названий способа, ни параметров.
 * - «Запомнить на этом устройстве»: в браузере сохраняется ключ, который нельзя извлечь (только применить), —
 *   пароль не нужно вводить каждый раз. Не включать на чужом компьютере.
 *
 * Здесь — пароль личных настроек на Google Диске. Фраза грамоток — owner.ts, пропуска и журнал — pass.ts.
 */

const SALT = 16;
const NONCE = 12;
const ROUNDS = 600_000;
const REMEMBER_KEY = 'vault.key';

export class VaultError extends Error {
  constructor(readonly kind: 'wrong-phrase' | 'damaged' | 'unsupported' | 'too-many' | 'expired', message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

export function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new VaultError('unsupported', 'Этот браузер не умеет шифровать (нужно защищённое соединение https).');
  return s;
}

/** Фраза без мелочей, которые легко перепутать: регистр, «ё», лишние пробелы. */
export function normalizePhrase(phrase: string): string {
  return phrase.normalize('NFKC').toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
}

/** Пароль: только лишние пробелы по краям (регистр важен). */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC').trim();
}

export const ROUNDS_COUNT = ROUNDS;
export const SALT_SIZE = SALT;
export const NONCE_SIZE = NONCE;

export interface VaultKey {
  key: CryptoKey;
  salt: Uint8Array;
}

/** Ключ из пароля (для этой соли). Ключ нельзя извлечь из браузера — только применить. */
export async function keyFromPassword(password: string, salt: Uint8Array = crypto.getRandomValues(new Uint8Array(SALT))): Promise<VaultKey> {
  const s = subtle();
  const base = await s.importKey('raw', new TextEncoder().encode(normalizePassword(password)), 'PBKDF2', false, ['deriveKey']);
  const key = await s.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ROUNDS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { key, salt };
}

/** Закрыть данные ключом. */
export async function lockWithKey(data: Uint8Array, vk: VaultKey): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE));
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, vk.key, data as BufferSource));
  const out = new Uint8Array(SALT + NONCE + sealed.length);
  out.set(vk.salt, 0);
  out.set(nonce, SALT);
  out.set(sealed, SALT + NONCE);
  return out;
}

/** Закрыть данные паролем. */
export async function lock(data: Uint8Array, password: string): Promise<Uint8Array> {
  return lockWithKey(data, await keyFromPassword(password));
}

/** Соль закрытых данных: нужна, чтобы получить ключ из фразы. */
export function saltOf(sealed: Uint8Array): Uint8Array {
  if (sealed.length < SALT + NONCE + 16) throw new VaultError('damaged', 'Файл повреждён или это не файл DocAssist.');
  return sealed.slice(0, SALT);
}

/** Открыть ключом. Неверный ключ или испорченные данные — VaultError. */
export async function unlockWithKey(sealed: Uint8Array, vk: VaultKey): Promise<Uint8Array> {
  saltOf(sealed);
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: sealed.slice(SALT, SALT + NONCE) as BufferSource }, vk.key, sealed.slice(SALT + NONCE) as BufferSource));
  } catch {
    throw new VaultError('wrong-phrase', 'Пароль не подходит (или файл повреждён).');
  }
}

/** Открыть паролем. */
export async function unlock(sealed: Uint8Array, password: string): Promise<{ data: Uint8Array; key: VaultKey }> {
  const key = await keyFromPassword(password, saltOf(sealed));
  return { data: await unlockWithKey(sealed, key), key };
}

/** Тот же ли ключ подходит к этим данным (соль совпадает). */
export function sameSalt(sealed: Uint8Array, vk: VaultKey): boolean {
  const s = saltOf(sealed);
  return s.length === vk.salt.length && s.every((b, i) => b === vk.salt[i]);
}

// ---------- Запомнить на этом устройстве ----------

export async function rememberKey(vk: VaultKey): Promise<void> {
  await kvSet(REMEMBER_KEY, { key: vk.key, salt: vk.salt });
}

export async function rememberedKey(): Promise<VaultKey | null> {
  try {
    const v = await kvGet<{ key: CryptoKey; salt: Uint8Array }>(REMEMBER_KEY);
    return v?.key && v.salt ? { key: v.key, salt: new Uint8Array(v.salt) } : null;
  } catch {
    return null;
  }
}

export async function forgetKey(): Promise<void> {
  await kvDelete(REMEMBER_KEY).catch(() => undefined);
}

// ---------- Пароль и фраза ----------

export interface PhraseCheck {
  ok: boolean;
  /** 0 — не подходит, 1 — слабый, 3 — надёжный. */
  level: 0 | 1 | 2 | 3;
  hint: string;
}

/** Пароль личных настроек: не короче 4 знаков. Короткий пароль подбирается быстро — так и говорим. */
export function checkPassword(password: string): PhraseCheck {
  const p = normalizePassword(password);
  const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(p)).length;
  if (p.length < 4) return { ok: false, level: 0, hint: 'Нужно хотя бы 4 знака (например, 4 цифры).' };
  if (p.length >= 12 || (p.length >= 9 && kinds >= 2)) return { ok: true, level: 3, hint: 'Надёжный пароль.' };
  if (p.length >= 7 || (p.length >= 6 && kinds >= 2)) return { ok: true, level: 2, hint: 'Хороший пароль. Длиннее — надёжнее.' };
  return { ok: true, level: 1, hint: 'Подойдёт, но такой пароль легко подобрать, если файл попадёт в чужие руки. Длиннее — надёжнее.' };
}

/** Фраза грамоток: несколько не связанных между собой слов (короткие пароли подбираются, длинные фразы — нет). */
export function checkPhrase(phrase: string): PhraseCheck {
  const p = normalizePhrase(phrase);
  const words = p.split(' ').filter((w) => w.length >= 3).length;
  const kinds = [/[a-zа-я]/, /\d/, /[^a-zа-я\d ]/].filter((r) => r.test(p)).length;
  if (p.length < 12) return { ok: false, level: 0, hint: 'Слишком коротко: нужно хотя бы 12 знаков, а лучше 4–5 случайных слов.' };
  if (words >= 5 && p.length >= 24) return { ok: true, level: 3, hint: 'Надёжная фраза.' };
  if ((words >= 4 && p.length >= 18) || (p.length >= 20 && kinds >= 2)) return { ok: true, level: 2, hint: 'Хорошая фраза. Ещё одно слово сделает её надёжнее.' };
  return { ok: false, level: 1, hint: 'Слабовато: возьмите 4–5 не связанных между собой слов.' };
}

const WORDS =
  'абрикос автобус акула альбом арбуз астра базар балкон банан барсук башня бегун береза бинокль блюдце бобер ботинок бочка браслет бублик букет буря ваза вагон валенок варенье веер ведро веник веревка ветер вилка виноград витрина вишня волна ворона вулкан гамак гитара глобус гнездо голубь гора горох гриб груша гусь дождь домик дракон дрозд дубрава дятел ежик ель желудь жираф жук забор заря звезда зебра зеркало зонт ива игла индюк иней кабан какао калач камин каток кедр кисель кит клевер ключ ковер колесо компот комета корабль кофе краб кран кролик ксилофон кубик лампа ласточка лебедь лимон лиса лодка луна льдина малина маяк медведь мельница метла миска мост мухомор облако овраг озеро окно олень орех оса павлин палатка панда парус пенал перо песок пингвин пирог плед поезд полка пончик помидор радуга ракета река ромашка рыбак самовар сани сапог сверчок свеча сирень скамейка слива снегирь сова сокол соль сосна спичка стакан стол сугроб сыр тапок тигр тополь трамвай тропа тюльпан улей утка фазан фонарь футбол хлеб хомяк цапля чайник черника чижик шарф шишка щука эхо юла яблоко ягода якорь ящерица август айсберг алмаз аллея ангар антенна аптека атлас бабочка багаж бант барабан батон бегемот бисер блин бокал бор брусника бусы валун ватрушка веранда верблюд вертолет весло вьюга газета галстук гвоздь гиря гном гроза дельфин джем диван дыня елка жилет завод замок заяц зерно знамя изба икра искра кактус камыш капуста карта квас кегля кнопка ковш кокос колос корзина космос кошка крокус кружка лавина лаванда лейка лента лопата луг магнит мармелад мачта мед мишень молния морж мох мыло наперсток нарцисс носорог'.split(
    ' ',
  );

/** Придумать фразу из случайных слов: 256 слов, 6 штук — около 48 бит случайности (с медленным получением ключа это очень долго подбирать). */
export function generatePhrase(count = 6): string {
  const out: string[] = [];
  const rnd = new Uint32Array(count);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < count; i++) out.push(WORDS[rnd[i] % WORDS.length]);
  return out.join(' ');
}

export const PHRASE_WORDS_COUNT = WORDS.length;
