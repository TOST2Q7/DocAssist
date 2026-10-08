/**
 * Версионированные JSON-документы — основа переносимости данных между версиями.
 *
 * Каждый служебный JSON-файл хранится в «конверте»:
 *   { "$type": "docassist/variables", "$version": 2, "$app": "0.3.0", "$savedAt": "...", "data": { ... } }
 *
 * - $type    — что это за данные (по нему любая версия понимает, что лежит в файле);
 * - $version — версия схемы данных (не приложения!);
 * - data     — сами данные.
 *
 * Когда схема меняется, увеличиваем version и добавляем миграцию N → N+1.
 * Старые файлы при чтении поднимаются по цепочке миграций до текущей версии.
 * Если файл создан более новой версией приложения — читаем «как есть»
 * и запрещаем перезапись, чтобы не потерять данные.
 */

export interface Envelope<T = unknown> {
  $type: string;
  $version: number;
  $app?: string;
  $savedAt?: string;
  data: T;
}

export interface DocType<T> {
  type: string;
  version: number;
  /** migrations[n] переводит данные версии n в версию n + 1. Версия 0 — «сырой» JSON без конверта. */
  migrations: Record<number, (data: any) => any>;
  empty: () => T;
}

export function defineDocType<T>(def: DocType<T>): DocType<T> {
  for (let v = 1; v < def.version; v++) {
    if (!def.migrations[v]) throw new Error(`${def.type}: нет миграции ${v} → ${v + 1}`);
  }
  return def;
}

export interface Upgraded<T> {
  data: T;
  /** Версия, из которой данные были подняты (если была миграция). */
  migratedFrom?: number;
  /** Файл создан более новой версией — перезаписывать нельзя. */
  tooNew: boolean;
}

export class DocTypeMismatchError extends Error {}

export function isEnvelope(raw: unknown): raw is Envelope {
  return !!raw && typeof raw === 'object' && '$type' in raw && '$version' in raw && 'data' in raw;
}

export function upgrade<T>(dt: DocType<T>, raw: unknown): Upgraded<T> {
  let version: number;
  let data: unknown;
  if (isEnvelope(raw)) {
    if (raw.$type !== dt.type) {
      throw new DocTypeMismatchError(`Ожидался документ «${dt.type}», а в файле «${raw.$type}»`);
    }
    version = raw.$version;
    data = raw.data;
  } else {
    version = 0;
    data = raw;
  }
  if (version > dt.version) return { data: data as T, tooNew: true };
  const from = version;
  while (version < dt.version) {
    const m = dt.migrations[version];
    if (!m) throw new Error(`${dt.type}: нет миграции ${version} → ${version + 1}`);
    data = m(data);
    version++;
  }
  return { data: data as T, migratedFrom: from !== dt.version ? from : undefined, tooNew: false };
}

export function wrap<T>(dt: DocType<T>, data: T): Envelope<T> {
  return {
    $type: dt.type,
    $version: dt.version,
    $app: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
    $savedAt: new Date().toISOString(),
    data,
  };
}
