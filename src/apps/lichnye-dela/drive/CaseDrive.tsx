import { AlertTriangle, CheckCircle2, Cloud, CloudDownload, CloudOff, CloudUpload, ExternalLink, FileText, FolderPlus, Link2, Loader2, PenLine, RefreshCw, Trash2 } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatStamp, getDevice } from '@/core/device/device';
import type { Conflict, ConflictChoice } from '@/core/device/sync';
import { ensureToken, errorText, folderUrl, googleAvailability, pick, useGoogleAuth } from '@/core/google';
import type { PersonRecord } from '@/core/people/people';
import { formatBytes } from '@/core/util/format';
import { useVariables } from '@/core/variables/variables';
import { useWorkspace, useWorkspaceRevision } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { ConflictDialog } from '@/ui/ConflictDialog';
import { GoogleBar } from '@/ui/GoogleBar';
import { useToast } from '@/ui/Toast';
import { guessScanKind } from '../constants';
import { casePath, type CasesApi, type PersonCase } from '../model/cases';
import { useTemplates } from '../model/templates';
import { isImageName } from '../model/transfer';
import { useObjectUrl } from '../ui/hooks';
import { createPersonFolder, dropLink, importFromDrive, linkOf, localFiles, pullFiles, pushFiles, recordRows, resolveConflicts, checkDrive, assignPerson, type BatchReport, type Progress } from './engine';
import { nodePath, personNode, personStatus, sectionOfRel, STATUS_TEXT, useDriveDoc, type DriveNode, type FileStatus, type StatusRow } from './model';
import { makeNameFor, personFolderName } from './names';

/*
 * Google Диск в личной папке бойца: панель сверки и значки у файлов.
 * Миниатюры — только из файлов на устройстве; файл, который есть лишь на Диске, показывается значком типа.
 */

interface DriveCtx {
  statusOf: (rel: string) => FileStatus | undefined;
  /** Файл удалён на устройстве — спросить, убрать ли его и с Диска. */
  onRemoved: (rel: string) => Promise<void>;
}
const Ctx = createContext<DriveCtx>({ statusOf: () => undefined, onRemoved: async () => {} });
export const useDriveMarks = () => useContext(Ctx);

const ICON: Partial<Record<FileStatus, typeof Cloud>> = {
  synced: CheckCircle2,
  kept: CheckCircle2,
  local: CloudOff,
  push: CloudUpload,
  rename: PenLine,
  pull: CloudDownload,
  conflict: AlertTriangle,
  trashed: AlertTriangle,
  missing: AlertTriangle,
};
const TONE: Partial<Record<FileStatus, string>> = { synced: 'sec--ok', kept: 'sec--info', conflict: 'sec--warn', trashed: 'sec--warn', missing: 'sec--fail' };

/** Значок состояния файла относительно Google Диска. */
export function DriveMark({ rel }: { rel: string }) {
  const s = useDriveMarks().statusOf(rel);
  if (!s) return null;
  const Icon = ICON[s] ?? Cloud;
  return (
    <span className={`dela-drive-mark ${TONE[s] ?? 'faint'}`} data-tip={STATUS_TEXT[s]} aria-label={STATUS_TEXT[s]}>
      <Icon size={14} />
    </span>
  );
}

function reportText(r: BatchReport, verb: string): string {
  const parts = [`${verb}: ${r.ok}`];
  if (r.skipped.length) parts.push(`пропущено: ${r.skipped.length}`);
  if (r.failed.length) parts.push(`не получилось: ${r.failed.length} (${r.failed.map((f) => `${f.name} — ${errorText(f.error)}`).join('; ')})`);
  return parts.join(', ');
}

/** Миниатюра для расхождения — только если файл есть на устройстве и это картинка. */
function useLocalImage(c: PersonCase, rel?: string) {
  return useObjectUrl(rel && isImageName(rel) ? casePath(c, rel) : null);
}

function ConflictsFor({ c, rows, onResolve, onClose }: { c: PersonCase; rows: StatusRow[]; onResolve: (ch: ConflictChoice[]) => void; onClose: () => void }) {
  const first = useLocalImage(c, rows.length === 1 ? rows[0].local?.rel : undefined);
  const conflicts: Conflict[] = rows.map((r) => ({
    id: r.link!.id,
    title: r.local!.rel,
    allowBoth: true,
    local: { stamp: { at: new Date(r.local!.lastModified || Date.now()).toISOString(), device: getDevice().name, deviceId: getDevice().id }, details: formatBytes(r.local!.size), imageUrl: first ?? undefined },
    remote: { stamp: r.link!.remote, details: `${r.link!.name}${r.link!.size ? `, ${formatBytes(r.link!.size)}` : ''}` },
  }));
  return <ConflictDialog conflicts={conflicts} onResolve={onResolve} onClose={onClose} />;
}

