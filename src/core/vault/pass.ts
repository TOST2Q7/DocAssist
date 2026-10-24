import { concatBytes, fromBase64, fromUtf8, toBase64, utf8 } from '../util/bytes';
import { DEVELOPER_LOCK } from './devkey';
import { ownerOpen, ownerSeal, type OwnerKeys } from './owner';
import { NONCE_SIZE, ROUNDS_COUNT, SALT_SIZE, subtle, VaultError } from './vault';

/*
 * Ключ данных и пропуска к нему (грамотей).
 *
 * - Ключ данных — свой у каждой грамотки: им закрыты оглавление и каждый файл. Каждый кусок «пришит» к своему
 *   месту (aad): переставить куски или подсунуть кусок из другой грамотки нельзя — он не откроется.
 * - Пропуск — ключ данных и сведения о пропуске, закрытые: ключом владельца (свой), временным ключом из 6 цифр
 *   (перевод) или замком разработчика (запечатанная копия). Сведения внутри пропуска подменить нельзя:
 *   изменённый пропуск не откроется.
 * - Журнал — записи, закрытые замком разработчика. Прочитать их может только он.
 */

export interface DataKey {
  /** Нужен, чтобы выдать пропуск; наружу не уходит. */
  readonly raw: Uint8Array;
  readonly key: CryptoKey;
}

async function importDataKey(raw: Uint8Array): Promise<DataKey> {
  const key = await subtle().importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { raw, key };
}

export function newDataKey(): Promise<DataKey> {
  return importDataKey(crypto.getRandomValues(new Uint8Array(32)));
}

/** Закрыть кусок ключом данных: [одноразовый номер][данные]. aad — место куска (номер грамотки и куска). */
export async function sealData(dk: DataKey, data: Uint8Array, aad: string): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(aad) as BufferSource }, dk.key, data as BufferSource));
  return concatBytes([nonce, sealed]);
}

export async function openData(dk: DataKey, sealed: Uint8Array, aad: string): Promise<Uint8Array> {
  if (sealed.length < NONCE_SIZE + 16) throw new VaultError('damaged', 'Часть грамотки повреждена.');
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: sealed.slice(0, NONCE_SIZE), additionalData: utf8(aad) as BufferSource }, dk.key, sealed.slice(NONCE_SIZE) as BufferSource));
  } catch {
    throw new VaultError('damaged', 'Часть грамотки повреждена или не от этой грамотки.');
  }
}

// ---------- Пропуска ----------

interface PassBody<M> {
  k: string;
  m: M;
}

const passBody = <M>(dk: DataKey, meta: M) => utf8(JSON.stringify({ k: toBase64(dk.raw), m: meta } satisfies PassBody<M>));

async function readPassBody<M>(plain: Uint8Array): Promise<{ dk: DataKey; meta: M }> {
  let body: PassBody<M>;
  try {
    body = JSON.parse(fromUtf8(plain)) as PassBody<M>;
  } catch {
    throw new VaultError('damaged', 'Пропуск грамотки повреждён.');
  }
  if (typeof body?.k !== 'string') throw new VaultError('damaged', 'Пропуск грамотки повреждён.');
  return { dk: await importDataKey(fromBase64(body.k)), meta: body.m };
}

/** Пропуск владельца. aad — номер грамотки: пропуск от одной грамотки к другой не подойдёт. */
export async function passForOwner<M>(keys: OwnerKeys, dk: DataKey, meta: M, aad: string): Promise<Uint8Array> {
  return ownerSeal(keys, passBody(dk, meta), aad);
}

export async function openOwnerPass<M>(keys: OwnerKeys, sealed: Uint8Array, aad: string): Promise<{ dk: DataKey; meta: M }> {
  return readPassBody<M>(await ownerOpen(keys, sealed, aad));
}

/** Временный ключ перевода: 6 цифр. */
export function newTransferCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

/** Временный ключ без пробелов и тире: «123 456» → «123456». */
export const normalizeCode = (code: string) => code.replace(/\D/g, '');

async function codeKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const s = subtle();
  const base = await s.importKey('raw', utf8(normalizeCode(code)) as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return s.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ROUNDS_COUNT }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Пропуск по временному ключу: [соль][одноразовый номер][данные]. */
