import { getDevice } from '../device/device';
import { joinPath } from '../storage/types';
import { fromUtf8, utf8 } from '../util/bytes';
import { uid } from '../util/id';
import { attempt } from '../vault/attempts';
import { forgetOwnerKeys, isOwners, ownerKeys, ownerOpen, ownerSaltOf, ownerSeal, readKeyFile, rememberedOwnerKeys, rememberOwnerKeys, type OwnerKeys } from '../vault/owner';
import { newTransferCode } from '../vault/pass';
import { VaultError } from '../vault/vault';
import { MOUNT_ROOT, type Workspace } from '../workspace/workspace';
import { compareEdits, diffIndexes, mergeIndexes, type DiffItem, type MergeChoice, type Order } from './compare';
import { GramotkaFiles } from './files';
import { FormatError, HEAD_FILE, hex, newId, readBundle, readHead, shortCode, writeHead } from './format';
import { clearCache, Gramotka, openReceivedOwn, openReceivedWithCode, type GramotkaIO, type OwnerContext, type Received } from './gramotka';
import type { OwnerInfo, SealedLabel } from './types';

/*
 * Грамотки рабочей папки: открыть фразой (один медленный расчёт ключа на все), держать открытые в памяти,
 * создавать, удалять, переводить и принимать. Папка человека каждой открытой грамотки подключена к рабочей
 * папке как виртуальная («@грамотки/<номер>»).
 *
 *   <Рабочая папка>/
 *     .docassist/owner.bin       ← кто ведёт грамотки (имя мастера), закрыто фразой — по нему проверяется фраза
 *     Грамотки/
 *       Грамотка 7KQ2/           ← одна грамотка: «0» — голова (пропуск, оглавление, журнал), остальное — файлы
 */

export const GRAMOTKI_FOLDER = 'Грамотки';
export const GRAMOTKA_EXT = 'gramotka';
export const KEY_FILE_EXT = 'gramkey';
/** Сколько дней действует временный ключ перевода. */
export const TRANSFER_DAYS = 3;

const OWNER_AAD = 'owner';
const CLOSED_FLAG = 'docassist.gramotki.closed';

export type GramotkiStatus =
  /** Ещё читаем рабочую папку. */
  | 'starting'
  /** Грамоток и фразы ещё нет: фраза создаётся при первом человеке. */
  | 'new'
  /** Закрыты: нужна фраза (или файл ключа). */
  | 'locked'
  | 'opening'
  | 'open';

export interface PersonEntry {
  id: string;
  fields: Record<string, string>;
  savedAt: string;
  source: string;
}

export interface SealedEntry {
  id: string;
  folder: string;
  label: SealedLabel;
}

export interface GramotkiSnapshot {
  status: GramotkiStatus;
  owner: OwnerInfo | null;
  progress: { done: number; total: number } | null;
  people: PersonEntry[];
  sealed: SealedEntry[];
  /** Сколько грамоток не открываются этой фразой (другого мастера). */
  foreign: number;
  damaged: string[];
  /** Грамотки, у которых журнал не сходится с пропуском. */
  brokenJournal: string[];
  /** Ключ запомнен на этом устройстве. */
  remembered: boolean;
  error: string | null;
  rev: number;
}

const EMPTY: GramotkiSnapshot = { status: 'starting', owner: null, progress: null, people: [], sealed: [], foreign: 0, damaged: [], brokenJournal: [], remembered: false, error: null, rev: 0 };

/** Пришедший файл грамотки: что это и что с ним будет. */
export interface Incoming {
  id: string;
  short: string;
  /** Свой файл (этой фразы): временный ключ не нужен. */
  own: boolean;
  /** Такая грамотка уже есть: открытая или запечатанная (уже переданная). */
  existing: 'open' | 'sealed' | null;
}

export interface Prepared {
  received: Received;
  order: Order | 'new';
  /** Различия, если копии разошлись. */
  diff: DiffItem[];
  /** ФИО в пришедшей копии. */
  fields: Record<string, string>;
}

