import { joinPath, parentPath, splitPath, type FsEntry } from '../storage/types';
import { fromUtf8, utf8 } from '../util/bytes';
import { ownerOpen, ownerSeal, type OwnerKeys } from '../vault/owner';
import { digest, newDataKey, openCodePass, openData, openOwnerPass, passForDeveloper, passForOwner, passWithCode, sealData, sealForDeveloper, type DataKey } from '../vault/pass';
import { VaultError } from '../vault/vault';
import { FormatError, hex, HEAD_FILE, newId, readHead, unhex, writeBundle, writeHead, type Bundle, type Head } from './format';
import type { EditStamp, GramotkaFile, GramotkaIndex, JournalEntry, JournalEvent, OwnerInfo, PassMeta, SealedLabel } from './types';

/*
 * Открытая грамотка: ключ данных в памяти, оглавление, журнал. Файлы человека читаются и пишутся по одному
 * (каждый — свой закрытый кусок), оглавление сохраняется с небольшой задержкой.
 * Все изменения одной грамотки идут по очереди, поэтому одновременные сохранения не мешают друг другу.
 */

/** Чтение и запись настоящих файлов (папка грамотки в рабочей папке). */
export interface GramotkaIO {
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  list(path: string): Promise<FsEntry[]>;
}

/** Кто работает: ключ владельца, кто он и на каком устройстве. */
export interface OwnerContext {
  keys: OwnerKeys;
  owner: OwnerInfo;
  device: () => string;
  /** Где ведётся эта копия (устройство и рабочая папка): правки считаются по каждой копии отдельно. */
  replica: string;
  /** Замок разработчика (в проверках — свой). */
  lock?: string;
}

const pieceAad = (id: string, piece: string) => `${id}/${piece}`;
const indexAad = (id: string) => `${id}/index`;
const labelAad = (id: string) => `${id}/label`;

// ---------- Память открытых файлов ----------

/** Недавно открытые файлы (уже расшифрованные): миниатюры не расшифровываются заново при каждом показе. */
const cache = new Map<string, Uint8Array>();
let cached = 0;
const CACHE_LIMIT = 64 * 1024 * 1024;

function remember(key: string, data: Uint8Array) {
  if (data.length > CACHE_LIMIT / 4) return;
  cache.delete(key);
  cache.set(key, data);
  cached += data.length;
  for (const [k, v] of cache) {
    if (cached <= CACHE_LIMIT) break;
    cache.delete(k);
    cached -= v.length;
  }
}

