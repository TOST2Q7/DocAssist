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
 *       dictionaries/*.json       ← пользовательские дополнения справочников
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

export class Workspace {
  readonly changes = new Emitter<ChangeEvent>();
  info: WorkspaceInfo | null = null;

  constructor(readonly adapter: StorageAdapter) {}

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

  list(path = ''): Promise<FsEntry[]> {
    return this.adapter.list(path);
  }

  readBytes(path: string) {
    return this.adapter.readFile(path);
  }

  stat(path: string) {
    return this.adapter.stat(path);
  }

  async writeBytes(path: string, data: Uint8Array | string): Promise<void> {
    await this.adapter.writeFile(path, data);
    this.changes.emit({ path, action: 'write' });
  }

  async remove(path: string): Promise<void> {
    await this.adapter.remove(path);
    this.changes.emit({ path, action: 'remove' });
  }

  async readJson(path: string): Promise<unknown | undefined> {
    const bytes = await this.adapter.readFile(path);
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