export interface TransferFile {
  id: string;
  name: string;
  data: Uint8Array;
}

export function gramotkaPath(id: string): string {
  return joinPath(MOUNT_ROOT, id);
}

export class GramotkiStore {
  private items = new Map<string, Gramotka>();
  private sealed = new Map<string, SealedEntry>();
  private foreign = new Set<string>();
  private damaged: string[] = [];
  private keys: OwnerKeys | null = null;
  private owner: OwnerInfo | null = null;
  private snap: GramotkiSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private opened: Promise<void> | null = null;
  private waiters: Array<(ok: boolean) => void> = [];
  /** Замок разработчика (в проверках — свой). */
  developerLock?: string;

  readonly io: GramotkaIO;

  constructor(readonly ws: Workspace) {
    const a = ws.adapter;
    this.io = { read: (p) => a.readFile(p), write: (p, d) => a.writeFile(p, d), remove: (p) => a.remove(p), list: (p) => a.list(p) };
  }

  // ---------- Подписка ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  snapshot = (): GramotkiSnapshot => this.snap;

  private emit(patch: Partial<GramotkiSnapshot> = {}) {
    const people = [...this.items.values()]
      .map((g) => ({ id: g.id, fields: g.fields, savedAt: g.index.person.savedAt, source: g.index.person.source }))
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    this.snap = {
      ...this.snap,
      owner: this.owner,
      people,
      sealed: [...this.sealed.values()],
      foreign: this.foreign.size,
      damaged: this.damaged,
      brokenJournal: [...this.items.values()].filter((g) => g.journalBroken).map((g) => g.id),
      ...patch,
      rev: this.snap.rev + 1,
    };
    if (this.snap.status === 'open') for (const w of this.waiters.splice(0)) w(true);
    for (const fn of [...this.listeners]) fn();
  }

  private ctx(): OwnerContext {
    if (!this.keys || !this.owner) throw new VaultError('wrong-phrase', 'Грамотки закрыты: введите фразу.');
    return { keys: this.keys, owner: this.owner, device: () => getDevice().name, replica: this.replica(), lock: this.developerLock };
  }

  /** Эта копия: устройство и рабочая папка. */
  private replica(): string {
    return `${getDevice().id}.${this.ws.info?.id ?? ''}`;
  }

  // ---------- Запуск ----------

  private ownerPath() {
    return this.ws.systemPath('owner.bin');
  }

  /** Папки грамоток в рабочей папке. */
  async folders(): Promise<string[]> {
    const list = await this.io.list(GRAMOTKI_FOLDER).catch(() => []);
    const out: string[] = [];
    for (const e of list) if (e.kind === 'directory' && (await this.io.read(joinPath(e.path, HEAD_FILE)).catch(() => null))) out.push(e.path);
    return out;
  }

  /** Прочитать рабочую папку; если ключ запомнен — открыть грамотки в фоне. */
  async init(): Promise<void> {
    const card = await this.io.read(this.ownerPath()).catch(() => null);
    const folders = await this.folders();
    const remembered = await this.rememberedKeys();
    this.emit({ status: card || folders.length ? 'locked' : 'new', remembered: !!remembered });
    if (remembered && !closedByUser()) void this.openWith(remembered).catch((e: unknown) => this.emit({ status: 'locked', error: errorText(e) }));
  }

  private async rememberedKeys(): Promise<OwnerKeys | null> {
    const id = this.ws.info?.id;
    return id ? rememberedOwnerKeys(id) : null;
  }

