import { defineDocType, isEnvelope, upgrade, wrap, type DocType } from '../schema/docType';
import { Emitter } from '../util/events';
import { uid } from '../util/id';
import { joinPath, type FsEntry, type StorageAdapter } from '../storage/types';

/**
 * Рабочая папка.
 *
 *   <Рабочая папка>/
 *     .docassist/                 ← служебные данные ядра (не трогать руками)
 *       workspace.json            ← паспорт рабочей папки
 *       variables.json            ← глобальные переменные
 *       outbox.json               ← предложения в общую базу
 *       base/*.json               ← база данных: древа «ключ:значение» («Адреса.json»…)
 *       owner.bin                 ← кто ведёт грамотки (закрыто фразой)
 *     Грамотки/                   ← база людей: у каждого человека своя грамотка (src/core/gramotka)
 *     Анкеты 2025.xlsx            ← общие файлы пользователя (видны всем приложениям)
 *     Проверка анкет/             ← папка приложения: его правила, сеансы, результаты
 *     <Другое приложение>/
 */

export const SYSTEM_DIR = '.docassist';

export interface WorkspaceInfo {
  id: string;
  createdAt: string;
  createdWith: string;
}

export const workspaceDocType = defineDocType<WorkspaceInfo>({
  type: 'docassist/workspace',
  version: 1,
  migrations: {},
  empty: () => ({ id: uid('ws_'), createdAt: new Date().toISOString(), createdWith: __APP_VERSION__ }),
});

export interface ChangeEvent {
  path: string;
  action: 'write' | 'remove';
}

export class ReadOnlyDocError extends Error {
  constructor(path: string) {
    super(`Файл «${path}» создан более новой версией DocAssist. Обновите приложение, чтобы изменить его.`);
  }
}

export interface DocResult<T> {
  data: T;
  exists: boolean;
  tooNew: boolean;
  migratedFrom?: number;
}

const decoder = new TextDecoder();

/** Имя, которого нет среди занятых (занятые — в нижнем регистре): «скан.jpg» → «скан (2).jpg». */
export function uniqueFileName(name: string, takenLower: Set<string>): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().replace(/^\.+$/, '') || 'файл';
  if (!takenLower.has(clean.toLowerCase())) return clean;
  const dot = clean.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
  for (let i = 2; ; i++) {
    const next = `${stem} (${i})${ext}`;
    if (!takenLower.has(next.toLowerCase())) return next;
  }
}

/**
 * Виртуальные папки: пути «@грамотки/<номер>/…» ведут не в рабочую папку, а внутрь грамотки (src/core/gramotka).
 * Поэтому приложения работают с папкой человека так же, как с любой папкой: читают, пишут, переносят в «Для выдачи».
 */
export const MOUNT_ROOT = '@грамотки';

export class Workspace {
  readonly changes = new Emitter<ChangeEvent>();
  info: WorkspaceInfo | null = null;
  private mounts = new Map<string, StorageAdapter>();

  constructor(readonly adapter: StorageAdapter) {}

  /** Подключить виртуальную папку (путь вида «@грамотки/<номер>»). */
  mount(prefix: string, adapter: StorageAdapter): void {
    this.mounts.set(joinPath(prefix), adapter);
  }

  unmount(prefix: string): void {
    this.mounts.delete(joinPath(prefix));
  }

  /** Отключить все виртуальные папки (грамотки закрыты). */
  unmountAll(): void {
    this.mounts.clear();
  }

  /** Где на самом деле лежит путь: в рабочей папке или в виртуальной папке. */
  private route(path: string): { adapter: StorageAdapter; rel: string; mounted: boolean } {
    const p = joinPath(path);
    if (p === MOUNT_ROOT || p.startsWith(`${MOUNT_ROOT}/`)) {
      const parts = p.split('/');
      const prefix = parts.slice(0, 2).join('/');
      const adapter = this.mounts.get(prefix);
      if (!adapter) throw new Error(parts.length < 2 ? 'Это не папка.' : 'Грамотка закрыта или её нет: откройте грамотки.');
      return { adapter, rel: parts.slice(2).join('/'), mounted: true };
    }
    return { adapter: this.adapter, rel: p, mounted: false };
  }

