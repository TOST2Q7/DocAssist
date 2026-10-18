import { CloudUpload, ExternalLink, Loader2, RefreshCw, Sheet } from 'lucide-react';
import { useState } from 'react';
import { formatStamp, getDevice, makeStamp } from '@/core/device/device';
import type { Conflict, ConflictChoice } from '@/core/device/sync';
import { drive, ensureToken, errorText, googleAvailability, sheets, useGoogleAuth } from '@/core/google';
import { FIELD_BY_ID } from '@/core/schema/fields';
import type { TableData } from '@/core/tables/tables';
import { plural } from '@/core/util/format';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { ConflictDialog } from '@/ui/ConflictDialog';
import { GoogleBar } from '@/ui/GoogleBar';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import { remapSession, type AnketaSession } from '../model/session';
import { mapRows, planWrite, refreshSnapshot, useSheetLinks, type WritePlan } from './sheetLink';

interface SessionApi {
  session: AnketaSession;
  readOnly: boolean;
  replace: (fn: (s: AnketaSession) => AnketaSession) => void;
  setCell: (row: number, col: number, value: string, orig: string) => void;
}

/** Полоса Google Таблицы над проверкой: обновить из таблицы, записать исправления, открыть в Google. */
export function GoogleSheetBar({ path, table, columns, names, s }: { path: string; table: TableData; columns: (string | null)[]; names: string[]; s: SessionApi }) {
  const { workspace } = useWorkspace();
  const { links, store } = useSheetLinks();
  const auth = useGoogleAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<(WritePlan & { theirs?: { at?: string; device?: string } }) | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const link = links[path];
  if (!link) return null;
  const edits = Object.values(s.session.edits).reduce((n, r) => n + Object.keys(r).length, 0);

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!workspace) return;
    setBusy(label);
    try {
      await ensureToken();
      await fn();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  /** Перечитать таблицу: снимок обновится, правки и пометки переедут к тем же людям, записанное — уберётся. */
  const refresh = async () => {
    const next = await refreshSnapshot(workspace!, path, link);
    const map = mapRows(table.rows, next.rows, columns);
    s.replace((sess) => {
      const moved = remapSession(sess, map);
      const edits: AnketaSession['edits'] = {};
      for (const [r, cols] of Object.entries(moved.edits)) {
        const row: Record<string, (typeof cols)[string]> = {};
        for (const [c, e] of Object.entries(cols)) {
          const now = next.rows[Number(r)]?.[Number(c)] ?? '';
          // Уже записано в таблицу — правка больше не нужна.
          if (now !== e.value) row[c] = e;
        }
        if (Object.keys(row).length) edits[r] = row;
      }
      return { ...moved, edits };
    });
    const lost = table.rows.length - map.size;
    toast(`Таблица обновлена из Google.${lost > 0 ? ` Не нашлось в таблице: ${lost} ${plural(lost, ['анкета', 'анкеты', 'анкет'])} — их правки и пометки сняты.` : ''}`);
  };

  const prepareWrite = () =>
    run('plan', async () => {
      const [current, meta] = await Promise.all([sheets.readSheet(link.spreadsheetId, link.sheetTitle), drive.getFile(link.spreadsheetId).catch(() => null)]);
      const p = planWrite(table, columns, s.session, current);
      const theirs = meta ? { at: meta.modifiedTime, device: meta.lastModifyingUser?.displayName ? `${meta.lastModifyingUser.displayName} (Google Таблица)` : 'Google Таблица' } : undefined;
      setPlan({ ...p, theirs });
      if (p.conflicts.length) {
        setConflicts(
          p.conflicts.map((c) => ({
            id: `${c.tableRow}:${c.col}`,
            title: `${names[c.tableRow] || `Анкета ${c.tableRow + 1}`} — ${FIELD_BY_ID.get(columns[c.col] ?? '')?.label ?? table.headers[c.col]} (строка ${c.sheetRow})`,
            local: { stamp: { at: c.at, device: getDevice().name, deviceId: getDevice().id }, details: `Здесь: «${c.mine}» (было «${c.orig}»)` },
            remote: { stamp: theirs, details: `В таблице: «${c.theirs}»` },
          })),
        );
      }
    });

  const write = (choices: ConflictChoice[]) =>
    run('write', async () => {
      if (!plan) return;
      const extra = plan.conflicts.filter((c) => choices.find((x) => x.id === `${c.tableRow}:${c.col}` && x.keep === 'local' && x.overwrite));
      for (const c of plan.conflicts) {
        const ch = choices.find((x) => x.id === `${c.tableRow}:${c.col}`);
        // Верно то, что в таблице, — взять это значение и здесь.
        if (ch?.keep === 'remote' && ch.overwrite) s.setCell(c.tableRow, c.col, c.theirs, table.rows[c.tableRow]?.[c.col] ?? '');
      }
      const cells = [...plan.writes, ...extra.map((c) => ({ row: c.sheetRow, col: c.col, value: c.mine }))];
      const n = await sheets.writeCells(link.spreadsheetId, link.sheetTitle, cells);
      store?.update((d) => ({ links: { ...d.links, [path]: { ...d.links[path], lastWrite: makeStamp(), written: n } } }));
      setPlan(null);
      toast(`Записано в Google Таблицу: ${n} ${plural(n, ['ячейка', 'ячейки', 'ячеек'])}.`);
      await refresh();
    });

  if (!googleAvailability().ok || !auth.signedIn) return <GoogleBar hint={`Таблица «${link.title}» из Google. Войдите в Google, чтобы обновить её или записать исправления.`} />;

  return (
    <div className="card card--flat row gsheet-bar">
      <Sheet size={18} className="brand-icon" />
      <span className="spacer small">
        Google Таблица «{link.title}», лист «{link.sheetTitle}». Прочитана: {formatStamp(link.readAt)}
        {link.lastWrite ? ` · записано: ${formatStamp(link.lastWrite)}` : ''}
      </span>
      <a className="btn btn--sm btn--ghost" href={sheets.spreadsheetUrl(link.spreadsheetId, link.url)} target="_blank" rel="noreferrer">
        <ExternalLink size={14} /> Открыть
      </a>
      <button className="btn btn--sm" disabled={!!busy || s.readOnly} onClick={() => void run('refresh', refresh)} data-tip="Прочитать таблицу заново; правки и пометки останутся у тех же людей">
        {busy === 'refresh' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Обновить из Google
      </button>
      <button className="btn btn--sm btn--primary" disabled={!!busy || !edits || s.readOnly} onClick={() => void prepareWrite()}>
        {busy === 'plan' || busy === 'write' ? <Loader2 size={14} className="spin" /> : <CloudUpload size={14} />} Записать исправления ({edits})
      </button>
      {plan && !conflicts && (
        <Modal
          title="Записать исправления в Google Таблицу"
          onClose={() => setPlan(null)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setPlan(null)}>
                Отмена
              </button>
              <span className="spacer" />
              <button className="btn btn--primary" disabled={!!busy || !(plan.writes.length || plan.conflicts.length)} onClick={() => void write([])}>
                Записать
              </button>
            </>
          }
        >
          <div className="stack stack--s small">
            <div>
              Будет записано: <strong>{plan.writes.length}</strong> {plural(plan.writes.length, ['ячейка', 'ячейки', 'ячеек'])} — одним запросом, как текст (ведущие нули и даты не
              изменятся). Остальное в таблице не трогается.
            </div>
            {plan.already > 0 && <div className="muted">Уже совпадает с таблицей: {plan.already}.</div>}
            {plan.missing.length > 0 && (
              <div className="field__warn">
                Не нашлись в таблице (удалены или изменено ФИО): {plan.missing.map((r) => names[r] || `анкета ${r + 1}`).join(', ')} — их исправления не записываются.
              </div>
            )}
          </div>
        </Modal>
      )}
      {conflicts && (
        <ConflictDialog
          conflicts={conflicts}
          remote={{ in: 'в Google Таблице', from: 'из Google Таблицы' }}
          onClose={() => {
            setConflicts(null);
            setPlan(null);
          }}
          onResolve={(choices) => {
            setConflicts(null);
            void write(choices);
          }}
        />
      )}
    </div>
  );
}