function recall(key: string): Uint8Array | undefined {
  const v = cache.get(key);
  if (v) {
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

/** Забыть всё расшифрованное (грамотки закрыты). */
export function clearCache() {
  cache.clear();
  cached = 0;
}

// ---------- Пути внутри папки человека ----------

const norm = (p: string) => splitPath(p).join('/');
const isUnder = (path: string, dir: string) => !dir || path === dir || path.startsWith(`${dir}/`);

function parents(path: string): string[] {
  const out: string[] = [];
  for (let p = parentPath(path); p; p = parentPath(p)) out.push(p);
  return out;
}

export function emptyIndex(owner: OwnerInfo, fields: Record<string, string>, source: string, now = new Date().toISOString()): GramotkaIndex {
  return { v: 1, person: { fields, savedAt: now, source }, sections: {}, files: {}, dirs: [], edits: {}, created: { at: now, by: owner.id } };
}

/** Что лежит в папке грамотки: открытая (своя), запечатанная после перевода, чужая или повреждённая. */
export type Opened = { kind: 'open'; g: Gramotka } | { kind: 'sealed'; id: string; label: SealedLabel } | { kind: 'foreign'; id: string } | { kind: 'damaged'; error: string };

export class Gramotka {
  private dirty = false;
  private passBytes: Uint8Array | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private obsolete: string[] = [];
  /** Журнал не сходится с пропуском — его стёрли или подменили. */
  journalBroken = false;
  /** После каждого сохранения оглавления (для подписчиков). */
  onChange?: () => void;

  private constructor(
    readonly id: string,
    public folder: string,
    private readonly io: GramotkaIO,
    private dk: DataKey,
    public pass: PassMeta,
    public index: GramotkaIndex,
    private journal: Uint8Array[],
    private ctx: OwnerContext,
  ) {}

  // ---------- Создать и открыть ----------

  static async create(io: GramotkaIO, folder: string, ctx: OwnerContext, fields: Record<string, string>, source: string, id = hex(newId())): Promise<Gramotka> {
    const now = new Date().toISOString();
    const pass: PassMeta = { v: 1, kind: 'own', gen: 1, owner: ctx.owner, at: now, journal: { count: 0, last: '' } };
    const g = new Gramotka(id, folder, io, await newDataKey(), pass, emptyIndex(ctx.owner, fields, source, now), [], ctx);
    await g.addJournal('created');
    g.dirty = true;
    await g.flush();
    return g;
  }

  /** Открыть папку грамотки ключом владельца. */
  static async open(io: GramotkaIO, folder: string, ctx: OwnerContext): Promise<Opened> {
    let head: Head;
    try {
      const bytes = await io.read(joinPath(folder, HEAD_FILE));
      if (!bytes) return { kind: 'damaged', error: `В папке «${folder}» нет грамотки.` };
      head = readHead(bytes);
    } catch (e) {
      return { kind: 'damaged', error: e instanceof FormatError ? `«${folder}»: ${e.message}` : String(e) };
    }
    const id = hex(head.id);
    try {
      if (head.label.length) {
        const label = JSON.parse(fromUtf8(await ownerOpen(ctx.keys, head.label, labelAad(id)))) as SealedLabel;
        return { kind: 'sealed', id, label };
      }
      const { dk, meta } = await openOwnerPass<PassMeta>(ctx.keys, head.pass, id);
      const index = JSON.parse(fromUtf8(await openData(dk, head.index, indexAad(id)))) as GramotkaIndex;
      const g = new Gramotka(id, folder, io, dk, meta, index, head.journal, ctx);
      g.passBytes = head.pass;
      g.journalBroken = !(await journalMatches(head.journal, meta));
      return { kind: 'open', g };
    } catch (e) {
      if (e instanceof VaultError && e.kind === 'wrong-phrase') return { kind: 'foreign', id };
      return { kind: 'damaged', error: `«${folder}»: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // ---------- Очередь изменений ----------

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private touch() {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 400);
    this.onChange?.();
  }

  get pending(): boolean {
    return this.dirty;
  }

  /** Сохранить оглавление (и пропуск, если менялся). */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.run(async () => {
      if (!this.dirty) return;
      this.dirty = false;
      const me = this.ctx.replica;
      this.index = { ...this.index, edits: { ...this.index.edits, [me]: (this.index.edits[me] ?? 0) + 1 }, last: this.stamp() };
      try {
        await this.writeHeadNow();
      } catch (e) {
        // Не записалось (диск, права) — изменения остаются в памяти и запишутся при следующем сохранении.
        this.dirty = true;
        throw e;
      }
      const drop = this.obsolete.splice(0);
      for (const p of drop) await this.io.remove(joinPath(this.folder, p)).catch(() => undefined);
    });
  }

  private stamp(): EditStamp {
    return { at: new Date().toISOString(), by: this.ctx.owner.id, byName: this.ctx.owner.name, device: this.ctx.device() };
  }

  private async writeHeadNow(label = new Uint8Array(0)): Promise<void> {
    this.passBytes ??= await passForOwner(this.ctx.keys, this.dk, this.pass, this.id);
    const index = await sealData(this.dk, utf8(JSON.stringify(this.index)), indexAad(this.id));
    await this.io.write(joinPath(this.folder, HEAD_FILE), writeHead({ id: unhex(this.id), pass: this.passBytes, label, index, journal: this.journal }));
  }

  private async addJournal(event: JournalEvent, extra: Partial<JournalEntry> = {}): Promise<void> {
    const entry: JournalEntry = {
      n: this.journal.length + 1,
      event,
      at: new Date().toISOString(),
      by: this.ctx.owner,
      device: this.ctx.device(),
      gen: this.pass.gen,
      prev: this.pass.journal.last,
      ...extra,
    };
    const sealed = await sealForDeveloper(utf8(JSON.stringify(entry)), this.id, this.ctx.lock);
    this.journal = [...this.journal, sealed];
    this.pass = { ...this.pass, journal: { count: this.journal.length, last: await digest(sealed) } };
    this.passBytes = null;
  }

  // ---------- Данные человека и разделы приложений ----------

  get fields(): Record<string, string> {
    return this.index.person.fields;
  }

  setPerson(fields: Record<string, string>, source: string): void {
    this.index = { ...this.index, person: { fields, savedAt: new Date().toISOString(), source } };
    this.touch();
  }

  section<T>(app: string): T | undefined {
    return this.index.sections[app] as T | undefined;
  }

  setSection(app: string, data: unknown): void {
    const sections = { ...this.index.sections };
    if (data === undefined) delete sections[app];
    else sections[app] = data;
    this.index = { ...this.index, sections };
    this.touch();
  }

  // ---------- Файлы (папка человека) ----------

  list(dir: string): FsEntry[] {
    const d = norm(dir);
    const out = new Map<string, FsEntry>();
    const prefix = d ? `${d}/` : '';
    for (const [path, f] of Object.entries(this.index.files)) {
      if (!path.startsWith(prefix)) continue;
      const [first, ...rest] = path.slice(prefix.length).split('/');
      const p = prefix + first;
      if (rest.length) out.set(p, { name: first, path: p, kind: 'directory' });
      else out.set(p, { name: first, path: p, kind: 'file', size: f.size, lastModified: f.modified });
    }
    for (const path of this.index.dirs) {
      if (!path.startsWith(prefix) || path === d) continue;
      const first = path.slice(prefix.length).split('/')[0];
      const p = prefix + first;
      if (!out.has(p)) out.set(p, { name: first, path: p, kind: 'directory' });
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  stat(path: string): GramotkaFile | null {
    return this.index.files[norm(path)] ?? null;
  }

  isDir(path: string): boolean {
    const p = norm(path);
    return !p || this.index.dirs.includes(p) || Object.keys(this.index.files).some((f) => f.startsWith(`${p}/`));
  }

  async readFile(path: string): Promise<Uint8Array | null> {
    const f = this.index.files[norm(path)];
    if (!f) return null;
    const key = `${this.id}/${this.pass.gen}/${f.piece}`;
    const hit = recall(key);
    if (hit) return hit;
    const sealed = await this.io.read(joinPath(this.folder, f.piece));
    if (!sealed) throw new VaultError('damaged', `Часть грамотки пропала: «${path}».`);
    const data = await openData(this.dk, sealed, pieceAad(this.id, f.piece));
    remember(key, data);
    return data;
  }

  writeFile(path: string, data: Uint8Array): Promise<void> {
    const p = norm(path);
    if (!p) return Promise.reject(new Error('Пустое имя файла.'));
    return this.run(async () => {
      const piece = hex(newId());
      await this.io.write(joinPath(this.folder, piece), await sealData(this.dk, data, pieceAad(this.id, piece)));
      const old = this.index.files[p];
      if (old) this.obsolete.push(old.piece);
      const dirs = new Set(this.index.dirs);
      for (const d of parents(p)) dirs.add(d);
      this.index = { ...this.index, files: { ...this.index.files, [p]: { piece, size: data.length, modified: Date.now() } }, dirs: [...dirs] };
      remember(`${this.id}/${this.pass.gen}/${piece}`, data);
      this.touch();
    });
  }

  mkdir(path: string): void {
    const p = norm(path);
    if (!p) return;
    const dirs = new Set(this.index.dirs);
    const before = dirs.size;
    for (const d of [p, ...parents(p)]) dirs.add(d);
    if (dirs.size === before) return;
    this.index = { ...this.index, dirs: [...dirs] };
    this.touch();
  }

  /** Удалить файл или папку со всем, что внутри. */
  remove(path: string): void {
    const p = norm(path);
    const files = { ...this.index.files };
    let changed = false;
    for (const [f, item] of Object.entries(files)) {
      if (!isUnder(f, p)) continue;
      this.obsolete.push(item.piece);
      delete files[f];
      changed = true;
    }
    const dirs = this.index.dirs.filter((d) => !isUnder(d, p));
    if (!changed && dirs.length === this.index.dirs.length) return;
    this.index = { ...this.index, files, dirs };
    this.touch();
  }

  /** Сколько занимают закрытые файлы (для Google Диска: сколько места займёт). */
  get size(): number {
    return Object.values(this.index.files).reduce((n, f) => n + f.size, 0);
  }

  // ---------- Перевод и запечатывание ----------

  /** Все куски как есть (закрытые), для одного файла. */
  private async rawPieces(): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>();
    for (const f of Object.values(this.index.files)) {
      const data = await this.io.read(joinPath(this.folder, f.piece));
      if (!data) throw new VaultError('damaged', 'Часть грамотки пропала — её не собрать в один файл.');
      out.set(f.piece, data);
    }
    return out;
  }

  /** Один файл с этим пропуском (свой — для резервной копии и Google Диска). */
  async bundle(): Promise<Uint8Array> {
    await this.flush();
    return this.run(async () => {
      this.passBytes ??= await passForOwner(this.ctx.keys, this.dk, this.pass, this.id);
      const index = await sealData(this.dk, utf8(JSON.stringify(this.index)), indexAad(this.id));
      return writeBundle({ head: { id: unhex(this.id), pass: this.passBytes, label: new Uint8Array(0), index, journal: this.journal }, pieces: await this.rawPieces() });
    });
  }

  /** Файл для перевода: пропуск по временному ключу (до until). В журнал — «передано». */
  async bundleForTransfer(code: string, until: string): Promise<Uint8Array> {
    await this.flush();
    return this.run(async () => {
      await this.addJournal('transfer', { until });
      const meta: PassMeta = { v: 1, kind: 'transfer', gen: this.pass.gen, from: this.ctx.owner, at: new Date().toISOString(), until, journal: this.pass.journal };
      const pass = await passWithCode(code, this.dk, meta, this.id);
      const index = await sealData(this.dk, utf8(JSON.stringify(this.index)), indexAad(this.id));
      const out = writeBundle({ head: { id: unhex(this.id), pass, label: new Uint8Array(0), index, journal: this.journal }, pieces: await this.rawPieces() });
      await this.writeHeadNow();
      return out;
    });
  }

  /**
   * Запечатать свою копию для разработчика: пропуск закрывается его замком, мастеру остаётся ярлык
   * (ФИО и дата). Открыть эту копию в приложении больше нельзя.
   */
  async seal(label: SealedLabel): Promise<void> {
    await this.flush();
    await this.run(async () => {
      const meta: PassMeta = { ...this.pass, kind: 'sealed', from: this.ctx.owner, at: new Date().toISOString() };
      const pass = await passForDeveloper(this.dk, meta, this.id, this.ctx.lock);
      const sealedLabel = await ownerSeal(this.ctx.keys, utf8(JSON.stringify(label)), labelAad(this.id));
      const index = await sealData(this.dk, utf8(JSON.stringify(this.index)), indexAad(this.id));
      await this.io.write(joinPath(this.folder, HEAD_FILE), writeHead({ id: unhex(this.id), pass, label: sealedLabel, index, journal: this.journal }));
    });
  }

  /** Кто работает (мастер узнан после открытия). Ничего не перезаписывает. */
  setContext(ctx: OwnerContext): void {
    this.ctx = ctx;
  }

  /** Перезакрыть свой пропуск (сменилась фраза или имя мастера). Файлы не трогаются. */
  async rewrap(ctx: OwnerContext): Promise<void> {
    await this.flush();
    await this.run(async () => {
      this.ctx = ctx;
      this.pass = { ...this.pass, owner: ctx.owner };
      this.passBytes = null;
      await this.writeHeadNow();
    });
  }

  /** Сделать копию из пришедшей (после слияния): оглавление и файлы из её кусков. */
  async adopt(index: GramotkaIndex, takeFiles: string[], from: Received): Promise<void> {
    await this.flush();
    await this.run(async () => {
      const files = { ...index.files };
      for (const path of takeFiles) {
        const f = from.index.files[path];
        const sealed = f && from.bundle.pieces.get(f.piece);
        if (!f || !sealed) continue;
        const data = await openData(from.dk, sealed, pieceAad(this.id, f.piece));
        const piece = hex(newId());
        await this.io.write(joinPath(this.folder, piece), await sealData(this.dk, data, pieceAad(this.id, piece)));
        files[path] = { ...f, piece };
      }
      for (const [path, f] of Object.entries(this.index.files)) if (!files[path] || files[path].piece !== f.piece) this.obsolete.push(f.piece);
      this.index = { ...index, files: Object.fromEntries(Object.entries(files).filter(([, f]) => !!f)) };
      this.dirty = true;
    });
    await this.flush();
  }

  /**
   * Сохранить пришедшую грамотку в папку как свою. Перевод: новый ключ данных (новое поколение) — прежний
   * мастер к этой копии больше не подходит; в журнал — «принято». Своя копия (резерв, Диск) — как есть.
   */
  static async fromReceived(io: GramotkaIO, folder: string, r: Received, ctx: OwnerContext, index: GramotkaIndex = r.index): Promise<Gramotka> {
    const transfer = r.meta.kind === 'transfer';
    const dk = transfer ? await newDataKey() : r.dk;
    const files: Record<string, GramotkaFile> = {};
    for (const [path, f] of Object.entries(index.files)) {
      const sealed = r.bundle.pieces.get(f.piece);
      if (!sealed) continue;
      if (!transfer) {
        await io.write(joinPath(folder, f.piece), sealed);
        files[path] = f;
        continue;
      }
      const data = await openData(r.dk, sealed, pieceAad(r.id, f.piece));
      const piece = hex(newId());
      await io.write(joinPath(folder, piece), await sealData(dk, data, pieceAad(r.id, piece)));
      files[path] = { ...f, piece };
    }
    const now = new Date().toISOString();
    const pass: PassMeta = transfer ? { v: 1, kind: 'own', gen: r.meta.gen + 1, owner: ctx.owner, from: r.meta.from, at: now, journal: r.meta.journal } : { ...r.meta, kind: 'own', owner: ctx.owner };
    const g = new Gramotka(r.id, folder, io, dk, pass, { ...index, files }, r.bundle.head.journal, ctx);
    if (transfer) await g.addJournal('accepted');
    g.dirty = true;
    await g.flush();
    return g;
  }

  /** Сведения о журнале для разработчика и проверок. */
  get journalCount(): number {
    return this.journal.length;
  }
}

/** Журнал сходится с пропуском: столько же записей и последняя — та самая. */
async function journalMatches(journal: Uint8Array[], meta: PassMeta): Promise<boolean> {
  if (journal.length !== meta.journal.count) return false;
  if (!journal.length) return meta.journal.last === '';
  return (await digest(journal[journal.length - 1])) === meta.journal.last;
}

// ---------- Пришедший файл ----------

/** Пришедшая грамотка, открытая временным ключом или своим пропуском (ещё не сохранена). */
export interface Received {
  id: string;
  bundle: Bundle;
  dk: DataKey;
  meta: PassMeta;
  index: GramotkaIndex;
  /** Журнал не сходится с пропуском. */
  journalBroken: boolean;
}

/** Номер грамотки в файле (без ключа). */
export function bundleId(bundle: Bundle): string {
  return hex(bundle.head.id);
}

/** Свой ли это файл (закрыт этим владельцем) — тогда временный ключ не нужен. */
export async function openReceivedOwn(bundle: Bundle, keys: OwnerKeys): Promise<Received> {
  const id = bundleId(bundle);
  if (bundle.head.label.length) throw new VaultError('wrong-phrase', 'Это запечатанная копия — её открывает только разработчик.');
  const { dk, meta } = await openOwnerPass<PassMeta>(keys, bundle.head.pass, id);
  return received(bundle, id, dk, meta);
}

/** Открыть пришедший файл временным ключом. Срок вышел — VaultError('expired'). */
export async function openReceivedWithCode(bundle: Bundle, code: string, now = new Date()): Promise<Received> {
  const id = bundleId(bundle);
  const { dk, meta } = await openCodePass<PassMeta>(code, bundle.head.pass, id);
  if (meta.kind !== 'transfer') throw new VaultError('damaged', 'Это не файл перевода.');
  if (meta.until && Date.parse(meta.until) < now.getTime())
    throw new VaultError('expired', `Срок временного ключа вышел ${new Date(meta.until).toLocaleDateString('ru-RU')}. Попросите прежнего мастера выдать новый.`);
  return received(bundle, id, dk, meta);
}

async function received(bundle: Bundle, id: string, dk: DataKey, meta: PassMeta): Promise<Received> {
  const index = JSON.parse(fromUtf8(await openData(dk, bundle.head.index, indexAad(id)))) as GramotkaIndex;
  return { id, bundle, dk, meta, index, journalBroken: !(await journalMatches(bundle.head.journal, meta)) };
}

/** Закрытые куски грамотки в папке, на которые ссылается оглавление (для проверок). */
export function piecesOf(g: Gramotka): string[] {
  return Object.values(g.index.files).map((f) => f.piece);
}
