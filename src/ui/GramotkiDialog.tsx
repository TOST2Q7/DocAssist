import { Eye, EyeOff, FileKey, KeyRound, Loader2, ShieldAlert, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { openRequests, useGramotki, type OpenRequest } from '@/core/gramotka/react';
import { errorText, KEY_FILE_EXT } from '@/core/gramotka/store';
import { runSecurityCheck, type SecurityCheck } from '@/core/security/security';
import { downloadBytes, pickFiles } from '@/core/util/download';
import { Emitter } from '@/core/util/events';
import { makeKeyFile } from '@/core/vault/owner';
import { checkPhrase, generatePhrase } from '@/core/vault/vault';
import { Alert } from './Alert';
import { Modal } from './Modal';
import { useToast } from './Toast';

/*
 * Окно «Грамотки»: придумать фразу (первый раз), ввести её или бросить файл ключа. Одно на весь сайт —
 * его открывают кнопка в шапке и любое приложение, которому нужны данные людей (ensureOpen).
 * Пока грамотки открываются — показывает, сколько уже открыто.
 */

/** Показать окно кнопкой (в шапке, в настройках). */
export const showGramotki = new Emitter<void>();

const LEVEL = ['слабая', 'слабая', 'хорошая', 'надёжная'];

export function saveKeyFile(phrase: string) {
  void makeKeyFile(phrase).then((bytes) => downloadBytes(bytes, `Ключ грамоток.${KEY_FILE_EXT}`));
}

export function GramotkiDialog() {
  const { store, snap } = useGramotki();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const waiting = useRef<OpenRequest[]>([]);
  const [phrase, setPhrase] = useState('');
  const [again, setAgain] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [danger, setDanger] = useState<SecurityCheck[]>([]);

  useEffect(
    () =>
      openRequests.on((r) => {
        waiting.current.push(r);
        setReason(r.reason);
        setOpen(true);
      }),
    [],
  );
  useEffect(() => showGramotki.on(() => setOpen(true)), []);
  useEffect(() => {
    if (open) void runSecurityCheck().then((r) => setDanger(r.filter((c) => c.status === 'fail')));
  }, [open]);

  // Открылись (в том числе из другого места) — ответить всем, кто ждал, и закрыть окно.
  useEffect(() => {
    if (snap.status !== 'open' || !open) return;
    for (const r of waiting.current.splice(0)) r.resolve(true);
    setOpen(false);
    setPhrase('');
    setAgain('');
    setError(null);
  }, [snap.status, open]);

  const close = () => {
    if (busy) return;
    for (const r of waiting.current.splice(0)) r.resolve(false);
    setOpen(false);
    setPhrase('');
    setAgain('');
    setError(null);
  };

  if (!open || !store) return null;

  const creating = snap.status === 'new';
  const opening = snap.status === 'opening' || snap.status === 'starting';
  const check = checkPhrase(phrase);
  const canSubmit = creating ? check.ok && phrase === again && understood && !!name.trim() : phrase.trim().length > 0;
  const type = show ? 'text' : 'password';

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
  const submit = () => {
    if (!canSubmit || busy) return;
    void run(() => (creating ? store.createOwner(phrase, name, remember) : store.unlock(phrase, remember)));
  };
  const openByKeyFile = (file: File) =>
    void run(async () => {
      await store.unlockWithKeyFile(new Uint8Array(await file.arrayBuffer()), remember);
      toast('Грамотки открыты файлом ключа');
    });

  return (
    <Modal
      title={creating ? 'Фраза для грамоток' : 'Откройте грамотки'}
      onClose={close}
      top
      footer={
        opening ? undefined : (
          <>
            <button className="btn btn--ghost" onClick={close} disabled={busy}>
              Отмена
            </button>
            <span className="spacer" />
            <button className="btn btn--primary" disabled={!canSubmit || busy} onClick={submit}>
              {busy ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />} {busy ? 'Подождите…' : creating ? 'Сохранить и открыть' : 'Открыть'}
            </button>
          </>
        )
      }
    >
      {opening ? (
        <div className="stack">
          <div className="row">
            <Loader2 size={18} className="spin" />
            <strong>Открываю грамотки…</strong>
          </div>
          {snap.progress && (
            <>
              <progress className="gramotki-progress" max={snap.progress.total || 1} value={snap.progress.done} />
              <span className="small muted">
                {snap.progress.done} из {snap.progress.total}
              </span>
            </>
          )}
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const f = [...e.dataTransfer.files].find((x) => x.name.toLowerCase().endsWith(`.${KEY_FILE_EXT}`));
            if (!f) return;
            e.preventDefault();
            e.stopPropagation();
            openByKeyFile(f);
          }}
        >
          {danger.length > 0 && (
            <Alert kind="error">
              <strong>
                <ShieldAlert size={16} style={{ verticalAlign: '-3px' }} /> Устройство вызывает подозрения
              </strong>
              {danger.map((d) => (
                <div key={d.id} className="small">
                  {d.title}: {d.text}
                </div>
              ))}
              <div className="small">
                Лучше не вводить фразу здесь. Подробно — в разделе <Link to="/google#security">«Проверка безопасности»</Link>.
              </div>
            </Alert>
          )}
          {reason && <div className="small">{reason} — откройте грамотки.</div>}
          {creating ? (
            <p className="small muted" style={{ margin: 0 }}>
              <strong>Гра́мотка</strong> — папка на одного человека: данные, фото, сканы, достижения. Все грамотки закрыты этой фразой: без неё их не откроет никто — ни вы, ни разработчик. Регистр
              букв, «ё» и лишние пробелы не важны.{' '}
              <Link to="/faq#gramotka" onClick={close}>
                Подробнее
              </Link>
            </p>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              Фраза, которую вы придумали для грамоток. Вместо неё можно перетащить сюда файл ключа.
            </p>
          )}
          {creating && (
            <label className="field">
              <span className="field__label">Как вас подписывать</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Фамилия И. О., отряд" autoComplete="off" />
              <span className="field__hint">Так вы будете видны другим мастерам при переводе бойцов.</span>
            </label>
          )}
          <label className="field">
            <span className="field__label">Фраза</span>
            <div className="row row--nowrap">
              <input className="input" type={type} autoComplete="off" autoCapitalize="none" spellCheck={false} value={phrase} onChange={(e) => setPhrase(e.target.value)} style={{ flex: 1 }} />
              <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Скрыть' : 'Показать'} data-tip={show ? 'Скрыть' : 'Показать'}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {creating && phrase && (
              <span className={check.ok ? 'field__hint' : 'field__warn'}>
                Фраза {LEVEL[check.level]}. {check.hint}
              </span>
            )}
          </label>
          {creating ? (
            <>
              <div className="row">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    setPhrase(generatePhrase());
                    setAgain('');
                    setShow(true);
                  }}
                >
                  <Wand2 size={14} /> Придумать за меня
                </button>
                <span className="small muted">Шесть случайных слов. Запишите их на бумаге.</span>
              </div>
              <label className="field">
                <span className="field__label">Повторите фразу</span>
                <input className="input" type={type} autoComplete="off" autoCapitalize="none" spellCheck={false} value={again} onChange={(e) => setAgain(e.target.value)} />
                {again && again !== phrase && <span className="field__warn">Не совпадает.</span>}
              </label>
              <div className="row">
                <button type="button" className="btn btn--sm" disabled={!check.ok || phrase !== again} onClick={() => saveKeyFile(phrase)}>
                  <FileKey size={14} /> Сохранить в файл ключа
                </button>
                <span className="small muted">Файл можно бросать вместо ввода фразы. Это как ключ от квартиры: храните его отдельно от грамоток.</span>
              </div>
              <label className="check small">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                Понимаю: если забуду фразу (и потеряю файл ключа), грамотки не откроет никто.
              </label>
            </>
          ) : (
            <div className="row">
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={async () => {
                  const [f] = await pickFiles(`.${KEY_FILE_EXT}`, false);
                  if (f) openByKeyFile(f);
                }}
              >
                <FileKey size={14} /> Открыть файлом ключа
              </button>
            </div>
          )}
          <label className="check small">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Запомнить на этом устройстве (не вводить каждый раз). Не включайте на чужом компьютере.
          </label>
          {error && <Alert kind="error">{error}</Alert>}
          {snap.error && !error && <Alert kind="warning">{snap.error}</Alert>}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}
