import { useMemo } from 'react';
import type { Stamp } from '@/core/device/device';
import { defineDocType } from '@/core/schema/docType';
import { getDocStore, useDocStore } from '@/core/workspace/docStore';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import type { Workspace } from '@/core/workspace/workspace';
import { DRIVE_FILE, SECTIONS, type SectionId } from '../constants';

/*
 * «Личные дела» ↔ Google Диск.
 *
 * Личная папка на устройстве — рабочее хранилище приложения (своя структура). Google Диск — пространство, выданное
 * человеку для работы: там строгие правила, как всё хранится (имена, места, цвета папок), и туда приложение кладёт
 * данные только по этим правилам. Приложение не видит Диск целиком (узкий доступ drive.file), поэтому древо папок
 * человек ведёт сам: подключает выданную папку, создаёт папки внутри или привязывает существующие.
 *
 *   Личные дела/drive.json  ← этот файл: древо папок на Диске, правила оформления, какие файлы где лежат
 */

export { DRIVE_FILE };

export interface DriveNode {
  /** ID папки на Google Диске. */
  id: string;
  name: string;
  /** Родитель в древе (ID папки) или null — корень. */
  parent: string | null;
  /** Цвет папки на Диске (#rrggbb). */
  color?: string;
  /** Папка бойца. */
  personId?: string;
  /** Папка раздела бойца (Фотографии, Сканы…). */
  section?: SectionId;
  /** Создана приложением (иначе — привязана через окно Google). */
  created?: boolean;
  /** Что показала последняя проверка Диска. */
  state?: 'trashed' | 'missing';
}

export interface DriveFileLink {
  personId: string;
  /** ID файла на Диске. */
  id: string;
  /** Имя на Диске. */
  name: string;
  /** Папка на Диске (ID). */
  parent: string;
  mimeType?: string;
  size?: number;
  /** Контрольная сумма на Диске (последняя известная). */
  md5?: string;
  /** Кто и когда последним изменил на Диске. */
  remote?: Partial<Stamp>;
  /** Путь в личной папке на устройстве («Сканы/Паспорт.jpg»). Нет — файл ещё не скачан. */
  rel?: string;
  /** Контрольная сумма при последней сверке — у каждого устройства своя (номер устройства → сумма). */
  base?: Record<string, string>;
  /** Расхождение отложено: «сумма здесь|сумма на Диске». Пока они те же — не спрашивать снова. */
  dismissed?: string;
  state?: 'trashed' | 'missing';
}

export interface DriveRules {
  /** Имя папки бойца по данным: «{Фамилия} {Имя} {Отчество}». */
  personFolder: string;
  personColor?: string;
  /** Папки разделов на Диске: имя и цвет. */
  sections: Record<SectionId, { name: string; color?: string }>;
  /** Сканы на Диске называть по шаблону имени сканов (как «Переименовать по шаблону»). */
  scanNames: boolean;
}

export interface DriveDoc {
  /** Папка, выданная человеку, — корень древа. */
  root?: string;
  /** Где создавать папки бойцов (по умолчанию — в корне). */
  peopleParent?: string;
  nodes: DriveNode[];
  files: DriveFileLink[];
  rules: DriveRules;
  checkedAt?: string;
}

export const DEFAULT_RULES: DriveRules = {
  personFolder: '{Фамилия} {Имя} {Отчество}',
  personColor: '#4986e7',
  sections: Object.fromEntries(SECTIONS.map((s) => [s.id, { name: s.folder, color: s.id === 'scans' ? '#16a765' : s.id === 'photos' ? '#fad165' : '#8f8f8f' }])) as DriveRules['sections'],
  scanNames: true,
};

export const driveDocType = defineDocType<DriveDoc>({
  type: 'lichnye-dela/drive',
  version: 1,
  migrations: {},
  empty: () => ({ nodes: [], files: [], rules: DEFAULT_RULES }),
});

export function driveStore(ws: Workspace) {
  return getDocStore(ws, DRIVE_FILE, driveDocType);
}

export function useDriveDoc() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? driveStore(workspace) : null), [workspace]);
  const state = useDocStore(store);
  return { store, doc: state?.data ?? driveDocType.empty(), loaded: !!state?.loaded, readOnly: !!state?.tooNew || !!state?.broken };
}

// ---------- Древо ----------

export function childrenOf(doc: DriveDoc, parent: string | null): DriveNode[] {
  return doc.nodes.filter((n) => n.parent === parent).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Папка и всё, что внутри (ID). */
export function subtreeIds(doc: DriveDoc, id: string): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of doc.nodes) if (n.parent && out.has(n.parent) && !out.has(n.id)) (out.add(n.id), (grew = true));
  }
  return out;
}

