import { concatBytes, sameBytes } from '../util/bytes';

/*
 * Как грамотка лежит в байтах. Внутри — только закрытые куски и их длины: ни названий, ни открытого текста.
 *
 * Голова (файл «0» в папке грамотки) — маленькая, переписывается при каждом изменении данных:
 *   [номер грамотки: 16 байт] [пропуск] [ярлык] [оглавление] [записи журнала…]
 * Каждый файл человека — отдельный кусок (файл в той же папке), поэтому поправить поле — не значит переписать сканы.
 *
 * Для перевода и Google Диска всё складывается в один файл «.gramotka» без перешифровки:
 *   [голова] [куски: номер 16 байт + байты…]
 */

export const HEAD_FILE = '0';
export const ID_SIZE = 16;

export interface Head {
  /** Номер грамотки (16 байт). Постоянный: не меняется при переводе. */
  id: Uint8Array;
  pass: Uint8Array;
  /** Ярлык запечатанной копии (пусто — нет). */
  label: Uint8Array;
  index: Uint8Array;
  journal: Uint8Array[];
}

export class FormatError extends Error {
  constructor(message = 'Это не грамотка или файл повреждён.') {
    super(message);
    this.name = 'FormatError';
  }
}

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};

class Reader {
  private at = 0;
  constructor(private readonly b: Uint8Array) {}
  get done() {
    return this.at >= this.b.length;
  }
  get offset() {
    return this.at;
  }
  take(n: number): Uint8Array {
    if (n < 0 || this.at + n > this.b.length) throw new FormatError();
    const out = this.b.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }
  u32(): number {
    const v = new DataView(this.b.buffer, this.b.byteOffset + this.at, 4);
    if (this.at + 4 > this.b.length) throw new FormatError();
    this.at += 4;
    return v.getUint32(0, true);
  }
  chunk(): Uint8Array {
    return this.take(this.u32());
  }
}

const chunk = (b: Uint8Array) => [u32(b.length), b];

export function writeHead(h: Head): Uint8Array {
  if (h.id.length !== ID_SIZE) throw new FormatError('Неверный номер грамотки.');
  return concatBytes([h.id, ...chunk(h.pass), ...chunk(h.label), ...chunk(h.index), u32(h.journal.length), ...h.journal.flatMap(chunk)]);
}

export function readHead(bytes: Uint8Array): Head {
  const r = new Reader(bytes);
  const id = r.take(ID_SIZE).slice();
  const pass = r.chunk().slice();
  const label = r.chunk().slice();
  const index = r.chunk().slice();
  const count = r.u32();
  if (count > 100_000) throw new FormatError();
  const journal: Uint8Array[] = [];
  for (let i = 0; i < count; i++) journal.push(r.chunk().slice());
  if (!r.done) throw new FormatError();
  if (pass.length < 40 || index.length < 28) throw new FormatError();
  return { id, pass, label, index, journal };
}

export interface Bundle {
  head: Head;
  /** Номер куска (16 байт в шестнадцатеричном виде) → закрытые байты. */
  pieces: Map<string, Uint8Array>;
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export function unhex(s: string): Uint8Array {
  if (!/^[0-9a-f]{32}$/.test(s)) throw new FormatError('Неверный номер куска.');
  return Uint8Array.from(s.match(/../g)!.map((x) => parseInt(x, 16)));
}

/** Один файл: голова и все куски. */
export function writeBundle(b: Bundle): Uint8Array {
  const parts: Uint8Array[] = [...chunk(writeHead(b.head)), u32(b.pieces.size)];
  for (const [id, data] of b.pieces) parts.push(unhex(id), ...chunk(data));
  return concatBytes(parts);
}

export function readBundle(bytes: Uint8Array): Bundle {
  const r = new Reader(bytes);
  const head = readHead(r.chunk());
  const count = r.u32();
  if (count > 1_000_000) throw new FormatError();
  const pieces = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const id = hex(r.take(ID_SIZE));
    pieces.set(id, r.chunk().slice());
  }
  if (!r.done) throw new FormatError();
  return { head, pieces };
}

/** Похоже ли на файл грамотки (без ключа — только по устройству). */
export function looksLikeBundle(bytes: Uint8Array): boolean {
  try {
    readBundle(bytes);
    return true;
  } catch {
    return false;
  }
}

export function newId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(ID_SIZE));
}

export const sameId = (a: Uint8Array, b: Uint8Array) => sameBytes(a, b);

/** Короткий код для имён файлов: «7KQ2». Без похожих букв и цифр (0/O, 1/I). */
const CODE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function shortCode(id: string): string {
  const b = unhex(id);
  const n = (b[0] << 12) | (b[1] << 4) | (b[2] >> 4);
  let out = '';
  for (let i = 0; i < 4; i++) out += CODE[(n >> (5 * (3 - i))) & 31];
  return out;
}
