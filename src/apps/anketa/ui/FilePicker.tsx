import { ClipboardPaste, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TABLE_EXTENSIONS } from '@/core/tables/formats';
import { extName, type FsEntry } from '@/core/storage/types';
import { pickFiles } from '@/core/util/download';
import { formatBytes, formatDateTime } from '@/core/util/format';
import { useWorkspace, useWorkspaceRevision } from '@/core/workspace/WorkspaceContext';
import { useToast } from '@/ui/Toast';
import { APP_FOLDER } from '../constants';

export function FilePicker({ onOpen, onPaste }: { onOpen: (path: string) => void; onPaste: () => void }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const rev = useWorkspaceRevision();
  const [files, setFiles] = useState<FsEntry[] | null>(null);
  const [sessions, setSessions] = useState<Set<string>>(new Set());
  // Браузер не сообщает о файлах, добавленных в папку через Проводник, — список можно перечитать вручную.
  const [manual, setManual] = useState(0);

  useEffect(() => {
    if (!workspace) return;
    let alive = true;
    (async () => {
      const root = await workspace.list('');
      const sess = await workspace.list(`${APP_FOLDER}/sessions`);
      if (!alive) return;
      setFiles(root.filter((e) => e.kind === 'file' && TABLE_EXTENSIONS.includes(extName(e.name))));
      setSessions(new Set(sess.map((s) => s.name.replace(/\.json$/, ''))));
    })();
    return () => {
      alive = false;
    };
  }, [workspace, rev, manual]);

  const upload = async () => {
    if (!workspace) return;
    const picked = await pickFiles(TABLE_EXTENSIONS.map((e) => '.' + e).join(','), true);
    for (const f of picked) await workspace.writeBytes(f.name, new Uint8Array(await f.arrayBuffer()));
    if (picked.length === 1) {
      toast(`Таблица «${picked[0].name}» добавлена в рабочую папку`);
      onOpen(picked[0].name);
    } else if (picked.length) toast(`Добавлено таблиц: ${picked.length}`);
  };

  return (
    <div className="stack">
      <div className="row">
        <div className="spacer">
          <h2 style={{ margin: 0 }}>Выберите таблицу с анкетами</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Таблицы из рабочей папки (Excel или CSV). Одна строка — один человек, столбцы — его данные. Можно вставить строки
            из Excel через <kbd>Ctrl</kbd>+<kbd>V</kbd>.
          </p>
        </div>
        <button className="btn" onClick={() => setManual((n) => n + 1)} aria-label="Обновить список" data-tip="Обновить список">
          <RefreshCw size={16} />
        </button>
        <button className="btn" onClick={onPaste}>
          <ClipboardPaste size={16} /> Вставить из буфера
        </button>
        <button className="btn btn--primary" onClick={upload}>
          <Upload size={16} /> Добавить таблицу
        </button>
      </div>
      {files === null ? (
        <div className="loading">Читаем рабочую папку…</div>
      ) : files.length === 0 ? (
        <div className="card empty stack">
          <FileSpreadsheet size={32} className="faint" style={{ margin: '0 auto' }} />
          <div>В рабочей папке пока нет таблиц.</div>
          <div className="small">Нажмите «Добавить таблицу», вставьте строки через Ctrl+V или положите файл .xlsx/.csv в папку на компьютере.</div>
        </div>
      ) : (
        <div className="list">
          {files.map((f) => (
            <button key={f.path} className="list__item" onClick={() => onOpen(f.path)}>
              <FileSpreadsheet size={22} className="brand-icon" />
              <div className="list__main">
                <div className="list__title">{f.name}</div>
                <div className="list__sub">
                  {formatBytes(f.size)} · {formatDateTime(f.lastModified)}
                </div>
              </div>
              {sessions.has(f.name) && <span className="badge badge--beta">есть сохранённые правки</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
