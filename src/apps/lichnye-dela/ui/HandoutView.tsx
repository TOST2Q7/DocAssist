import { Download, ExternalLink, FolderOutput, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { HANDOUT_FOLDER, removeFromHandout, takeBack, useHandoutIndex, type HandoutItem } from '@/core/handout/handout';
import { baseName, joinPath, parentPath, type FsEntry } from '@/core/storage/types';
import { downloadBytes, mimeFor } from '@/core/util/download';
import { formatBytes, formatDateTime, todayStamp } from '@/core/util/format';
import { writeZip } from '@/core/util/zip';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Menu } from '@/ui/Menu';
import { useToast } from '@/ui/Toast';
import { APP_ID } from '../constants';
import { casePath, type CasesApi } from '../model/cases';
import { isImageName } from '../model/transfer';
import { Preview, Thumb } from './files';
import { openFile, useFolderFiles } from './hooks';

/*
 * «Для выдачи» — временная папка в рабочей папке: файлы, которые нужно отдать или куда-то загрузить.
 * Отсюда их скачивают (по одному или архивом), а потом папку очищают. Перемещённое из личной папки можно вернуть.
 */
export function HandoutView({ cases }: { cases: CasesApi }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const files = useFolderFiles(HANDOUT_FOLDER);
  const index = useHandoutIndex();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = files ?? [];
  const moved = list.map((e) => index.get(e.name)).filter((x): x is HandoutItem => !!x?.moved);

  /** Вернуть файл: из личного дела — в нынешнюю папку этого человека и с прежней подписью. */
  const giveBack = async (item: HandoutItem): Promise<string> => {
    if (!workspace) throw new Error('Рабочая папка не открыта');
    const m = item.meta ?? {};
    const c = item.source === APP_ID && m.personId ? cases.get(m.personId) : undefined;
    if (c && m.rel) {
      const to = await takeBack(workspace, item, casePath(c, parentPath(m.rel)));
      const rel = joinPath(parentPath(m.rel), baseName(to));
      if (m.kind || m.title) cases.setFileNote(c.personId, rel, { kind: m.kind, title: m.title });
      return to;
    }
    return takeBack(workspace, item);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(`Не получилось: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const download = async (e: FsEntry) => {
    const bytes = await workspace?.readBytes(e.path);
    if (bytes) downloadBytes(bytes, e.name, mimeFor(e.name));
  };
  const downloadAll = () =>
    run(async () => {
      if (!workspace) return;
      const entries = [];
      for (const e of list) {
        const data = await workspace.readBytes(e.path);
        if (data) entries.push({ path: e.name, data });
      }
      downloadBytes(writeZip(entries), `${HANDOUT_FOLDER} ${todayStamp()}.zip`, 'application/zip');
    });
  const returnAll = () =>
    run(async () => {
      for (const item of moved) await giveBack(item);
      toast(`Возвращено на место: ${moved.length}`);
    });
  const clear = () => {
    if (!workspace) return;
    const warn = moved.length ? `\n\n${moved.length} из них перемещены из личных папок — после очистки их не останется нигде. Нужные сначала верните на место.` : '';
    if (!confirm(`Удалить все файлы из «${HANDOUT_FOLDER}» (${list.length})?${warn}`)) return;
    void run(async () => {
      await removeFromHandout(
        workspace,
        list.map((e) => e.name),
      );
      toast(`Папка «${HANDOUT_FOLDER}» очищена`);
    });
  };

  return (
    <div className="stack">
      <div className="card stack stack--s">
        <div className="row">
          <FolderOutput size={20} className="brand-icon" />
          <strong className="spacer">Папка «{HANDOUT_FOLDER}»</strong>
          <button className="btn btn--sm" onClick={() => void downloadAll()} disabled={busy || !list.length}>
            <Download size={14} /> Скачать всё архивом
          </button>
          {moved.length > 0 && (
            <button className="btn btn--sm" onClick={() => void returnAll()} disabled={busy || cases.readOnly}>
              <RotateCcw size={14} /> Вернуть всё на место
            </button>
          )}
          <button className="btn btn--sm btn--danger" onClick={clear} disabled={busy || !list.length}>
            <Trash2 size={14} /> Очистить
          </button>
        </div>
        <span className="small muted">
          Временная папка в рабочей папке — для файлов, которые нужно отдать или куда-то загрузить. Сюда попадают сканы, отправленные из личных
          папок бойцов; на компьютере папку видно в Проводнике. Отдали — очистите.
        </span>
      </div>
      {files === null ? (
        <div className="loading">Загрузка…</div>
      ) : !list.length ? (
        <div className="card empty small">Пусто. Отметьте сканы в личной папке бойца и нажмите «В „{HANDOUT_FOLDER}“».</div>
      ) : (
        <div className="list dela-handout">
          {list.map((e) => {
            const item = index.get(e.name);
            const where = item ? [item.who, item.label].filter(Boolean).join(' · ') : '';
            return (
              <div key={e.path} className="list__item">
                <Thumb path={e.path} onClick={() => (isImageName(e.name) ? setPreview(e.path) : workspace && void openFile(workspace, e.path))} />
                <div className="list__main">
                  <div className="list__title dela-break">{e.name}</div>
                  <div className="list__sub">
                    {where && `${where} · `}
                    {item ? `${item.moved ? 'перемещён' : 'скопирован'} ${formatDateTime(item.at)}` : 'положен вручную'} · {formatBytes(e.size)}
                  </div>
                </div>
                <Menu
                  label={`Действия с файлом «${e.name}»`}
                  actions={[
                    { label: 'Открыть', icon: <ExternalLink size={16} />, onClick: () => (isImageName(e.name) ? setPreview(e.path) : workspace && void openFile(workspace, e.path)) },
                    { label: 'Скачать', icon: <Download size={16} />, onClick: () => void download(e) },
                    ...(item?.moved
                      ? [
                          {
                            label: 'Вернуть на место',
                            icon: <RotateCcw size={16} />,
                            disabled: busy || cases.readOnly,
                            onClick: () => void run(async () => toast(`Возвращено в личную папку: ${baseName(await giveBack(item))}`)),
                          },
                        ]
                      : []),
                    {
                      label: 'Удалить',
                      icon: <Trash2 size={16} />,
                      disabled: busy,
                      onClick: () => {
                        if (!workspace) return;
                        const msg = item?.moved ? `Удалить «${e.name}»?\n\nФайл перемещён из личной папки — после удаления его не останется нигде.` : `Удалить «${e.name}» из «${HANDOUT_FOLDER}»?`;
                        if (confirm(msg)) void run(async () => removeFromHandout(workspace, [e.name]));
                      },
                    },
                  ]}
                />
              </div>
            );
          })}
        </div>
      )}
      {preview && <Preview path={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