  /** Дождаться, пока грамотки откроются (false — закрыты и никто не открывает). */
  whenOpen(): Promise<boolean> {
    if (this.snap.status === 'open') return Promise.resolve(true);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  // ---------- Фраза ----------

  /** Создать мастера: первая фраза в этой рабочей папке. */
  async createOwner(phrase: string, name: string, remember: boolean): Promise<void> {
    if (this.snap.status !== 'new') throw new Error('Фраза для этой рабочей папки уже есть — введите её.');
    const keys = await ownerKeys(phrase);
    const owner: OwnerInfo = { id: uid('m_'), name: name.trim() || 'Мастер' };
    await this.io.write(this.ownerPath(), await ownerSeal(keys, utf8(JSON.stringify({ ...owner, createdAt: new Date().toISOString() })), OWNER_AAD));
    await this.openWith(keys, owner);
    if (remember) await this.remember(keys);
  }

  /** Соли, которыми закрыты грамотки этой папки: из карточки мастера, а если её нет — из самих грамоток. */
  private async salts(): Promise<Uint8Array[]> {
    const card = await this.io.read(this.ownerPath()).catch(() => null);
    if (card) return [ownerSaltOf(card)];
    const out: Uint8Array[] = [];
    for (const f of await this.folders()) {
      try {
        const head = readHead((await this.io.read(joinPath(f, HEAD_FILE)))!);
        const salt = ownerSaltOf(head.label.length ? head.label : head.pass);
        if (!out.some((s) => s.every((b, i) => b === salt[i]))) out.push(salt);
      } catch {
        /* чужая или повреждённая — пропускаем */
      }
      if (out.length >= 5) break;
    }
    return out;
  }

  /** Открыть грамотки фразой. Неверная фраза — VaultError; после нескольких ошибок — пауза. */
  async unlock(phrase: string, remember: boolean): Promise<void> {
    const keys = await attempt('gramotki', async () => {
      for (const salt of await this.salts()) {
        const k = await ownerKeys(phrase, salt);
        if (await this.check(k)) return k;
      }
      throw new VaultError('wrong-phrase', 'Фраза не подходит к грамоткам этой рабочей папки.');
    });
    await this.openWith(keys);
    if (remember) await this.remember(keys);
  }

  /** Открыть файлом ключа (вместо ввода фразы). */
  async unlockWithKeyFile(bytes: Uint8Array, remember: boolean): Promise<void> {
    const phrase = await readKeyFile(bytes);
    if (!phrase) throw new VaultError('damaged', 'Это не файл ключа DocAssist.');
    if (this.snap.status === 'new') throw new VaultError('wrong-phrase', 'В этой рабочей папке ещё нет грамоток. Создайте фразу — или введите ту же, что в файле ключа.');
    await this.unlock(phrase, remember);
  }

  /** Подходит ли ключ: открывается карточка мастера (или хоть одна грамотка). */
  private async check(keys: OwnerKeys): Promise<boolean> {
    const card = await this.io.read(this.ownerPath()).catch(() => null);
    if (card)
      return ownerOpen(keys, card, OWNER_AAD).then(
        () => true,
        () => false,
      );
    for (const f of await this.folders()) {
      const r = await Gramotka.open(this.io, f, { keys, owner: { id: '', name: '' }, device: () => '', replica: '' });
      if (r.kind === 'open' || r.kind === 'sealed') return true;
    }
    return false;
  }

  private async readOwner(keys: OwnerKeys): Promise<OwnerInfo | null> {
    const card = await this.io.read(this.ownerPath()).catch(() => null);
    if (!card) return null;
    const v = JSON.parse(fromUtf8(await ownerOpen(keys, card, OWNER_AAD))) as OwnerInfo;
    return { id: v.id, name: v.name };
  }

  private async remember(keys: OwnerKeys) {
    const id = this.ws.info?.id;
    if (!id) return;
    await rememberOwnerKeys(id, keys).catch(() => undefined);
    this.emit({ remembered: true });
  }

  /** Забыть ключ на этом устройстве (грамотки остаются открытыми до закрытия). */
  async forgetHere(): Promise<void> {
    const id = this.ws.info?.id;
    if (id) await forgetOwnerKeys(id);
    this.emit({ remembered: false });
  }

  private openWith(keys: OwnerKeys, known?: OwnerInfo): Promise<void> {
    if (this.opened && this.snap.status === 'opening') return this.opened;
    this.opened = (async () => {
      setClosedByUser(false);
      const folders = await this.folders();
      this.emit({ status: 'opening', progress: { done: 0, total: folders.length }, error: null });
      let owner = known ?? (await this.readOwner(keys));
      const items = new Map<string, Gramotka>();
      const sealed = new Map<string, SealedEntry>();
      const foreign = new Set<string>();
      const damaged: string[] = [];
      const ctx = (): OwnerContext => ({ keys, owner: owner ?? { id: '', name: '' }, device: () => getDevice().name, replica: this.replica(), lock: this.developerLock });
      let done = 0;
      for (const f of folders) {
        const r = await Gramotka.open(this.io, f, ctx());
        if (r.kind === 'open') {
          // Карточки мастера нет (её удалили) — мастер берётся из своего пропуска.
          if (!owner && r.g.pass.owner) owner = r.g.pass.owner;
          items.set(r.g.id, r.g);
        } else if (r.kind === 'sealed') sealed.set(r.id, { id: r.id, folder: f, label: r.label });
        else if (r.kind === 'foreign') foreign.add(r.id);
        else damaged.push(r.error);
        this.emit({ progress: { done: ++done, total: folders.length } });
      }
      owner ??= { id: uid('m_'), name: 'Мастер' };
      if (!(await this.io.read(this.ownerPath()).catch(() => null))) {
        await this.io.write(this.ownerPath(), await ownerSeal(keys, utf8(JSON.stringify({ ...owner, createdAt: new Date().toISOString() })), OWNER_AAD));
      }
      this.keys = keys;
      this.owner = owner;
      for (const g of items.values()) g.setContext(this.ctx());
      this.items = items;
      this.sealed = sealed;
      this.foreign = foreign;
      this.damaged = damaged;
      for (const g of items.values()) this.attach(g);
      this.emit({ status: 'open', progress: null });
    })();
    return this.opened.finally(() => {
      this.opened = null;
    });
  }

  private attach(g: Gramotka) {
    g.onChange = () => this.emit();
    this.ws.mount(gramotkaPath(g.id), new GramotkaFiles(() => this.items.get(g.id) ?? null, this.ws.kind));
  }

  /** Закрыть грамотки: всё сохраняется, ключ и данные уходят из памяти. */
  async lock(): Promise<void> {
    await this.flushAll();
    this.ws.unmountAll();
    this.items.clear();
    this.sealed.clear();
    this.keys = null;
    this.owner = null;
    clearCache();
    setClosedByUser(true);
    for (const w of this.waiters.splice(0)) w(false);
    this.emit({ status: 'locked', progress: null });
  }

  async flushAll(): Promise<void> {
    for (const g of this.items.values()) await g.flush();
  }

  /** Сменить фразу: перезакрываются пропуска и ярлыки, файлы не трогаются. */
  async changePhrase(phrase: string, remember: boolean): Promise<void> {
    const old = this.ctx();
    const keys = await ownerKeys(phrase);
    const next: OwnerContext = { ...old, keys };
    for (const g of this.items.values()) await g.rewrap(next);
    for (const s of this.sealed.values()) {
      const path = joinPath(s.folder, HEAD_FILE);
      const head = readHead((await this.io.read(path))!);
      const label = await ownerOpen(old.keys, head.label, `${s.id}/label`);
      await this.io.write(path, writeHead({ ...head, label: await ownerSeal(keys, label, `${s.id}/label`) }));
    }
    await this.io.write(this.ownerPath(), await ownerSeal(keys, utf8(JSON.stringify({ ...old.owner, createdAt: new Date().toISOString() })), OWNER_AAD));
    this.keys = keys;
    await this.forgetHere();
    if (remember) await this.remember(keys);
  }

  /** Сменить имя мастера (как подписываться в журнале). */
  async rename(name: string): Promise<void> {
    const ctx = this.ctx();
    this.owner = { ...ctx.owner, name: name.trim() || ctx.owner.name };
    await this.io.write(this.ownerPath(), await ownerSeal(ctx.keys, utf8(JSON.stringify({ ...this.owner, createdAt: new Date().toISOString() })), OWNER_AAD));
    for (const g of this.items.values()) await g.rewrap(this.ctx());
    this.emit();
  }

  // ---------- Люди ----------

  item(id: string): Gramotka | undefined {
    return this.items.get(id);
  }

  private async freeFolder(id: string): Promise<string> {
    const taken = new Set((await this.io.list(GRAMOTKI_FOLDER).catch(() => [])).map((e) => e.name.toLowerCase()));
    const base = `Грамотка ${shortCode(id)}`;
    if (!taken.has(base.toLowerCase())) return joinPath(GRAMOTKI_FOLDER, base);
    for (let i = 2; ; i++) if (!taken.has(`${base} (${i})`.toLowerCase())) return joinPath(GRAMOTKI_FOLDER, `${base} (${i})`);
  }

  /** Новая грамотка (новый человек). */
  async create(fields: Record<string, string>, source: string): Promise<string> {
    const ctx = this.ctx();
    const id = hex(newId());
    const g = await Gramotka.create(this.io, await this.freeFolder(id), ctx, fields, source, id);
    this.items.set(g.id, g);
    this.attach(g);
    this.emit();
    return g.id;
  }

  setPerson(id: string, fields: Record<string, string>, source: string): void {
    const g = this.items.get(id);
    if (!g) throw new Error('Грамотка закрыта или её нет.');
    g.setPerson(fields, source);
  }

  section<T>(id: string, app: string): T | undefined {
    return this.items.get(id)?.section<T>(app);
  }

  setSection(id: string, app: string, data: unknown): void {
    this.items.get(id)?.setSection(app, data);
  }

  /** Удалить грамотку насовсем (вместе с файлами). */
  async remove(id: string): Promise<void> {
    const g = this.items.get(id);
    const s = this.sealed.get(id);
    if (g) await g.flush();
    const folder = g?.folder ?? s?.folder;
    if (!folder) return;
    this.items.delete(id);
    this.sealed.delete(id);
    this.ws.unmount(gramotkaPath(id));
    await this.io.remove(folder);
    this.emit();
  }

  /** Сколько места занимают грамотки (байты файлов, примерно). */
  totalSize(): number {
    return [...this.items.values()].reduce((n, g) => n + g.size, 0);
  }

  // ---------- Перевод ----------

  /**
   * Перевод: файлы грамоток с пропуском по временному ключу (6 цифр, действует TRANSFER_DAYS дня), свои копии
   * запечатываются для разработчика. Возвращает файлы и ключ, который нужно сообщить новому мастеру.
   */
  async transfer(ids: string[], label: (id: string) => string, now = new Date()): Promise<{ code: string; until: string; files: TransferFile[] }> {
    this.ctx();
    const code = newTransferCode();
    const until = new Date(now.getTime() + TRANSFER_DAYS * 86_400_000).toISOString();
    const files: TransferFile[] = [];
    for (const id of ids) {
      const g = this.items.get(id);
      if (!g) continue;
      const data = await g.bundleForTransfer(code, until);
      files.push({ id, name: `Грамотка ${shortCode(id)}.${GRAMOTKA_EXT}`, data });
    }
    for (const f of files) {
      const g = this.items.get(f.id)!;
      const sealedLabel: SealedLabel = { fio: label(f.id), at: now.toISOString(), until };
      await g.seal(sealedLabel);
      this.items.delete(f.id);
      this.ws.unmount(gramotkaPath(f.id));
      this.sealed.set(f.id, { id: f.id, folder: g.folder, label: sealedLabel });
    }
    clearCache();
    this.emit();
    return { code, until, files };
  }

  /** Своя грамотка одним файлом (резервная копия, Google Диск). */
  async bundle(id: string): Promise<TransferFile> {
    const g = this.items.get(id);
    if (!g) throw new Error('Грамотка закрыта или её нет.');
    return { id, name: `Грамотка ${shortCode(id)}.${GRAMOTKA_EXT}`, data: await g.bundle() };
  }

  /** Что за файл пришёл (без ключа). */
  inspect(bytes: Uint8Array): Incoming {
    const b = readBundle(bytes);
    const id = hex(b.head.id);
    const own = !!this.keys && !b.head.label.length && isOwners(b.head.pass, this.keys);
    return { id, short: shortCode(id), own, existing: this.items.has(id) ? 'open' : this.sealed.has(id) ? 'sealed' : null };
  }

  /** Открыть пришедший файл: свой — ключом владельца, перевод — временным ключом. И сравнить с тем, что уже есть. */
  async prepare(bytes: Uint8Array, code?: string): Promise<Prepared> {
    const ctx = this.ctx();
    let bundle;
    try {
      bundle = readBundle(bytes);
    } catch {
      throw new FormatError();
    }
    const info = this.inspect(bytes);
    const received = info.own ? await openReceivedOwn(bundle, ctx.keys) : await attempt('transfer', () => openReceivedWithCode(bundle, code ?? ''));
    const mine = this.items.get(received.id);
    if (!mine) return { received, order: 'new', diff: [], fields: received.index.person.fields };
    const order = compareEdits(received.index.edits, mine.index.edits);
    const diff = order === 'diverged' ? diffIndexes(mine.index, received.index, (p) => sameFileMeta(mine.index.files[p], received.index.files[p])) : [];
    return { received, order, diff, fields: received.index.person.fields };
  }

  /**
   * Принять пришедшую грамотку. Новая — добавляется; новее своей — заменяет её; старше или та же — ничего;
   * разошлись — по выбору человека (choice). Возвращает номер грамотки.
   */
  async accept(p: Prepared, choice: MergeChoice = {}): Promise<{ id: string; how: 'added' | 'replaced' | 'merged' | 'kept' }> {
    const ctx = this.ctx();
    const r = p.received;
    const mine = this.items.get(r.id);
    if (mine && (p.order === 'older' || p.order === 'same')) return { id: r.id, how: 'kept' };
    if (mine && p.order === 'diverged') {
      const { index, takeFiles } = mergeIndexes(mine.index, r.index, p.diff, choice);
      await mine.adopt(index, takeFiles, r);
      this.emit();
      return { id: r.id, how: 'merged' };
    }
    const folder = await this.freeFolder(r.id);
    const g = await Gramotka.fromReceived(this.io, folder, r, ctx);
    const old = mine?.folder ?? this.sealed.get(r.id)?.folder;
    if (mine) await mine.flush();
    this.items.set(g.id, g);
    this.sealed.delete(g.id);
    if (old) await this.io.remove(old);
    this.ws.unmount(gramotkaPath(g.id));
    this.attach(g);
    this.emit();
    return { id: g.id, how: mine ? 'replaced' : 'added' };
  }
}

const sameFileMeta = (a?: { size: number; modified: number }, b?: { size: number; modified: number }) => !!a && !!b && a.size === b.size && a.modified === b.modified;

function closedByUser(): boolean {
  try {
    return sessionStorage.getItem(CLOSED_FLAG) === '1';
  } catch {
    return false;
  }
}

function setClosedByUser(v: boolean) {
  try {
    if (v) sessionStorage.setItem(CLOSED_FLAG, '1');
    else sessionStorage.removeItem(CLOSED_FLAG);
  } catch {
    /* без памяти вкладки — откроются при следующем запуске */
  }
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------- Один набор грамоток на рабочую папку ----------

const stores = new WeakMap<Workspace, GramotkiStore>();

export function gramotkiStore(ws: Workspace): GramotkiStore {
  let s = stores.get(ws);
  if (!s) {
    s = new GramotkiStore(ws);
    stores.set(ws, s);
  }
  return s;
}
