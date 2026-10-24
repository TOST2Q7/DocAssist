import { kvDelete, kvGet, kvSet } from '../storage/idb';
import { concatBytes, fromUtf8, sameBytes, utf8 } from '../util/bytes';
import { NONCE_SIZE, normalizePhrase, ROUNDS_COUNT, SALT_SIZE, subtle, VaultError } from './vault';

/*
 * Ключ владельца грамоток. Фраза → медленный расчёт (один раз за запуск) → ключ, которым закрыты все пропуска
 * владельца. Соль у владельца одна на все его грамотки, поэтому сколько бы ни было людей, медленный расчёт — один.
 * Соль не секрет: она лежит в начале каждого закрытого владельцем куска и по ней видно, чей он.
 *
 * Файл ключа — фраза в файле (чтобы не набирать её): на вид случайные байты. Это не защита, а сама фраза:
 * у кого файл — у того и фраза.
 */

export interface OwnerKeys {
  /** Ключ пропусков (нельзя извлечь — только применить). */
  readonly wrap: CryptoKey;
  readonly salt: Uint8Array;
}

/** Ключ владельца из фразы (и его соли; без соли — новая, для нового владельца). */
export async function ownerKeys(phrase: string, salt: Uint8Array = crypto.getRandomValues(new Uint8Array(SALT_SIZE))): Promise<OwnerKeys> {
  const s = subtle();
  const base = await s.importKey('raw', utf8(normalizePhrase(phrase)) as BufferSource, 'PBKDF2', false, ['deriveKey']);
  const wrap = await s.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ROUNDS_COUNT }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { wrap, salt: new Uint8Array(salt) };
}

const aadOf = (aad?: string) => (aad ? { additionalData: utf8(aad) as BufferSource } : {});

/** Закрыть ключом владельца: [соль][одноразовый номер][данные]. */
export async function ownerSeal(keys: OwnerKeys, data: Uint8Array, aad?: string): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce, ...aadOf(aad) }, keys.wrap, data as BufferSource));
  return concatBytes([keys.salt, nonce, sealed]);
}

/** Соль закрытого владельцем куска — по ней находится ключ. */
export function ownerSaltOf(sealed: Uint8Array): Uint8Array {
  if (sealed.length < SALT_SIZE + NONCE_SIZE + 16) throw new VaultError('damaged', 'Файл повреждён или это не файл DocAssist.');
  return sealed.slice(0, SALT_SIZE);
}

/** Этот кусок закрыт этим владельцем (соль та же)? */
export function isOwners(sealed: Uint8Array, keys: OwnerKeys): boolean {
  return sealed.length >= SALT_SIZE + NONCE_SIZE + 16 && sameBytes(sealed.subarray(0, SALT_SIZE), keys.salt);
}

/** Открыть ключом владельца. Другой ключ или испорченные данные — VaultError. */
export async function ownerOpen(keys: OwnerKeys, sealed: Uint8Array, aad?: string): Promise<Uint8Array> {
  ownerSaltOf(sealed);
  if (!isOwners(sealed, keys)) throw new VaultError('wrong-phrase', 'Закрыто другой фразой.');
  try {
    const iv = sealed.slice(SALT_SIZE, SALT_SIZE + NONCE_SIZE);
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, ...aadOf(aad) }, keys.wrap, sealed.slice(SALT_SIZE + NONCE_SIZE) as BufferSource));
  } catch {
    throw new VaultError('wrong-phrase', 'Фраза не подходит (или файл повреждён).');
  }
}

// ---------- Файл ключа ----------

let appKey: Promise<CryptoKey> | null = null;
/** Ключ, одинаковый во всех DocAssist: файл ключа выглядит случайными байтами, но секретом это не делает. */
function keyFileKey(): Promise<CryptoKey> {
  appKey ??= subtle()
    .digest('SHA-256', utf8('DocAssist: файл ключа грамоток') as BufferSource)
    .then((raw) => subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  return appKey;
}

export async function makeKeyFile(phrase: string): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
  const body = utf8(JSON.stringify({ t: 'docassist-key', p: normalizePhrase(phrase) }));
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, await keyFileKey(), body as BufferSource));
  return concatBytes([nonce, sealed]);
}

/** Фраза из файла ключа (null — это не файл ключа). */
export async function readKeyFile(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length < NONCE_SIZE + 17 || bytes.length > 4096) return null;
  try {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(0, NONCE_SIZE) }, await keyFileKey(), bytes.slice(NONCE_SIZE) as BufferSource);
    const v = JSON.parse(fromUtf8(new Uint8Array(plain))) as { t?: string; p?: string };
    return v.t === 'docassist-key' && typeof v.p === 'string' ? v.p : null;
  } catch {
    return null;
  }
}

// ---------- Запомнить на этом устройстве ----------

const rememberSlot = (workspaceId: string) => `gramotki.key.${workspaceId}`;

export async function rememberOwnerKeys(workspaceId: string, keys: OwnerKeys): Promise<void> {
  await kvSet(rememberSlot(workspaceId), { wrap: keys.wrap, salt: keys.salt });
}

export async function rememberedOwnerKeys(workspaceId: string): Promise<OwnerKeys | null> {
  try {
    const v = await kvGet<{ wrap: CryptoKey; salt: Uint8Array }>(rememberSlot(workspaceId));
    return v?.wrap && v.salt ? { wrap: v.wrap, salt: new Uint8Array(v.salt) } : null;
  } catch {
    return null;
  }
}

export async function forgetOwnerKeys(workspaceId: string): Promise<void> {
  await kvDelete(rememberSlot(workspaceId)).catch(() => undefined);
}
