import { GoogleError } from './errors';
import { gfetch } from './http';
import { md5 } from './md5';

/*
 * Google Диск (Drive API v3) с узким доступом drive.file: приложение видит только файлы, которые создало само
 * или которые человек показал ему в окне выбора Google. Доступ у каждого человека свой.
 * Ключ файла — всегда ID (имена на Диске не уникальны).
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const BATCH = 'https://www.googleapis.com/batch/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
/** До этого размера — загрузка одним запросом, больше — по частям с продолжением после обрыва. */
const SIMPLE_LIMIT = 5 * 1024 * 1024;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  md5Checksum?: string;
  size?: string;
  modifiedTime?: string;
  trashed?: boolean;
  appProperties?: Record<string, string>;
  webViewLink?: string;
  folderColorRgb?: string;
  capabilities?: { canAddChildren?: boolean; canEdit?: boolean; canRename?: boolean; canTrash?: boolean };
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
}

export const FILE_FIELDS =
  'id,name,mimeType,parents,md5Checksum,size,modifiedTime,trashed,appProperties,webViewLink,folderColorRgb,capabilities(canAddChildren,canEdit,canRename,canTrash),lastModifyingUser(displayName,emailAddress),shortcutDetails(targetId,targetMimeType)';

export interface DriveMeta {
  name?: string;
  parents?: string[];
  mimeType?: string;
  folderColorRgb?: string;
  appProperties?: Record<string, string | null>;
  trashed?: boolean;
}

/** Цвета папок Google Диска (Диск сам подбирает ближайший из своей палитры). */
export const FOLDER_COLORS: { rgb: string; title: string }[] = [
  { rgb: '#8f8f8f', title: 'Серый' },
  { rgb: '#ac725e', title: 'Коричневый' },
  { rgb: '#f83a22', title: 'Красный' },
  { rgb: '#ff7537', title: 'Оранжевый' },
  { rgb: '#fad165', title: 'Жёлтый' },
  { rgb: '#16a765', title: 'Зелёный' },
  { rgb: '#4986e7', title: 'Синий' },
  { rgb: '#a47ae2', title: 'Фиолетовый' },
  { rgb: '#f691b2', title: 'Розовый' },
];

export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export const fileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function isFolder(f: Pick<DriveFile, 'mimeType'>): boolean {
  return f.mimeType === FOLDER_MIME;
}

export async function getFile(id: string): Promise<DriveFile> {
  return gfetch<DriveFile>(`${API}/files/${encodeURIComponent(id)}`, { query: { fields: FILE_FIELDS, supportsAllDrives: true } });
}

