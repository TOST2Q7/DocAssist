import { getDevice, makeStamp, type Stamp } from '@/core/device/device';
import type { ConflictChoice } from '@/core/device/sync';
import { drive, GoogleError, isFolder, md5, pick, runQueue, type DriveFile } from '@/core/google';
import { baseName, extName, joinPath, parentPath } from '@/core/storage/types';
import { mimeFor } from '@/core/util/download';
import type { DocStore } from '@/core/workspace/docStore';
import type { Workspace } from '@/core/workspace/workspace';
import { SECTION_BY_ID, SECTIONS, type SectionId } from '../constants';
import { casePath, type PersonCase } from '../model/cases';
import { personNode, sectionNode, sectionOfRel, subtreeIds, type DriveDoc, type DriveFileLink, type DriveNode, type LocalFile, type StatusRow } from './model';

/*
 * Действия с Google Диском для «Личных дел». Всё общение с Google — через блок src/core/google.
 * Массовые операции идут очередью (по 3), ошибка одного файла не останавливает остальные.
 */

type Store = DocStore<DriveDoc>;
const doc = (store: Store) => store.get().data;

// ---------- Метки «кто и когда» ----------

/** Метка изменения для файла на Диске (видна только приложению). */
function stampProps(s: Stamp): Record<string, string> {
  return { daAt: s.at, daDev: s.device.slice(0, 40), daDevId: s.deviceId.slice(0, 40) };
}

/** Кто и когда последним изменил файл на Диске: метка приложения, а если меняли мимо него — данные Google. */
export function remoteStamp(f: DriveFile): Partial<Stamp> {
  const a = f.appProperties;
  if (a?.daAt && f.modifiedTime && Math.abs(Date.parse(f.modifiedTime) - Date.parse(a.daAt)) < 120_000) return { at: a.daAt, device: a.daDev, deviceId: a.daDevId };
  const who = f.lastModifyingUser?.displayName;
  return { at: f.modifiedTime, device: who ? `${who} (Google Диск)` : 'Google Диск' };
}

function linkFrom(f: DriveFile, personId: string, extra: Partial<DriveFileLink> = {}): DriveFileLink {
  return {
    personId,
    id: f.id,
    name: f.name,
    parent: f.parents?.[0] ?? extra.parent ?? '',
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : undefined,
    md5: f.md5Checksum,
    remote: remoteStamp(f),
    ...extra,
  };
}

