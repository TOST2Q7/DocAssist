import { CloudCog, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatStamp } from '@/core/device/device';
import type { ConflictChoice } from '@/core/device/sync';
import { ensureToken, errorText, useGoogleAuth } from '@/core/google';
import { gramotkiSummaryText, gramotkiSyncEnabled, runGramotkiSync } from '@/core/sync/gramotki';
import {
  changePassword,
  forgetHere,
  hasRememberedKey,
  removeRemote,
  runSync,
  setPendingConflicts,
  setSyncPrefs,
  syncGroups,
  usePendingConflicts,
  useSyncPrefs,
  type SyncStep,
  type SyncSummary,
} from '@/core/sync/personal';
import { VaultError } from '@/core/vault/vault';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { ConflictDialog } from '@/ui/ConflictDialog';
import { useToast } from '@/ui/Toast';
import { GramotkiSync } from './GramotkiSync';
import { PasswordDialog } from './PasswordDialog';

export function summaryText(s: SyncSummary): string {
  const parts = [s.pulled && `получено с Диска: ${s.pulled}`, s.pushed && `отправлено на Диск: ${s.pushed}`, s.postponed && `отложено: ${s.postponed}`].filter(Boolean);
  return parts.length ? `Личные настройки сверены — ${parts.join(', ')}.` : 'Личные настройки сверены — всё совпадает.';
}

/** Личные настройки на личном Google Диске: включить, сверить, сменить пароль, удалить. И грамотки — по желанию. */
export function SyncPanel() {
  const { workspace } = useWorkspace();
  const auth = useGoogleAuth();
  const prefs = useSyncPrefs();
  const toast = useToast();
  const pending = usePendingConflicts();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState<{ mode: 'create' | 'enter' | 'change'; error?: string } | null>(null);
  const [remembered, setRemembered] = useState(false);
  useEffect(() => {
    void hasRememberedKey().then(setRemembered);
  }, [prefs, busy]);

  const groups = syncGroups(workspace);
  const chosen = new Set(prefs.groups ?? groups.filter((g) => g.default).map((g) => g.id));

  const handle = async (step: SyncStep) => {
    if (step.kind === 'need-password') return setPassword({ mode: step.exists ? 'enter' : 'create' });
    if (step.kind === 'conflicts') setPendingConflicts(step);
    else toast(summaryText(step.summary));
    // Настройки сверены — следом грамотки (если перенос включён на этом устройстве).
    if (workspace && gramotkiSyncEnabled()) {
      const g = await runGramotkiSync(workspace);
      if (g && !g.conflicts.length) toast(gramotkiSummaryText(g));
    }
  };

  const sync = async (opts: { password?: string; remember?: boolean } = {}) => {
    if (!workspace) return;
    setBusy(true);
    try {
      await ensureToken();
      const step = await runSync(workspace, opts);
      if (step.kind !== 'need-password') setPassword(null);
      await handle(step);
    } catch (e) {
      if (e instanceof VaultError && password) setPassword({ ...password, error: e.message });
      else toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (choices: ConflictChoice[]) => {
    if (!pending) return;
    setBusy(true);
    try {
      await ensureToken();
      toast(summaryText(await pending.resolve(choices)));
      setPendingConflicts(null);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const doChange = async (v: { password: string; oldPassword?: string; remember: boolean }) => {
    setBusy(true);
    try {
      await ensureToken();
      await changePassword(v.oldPassword?.trim() ? v.oldPassword : null, v.password, v.remember);
      setPassword(null);
      toast('Пароль сменён. На других устройствах введите новый пароль.');
    } catch (e) {
      setPassword({ mode: 'change', error: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Удалить личные настройки с Google Диска насовсем? На этом устройстве они останутся. На других устройствах подтягивать будет нечего.')) return;
    setBusy(true);
    try {
      await ensureToken();
      const had = await removeRemote();
      toast(had ? 'Личные настройки удалены с Google Диска.' : 'На Google Диске их и не было.');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" id="sync">
      <div className="section-title">
        <CloudCog size={18} className="brand-icon" />
        <h2 className="spacer" style={{ margin: 0 }}>
          Личные настройки на Google Диске
        </h2>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        По желанию: настройки сохраняются в ваш личный Google Диск одним файлом, закрытым паролем, — и подтягиваются на других устройствах при
        входе в Google. Без пароля файл не открыть никому, а забытый пароль восстановить нельзя. Грамотки (данные людей) — отдельным переключателем
        ниже: они закрыты своей фразой.
      </p>
      {!workspace && <Alert kind="info">Сначала откройте рабочую папку — настройки хранятся в ней.</Alert>}
      {workspace && (
        <>
          <div className="stack stack--s">
            <strong className="small">Что переносить</strong>
            {groups.map((g) => (
              <label key={g.id} className="check small">
                <input
                  type="checkbox"
                  checked={chosen.has(g.id)}
                  onChange={(e) => {
                    if (e.target.checked && g.personal && !confirm(`«${g.title}» — это личные данные людей. Они будут зашифрованы вашим паролем, но всё же уйдут на ваш Google Диск. Включить?`)) return;
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(g.id);
                    else next.delete(g.id);
                    setSyncPrefs({ groups: [...next] });
                  }}
                />
                <span>
                  {g.title}
                  {g.hint && <span className="muted"> — {g.hint}</span>}
                </span>
              </label>
            ))}
          </div>
          <GramotkiSync />
          <label className="check small">
            <input type="checkbox" checked={prefs.auto} onChange={(e) => setSyncPrefs({ auto: e.target.checked })} />
            Сверять при каждом входе в Google на этом устройстве
          </label>
          <div className="small muted">
            {prefs.enabled ? `Включено на этом устройстве. Последняя сверка: ${formatStamp(prefs.lastSync)}.` : 'На этом устройстве ещё не включено.'}
            {remembered ? ' Пароль запомнен здесь.' : ''}
          </div>
          {!auth.signedIn ? (
            <div className="small muted">Войдите в Google выше, чтобы сверить или включить.</div>
          ) : (
            <div className="row">
              <button className="btn btn--primary" disabled={busy} onClick={() => void sync()}>
                {busy ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} {prefs.enabled ? 'Сверить сейчас' : 'Включить и сверить'}
              </button>
              {prefs.enabled && (
                <button className="btn" disabled={busy} onClick={() => setPassword({ mode: 'change' })}>
                  <KeyRound size={16} /> Сменить пароль
                </button>
              )}
              {remembered && (
                <button className="btn btn--ghost" disabled={busy} onClick={() => void forgetHere().then(() => toast('Пароль забыт на этом устройстве.'))}>
                  Забыть пароль здесь
                </button>
              )}
              <button className="btn btn--ghost" disabled={busy} onClick={() => void remove()}>
                <Trash2 size={16} /> Удалить с Google Диска
              </button>
            </div>
          )}
          {pending && (
            <Alert kind="warning">
              Есть расхождения между этим устройством и Google Диском: {pending.conflicts.length}. Выберите, какие версии верные.
            </Alert>
          )}
        </>
      )}
      {password && (
        <PasswordDialog
          mode={password.mode}
          busy={busy}
          error={password.error}
          onClose={() => setPassword(null)}
          onSubmit={(v) => (password.mode === 'change' ? void doChange(v) : void sync({ password: v.password, remember: v.remember }))}
        />
      )}
      {pending && <ConflictDialog conflicts={pending.conflicts} onResolve={(c) => void resolve(c)} onClose={() => setPendingConflicts(null)} />}
    </section>
  );
}
