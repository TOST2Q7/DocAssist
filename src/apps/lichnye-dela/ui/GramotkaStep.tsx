import { Check, KeyRound, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MergeChoice } from '@/core/gramotka/compare';
import { FormatError } from '@/core/gramotka/format';
import { useGramotki } from '@/core/gramotka/react';
import { errorText, type Incoming, type Prepared } from '@/core/gramotka/store';
import { fioText } from '@/core/people/people';
import { Alert } from '@/ui/Alert';
import { GramotkaMerge } from '@/ui/GramotkaMerge';
import { showGramotki } from '@/ui/GramotkiDialog';

/*
 * Пункт окна «Новый файл» для грамотки: временный ключ (если это перевод от другого мастера) → кто внутри
 * и что будет (новый боец, обновление, копии разошлись) → «Принять». Сами проверки и шифрование — в ядре.
 */

export interface Accepted {
  id: string;
  fio: string;
  how: 'added' | 'replaced' | 'merged' | 'kept';
}

const ORDER_TEXT: Record<Prepared['order'], string> = {
  new: 'Боец появится в вашем списке.',
  newer: 'Этот боец у вас уже есть — пришедшая копия новее. Ваша заменится ею.',
  older: 'Этот боец у вас уже есть, и ваша копия новее пришедшей. Ничего не изменится.',
  same: 'Этот боец у вас уже есть — копии одинаковые. Ничего не изменится.',
  diverged: 'Этот боец у вас уже есть, но копии разошлись: правили и у вас, и в пришедшей.',
};

export function GramotkaStep({ file, onAccepted }: { file: File; onAccepted: (r: Accepted) => void }) {
  const { store, snap } = useGramotki();
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [info, setInfo] = useState<Incoming | null>(null);
  const [code, setCode] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [choice, setChoice] = useState<MergeChoice>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = snap.status === 'open';

  useEffect(() => {
    let alive = true;
    setBytes(null);
    setInfo(null);
    setPrepared(null);
    setCode('');
    setError(null);
    void file.arrayBuffer().then((b) => alive && setBytes(new Uint8Array(b)));
    return () => {
      alive = false;
    };
  }, [file]);

  // Что за файл: свой (временный ключ не нужен) или перевод.
  useEffect(() => {
    if (!bytes || !store || !open) return;
    try {
      const i = store.inspect(bytes);
      setInfo(i);
      if (i.own) void run(() => store.prepare(bytes).then(setPrepared));
    } catch (e) {
      setError(e instanceof FormatError ? 'Это не грамотка или файл повреждён (недокачан). Попросите прислать его ещё раз.' : errorText(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, store, open]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="stack stack--s">
        <span className="small">Чтобы принять грамотку, откройте свои грамотки (или создайте фразу, если её ещё нет).</span>
        <div>
          <button type="button" className="btn btn--primary" onClick={() => showGramotki.emit()}>
            <KeyRound size={16} /> Открыть грамотки
          </button>
        </div>
      </div>
    );
  }
  if (error && !info) return <Alert kind="error">{error}</Alert>;
  if (!info) return <div className="loading">Читаю файл…</div>;

  const unlock = () => bytes && code.replace(/\D/g, '').length === 6 && void run(() => store!.prepare(bytes, code).then(setPrepared));
  const accept = () =>
    prepared &&
    void run(async () => {
      const r = await store!.accept(prepared, choice);
      onAccepted({ id: r.id, fio: fioText(prepared.fields), how: r.how });
    });

  return (
    <div className="stack">
      {!prepared && !info.own && (
        <form
          className="stack stack--s"
          onSubmit={(e) => {
            e.preventDefault();
            unlock();
          }}
        >
          <label className="field">
            <span className="field__label">Временный ключ</span>
            <input
              className="input incoming__code"
              data-autofocus=""
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={7}
              onChange={(e) => setCode(e.target.value)}
            />
            <span className="field__hint">6 цифр — их сообщает мастер, который передаёт бойца. Ключ действует 3 дня.</span>
          </label>
          <div>
            <button type="submit" className="btn btn--primary" disabled={busy || code.replace(/\D/g, '').length !== 6}>
              {busy ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />} Открыть
            </button>
          </div>
        </form>
      )}
      {!prepared && info.own && busy && <div className="loading">Открываю…</div>}
      {prepared && (
        <div className="stack stack--s">
          <div>
            <strong>{fioText(prepared.fields) || 'Без имени'}</strong>
            {prepared.fields['person.birthDate'] && <span className="muted"> · {prepared.fields['person.birthDate']}</span>}
            {prepared.fields['rso.squad'] && <span className="muted"> · {prepared.fields['rso.squad']}</span>}
          </div>
          <div className="small">
            {info.existing === 'sealed' ? 'Этого бойца вы раньше передавали — грамотка вернулась к вам. ' : ''}
            {ORDER_TEXT[prepared.order]}
          </div>
          {prepared.received.meta.from && <div className="small muted">Передал: {prepared.received.meta.from.name}</div>}
          {prepared.received.journalBroken && <Alert kind="warning">Журнал этой грамотки не сходится — его стёрли или подменили. Данные бойца при этом в порядке.</Alert>}
          {prepared.order === 'diverged' && <GramotkaMerge diff={prepared.diff} choice={choice} onChoice={setChoice} />}
          <div>
            <button type="button" className="btn btn--primary" data-autofocus="" disabled={busy} onClick={accept}>
              {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{' '}
              {prepared.order === 'older' || prepared.order === 'same' ? 'Понятно' : prepared.order === 'diverged' ? 'Сохранить выбранное' : 'Принять'}
            </button>
          </div>
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