/**
 * Сверка личной папки с Google Диском. Оборачивает разделы личной папки: даёт им значки состояния файлов
 * и спрашивает при удалении файла, убрать ли его и с Диска.
 */
export function CaseDrive({ c, record, cases, children, onOpenDriveTab }: { c: PersonCase; record: PersonRecord; cases: CasesApi; children: ReactNode; onOpenDriveTab: () => void }) {
  const { workspace } = useWorkspace();
  const rev = useWorkspaceRevision(c.folder);
  const auth = useGoogleAuth();
  const toast = useToast();
  const vars = useVariables();
  const templates = useTemplates();
  const { store, doc } = useDriveDoc();
  const [rows, setRows] = useState<StatusRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [resolving, setResolving] = useState(false);
  const [parent, setParent] = useState<string>('');
  const av = googleAvailability();
  const folder = personNode(doc, c.personId);
  const links = useMemo(() => doc.files.filter((f) => f.personId === c.personId), [doc.files, c.personId]);
  const nameFor = useMemo(() => makeNameFor(doc, c, record, templates.scanName, vars.items), [doc, c, record, templates.scanName, vars.items]);

  useEffect(() => {
    if (!workspace || !folder) {
      setRows(null);
      return;
    }
    let alive = true;
    void localFiles(workspace, c).then((local) => {
      if (!alive) return;
      const r = personStatus(local, links, getDevice().id, nameFor);
      setRows(r);
      if (store) recordRows(store, r);
    });
    return () => {
      alive = false;
    };
  }, [workspace, c, folder, links, nameFor, rev, store]);

  const statusMap = useMemo(() => new Map((rows ?? []).filter((r) => r.local).map((r) => [r.local!.rel, r.status])), [rows]);
  const ctx: DriveCtx = {
    statusOf: (rel) => statusMap.get(rel),
    onRemoved: async (rel) => {
      const l = store && linkOf(store, c.personId, rel);
      if (!l || !store) return;
      if (!confirm(`«${l.name}» есть и на Google Диске. Убрать его и оттуда (в корзину Диска)?`)) return;
      try {
        await ensureToken();
        await dropLink(store, l, true);
        toast('Убрано и с Google Диска (в корзину).');
      } catch (e) {
        toast(errorText(e));
      }
    },
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!workspace || !store) return;
    setBusy(label);
    try {
      await ensureToken();
      await fn();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const count = (...s: FileStatus[]) => (rows ?? []).filter((r) => s.includes(r.status));
  const toPush = count('local', 'push', 'rename');
  const renames = count('rename');
  const toPull = count('remote', 'pull');
  const conflicts = count('conflict');
  const deleted = count('deleted');
  const broken = count('trashed', 'missing');
  const remoteOnly = count('remote');
  const synced = count('synced', 'kept');

  const candidates = doc.nodes.filter((n) => !n.section && !n.personId && !n.state);
  const parentId = parent || doc.peopleParent || doc.root || '';
  const path = folder ? nodePath(doc, folder.id) : [];

  let panel: ReactNode;
  if (!av.ok || !auth.signedIn) panel = <GoogleBar hint="Войдите в Google, чтобы сверить личную папку с Google Диском." />;
  else if (!doc.root)
    panel = (
      <div className="card card--flat row">
        <Cloud size={18} className="faint" />
        <span className="spacer small">Папка на Google Диске ещё не подключена.</span>
        <button className="btn btn--sm" onClick={onOpenDriveTab}>
          Подключить во вкладке «Google Диск»
        </button>
      </div>
    );
  else if (!folder)
    panel = (
      <div className="card card--flat stack stack--s">
        <div className="row">
          <Cloud size={18} className="brand-icon" />
          <strong className="spacer">Папки бойца на Google Диске ещё нет</strong>
        </div>
        <div className="row">
          <span className="small muted">Создать «{personFolderName(doc, record, c, vars.items)}» в</span>
          <select className="select select--sm" value={parentId} onChange={(e) => setParent(e.target.value)} aria-label="Где создать">
            {candidates.map((n) => (
              <option key={n.id} value={n.id}>
                {nodePath(doc, n.id)
                  .map((x) => x.name)
                  .join(' / ')}
              </option>
            ))}
          </select>
          <button
            className="btn btn--sm btn--primary"
            disabled={!!busy || !parentId}
            onClick={() =>
              void run('create', async () => {
                const n = await createPersonFolder(store!, c.personId, personFolderName(doc, record, c, vars.items), parentId);
                toast(`Создана папка «${n.name}» на Google Диске`);
              })
            }
          >
            <FolderPlus size={14} /> Создать по правилам
          </button>
          <button
            className="btn btn--sm"
            disabled={!!busy}
            onClick={() =>
              void run('link', async () => {
                const [p] = await pick({ kind: 'folders', parentId, title: 'Выберите папку бойца' });
                if (!p) return;
                const existing = doc.nodes.find((n) => n.id === p.id);
                const node: DriveNode = existing ?? { id: p.id, name: p.name, parent: parentId };
                if (!existing) store!.update((d) => ({ ...d, nodes: [...d.nodes, node] }));
                assignPerson(store!, node, c.personId);
                toast(`Папка «${p.name}» привязана к бойцу`);
              })
            }
          >
            <Link2 size={14} /> Выбрать существующую
          </button>
        </div>
      </div>
    );
  else
    panel = (
      <div className="card card--flat stack stack--s">
        <div className="row">
          <Cloud size={18} className="brand-icon" />
          <span className="spacer small">
            Google Диск:{' '}
            <a href={folderUrl(folder.id)} target="_blank" rel="noreferrer">
              {path.map((n) => n.name).join(' / ')} <ExternalLink size={12} />
            </a>
          </span>
          <button className="btn btn--sm btn--ghost" disabled={!!busy} onClick={() => void run('check', async () => void (await checkDrive(store!)))} data-tip="Сверить с Диском: имена, корзина, изменения">
            {busy === 'check' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Проверить Диск
          </button>
        </div>
        {folder.state && <Alert kind="warning">Папка бойца на Диске {folder.state === 'trashed' ? 'в корзине' : 'пропала или к ней закрыт доступ'}. Выберите или создайте её заново во вкладке «Google Диск».</Alert>}
        {rows === null ? (
          <div className="small muted">Считаю файлы…</div>
        ) : (
          <div className="row small">
            <span className="chip">
              <CheckCircle2 size={12} className="sec--ok" /> на Диске: {synced.length}
            </span>
            {toPush.length - renames.length > 0 && <span className="chip">отправить: {toPush.length - renames.length}</span>}
            {renames.length > 0 && (
              <span className="chip" data-tip="Имя на Диске не по правилам оформления — переименуется при отправке">
                переименовать на Диске: {renames.length}
              </span>
            )}
            {toPull.length > 0 && <span className="chip">взять с Диска: {toPull.length}</span>}
            {conflicts.length > 0 && <span className="chip chip--error">расхождения: {conflicts.length}</span>}
          </div>
        )}
        <div className="row">
          <button
            className="btn btn--sm btn--primary"
            disabled={!!busy || !toPush.length}
            onClick={() =>
              void run('push', async () => {
                const r = await pushFiles(workspace!, store!, c, toPush, nameFor, setProgress);
                toast(reportText(r, 'Отправлено на Google Диск'));
                r.skipped.forEach((s) => toast(s));
              })
            }
          >
            {busy === 'push' ? <Loader2 size={14} className="spin" /> : <CloudUpload size={14} />} Отправить на Диск{toPush.length ? ` (${toPush.length})` : ''}
          </button>
          <button
            className="btn btn--sm"
            disabled={!!busy || !toPull.length}
            onClick={() =>
              void run('pull', async () => {
                const r = await pullFiles(workspace!, store!, c, toPull, setProgress);
                for (const rel of r.added) if (sectionOfRel(rel) === 'scans') guessKind(cases, c, rel);
                toast(reportText(r, 'Получено с Google Диска'));
              })
            }
          >
            {busy === 'pull' ? <Loader2 size={14} className="spin" /> : <CloudDownload size={14} />} Взять с Диска{toPull.length ? ` (${toPull.length})` : ''}
          </button>
          {conflicts.length > 0 && (
            <button className="btn btn--sm" disabled={!!busy} onClick={() => setResolving(true)}>
              <AlertTriangle size={14} /> Решить расхождения ({conflicts.length})
            </button>
          )}
          <button
            className="btn btn--sm btn--ghost"
            disabled={!!busy}
            onClick={() =>
              void run('import', async () => {
                const r = await importFromDrive(workspace!, store!, c, folder.id);
                for (const rel of r.added) if (sectionOfRel(rel) === 'scans') guessKind(cases, c, rel);
                if (r.ok || r.failed.length) toast(reportText(r, 'Подключено файлов с Диска'));
              })
            }
            data-tip="Файлы, которые положили на Диск мимо приложения: выберите их в окне Google — они скачаются в личную папку"
          >
            <Link2 size={14} /> Показать файлы с Диска
          </button>
        </div>
        {progress && (
          <div className="small muted">
            {progress.done} из {progress.total}…
            <progress value={progress.done} max={progress.total} style={{ width: '100%' }} />
          </div>
        )}
        {remoteOnly.length > 0 && (
          <details>
            <summary className="small">Только на Google Диске: {remoteOnly.length}</summary>
            <div className="list" style={{ marginTop: 6 }}>
              {remoteOnly.map((r) => (
                <div key={r.link!.id} className="list__item">
                  <FileText size={20} className="faint" />
                  <div className="list__main">
                    <div className="list__title">{r.link!.name}</div>
                    <div className="list__sub">
                      {[r.link!.size && formatBytes(r.link!.size), formatStamp(r.link!.remote)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
        {deleted.length > 0 && (
          <div className="stack stack--s">
            <strong className="small">Удалены на устройстве, но есть на Диске: {deleted.length}</strong>
            {deleted.map((r) => (
              <div key={r.link!.id} className="row small">
                <span className="spacer">{r.link!.name}</span>
                <button className="btn btn--sm" disabled={!!busy} onClick={() => void run('del', async () => dropLink(store!, r.link!, true))}>
                  <Trash2 size={14} /> Убрать и с Диска
                </button>
                <button className="btn btn--sm" disabled={!!busy} onClick={() => void run('del', async () => void (await pullFiles(workspace!, store!, c, [r])))}>
                  <CloudDownload size={14} /> Скачать снова
                </button>
                <button className="btn btn--sm btn--ghost" disabled={!!busy} onClick={() => void dropLink(store!, r.link!, false)}>
                  Забыть
                </button>
              </div>
            ))}
          </div>
        )}
        {broken.length > 0 && (
          <div className="stack stack--s">
            <strong className="small">Что-то не так на Диске: {broken.length}</strong>
            {broken.map((r) => (
              <div key={r.link!.id} className="row small">
                <span className="spacer">
                  {r.link!.name} — {STATUS_TEXT[r.status].toLowerCase()}
                </span>
                {r.local && (
                  <button className="btn btn--sm" disabled={!!busy} onClick={() => void run('re', async () => void (dropLink(store!, r.link!, false), toast('Связь убрана — файл можно отправить на Диск заново.')))}>
                    <CloudUpload size={14} /> Загрузить заново
                  </button>
                )}
                <button
                  className="btn btn--sm btn--ghost"
                  disabled={!!busy}
                  onClick={() =>
                    void run('show', async () => {
                      const res = await importFromDrive(workspace!, store!, c, folder.id, [r.link!.id]);
                      if (!res.ok) toast('Файл не выбран — возможно, он действительно удалён.');
                    })
                  }
                  data-tip="Если файл есть, но не показан приложению (например, его загрузил коллега)"
                >
                  Показать приложению
                </button>
                <button className="btn btn--sm btn--ghost" disabled={!!busy} onClick={() => void dropLink(store!, r.link!, false)}>
                  Забыть
                </button>
              </div>
            ))}
          </div>
        )}
        {doc.checkedAt && <div className="small faint">Диск проверен: {formatStamp({ at: doc.checkedAt })}</div>}
      </div>
    );

  return (
    <Ctx.Provider value={ctx}>
      {panel}
      {children}
      {resolving && (
        <ConflictsFor
          c={c}
          rows={conflicts}
          onClose={() => setResolving(false)}
          onResolve={(choices) => {
            setResolving(false);
            void run('resolve', async () => {
              await resolveConflicts(workspace!, store!, c, conflicts, choices, nameFor);
              toast('Расхождения решены.');
            });
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/** Скан, пришедший с Диска: угадать, что это, по имени (если ещё не подписан). */
function guessKind(cases: CasesApi, c: PersonCase, rel: string) {
  const kind = guessScanKind(rel.split('/').pop() ?? rel);
  if (kind && !c.files[rel]?.kind) cases.setFileNote(c.personId, rel, { kind });
}

