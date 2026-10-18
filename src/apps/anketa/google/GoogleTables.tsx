import { Loader2, Sheet } from 'lucide-react';
import { useState } from 'react';
import { formatStamp } from '@/core/device/device';
import { ensureToken, errorText, googleAvailability, prepareGoogle, preparePicker, sheets, useGoogleAuth } from '@/core/google';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import { importSheet, pickSpreadsheet, useSheetLinks } from './sheetLink';

/** Кнопка «Из Google Таблиц»: выбрать таблицу и лист, прочитать и открыть в проверке. */
export function OpenGoogleSheet({ onOpen }: { onOpen: (path: string) => void }) {
  const { workspace } = useWorkspace();
  const auth = useGoogleAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [choose, setChoose] = useState<sheets.SpreadsheetInfo | null>(null);
  if (!googleAvailability().ok) return null;

  const open = async (info: sheets.SpreadsheetInfo, sheetTitle: string) => {
    if (!workspace) return;
    setBusy(true);
    try {
      await ensureToken();
      onOpen(await importSheet(workspace, info, sheetTitle));
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="btn"
        disabled={busy || (auth.signedIn ? false : !auth.ready)}
        onMouseEnter={() => void Promise.all([prepareGoogle(), preparePicker()]).catch(() => undefined)}
        onClick={async () => {
          setBusy(true);
          try {
            await ensureToken();
            const info = await pickSpreadsheet();
            if (!info) return;
            if (info.sheets.length > 1) setChoose(info);
            else await open(info, info.sheets[0]?.title ?? 'Лист1');
          } catch (e) {
            toast(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
        data-tip="Открыть Google Таблицу: исправления потом можно записать обратно в неё"
      >
        {busy ? <Loader2 size={16} className="spin" /> : <Sheet size={16} />} Из Google Таблиц
      </button>
      {choose && (
        <Modal title={`Какой лист проверять — «${choose.title}»`} onClose={() => setChoose(null)}>
          <div className="list">
            {choose.sheets.map((sh) => (
              <button
                key={sh.sheetId}
                className="list__item"
                onClick={() => {
                  setChoose(null);
                  void open(choose, sh.title);
                }}
              >
                <Sheet size={20} className="brand-icon" />
                <div className="list__main">
                  <div className="list__title">{sh.title}</div>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Таблицы, открытые из Google (снимки в рабочей папке). */
export function GoogleTablesList({ onOpen, sessions }: { onOpen: (path: string) => void; sessions: Set<string> }) {
  const { links } = useSheetLinks();
  const entries = Object.entries(links);
  if (!entries.length) return null;
  return (
    <div className="stack stack--s">
      <strong className="small">Из Google Таблиц</strong>
      <div className="list">
        {entries.map(([path, l]) => (
          <button key={path} className="list__item" onClick={() => onOpen(path)}>
            <Sheet size={22} className="brand-icon" />
            <div className="list__main">
              <div className="list__title">
                {l.title} — {l.sheetTitle}
              </div>
              <div className="list__sub">
                Прочитана: {formatStamp(l.readAt)}
                {l.lastWrite ? ` · записано: ${formatStamp(l.lastWrite)}` : ''}
              </div>
            </div>
            {sessions.has(path.split('/').pop() ?? '') && <span className="badge badge--beta">есть сохранённые правки</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