export async function passWithCode<M>(code: string, dk: DataKey, meta: M, aad: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(aad) as BufferSource }, await codeKey(code, salt), passBody(dk, meta) as BufferSource));
  return concatBytes([salt, nonce, sealed]);
}

export async function openCodePass<M>(code: string, sealed: Uint8Array, aad: string): Promise<{ dk: DataKey; meta: M }> {
  if (sealed.length < SALT_SIZE + NONCE_SIZE + 16) throw new VaultError('damaged', 'Пропуск грамотки повреждён.');
  let plain: Uint8Array;
  try {
    const key = await codeKey(code, sealed.slice(0, SALT_SIZE));
    plain = new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv: sealed.slice(SALT_SIZE, SALT_SIZE + NONCE_SIZE), additionalData: utf8(aad) as BufferSource },
        key,
        sealed.slice(SALT_SIZE + NONCE_SIZE) as BufferSource,
      ),
    );
  } catch {
    throw new VaultError('wrong-phrase', 'Временный ключ не подходит.');
  }
  return readPassBody<M>(plain);
}

// ---------- Замок разработчика ----------

const POINT = 65;
const INFO = utf8('docassist/developer');

async function importLock(lock: string): Promise<CryptoKey> {
  try {
    return await subtle().importKey('raw', fromBase64(lock) as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  } catch {
    throw new VaultError('unsupported', 'Замок разработчика в приложении испорчен.');
  }
}

async function sharedKey(priv: CryptoKey, pub: CryptoKey, epk: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const s = subtle();
  const bits = await s.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const base = await s.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return s.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: epk as BufferSource, info: INFO as BufferSource }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

/** Закрыть замком разработчика: [одноразовая открытая половина][одноразовый номер][данные]. */
export async function sealForDeveloper(data: Uint8Array, aad = '', lock = DEVELOPER_LOCK): Promise<Uint8Array> {
  const s = subtle();
  const pub = await importLock(lock);
  const eph = await s.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const epk = new Uint8Array(await s.exportKey('raw', eph.publicKey));
  const key = await sharedKey(eph.privateKey, pub, epk, 'encrypt');
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const sealed = new Uint8Array(await s.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(aad) as BufferSource }, key, data as BufferSource));
  return concatBytes([epk, nonce, sealed]);
}

/** Открыть закрытое замком разработчика (нужна закрытая половина — JWK). Для проверок и инструментов разработчика. */
export async function openForDeveloper(sealed: Uint8Array, privateJwk: JsonWebKey, aad = ''): Promise<Uint8Array> {
  const s = subtle();
  const epk = sealed.slice(0, POINT);
  const priv = await s.importKey('jwk', privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const pub = await s.importKey('raw', epk as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const key = await sharedKey(priv, pub, epk, 'decrypt');
  try {
    return new Uint8Array(
      await s.decrypt({ name: 'AES-GCM', iv: sealed.slice(POINT, POINT + NONCE_SIZE), additionalData: utf8(aad) as BufferSource }, key, sealed.slice(POINT + NONCE_SIZE) as BufferSource),
    );
  } catch {
    throw new VaultError('wrong-phrase', 'Этот ключ разработчика не подходит.');
  }
}

/** Новая пара разработчика: замок (в приложение) и ключ (только у разработчика). */
export async function newDeveloperPair(): Promise<{ lock: string; key: JsonWebKey }> {
  const s = subtle();
  const pair = await s.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { lock: toBase64(new Uint8Array(await s.exportKey('raw', pair.publicKey))), key: await s.exportKey('jwk', pair.privateKey) };
}

/** Пропуск, запечатанный для разработчика. */
export function passForDeveloper<M>(dk: DataKey, meta: M, aad: string, lock = DEVELOPER_LOCK): Promise<Uint8Array> {
  return sealForDeveloper(passBody(dk, meta), aad, lock);
}

export async function openDeveloperPass<M>(sealed: Uint8Array, privateJwk: JsonWebKey, aad: string): Promise<{ dk: DataKey; meta: M }> {
  return readPassBody<M>(await openForDeveloper(sealed, privateJwk, aad));
}

// ---------- Отпечаток для цепочки журнала ----------

/** Короткий отпечаток байтов: по нему видно, что кусок не подменили. */
export async function digest(data: Uint8Array): Promise<string> {
  const h = new Uint8Array(await subtle().digest('SHA-256', data as BufferSource));
  return toBase64(h.slice(0, 18));
}