  get kind() {
    return this.adapter.kind;
  }
  get label() {
    return this.adapter.label;
  }

  async init(): Promise<void> {
    await this.adapter.mkdir(SYSTEM_DIR);
    const r = await this.readDoc(joinPath(SYSTEM_DIR, 'workspace.json'), workspaceDocType);
    if (!r.exists) await this.writeDoc(joinPath(SYSTEM_DIR, 'workspace.json'), workspaceDocType, r.data);
    this.info = r.data;
  }

  /** Путь служебного файла ядра. */
  systemPath(...parts: string[]): string {
    return joinPath(SYSTEM_DIR, ...parts);
  }

  async list(path = ''): Promise<FsEntry[]> {
    const p = joinPath(path);
    if (p === MOUNT_ROOT) return [...this.mounts.keys()].map((k) => ({ name: k.split('/')[1], path: k, kind: 'directory' as const }));
    const r = this.route(p);
    const list = await r.adapter.list(r.rel);
    if (!r.mounted) return p ? list : list.filter((e) => e.name !== MOUNT_ROOT);
    const base = p.split('/').slice(0, 2).join('/');
    return list.map((e) => ({ ...e, path: joinPath(base, e.path) }));
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const r = this.route(path);
    return r.adapter.readFile(r.rel);
  }

  async stat(path: string) {
    const r = this.route(path);
    return r.adapter.stat(r.rel);
  }

  async writeBytes(path: string, data: Uint8Array | string): Promise<void> {
    const r = this.route(path);
    await r.adapter.writeFile(r.rel, data);
    this.changes.emit({ path: joinPath(path), action: 'write' });
  }

  /** Перенести файл (у хранилищ нет переименования: копируем и удаляем исходный). */
  async moveFile(from: string, to: string): Promise<void> {
    if (joinPath(from) === joinPath(to)) return;
    const data = await this.readBytes(from);
    if (!data) throw new Error(`Файл не найден: ${from}`);
    await this.writeBytes(to, data);
    await this.remove(from);
  }

  /** Свободное имя в папке: «скан.jpg», «скан (2).jpg»… Символы, запрещённые в именах файлов, заменяются на «_». */
  async freeName(folder: string, name: string, also: Iterable<string> = []): Promise<string> {
    const taken = new Set([...(await this.list(folder)).map((e) => e.name), ...also].map((n) => n.toLowerCase()));
    return uniqueFileName(name, taken);
  }

  async mkdir(path: string): Promise<void> {
    const r = this.route(path);
    await r.adapter.mkdir(r.rel);
    this.changes.emit({ path: joinPath(path), action: 'write' });
  }

  async remove(path: string): Promise<void> {
    const r = this.route(path);
    await r.adapter.remove(r.rel);
    this.changes.emit({ path: joinPath(path), action: 'remove' });
  }

  async readJson(path: string): Promise<unknown | undefined> {
    const bytes = await this.readBytes(path);
    if (!bytes) return undefined;
    const text = decoder.decode(bytes).replace(/^﻿/, '');
    return JSON.parse(text);
  }

  async readDoc<T>(path: string, dt: DocType<T>): Promise<DocResult<T>> {
    const raw = await this.readJson(path);
    if (raw === undefined) return { data: dt.empty(), exists: false, tooNew: false };
    const r = upgrade(dt, raw);
    return { data: r.data, exists: true, tooNew: r.tooNew, migratedFrom: r.migratedFrom };
  }

  async writeDoc<T>(path: string, dt: DocType<T>, data: T): Promise<void> {
    const current = await this.readJson(path).catch(() => undefined);
    if (isEnvelope(current) && current.$type === dt.type && current.$version > dt.version) {
      throw new ReadOnlyDocError(path);
    }
    await this.writeBytes(path, JSON.stringify(wrap(dt, data), null, 2));
  }
}
