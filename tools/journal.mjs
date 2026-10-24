#!/usr/bin/env node
// Журнал грамоток — инструмент разработчика (запускается из `da` → «Журнал грамоток»).
//
//   node tools/journal.mjs keys            создать пару ключей: замок → в код приложения, ключ → только у вас
//   node tools/journal.mjs read <файл>     прочитать журнал грамотки (.gramotka или папка «Грамотка XXXX»)
//   node tools/journal.mjs unseal <файл> [папка]   распечатать запечатанную копию (после перевода) в папку
//
// Ключ хранится в ~/.docassist/journal-key.json (или в файле из DOCASSIST_JOURNAL_KEY). В репозиторий он не попадает.
// Формат файлов — как в приложении: src/core/gramotka/format.ts, src/core/vault/pass.ts.

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const subtle = globalThis.crypto?.subtle;
if (!subtle) {
  console.error('Нужен Node.js 19 или новее (в нём есть шифрование). Обновите: brew upgrade node');
  process.exit(1);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEVKEY = join(ROOT, 'src/core/vault/devkey.ts');
const KEY_FILE = process.env.DOCASSIST_JOURNAL_KEY || join(homedir(), '.docassist', 'journal-key.json');
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (b) => Buffer.from(b).toString('base64');
const hex = (b) => Buffer.from(b).toString('hex');

// ---------- Ключи ----------

function loadKeys() {
  if (!existsSync(KEY_FILE)) return [];
  const v = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
  return Array.isArray(v.keys) ? v.keys : [];
}

async function cmdKeys() {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const lock = b64(new Uint8Array(await subtle.exportKey('raw', pair.publicKey)));
  const key = await subtle.exportKey('jwk', pair.privateKey);
  const keys = loadKeys();
  // Старые ключи остаются в файле: ими закрыты журналы, записанные раньше.
  keys.push({ lock, key, createdAt: new Date().toISOString() });
  mkdirSync(dirname(KEY_FILE), { recursive: true });
  writeFileSync(KEY_FILE, JSON.stringify({ keys }, null, 2), { mode: 0o600 });
  chmodSync(KEY_FILE, 0o600);
  let src = readFileSync(DEVKEY, 'utf8');
  src = src.replace(/export const DEVELOPER_LOCK = '[^']*';/, `export const DEVELOPER_LOCK = '${lock}';`);
  src = src.replace(/export const DEVELOPER_LOCK_IS_PLACEHOLDER = (true|false);/, 'export const DEVELOPER_LOCK_IS_PLACEHOLDER = false;');
  writeFileSync(DEVKEY, src);
  console.log(`✓ Ключ сохранён: ${KEY_FILE} (виден только вам).`);
  console.log(`✓ Замок вписан в ${DEVKEY.slice(ROOT.length + 1)} — сохраните и отправьте изменения, потом выпустите версию.`);
  console.log('! Сделайте резервную копию файла ключа (например, на флешку): без него журналы и запечатанные копии не прочитать.');
  if (keys.length > 1) console.log(`  В файле ключей: ${keys.length} — старые оставлены для журналов, записанных раньше.`);
}

// ---------- Формат ----------

function reader(b) {
  let at = 0;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const take = (n) => {
    if (n < 0 || at + n > b.length) throw new Error('Это не грамотка или файл повреждён.');
    const out = b.subarray(at, at + n);
    at += n;
    return out;
  };
  const u32 = () => {
    if (at + 4 > b.length) throw new Error('Это не грамотка или файл повреждён.');
    const v = dv.getUint32(at, true);
    at += 4;
    return v;
  };
  return { take, u32, chunk: () => take(u32()), done: () => at >= b.length };
}

function readHead(bytes) {
  const r = reader(bytes);
  const id = r.take(16);
  const pass = r.chunk();
  const label = r.chunk();
  const index = r.chunk();
  const count = r.u32();
  const journal = [];
  for (let i = 0; i < count; i++) journal.push(r.chunk());
  return { id: hex(id), pass, label, index, journal };
}

/** Файл .gramotka или папка грамотки («0» — голова, остальное — куски). */
function readGramotka(path) {
  if (statSync(path).isDirectory()) {
    const head = readHead(new Uint8Array(readFileSync(join(path, '0'))));
    const pieces = new Map();
    for (const name of readdirSync(path)) if (/^[0-9a-f]{32}$/.test(name)) pieces.set(name, new Uint8Array(readFileSync(join(path, name))));
    return { head, pieces };
  }
  const r = reader(new Uint8Array(readFileSync(path)));
  const head = readHead(r.chunk());
  const count = r.u32();
  const pieces = new Map();
  for (let i = 0; i < count; i++) {
    const id = hex(r.take(16));
    pieces.set(id, r.chunk());
  }
  return { head, pieces };
}

// ---------- Шифрование (как в приложении) ----------

async function openForDeveloper(sealed, jwk, aad) {
  const epk = sealed.subarray(0, 65);
  const priv = await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const pub = await subtle.importKey('raw', epk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const base = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: epk, info: enc.encode('docassist/developer') }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: sealed.subarray(65, 77), additionalData: enc.encode(aad) }, key, sealed.subarray(77)));
}