/** Путь до папки: «Выданная папка / Отряд / Фамилия Имя». */
export function nodePath(doc: DriveDoc, id: string | undefined): DriveNode[] {
  const out: DriveNode[] = [];
  const seen = new Set<string>();
  for (let n = doc.nodes.find((x) => x.id === id); n && !seen.has(n.id); n = doc.nodes.find((x) => x.id === n!.parent)) {
    seen.add(n.id);
    out.unshift(n);
  }
  return out;
}

export function personNode(doc: DriveDoc, personId: string): DriveNode | undefined {
  return doc.nodes.find((n) => n.personId === personId && !n.section);
}

export function sectionNode(doc: DriveDoc, personFolder: string, section: SectionId): DriveNode | undefined {
  return doc.nodes.find((n) => n.parent === personFolder && n.section === section);
}

/** Раздел личной папки по пути файла («Сканы/x.jpg» → scans); файл в корне личной папки — null. */
export function sectionOfRel(rel: string): SectionId | null {
  const dir = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '';
  return SECTIONS.find((s) => s.folder === dir)?.id ?? null;
}

// ---------- Состояние файлов ----------

export type FileStatus =
  /** Только на устройстве — загрузить. */
  | 'local'
  /** Одинаково здесь и на Диске. */
  | 'synced'
  /** Изменён на устройстве — отправить. */
  | 'push'
  /** Изменён на Диске — взять. */
  | 'pull'
  /** Изменён и там, и там. */
  | 'conflict'
  /** Расхождение отложено человеком. */
  | 'kept'
  /** Только на Диске — скачать. */
  | 'remote'
  /** Совпадает, но на Диске другое имя, чем по правилам, — переименовать. */
  | 'rename'
  /** Удалён на устройстве после сверки. */
  | 'deleted'
  | 'trashed'
  | 'missing';

export interface LocalFile {
  rel: string;
  md5: string;
  size: number;
  lastModified: number;
}

export interface StatusRow {
  status: FileStatus;
  local?: LocalFile;
  link?: DriveFileLink;
  /** Файл на устройстве переименован — связь нужно перевесить на новый путь. */
  relinked?: boolean;
}

/**
 * Состояние файлов одного дела: что есть на устройстве и что известно о Диске.
 * desiredName — каким должно быть имя на Диске по правилам (для «rename»).
 */
export function personStatus(local: LocalFile[], links: DriveFileLink[], deviceId: string, desiredName?: (rel: string) => string): StatusRow[] {
  const rows: StatusRow[] = [];
  const byRel = new Map(links.filter((l) => l.rel).map((l) => [l.rel!, l]));
  const localRels = new Set(local.map((f) => f.rel));
  const used = new Set<DriveFileLink>();

  for (const f of local) {
    let link = byRel.get(f.rel);
    let relinked = false;
    if (!link) {
      // Переименован на устройстве: связь со старым путём, которого уже нет, и та же сумма.
      link = links.find((l) => !used.has(l) && (!l.rel || !localRels.has(l.rel)) && (l.base?.[deviceId] ?? l.md5) === f.md5);
      relinked = !!link;
    }
    if (!link) {
      rows.push({ status: 'local', local: f });
      continue;
    }
    used.add(link);
    const base = link.base?.[deviceId];
    let status: FileStatus;
    if (link.state) status = link.state;
    else if (link.md5 === f.md5) status = desiredName && link.name !== desiredName(f.rel) ? 'rename' : 'synced';
    else if (link.dismissed === `${f.md5}|${link.md5}`) status = 'kept';
    else if (base !== undefined && base === f.md5) status = 'pull';
    else if (base !== undefined && base === link.md5) status = 'push';
    else status = 'conflict';
    rows.push({ status, local: f, link, relinked });
  }
  for (const l of links) {
    if (used.has(l)) continue;
    rows.push({ status: l.state ?? (l.rel && l.base?.[deviceId] !== undefined ? 'deleted' : 'remote'), link: l });
  }
  return rows;
}

export const STATUS_TEXT: Record<FileStatus, string> = {
  local: 'Только на устройстве',
  synced: 'На Google Диске',
  push: 'Изменён здесь — отправить на Диск',
  pull: 'Изменён на Диске — взять',
  conflict: 'Изменён и здесь, и на Диске',
  kept: 'Отличается от Диска (оставлено как есть)',
  remote: 'Только на Google Диске',
  rename: 'На Диске имя не по правилам',
  deleted: 'Удалён здесь, остался на Диске',
  trashed: 'На Диске — в корзине',
  missing: 'Пропал с Диска (удалён или закрыт доступ)',
};