function putLink(store: Store, l: DriveFileLink) {
  store.update((d) => ({ ...d, files: [...d.files.filter((x) => x.id !== l.id), l] }));
}
function patchLink(store: Store, id: string, fn: (l: DriveFileLink) => DriveFileLink) {
  store.update((d) => ({ ...d, files: d.files.map((x) => (x.id === id ? fn(x) : x)) }));
}
function putNode(store: Store, n: DriveNode) {
  store.update((d) => ({ ...d, nodes: [...d.nodes.filter((x) => x.id !== n.id), n] }));
}
function patchNode(store: Store, id: string, patch: Partial<DriveNode>) {
  store.update((d) => ({ ...d, nodes: d.nodes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}
const withBase = (l: DriveFileLink, sum: string): Record<string, string> => ({ ...(l.base ?? {}), [getDevice().id]: sum });

// ---------- Файлы на устройстве ----------

const md5Cache = new Map<string, string>();

/** Файлы личной папки (корень и разделы) с контрольными суммами. Пакеты перевода не входят. */
export async function localFiles(ws: Workspace, c: PersonCase): Promise<LocalFile[]> {
  const out: LocalFile[] = [];
  const dirs = ['', ...SECTIONS.map((s) => s.folder)];
  for (const dir of dirs) {
    const entries = await ws.list(casePath(c, dir)).catch(() => []);
    for (const e of entries) {
      if (e.kind !== 'file') continue;
      const rel = dir ? joinPath(dir, e.name) : e.name;
      const st = e.size !== undefined && e.lastModified !== undefined ? { size: e.size, lastModified: e.lastModified } : await ws.stat(e.path);
      const key = `${e.path}|${st?.size}|${st?.lastModified}`;
      let sum = md5Cache.get(key);
      if (!sum) {
        const bytes = await ws.readBytes(e.path);
        if (!bytes) continue;
        sum = md5(bytes);
        md5Cache.set(key, sum);
      }
      out.push({ rel, md5: sum, size: st?.size ?? 0, lastModified: st?.lastModified ?? 0 });
    }
  }
  return out;
}

/** Запомнить то, что выяснилось при подсчёте: совпадающие файлы и переименования на устройстве. */
export function recordRows(store: Store, rows: StatusRow[]) {
  const dev = getDevice().id;
  for (const r of rows) {
    if (!r.link || !r.local) continue;
    const needBase = r.status === 'synced' && r.link.base?.[dev] !== r.local.md5;
    if (r.relinked || needBase) patchLink(store, r.link.id, (l) => ({ ...l, rel: r.local!.rel, ...(needBase ? { base: withBase(l, r.local!.md5) } : {}) }));
  }
}

// ---------- Древо папок ----------

/** Подключить папку, выданную для работы (окно выбора Google). */
export async function connectRoot(store: Store): Promise<DriveNode | null> {
  const [p] = await pick({ kind: 'folders', title: 'Выберите папку, выданную вам для работы' });
  if (!p) return null;
  const f = await drive.getFile(p.id);
  if (!f.capabilities?.canAddChildren) throw new GoogleError('permission', `В папке «${f.name}» у вас нет права добавлять файлы. Попросите админа выдать права редактора.`);
  const node: DriveNode = { id: f.id, name: f.name, parent: null, color: f.folderColorRgb };
  store.update((d) => (d.root === f.id ? d : { ...d, root: f.id, peopleParent: f.id, nodes: [node], files: [] }));
  return node;
}

/** Создать папку внутри (по правилам: имя и цвет). */
export async function createChild(store: Store, parentId: string, name: string, color?: string, extra: Partial<DriveNode> = {}): Promise<DriveNode> {
  const f = await drive.createFolder(name, parentId, color);
  const node: DriveNode = { id: f.id, name: f.name, parent: parentId, color: f.folderColorRgb ?? color, created: true, ...extra };
  putNode(store, node);
  return node;
}

/** Привязать существующие папки (окно выбора открывается в этой папке). */
export async function linkChildren(store: Store, parentId: string): Promise<DriveNode[]> {
  const picked = await pick({ kind: 'folders', multiple: true, parentId, title: 'Выберите папки, которые есть внутри' });
  const known = new Set(doc(store).nodes.map((n) => n.id));
  const out: DriveNode[] = [];
  for (const p of picked) {
    if (known.has(p.id)) continue;
    const f = await drive.getFile(p.id);
    const realParent = f.parents?.[0];
    const node: DriveNode = { id: f.id, name: f.name, parent: realParent && known.has(realParent) ? realParent : parentId, color: f.folderColorRgb };
    putNode(store, node);
    known.add(f.id);
    out.push(node);
  }
  return out;
}

export async function renameNode(store: Store, node: DriveNode, name: string): Promise<void> {
  const f = await drive.renameFile(node.id, name);
  patchNode(store, node.id, { name: f.name });
}

export async function colorNode(store: Store, node: DriveNode, color: string): Promise<void> {
  const f = await drive.setFolderColor(node.id, color);
  patchNode(store, node.id, { color: f.folderColorRgb ?? color });
}

/** Убрать из древа приложения (на Диске ничего не меняется). */
export function unlinkNode(store: Store, node: DriveNode): void {
  store.update((d) => {
    const ids = subtreeIds(d, node.id);
    return {
      ...d,
      root: d.root && ids.has(d.root) ? undefined : d.root,
      peopleParent: d.peopleParent && ids.has(d.peopleParent) ? undefined : d.peopleParent,
      nodes: d.nodes.filter((n) => !ids.has(n.id)),
      files: d.files.filter((f) => !ids.has(f.parent)),
    };
  });
}

/** В корзину на Диске и убрать из древа. */
export async function trashNode(store: Store, node: DriveNode): Promise<void> {
  await drive.trashFile(node.id);
  unlinkNode(store, node);
}

/** Папка — папка бойца (или снять отметку). Разделы внутри узнаются по именам из правил. */
export function assignPerson(store: Store, node: DriveNode, personId: string | null): void {
  store.update((d) => {
    const names = new Map(Object.entries(d.rules.sections).map(([id, s]) => [s.name.toLowerCase(), id as SectionId]));
    return {
      ...d,
      nodes: d.nodes.map((n) => {
        if (n.id === node.id) return { ...n, personId: personId ?? undefined, section: undefined };
        if (personId && n.personId === personId && !n.section) return { ...n, personId: undefined };
        if (n.parent === node.id) {
          const sec = personId ? names.get(n.name.toLowerCase()) : undefined;
          return { ...n, personId: sec ? personId! : undefined, section: sec };
        }
        return n;
      }),
    };
  });
}

/** Папка раздела бойца: есть — вернуть; видна приложению на Диске — привязать; нет — создать по правилам. */
async function ensureSection(store: Store, folder: DriveNode, section: SectionId): Promise<DriveNode> {
  const known = sectionNode(doc(store), folder.id, section);
  if (known && !known.state) return known;
  const rule = doc(store).rules.sections[section] ?? { name: SECTION_BY_ID[section].folder };
  const found = (await drive.listChildren(folder.id, true)).find((f) => f.name.toLowerCase() === rule.name.toLowerCase());
  if (found) {
    const node: DriveNode = { id: found.id, name: found.name, parent: folder.id, color: found.folderColorRgb, personId: folder.personId, section };
    putNode(store, node);
    return node;
  }
  return createChild(store, folder.id, rule.name, rule.color, { personId: folder.personId, section });
}

/** Создать папку бойца по правилам. */
export async function createPersonFolder(store: Store, personId: string, name: string, parentId: string): Promise<DriveNode> {
  const existing = personNode(doc(store), personId);
  if (existing && !existing.state) return existing;
  return createChild(store, parentId, name, doc(store).rules.personColor, { personId });
}

// ---------- Файлы ----------

export interface Progress {
  done: number;
  total: number;
}

export interface BatchReport {
  ok: number;
  failed: { name: string; error: unknown }[];
  skipped: string[];
}

function report<T>(items: T[], results: Awaited<ReturnType<typeof runQueue>>, nameOf: (t: T) => string, skipped: string[] = []): BatchReport {
  const failed: BatchReport['failed'] = [];
  let ok = 0;
  results.forEach((r, i) => (r.ok ? ok++ : failed.push({ name: nameOf(items[i]), error: r.error })));
  return { ok, failed, skipped };
}

/**
 * Отправить на Диск: новые файлы (по правилам: папка раздела, имя), изменённые здесь, имена не по правилам.
 * Совпадающий по содержимому файл, который уже есть на Диске у этого дела, повторно не загружается.
 */
export async function pushFiles(ws: Workspace, store: Store, c: PersonCase, rows: StatusRow[], nameFor: (rel: string) => string, onProgress?: (p: Progress) => void): Promise<BatchReport> {
  const folder = personNode(doc(store), c.personId);
  if (!folder) throw new GoogleError('other', 'Сначала выберите или создайте папку бойца на Google Диске.');
  const todo = rows.filter((r) => r.local && (r.status === 'local' || r.status === 'push' || r.status === 'rename'));
  const skipped: string[] = [];
  // Папки разделов — заранее и по одной, чтобы не появилось двух одинаковых.
  const sections = new Map<SectionId, DriveNode>();
  for (const r of todo) {
    const s = r.status === 'local' ? sectionOfRel(r.local!.rel) : null;
    if (s && !sections.has(s)) sections.set(s, await ensureSection(store, folder, s));
  }
  const items = todo.filter((r) => {
    if (r.status !== 'local') return true;
    const twin = doc(store).files.find((l) => l.personId === c.personId && l.md5 === r.local!.md5 && !l.state);
    if (twin) {
      skipped.push(`${baseName(r.local!.rel)} — такой файл уже есть на Диске: «${twin.name}»`);
      return false;
    }
    return true;
  });
  const results = await runQueue(
    items,
    async (r) => {
      const f = r.local!;
      const stamp = makeStamp();
      if (r.status === 'rename') {
        const g = await drive.renameFile(r.link!.id, nameFor(f.rel));
        patchLink(store, g.id, (l) => ({ ...l, name: g.name }));
        return;
      }
      const bytes = await ws.readBytes(casePath(c, f.rel));
      if (!bytes) throw new Error('Файл не найден на устройстве');
      if (r.status === 'push') {
        const g = await drive.updateContent(r.link!.id, bytes, mimeFor(f.rel), { appProperties: stampProps(stamp) });
        patchLink(store, g.id, (l) => ({ ...linkFrom(g, c.personId, { rel: f.rel }), base: withBase(l, f.md5), remote: stamp }));
        return;
      }
      const s = sectionOfRel(f.rel);
      const parent = s ? sections.get(s)!.id : folder.id;
      const g = await drive.uploadFile({ name: nameFor(f.rel), parentId: parent, data: bytes, mimeType: mimeFor(f.rel), appProperties: stampProps(stamp) });
      putLink(store, { ...linkFrom(g, c.personId, { rel: f.rel, parent }), base: { [getDevice().id]: f.md5 }, remote: stamp });
    },
    { onProgress: (done, total) => onProgress?.({ done, total }) },
  );
  return report(items, results, (r) => baseName(r.local!.rel), skipped);
}

/** Куда положить файл с Диска на устройстве: раздел по папке на Диске, иначе — в корень личной папки. */
function localDirFor(d: DriveDoc, l: DriveFileLink): string {
  const sec = d.nodes.find((n) => n.id === l.parent)?.section;
  return sec ? SECTION_BY_ID[sec].folder : '';
}

async function freeRel(ws: Workspace, c: PersonCase, dir: string, name: string): Promise<string> {
  const free = await ws.freeName(casePath(c, dir), name);
  return dir ? joinPath(dir, free) : free;
}

/** Взять с Диска: новые файлы (скачать в личную папку) и изменённые на Диске (заменить здесь). */
export async function pullFiles(ws: Workspace, store: Store, c: PersonCase, rows: StatusRow[], onProgress?: (p: Progress) => void): Promise<BatchReport & { added: string[] }> {
  const items = rows.filter((r) => r.link && (r.status === 'remote' || r.status === 'pull' || r.status === 'deleted'));
  const added: string[] = [];
  const results = await runQueue(
    items,
    async (r) => {
      const l = r.link!;
      const bytes = await drive.downloadFile(l.id);
      const sum = md5(bytes);
      const rel = r.status === 'pull' && r.local ? r.local.rel : await freeRel(ws, c, localDirFor(doc(store), l), l.name);
      await ws.writeBytes(casePath(c, rel), bytes);
      if (r.status !== 'pull') added.push(rel);
      patchLink(store, l.id, (x) => ({ ...x, rel, md5: x.md5 ?? sum, base: withBase(x, sum), dismissed: undefined }));
    },
    { onProgress: (done, total) => onProgress?.({ done, total }) },
  );
  return { ...report(items, results, (r) => r.link!.name), added };
}

/** Показать приложению файлы, которые на Диске появились мимо него (окно выбора в папке бойца), и скачать их. */
export async function importFromDrive(ws: Workspace, store: Store, c: PersonCase, parentId: string, fileIds?: string[]): Promise<BatchReport & { added: string[] }> {
  const picked = await pick({ kind: 'files', multiple: true, parentId: fileIds ? undefined : parentId, fileIds, title: 'Выберите файлы бойца на Google Диске' });
  const known = new Set(doc(store).files.map((f) => f.id));
  const rows: StatusRow[] = [];
  for (const p of picked) {
    if (p.mimeType === 'application/vnd.google-apps.folder') continue;
    const f = await drive.getFile(p.id);
    if (isFolder(f) || f.mimeType.startsWith('application/vnd.google-apps.')) continue;
    const link = known.has(f.id) ? { ...doc(store).files.find((x) => x.id === f.id)!, ...linkFrom(f, c.personId), state: undefined } : linkFrom(f, c.personId);
    putLink(store, link);
    if (!link.rel) rows.push({ status: 'remote', link });
  }
  return pullFiles(ws, store, c, rows);
}

/** Сверить известные приложению папки и файлы с Диском: имена, корзина, пропавшие, изменения. */
export async function checkDrive(store: Store): Promise<{ changed: number; missing: number; noAccess: number }> {
  const d = doc(store);
  const ids = [...d.nodes.map((n) => n.id), ...d.files.map((f) => f.id)];
  const res = await drive.getMany(ids);
  let changed = 0;
  let missing = 0;
  let noAccess = 0;
  store.update((x) => ({
    ...x,
    checkedAt: new Date().toISOString(),
    nodes: x.nodes.map((n) => {
      const r = res.get(n.id);
      if (!r) return n;
      if (!r.ok) {
        missing++;
        return { ...n, state: 'missing' };
      }
      return { ...n, name: r.file.name, color: r.file.folderColorRgb ?? n.color, state: r.file.trashed ? 'trashed' : undefined };
    }),
    files: x.files.map((l) => {
      const r = res.get(l.id);
      if (!r) return l;
      if (!r.ok) {
        const reason = (r.body as { error?: { errors?: { reason?: string }[] } })?.error?.errors?.[0]?.reason;
        if (reason === 'appNotAuthorizedToFile') noAccess++;
        else missing++;
        return { ...l, state: 'missing' };
      }
      const next = { ...linkFrom(r.file, l.personId, { rel: l.rel, base: l.base, dismissed: l.dismissed }), state: r.file.trashed ? ('trashed' as const) : undefined };
      if (next.md5 !== l.md5 || next.name !== l.name || next.parent !== l.parent) changed++;
      return next;
    }),
  }));
  return { changed, missing, noAccess };
}

/** Решения по расхождениям. */
export async function resolveConflicts(ws: Workspace, store: Store, c: PersonCase, rows: StatusRow[], choices: ConflictChoice[], nameFor: (rel: string) => string): Promise<void> {
  for (const ch of choices) {
    const r = rows.find((x) => x.link?.id === ch.id);
    if (!r?.link || !r.local) continue;
    if (ch.keep === 'local' && ch.overwrite) await pushFiles(ws, store, c, [{ ...r, status: 'push' }], nameFor);
    else if (ch.keep === 'remote' && ch.overwrite) await pullFiles(ws, store, c, [{ ...r, status: 'pull' }]);
    else if (ch.keep === 'both') {
      // Версия с Диска — рядом отдельным файлом; файл на устройстве останется и потом загрузится как новый.
      const ext = extName(r.local.rel);
      const stem = baseName(r.local.rel).slice(0, ext ? -(ext.length + 1) : undefined);
      const bytes = await drive.downloadFile(r.link.id);
      const rel = await freeRel(ws, c, parentPath(r.local.rel), `${stem} (с Диска)${ext ? `.${ext}` : ''}`);
      await ws.writeBytes(casePath(c, rel), bytes);
      patchLink(store, r.link.id, (l) => ({ ...l, rel, base: withBase(l, md5(bytes)), dismissed: undefined }));
    } else patchLink(store, r.link.id, (l) => ({ ...l, dismissed: `${r.local!.md5}|${l.md5}` }));
  }
}

/** Файл удалён на устройстве: убрать и на Диске (в корзину) или просто забыть связь. */
export async function dropLink(store: Store, link: DriveFileLink, trash: boolean): Promise<void> {
  if (trash) await drive.trashFile(link.id);
  store.update((d) => ({ ...d, files: d.files.filter((f) => f.id !== link.id) }));
}

/** Удалить файл на устройстве вместе с Диском — для кнопки «Удалить» в личной папке. */
export function linkOf(store: Store, personId: string, rel: string): DriveFileLink | undefined {
  return doc(store).files.find((f) => f.personId === personId && f.rel === rel);
}