/** Поиск среди файлов, доступных приложению (запрос Drive «q»). */
export async function listFiles(query: string, fields = FILE_FIELDS): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const r = await gfetch<{ files?: DriveFile[]; nextPageToken?: string }>(`${API}/files`, {
      query: { q: query, fields: `nextPageToken,files(${fields})`, pageSize: 1000, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true },
    });
    out.push(...(r.files ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

/** Содержимое папки — только то, что видит приложение (созданное им или показанное человеком). */
export function listChildren(folderId: string, foldersOnly = false): Promise<DriveFile[]> {
  return listFiles(`${q(folderId)} in parents and trashed = false${foldersOnly ? ` and mimeType = ${q(FOLDER_MIME)}` : ''}`);
}

/** Файлы приложения с меткой key=value (метки видит только это приложение). */
export function findByAppProperty(key: string, value: string): Promise<DriveFile[]> {
  return listFiles(`appProperties has { key=${q(key)} and value=${q(value)} } and trashed = false`);
}

export async function createFolder(name: string, parentId: string, color?: string, appProperties?: Record<string, string>): Promise<DriveFile> {
  return gfetch<DriveFile>(`${API}/files`, {
    method: 'POST',
    query: { fields: FILE_FIELDS, supportsAllDrives: true },
    json: { name, mimeType: FOLDER_MIME, parents: [parentId], ...(color ? { folderColorRgb: color } : {}), ...(appProperties ? { appProperties } : {}) },
    retries: 3,
  });
}

export async function updateMeta(id: string, meta: DriveMeta, extra?: { addParents?: string; removeParents?: string }): Promise<DriveFile> {
  return gfetch<DriveFile>(`${API}/files/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    query: { fields: FILE_FIELDS, supportsAllDrives: true, ...extra },
    json: meta,
  });
}

export const renameFile = (id: string, name: string) => updateMeta(id, { name });
export const setFolderColor = (id: string, rgb: string) => updateMeta(id, { folderColorRgb: rgb });
export const trashFile = (id: string) => updateMeta(id, { trashed: true });
export const restoreFile = (id: string) => updateMeta(id, { trashed: false });
export const moveFile = (id: string, from: string, to: string) => updateMeta(id, {}, { addParents: to, removeParents: from });

/** Удалить насовсем (только своё: например, файл личных настроек). */
export async function deleteForever(id: string): Promise<void> {
  await gfetch(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE', query: { supportsAllDrives: true } });
}

export async function downloadFile(id: string): Promise<Uint8Array> {
  return gfetch<Uint8Array>(`${API}/files/${encodeURIComponent(id)}`, { query: { alt: 'media', supportsAllDrives: true }, as: 'bytes' });
}

function multipartBody(meta: unknown, data: Uint8Array, mimeType: string): { body: Blob; contentType: string } {
  const boundary = `da${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const body = new Blob([head, data as BlobPart, `\r\n--${boundary}--`]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

/** Загрузка по частям: если связь оборвалась, продолжаем ту же загрузку — копия не появится. */
async function resumable(method: 'POST' | 'PATCH', url: string, meta: unknown, data: Uint8Array, mimeType: string): Promise<DriveFile> {
  const start = await gfetch<Response>(url, {
    method,
    query: { uploadType: 'resumable', fields: FILE_FIELDS, supportsAllDrives: true },
    headers: { 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(data.length) },
    json: meta,
    as: 'response',
    retries: 3,
  });
  const session = start.headers.get('Location');
  if (!session) throw new GoogleError('other', 'Google не начал загрузку по частям.');
  let offset = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(session, {
        method: 'PUT',
        headers: offset ? { 'Content-Range': `bytes ${offset}-${data.length - 1}/${data.length}` } : {},
        body: data.subarray(offset) as BodyInit,
      });
      if (res.ok) return (await res.json()) as DriveFile;
      if (res.status !== 308 && res.status < 500) throw new GoogleError('other', `Загрузка прервана (код ${res.status}).`, res.status);
    } catch (e) {
      if (e instanceof GoogleError) throw e;
    }
    // Узнать, сколько уже дошло, и продолжить с этого места.
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    const st = await fetch(session, { method: 'PUT', headers: { 'Content-Range': `bytes */${data.length}` } }).catch(() => null);
    if (st?.ok) return (await st.json()) as DriveFile;
    const range = st?.headers.get('Range');
    offset = range ? Number(range.split('-')[1]) + 1 : 0;
  }
  throw new GoogleError('network', 'Не удалось загрузить файл: связь всё время обрывается.');
}

export interface UploadInput {
  name: string;
  parentId: string;
  data: Uint8Array;
  mimeType?: string;
  appProperties?: Record<string, string>;
}

/**
 * Загрузить новый файл. Если связь оборвалась после отправки, сначала проверяем, не появился ли файл
 * (то же имя и та же контрольная сумма в той же папке), и только потом повторяем — чтобы не плодить копии.
 */
export async function uploadFile(input: UploadInput): Promise<DriveFile> {
  const mimeType = input.mimeType || 'application/octet-stream';
  const meta = { name: input.name, parents: [input.parentId], ...(input.appProperties ? { appProperties: input.appProperties } : {}) };
  if (input.data.length > SIMPLE_LIMIT) return resumable('POST', `${UPLOAD}/files`, meta, input.data, mimeType);
  const sum = md5(input.data);
  for (let attempt = 0; ; attempt++) {
    const { body, contentType } = multipartBody(meta, input.data, mimeType);
    try {
      return await gfetch<DriveFile>(`${UPLOAD}/files`, {
        method: 'POST',
        query: { uploadType: 'multipart', fields: FILE_FIELDS, supportsAllDrives: true },
        headers: { 'Content-Type': contentType },
        body,
        retries: 0,
      });
    } catch (e) {
      if (!(e instanceof GoogleError) || !['network', 'server', 'rateLimit'].includes(e.kind) || attempt >= 3) throw e;
      if (e.kind !== 'rateLimit') {
        const same = (await listChildren(input.parentId).catch(() => [])).find((f) => f.name === input.name && f.md5Checksum === sum);
        if (same) return same;
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

/** Заменить содержимое файла (новая версия того же файла: ID и ссылки сохраняются). */
export async function updateContent(id: string, data: Uint8Array, mimeType = 'application/octet-stream', meta: DriveMeta = {}): Promise<DriveFile> {
  const url = `${UPLOAD}/files/${encodeURIComponent(id)}`;
  if (data.length > SIMPLE_LIMIT) return resumable('PATCH', url, meta, data, mimeType);
  const { body, contentType } = multipartBody(meta, data, mimeType);
  return gfetch<DriveFile>(url, {
    method: 'PATCH',
    query: { uploadType: 'multipart', fields: FILE_FIELDS, supportsAllDrives: true },
    headers: { 'Content-Type': contentType },
    body,
  });
}

/** Ответ одного запроса из пакета. */
export type BatchItem = { ok: true; file: DriveFile } | { ok: false; status: number; body: unknown };

/** Разобрать ответ пакетного запроса (multipart/mixed). Экспорт — для тестов. */
export function parseBatch(text: string, boundary: string): Map<string, { status: number; body: unknown }> {
  const out = new Map<string, { status: number; body: unknown }>();
  for (const part of text.split(`--${boundary}`)) {
    const id = /Content-ID:\s*<?response-([^>\s]+)>?/i.exec(part)?.[1];
    const st = /HTTP\/[\d.]+ (\d{3})/.exec(part);
    if (!id || !st) continue;
    const afterStatus = part.slice(st.index);
    const sep = afterStatus.search(/\r?\n\r?\n/);
    const raw = sep >= 0 ? afterStatus.slice(sep).trim() : '';
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      /* не JSON */
    }
    out.set(id, { status: Number(st[1]), body });
  }
  return out;
}

/** Сведения о многих файлах пакетами по 100 (лимит Google на пакет). */
export async function getMany(ids: string[], fields = FILE_FIELDS): Promise<Map<string, BatchItem>> {
  const out = new Map<string, BatchItem>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const boundary = `da_batch_${Date.now()}`;
    const body =
      chunk
        .map((id, n) => `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <${n}>\r\n\r\nGET /drive/v3/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true HTTP/1.1\r\n\r\n`)
        .join('') + `--${boundary}--`;
    const res = await gfetch<Response>(BATCH, { method: 'POST', headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` }, body, as: 'response' });
    const ct = res.headers.get('Content-Type') ?? '';
    const rb = /boundary=([^;]+)/.exec(ct)?.[1]?.replace(/"/g, '') ?? '';
    const parsed = parseBatch(await res.text(), rb);
    chunk.forEach((id, n) => {
      const r = parsed.get(String(n));
      if (r && r.status >= 200 && r.status < 300) out.set(id, { ok: true, file: r.body as DriveFile });
      else out.set(id, { ok: false, status: r?.status ?? 0, body: r?.body });
    });
  }
  return out;
}
