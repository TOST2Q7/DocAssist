import { ArrowRight, ArrowRightLeft, CheckCircle2, Download, Trash2 } from 'lucide-react';
import { fioText, usePeople, type PersonRecord } from '@/core/people/people';
import { downloadBytes } from '@/core/util/download';
import { formatDateTime } from '@/core/util/format';
import { listAllFiles } from '@/core/workspace/backup';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { writeZip } from '@/core/util/zip';
import { useToast } from '@/ui/Toast';
import { APP_ID } from '../constants';
import { safeName, type CasesApi, type TransferRecord } from '../model/cases';
import { applyTransfer } from '../model/transfer';

/** «Перевод состоялся»: новый отряд в данные бойцов и отметка в истории. */
export function useApplyTransfer(cases: CasesApi) {
  const people = usePeople();
  return (personIds: string[], transfer: Pick<TransferRecord, 'id' | 'to'>) => {
    let n = 0;
    for (const id of personIds) {
      const r = people.records.find((x) => x.id === id);
      if (!r) continue;
      people.put(applyTransfer(r.fields, transfer.to), APP_ID, id);
      cases.setTransferStatus(id, transfer.id, 'done');
      n++;
    }
    return n;
  };
}

/** Скачать папку пакета одним архивом. */
export function useDownloadFolder() {
  const { workspace } = useWorkspace();
  const toast = useToast();
  return async (folder: string, name: string) => {
    if (!workspace) return;
    const files = await listAllFiles(workspace, folder);
    if (!files.length) {
      toast('Папка пакета пуста или удалена');
      return;
    }
    const entries = [];
    for (const f of files) {
      const data = await workspace.readBytes(f.path);
      if (data) entries.push({ path: f.path.slice(folder.length + 1), data });
    }
    downloadBytes(writeZip(entries), `${safeName(name)}.zip`, 'application/zip');
  };
}

export const sideText = (s: { squad: string; branch: string }) => [s.squad, s.branch].filter(Boolean).join(', ') || '—';

export function TransfersView({ record, cases, onTransfer }: { record: PersonRecord; cases: CasesApi; onTransfer: () => void }) {
  const toast = useToast();
  const apply = useApplyTransfer(cases);
  const download = useDownloadFolder();
  const c = cases.get(record.id);
  const list = [...(c?.transfers ?? [])].reverse();
  const squad = record.fields['rso.squad'];

  return (
    <div className="stack">
      <div className="card stack stack--s">
        <div className="row">
          <div className="spacer">
            <strong>Оформить перевод</strong>
            <div className="small muted">
              Сейчас: {squad ? `отряд ${squad}` : 'отряд не указан'}
              {record.fields['rso.branch'] ? `, ${record.fields['rso.branch']}` : ''}. Документы о переводе, таблица со всеми данными, фото 3×4 и сканы —
              одним архивом и в личную папку.
            </div>
          </div>
          <button className="btn btn--primary" onClick={onTransfer} disabled={cases.readOnly}>
            <ArrowRightLeft size={16} /> Оформить перевод
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="card empty small">Переводов ещё не было.</div>
      ) : (
        <div className="list">
          {list.map((t) => (
            <div key={t.id} className="list__item list__item--col">
              <div className="row">
                <strong>{t.date}</strong>
                <span className="row small">
                  {sideText(t.from)} <ArrowRight size={14} /> {sideText(t.to)}
                </span>
                <span className="spacer" />
                {t.status === 'done' ? <span className="badge badge--updated">состоялся</span> : <span className="badge badge--beta">готовится</span>}
              </div>
              <div className="small muted">
                {t.reason ? `в связи с ${t.reason} · ` : ''}
                {t.group ? `вместе с другими (${t.group} чел.) · ` : ''}пакет собран {formatDateTime(t.createdAt)}
                {t.doneAt ? ` · отмечен ${formatDateTime(t.doneAt)}` : ''}
                {t.folder ? ` · ${t.folder}` : ''}
              </div>
              <div className="row">
                {t.status === 'prepared' && (
                  <button
                    className="btn btn--sm btn--primary"
                    disabled={cases.readOnly}
                    onClick={() => {
                      if (!confirm(`Перевод состоялся?\n\nВ данные бойца запишется: отряд ${t.to.squad || '(без изменений)'}${t.to.branch ? `, ${t.to.branch}` : ''}${t.to.position ? `, должность ${t.to.position}` : ''}.`)) return;
                      apply([record.id], t);
                      toast(`${fioText(record.fields)}: новый отряд записан`);
                    }}
                  >
                    <CheckCircle2 size={14} /> Перевод состоялся
                  </button>
                )}
                {t.folder && (
                  <button className="btn btn--sm" onClick={() => void download(t.folder!, `Перевод — ${fioText(record.fields)} — ${t.date}`)}>
                    <Download size={14} /> Скачать пакет
                  </button>
                )}
                <button
                  className="btn btn--sm btn--ghost"
                  disabled={cases.readOnly}
                  onClick={() => confirm('Удалить запись о переводе из истории?\nПапка с документами останется.') && cases.removeTransfer(record.id, t.id)}
                >
                  <Trash2 size={14} /> Удалить запись
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
