import { ChevronRight, Download, File, FileSpreadsheet, Folder, FolderOpen, HardDrive, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SYSTEM_DIR } from '@/core/workspace/workspace';
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
          <section>
            <h2>Файлы</h2>
            <FileBrowser />
          </section>
        </div>
      )}
    </div>
  );
}