async function openWithAnyKey(sealed, aad) {
  const keys = loadKeys();
  if (!keys.length) throw new Error(`Нет ключа разработчика (${KEY_FILE}). Создайте пару: da → «Журнал грамоток» → «Создать пару ключей».`);
  for (const k of keys) {
    try {
      return await openForDeveloper(sealed, k.key, aad);
    } catch {
      /* другой ключ */
    }
  }
  throw new Error('Ни один ваш ключ не подходит: грамотка записана с другим замком (или с заготовкой, к которой ключа нет ни у кого).');
}

async function digest(b) {
  return b64(new Uint8Array(await subtle.digest('SHA-256', b)).subarray(0, 18));
}

async function openData(rawKey, sealed, aad) {
  const key = await subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: sealed.subarray(0, 12), additionalData: enc.encode(aad) }, key, sealed.subarray(12)));
}

// ---------- Журнал ----------

const EVENTS = { created: 'создана', transfer: 'передана (выдан временный ключ)', accepted: 'принята' };
const when = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

async function cmdRead(path) {
  const { head } = readGramotka(path);
  if (!loadKeys().length) throw new Error(`Нет ключа разработчика (${KEY_FILE}). Создайте пару: da → «Журнал грамоток» → «Создать пару ключей».`);
  console.log(`Грамотка ${head.id}`);
  if (!head.journal.length) {
    console.log('Журнал пуст.');
    return;
  }
  let prev = '';
  let broken = 0;
  let unreadable = 0;
  for (const [i, sealed] of head.journal.entries()) {
    let e;
    try {
      e = JSON.parse(dec.decode(await openWithAnyKey(sealed, head.id)));
    } catch {
      console.log(`${String(i + 1).padStart(3)}. не открывается вашими ключами (записана с другим замком)`);
      unreadable++;
      prev = await digest(sealed);
      continue;
    }
    const chain = e.prev === prev ? '' : '  ⚠ цепочка разорвана: перед этой записью что-то вырезали или подменили';
    if (chain) broken++;
    const until = e.until ? `, ключ действует до ${when(e.until)}` : '';
    console.log(`${String(e.n ?? i + 1).padStart(3)}. ${when(e.at)} — ${EVENTS[e.event] ?? e.event}: ${e.by?.name ?? '?'} (${e.by?.id ?? '?'}), устройство «${e.device ?? '?'}», поколение ${e.gen}${until}${chain}`);
    prev = await digest(sealed);
  }
  // Запечатанная копия: в пропуске записано, сколько записей было и какая последняя.
  if (head.label.length) {
    try {
      const body = JSON.parse(dec.decode(await openWithAnyKey(head.pass, head.id)));
      const j = body.m?.journal;
      if (j && (j.count !== head.journal.length || j.last !== prev)) {
        console.log('  ⚠ журнал не сходится с пропуском: записи стёрли или подменили');
        broken++;
      }
    } catch {
      /* пропуск не наш */
    }
  }
  if (unreadable) console.log(`Не открылось записей: ${unreadable} — их записала версия приложения с другим замком (например, с заготовкой).`);
  console.log(broken ? `Найдено нарушений: ${broken}.` : unreadable === head.journal.length ? 'Проверить цепочку нечем.' : 'Цепочка записей в порядке.');
}

// ---------- Распечатать запечатанную копию ----------

async function cmdUnseal(path, out) {
  const { head, pieces } = readGramotka(path);
  if (!head.label.length) throw new Error('Это не запечатанная копия: её пропуск закрыт фразой мастера, а не вашим замком.');
  const body = JSON.parse(dec.decode(await openWithAnyKey(head.pass, head.id)));
  const raw = Buffer.from(body.k, 'base64');
  const index = JSON.parse(dec.decode(await openData(raw, head.index, `${head.id}/index`)));
  const dir = resolve(out || `Грамотка ${head.id.slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'данные.json'), JSON.stringify({ номер: head.id, пропуск: body.m, человек: index.person, разделы: index.sections, правки: index.edits }, null, 2));
  let n = 0;
  for (const [rel, f] of Object.entries(index.files)) {
    const sealed = pieces.get(f.piece);
    if (!sealed) {
      console.log(`! нет части файла «${rel}»`);
      continue;
    }
    if (rel.split('/').includes('..')) continue;
    const to = join(dir, 'файлы', rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, await openData(raw, sealed, `${head.id}/${f.piece}`));
    n++;
  }
  console.log(`✓ Распечатано в «${dir}»: данные.json и файлов — ${n}.`);
}

// ---------- Запуск ----------

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === 'keys') await cmdKeys();
  else if (cmd === 'read' && a) await cmdRead(a);
  else if (cmd === 'unseal' && a) await cmdUnseal(a, b);
  else {
    console.log('Использование: node tools/journal.mjs keys | read <файл.gramotka|папка> | unseal <файл|папка> [куда]');
    process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
