import { Archive, ArchiveRestore, ChevronRight, ClipboardCopy, Download, File, FileSpreadsheet, Folder, FolderOpen, HardDrive, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copySettings } from '@/core/settings/settingsExport';
import { backupWorkspace, lastBackupAt, restoreWorkspace } from '@/core/workspace/backup';
import { SYSTEM_DIR, type Workspace } from '@/core/workspace/workspace';
import { useWorkspace, useWorkspaceRevision } from '@/core/workspace/WorkspaceContext';
import { TABLE_EXTENSIONS } from '@/core/tables/formats';
import { extName, joinPath, splitPath, type FsEntry } from '@/core/storage/types';
import { downloadBytes, mimeFor, pickFiles } from '@/core/util/download';
import { formatBytes, formatDateTime } from '@/core/util/format';
import { Alert } from '@/ui/Alert';
import { useToast } from '@/ui/Toast';
import { WorkspaceChooser } from '@/ui/WorkspaceGate';

function FileBrowser() {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [dir, setDir] = useState('');
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [showSystem, setShowSystem] = useState(false);
  const rev = useWorkspaceRevision();

  useEffect(() => {
    if (!workspace) return;
    let alive = true;
    workspace.list(dir).then((e) => alive && setEntries(e));
    return () => {
      alive = false;
    };
  }, [workspace, dir, rev]);

  if (!workspace) return null;
  const crumbs = splitPath(dir);
  const visible = entries.filter((e) => showSystem || !e.name.startsWith('.'));

  const upload = async () => {
    const files = await pickFiles('', true);
    for (const f of files) await workspace.writeBytes(joinPath(dir, f.name), new Uint8Array(await f.arrayBuffer()));
    if (files.length) toast(`Загружено файлов: ${files.length}`);
  };

  const download = async (e: FsEntry) => {
    const bytes = await workspace.readBytes(e.path);
    if (bytes) downloadBytes(bytes, e.name, mimeFor(e.name));
  };

  const remove = async (e: FsEntry) => {
    if (!confirm(`Удалить «${e.name}»${e.kind === 'directory' ? ' со всем содержимым' : ''}?`)) return;
    await workspace.remove(e.path);
    toast(`Удалено: ${e.name}`);
  };

  return (
    <div className="stack">
      <div className="row">
        <nav className="row small" aria-label="Путь">
          <button className="btn btn--sm btn--ghost" onClick={() => setDir('')}>
            {workspace.label}
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="row">
              <ChevronRight size={14} className="faint" />
              <button className="btn btn--sm btn--ghost" onClick={() => setDir(crumbs.slice(0, i + 1).join('/'))}>
                {c}
              </button>
            </span>
          ))}
        </nav>
        <span className="spacer" />
        <label className="check small">
          <input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />
          Служебные файлы
        </label>
        <button className="btn btn--sm" onClick={upload}>
          <Upload size={16} /> Загрузить файлы
        </button>
      </div>
      {visible.length === 0 ? (
        <div className="card empty">Папка пуста. Загрузите сюда таблицы — их увидят все приложения.</div>
      ) : (
        <div className="list">
          {visible.map((e) => {
            const isTable = TABLE_EXTENSIONS.includes(extName(e.name));
            const Icon = e.kind === 'directory' ? Folder : isTable ? FileSpreadsheet : File;
            return (
              <div key={e.path} className="list__item">
                <Icon size={20} className={e.kind === 'directory' ? 'brand-icon' : 'faint'} />
                <div className="list__main">
                  {e.kind === 'directory' ? (
                    <button className="btn btn--ghost btn--sm" style={{ padding: 0 }} onClick={() => setDir(e.path)}>
                      <span className="list__title">{e.name}</span>
                    </button>
                  ) : (
                    <div className="list__title">{e.name}</div>
                  )}
                  {e.kind === 'file' && (
                    <div className="list__sub">
                      {formatBytes(e.size)} · {formatDateTime(e.lastModified)}
                    </div>
                  )}
                </div>
                {e.kind === 'file' && (
                  <button className="icon-btn" onClick={() => download(e)} aria-label={`Скачать ${e.name}`} data-tip="Скачать">
                    <Download size={18} />
                  </button>
                )}
                {e.name !== SYSTEM_DIR && (
                  <button className="icon-btn" onClick={() => remove(e)} aria-label={`Удалить ${e.name}`} data-tip="Удалить">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Копия всех данных в файл и восстановление — главное для «Хранилища браузера». */
function BackupCard({ ws }: { ws: Workspace }) {
  const toast = useToast();
  const rev = useWorkspaceRevision();
  const [last, setLast] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void lastBackupAt(ws).then(setLast);
  }, [ws, rev]);
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 86400000) : null;
  const save = async () => {
    setBusy(true);
    try {
      const { zip, count } = await backupWorkspace(ws);
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      downloadBytes(zip, `DocAssist-копия-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`, 'application/zip');
      toast(`Копия сохранена: файлов ${count}`);
    } catch (e) {
      toast(`Не удалось сохранить копию: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    const [file] = await pickFiles('.zip,application/zip', false);
    if (!file) return;
    if (!confirm(`Восстановить данные из «${file.name}»?\n\nФайлы с такими же именами будут заменены копией, остальные останутся.`)) return;
    setBusy(true);
    try {
      const n = await restoreWorkspace(ws, new Uint8Array(await file.arrayBuffer()));
      toast(`Восстановлено файлов: ${n}. Перезагрузите страницу, чтобы всё обновилось.`);
    } catch (e) {
      toast(`Не удалось восстановить: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card stack">
      <div className="section-title">
        <h2 style={{ margin: 0 }}>Копия всех данных в файл</h2>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Один .zip со всем, что есть в рабочей папке: таблицы, правки, проверки и настройки, база, переменные, словарь. Из него же
        можно восстановить данные — в этом или другом браузере, на другом компьютере.
        {ws.kind === 'browser' && ' Данные «Хранилища браузера» живут только в браузере — сохраняйте копию регулярно.'}
      </p>
      <div className="small">
        {last === undefined ? '…' : last ? `Последняя копия: ${formatDateTime(Date.parse(last))}${days !== null && days > 0 ? ` (${days} дн. назад)` : ''}` : 'Копию ещё не сохраняли.'}
      </div>
      {ws.kind === 'browser' && (last === null || (days !== null && days >= 7)) && <Alert kind="warning">Давно нет копии данных — сохраните её в файл.</Alert>}
      <div className="row">
        <button className="btn btn--primary" onClick={() => void save()} disabled={busy}>
          <Archive size={16} /> Сохранить копию в файл
        </button>
        <button className="btn" onClick={() => void restore()} disabled={busy}>
          <ArchiveRestore size={16} /> Восстановить из копии
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => void copySettings(ws).then((how) => toast(how === 'clipboard' ? 'Настройки скопированы' : 'Настройки скачаны файлом'))}
          data-tip="Временная кнопка: настройки приложений без переменных, словаря, базы и людей — чтобы отправить разработчику"
        >
          <ClipboardCopy size={16} /> Скопировать настройки
        </button>
      </div>
    </div>
  );
}

export function WorkspacePage() {
  const { status, fsSupported, openFolder, useBrowserStorage, close } = useWorkspace();

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <h1>Рабочая папка</h1>
        <p>Место, где лежат ваши файлы и данные приложений. Всё хранится только на этом устройстве.</p>
      </div>
      {status.state !== 'ready' ? (
        <WorkspaceChooser compact />
      ) : (
        <div className="stack stack--l">
          <div className="card stack">
            <div className="row">
              {status.ws.kind === 'browser' ? <HardDrive size={22} className="brand-icon" /> : <FolderOpen size={22} className="brand-icon" />}
              <div className="spacer">
                <strong>{status.ws.label}</strong>
                <div className="small muted">{status.ws.kind === 'browser' ? 'Хранилище внутри браузера' : 'Папка на компьютере'}</div>
              </div>
            </div>
            {status.ws.kind === 'browser' && (
              <Alert kind="info">
                Файлы хранятся внутри браузера. Если очистить данные сайта или удалить браузер, они пропадут — скачивайте
                важные результаты. На iPhone добавьте приложение на экран «Домой», чтобы iOS не удаляла данные.
              </Alert>
            )}
            <div className="row">
              {fsSupported && (
                <button className="btn" onClick={openFolder}>
                  <FolderOpen size={16} /> {status.ws.kind === 'browser' ? 'Перейти на папку компьютера' : 'Выбрать другую папку'}
                </button>
              )}
              {status.ws.kind !== 'browser' && (
                <button className="btn" onClick={useBrowserStorage}>
                  <HardDrive size={16} /> Хранилище браузера
                </button>
              )}
              <button className="btn btn--ghost" onClick={close}>
                Закрыть рабочую папку
              </button>
            </div>
          </div>
          <BackupCard ws={status.ws} />
          <section>
            <h2>Файлы</h2>
            <FileBrowser />
          </section>
        </div>
      )}
    </div>
  );
}
