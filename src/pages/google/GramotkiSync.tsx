import { FileKey, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { drive, ensureToken, errorText, useGoogleAuth } from '@/core/google';
import { useGramotki } from '@/core/gramotka/react';
import { formatBytes } from '@/core/util/format';
import {
  forgetGramotkiBase,
  gramotkiSummaryText,
  remoteSize,
  resolveGramotki,
  runGramotkiSync,
  setGramotkiSync,
  setPendingGramotki,
  useGramotkiSync,
  usePendingGramotki,
  type GramotkaConflict,
  type GramotkaDecision,
} from '@/core/sync/gramotki';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { GramotkaMerge } from '@/ui/GramotkaMerge';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';

/*
 * Переключатель «Грамотки» в личных настройках на Google Диске: перенос грамоток между устройствами через личный
 * Диск. Показывает, сколько места это займёт; спорное (правили на обоих устройствах, удалили на одном) — решает человек.
 */

export function GramotkiSync() {
  const { workspace } = useWorkspace();
  const auth = useGoogleAuth();
  const { store, snap } = useGramotki();
  const enabled = useGramotkiSync();
  const toast = useToast();
  const conflicts = usePendingGramotki();
  const [local, setLocal] = useState<number | null>(null);
  const [quota, setQuota] = useState<{ usage: number; limit: number | null; ours: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (store) void store.diskSize().then(setLocal);
  }, [store, snap.rev]);
  useEffect(() => {
    if (!auth.signedIn) return setQuota(null);
    let alive = true;
    void Promise.all([drive.storageQuota(), remoteSize()])
      .then(([q, ours]) => alive && setQuota({ ...q, ours }))
      .catch(() => alive && setQuota(null));
    return () => {
      alive = false;
    };
  }, [auth.signedIn, busy]);

  const sync = async () => {
    if (!workspace) return;
    setBusy('Сверяю…');
    try {
      await ensureToken();
      const s = await runGramotkiSync(workspace, (d, t) => setBusy(`Сверяю: ${d} из ${t}`));
      if (!s) return;
      if (s.failed.length) toast(`Не получилось: ${s.failed.join('; ')}`);
      else toast(s.conflicts.length ? `Грамотки: нужно решить ${s.conflicts.length}.` : gramotkiSummaryText(s));
    } catch (e) {
      toast(`Грамотки не сверены: ${errorText(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const free = quota?.limit != null ? quota.limit - quota.usage : null;
  const tooBig = free !== null && local !== null && local - (quota?.ours ?? 0) > free;

  return (
    <div className="card card--flat stack stack--s" id="gramotki-sync">
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (e.target.checked) {
              const sizeText = local !== null ? ` Сейчас грамотки занимают ${formatBytes(local)}.` : '';
              if (
                !confirm(
                  `Переносить грамотки через ваш личный Google Диск?\n\nГрамотки — личные данные людей. На Диске они будут так же закрыты фразой грамоток, но займут место вашего Google-аккаунта (общее с почтой и фото).${sizeText}`,
                )
              )
                return;
            } else forgetGramotkiBase();
            setGramotkiSync(e.target.checked);
          }}
        />
        <span>
          <FileKey size={14} style={{ verticalAlign: '-2px' }} /> <strong>Грамотки</strong>
          <span className="muted"> — данные людей, фото и сканы. Закрыты фразой грамоток; переносятся отдельно от настроек.</span>
        </span>
      </label>
      <div className="small muted">
        Место: грамотки — {local === null ? '…' : formatBytes(local)}
        {quota && (
          <>
            {' '}
            · уже на Диске — {formatBytes(quota.ours)} · свободно на вашем Google Диске —{' '}
            {quota.limit === null ? 'без ограничения' : `${formatBytes(Math.max(0, free ?? 0))} из ${formatBytes(quota.limit)}`}
          </>
        )}
        {!auth.signedIn && ' · войдите в Google, чтобы увидеть свободное место'}
      </div>
      {tooBig && <Alert kind="warning">На Google Диске не хватит места для грамоток. Освободите место или не включайте перенос грамоток.</Alert>}
      {enabled && auth.signedIn && (
        <div className="row">
          <button className="btn btn--sm" disabled={!!busy || !workspace} onClick={() => void sync()}>
            {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} {busy ?? 'Сверить грамотки'}
          </button>
          {snap.status !== 'open' && <span className="small muted">Понадобится фраза грамоток.</span>}
        </div>
      )}
      {conflicts.length > 0 && store && (
        <GramotkiConflictDialog
          conflicts={conflicts}
          onClose={() => setPendingGramotki([])}
          onResolve={async (decisions) => {
            setBusy('Сохраняю решения…');
            try {
              await ensureToken();
              const r = await resolveGramotki(store, conflicts, decisions);
              setPendingGramotki([]);
              toast(r.failed.length ? `Не получилось: ${r.failed.join('; ')}` : gramotkiSummaryText(r));
            } catch (e) {
              toast(errorText(e));
            } finally {
              setBusy(null);
            }
          }}
        />
      )}
    </div>
  );
}

const TEXT: Record<GramotkaConflict['kind'], { what: string; yes: string; no: string }> = {
  diverged: { what: 'правили и здесь, и на другом устройстве', yes: '', no: '' },
  'deleted-here': { what: 'удалена на этом устройстве, но осталась на Google Диске', yes: 'Удалить и с Диска', no: 'Вернуть сюда' },
  'deleted-there': { what: 'пропала с Google Диска (удалили с другого устройства?), а здесь есть', yes: 'Удалить и здесь', no: 'Вернуть на Диск' },
  'sealed-there': { what: 'на другом устройстве передан другому мастеру, а здесь его правили после', yes: 'Принять передачу (здесь запечатать)', no: 'Оставить здесь и вернуть на Диск' },
};

function GramotkiConflictDialog({ conflicts, onResolve, onClose }: { conflicts: GramotkaConflict[]; onResolve: (d: GramotkaDecision[]) => Promise<void>; onClose: () => void }) {
  const [choice, setChoice] = useState<Record<string, Record<string, 'mine' | 'theirs'>>>({});
  // По умолчанию — ничего не терять: вернуть удалённое, оставить своё.
  const [yes, setYes] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const decisions: GramotkaDecision[] = conflicts.map((c) =>
      c.kind === 'diverged'
        ? { kind: 'diverged', id: c.id, choice: choice[c.id] ?? {} }
        : c.kind === 'sealed-there'
          ? { kind: 'sealed-there', id: c.id, accept: !!yes[c.id] }
          : { kind: c.kind, id: c.id, remove: !!yes[c.id] },
    );
    await onResolve(decisions);
    setBusy(false);
  };
  return (
    <Modal
      title="Грамотки: что оставить"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Решить позже
          </button>
          <span className="spacer" />
          <button className="btn btn--primary" onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />} Сохранить
          </button>
        </>
      }
    >
      <div className="stack">
        {conflicts.map((c) => (
          <div key={`${c.kind}:${c.id}`} className="card card--flat stack stack--s">
            <div>
              <strong>{c.title}</strong> — <span className="small">{TEXT[c.kind].what}.</span>
            </div>
            {c.kind === 'diverged' ? (
              <GramotkaMerge diff={c.prepared.diff} choice={choice[c.id] ?? {}} onChoice={(x) => setChoice((s) => ({ ...s, [c.id]: x }))} />
            ) : (
              <div className="row small">
                <label className="check">
                  <input type="radio" name={c.id} checked={!yes[c.id]} onChange={() => setYes((s) => ({ ...s, [c.id]: false }))} /> {TEXT[c.kind].no}
                </label>
                <label className="check">
                  <input type="radio" name={c.id} checked={!!yes[c.id]} onChange={() => setYes((s) => ({ ...s, [c.id]: true }))} /> {TEXT[c.kind].yes}
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
