import { CloudCog, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatStamp } from '@/core/device/device';
import type { ConflictChoice } from '@/core/device/sync';
import { ensureToken, errorText, useGoogleAuth } from '@/core/google';
import {
  changePhrase,
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
import { PhraseDialog } from './PhraseDialog';

export function summaryText(s: SyncSummary): string {
  const parts = [s.pulled && `получено с Диска: ${s.pulled}`, s.pushed && `отправлено на Диск: ${s.pushed}`, s.postponed && `отложено: ${s.postponed}`].filter(Boolean);
  return parts.length ? `Личные настройки сверены — ${parts.join(', ')}.` : 'Личные настройки сверены — всё совпадает.';
}

/** Личные настройки на личном Google Диске: включить, сверить, сменить фразу, удалить. */
export function SyncPanel() {
  const { workspace } = useWorkspace();
  const auth = useGoogleAuth();
  const prefs = useSyncPrefs();
  const toast = useToast();
  const pending = usePendingConflicts();
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState<{ mode: 'create' | 'enter' | 'change'; error?: string } | null>(null);
  const [remembered, setRemembered] = useState(false);
  useEffect(() => {
    void hasRememberedKey().then(setRemembered);
  }, [prefs, busy]);

  const groups = syncGroups(workspace);
  const chosen = new Set(prefs.groups ?? groups.filter((g) => g.default).map((g) => g.id));

  const handle = (step: SyncStep) => {
    if (step.kind === 'need-phrase') setPhrase({ mode: step.exists ? 'enter' : 'create' });
    else if (step.kind === 'conflicts') setPendingConflicts(step);
    else toast(summaryText(step.summary));
  };

  const sync = async (opts: { phrase?: string; remember?: boolean } = {}) => {
    if (!workspace) return;
    setBusy(true);
    try {
      await ensureToken();
      const step = await runSync(workspace, opts);
      if (step.kind !== 'need-phrase') setPhrase(null);
      handle(step);
    } catch (e) {
      if (e instanceof VaultError && phrase) setPhrase({ ...phrase, error: e.message });
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

  const doChange = async (v: { phrase: string; oldPhrase?: string; remember: boolean }) => {
    setBusy(true);
    try {
      await ensureToken();
      await changePhrase(v.oldPhrase?.trim() ? v.oldPhrase : null, v.phrase, v.remember);
      setPhrase(null);
      toast('Фраза сменена. На других устройствах введите новую фразу.');
    } catch (e) {
      setPhrase({ mode: 'change', error: errorText(e) });
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
        По желанию: настройки сохраняются в ваш личный Google Диск одним файлом, закрытым контрольной фразой, — и подтягиваются на других
        устройствах при входе в Google. Без фразы файл не открыть никому, а забытую фразу восстановить нельзя.
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
                    if (e.target.checked && g.personal && !confirm(`«${g.title}» — это личные данные людей. Они будут зашифрованы вашей фразой, но всё же уйдут на ваш Google Диск. Включить?`)) return;
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
          <label className="check small">
            <input type="checkbox" checked={prefs.auto} onChange={(e) => setSyncPrefs({ auto: e.target.checked })} />
            Сверять при каждом входе в Google на этом устройстве
          </label>
          <div className="small muted">
            {prefs.enabled ? `Включено на этом устройстве. Последняя сверка: ${formatStamp(prefs.lastSync)}.` : 'На этом устройстве ещё не включено.'}
            {remembered ? ' Фраза запомнена здесь.' : ''}
          </div>
          {!auth.signedIn ? (
            <div className="small muted">Войдите в Google выше, чтобы сверить или включить.</div>
          ) : (
            <div className="row">
              <button className="btn btn--primary" disabled={busy} onClick={() => void sync()}>
                {busy ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} {prefs.enabled ? 'Сверить сейчас' : 'Включить и сверить'}
              </button>
              {prefs.enabled && (
                <button className="btn" disabled={busy} onClick={() => setPhrase({ mode: 'change' })}>
                  <KeyRound size={16} /> Сменить фразу
                </button>
              )}
              {remembered && (
                <button className="btn btn--ghost" disabled={busy} onClick={() => void forgetHere().then(() => toast('Фраза забыта на этом устройстве.'))}>
                  Забыть фразу здесь
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
      {phrase && (
        <PhraseDialog
          mode={phrase.mode}
          busy={busy}
          error={phrase.error}
          onClose={() => setPhrase(null)}
          onSubmit={(v) => (phrase.mode === 'change' ? void doChange(v) : void sync({ phrase: v.phrase, remember: v.remember }))}
        />
      )}
      {pending && <ConflictDialog conflicts={pending.conflicts} onResolve={(c) => void resolve(c)} onClose={() => setPendingConflicts(null)} />}
    </section>
  );
}
