import { Eye, EyeOff, ShieldAlert, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { runSecurityCheck, type SecurityCheck } from '@/core/security/security';
import { checkPhrase, generatePhrase } from '@/core/vault/vault';
import { Alert } from '@/ui/Alert';
import { Modal } from '@/ui/Modal';

/*
 * Ввод контрольной фразы. Перед вводом — быстрая проверка устройства: если найдено подозрительное
 * (подмена функций, чужая страница вокруг, нет https), предупреждаем, что фразу здесь лучше не вводить.
 */

interface Props {
  mode: 'create' | 'enter' | 'change';
  busy?: boolean;
  error?: string;
  onSubmit: (v: { phrase: string; oldPhrase?: string; remember: boolean }) => void;
  onClose: () => void;
}

const LEVEL = ['слабая', 'слабая', 'хорошая', 'надёжная'];

export function PhraseDialog({ mode, busy, error, onSubmit, onClose }: Props) {
  const [phrase, setPhrase] = useState('');
  const [again, setAgain] = useState('');
  const [old, setOld] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [understood, setUnderstood] = useState(mode === 'enter');
  const [danger, setDanger] = useState<SecurityCheck[]>([]);
  useEffect(() => {
    void runSecurityCheck().then((r) => setDanger(r.filter((c) => c.status === 'fail')));
  }, []);

  const creating = mode !== 'enter';
  const check = checkPhrase(phrase);
  const ok = creating ? check.ok && phrase === again && understood && (mode !== 'change' || old.trim()) : phrase.trim().length > 0;
  const type = show ? 'text' : 'password';

  return (
    <Modal
      title={mode === 'create' ? 'Контрольная фраза' : mode === 'change' ? 'Сменить контрольную фразу' : 'Введите контрольную фразу'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <span className="spacer" />
          <button className="btn btn--primary" disabled={!ok || busy} onClick={() => onSubmit({ phrase, oldPhrase: mode === 'change' ? old : undefined, remember })}>
            {busy ? 'Подождите…' : mode === 'enter' ? 'Открыть' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !busy) onSubmit({ phrase, oldPhrase: mode === 'change' ? old : undefined, remember });
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
        {creating ? (
          <p className="small muted" style={{ margin: 0 }}>
            Личные настройки на Google Диске закрываются этой фразой. Открыть их без неё нельзя — ни через ваш Google-аккаунт, ни через
            разработчика. Регистр букв, «ё» и лишние пробелы не важны.
          </p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Фраза, которую вы придумали, когда включали перенос настроек. Она нигде не хранится и никуда не отправляется.
          </p>
        )}
        {mode === 'change' && (
          <label className="field">
            <span className="field__label">Нынешняя фраза (если не запомнена на этом устройстве)</span>
            <input className="input" type={type} autoComplete="off" value={old} onChange={(e) => setOld(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span className="field__label">{mode === 'change' ? 'Новая фраза' : 'Фраза'}</span>
          <div className="row row--nowrap">
            <input className="input" type={type} autoComplete="off" autoCapitalize="none" spellCheck={false} value={phrase} onChange={(e) => setPhrase(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Скрыть' : 'Показать'} data-tip={show ? 'Скрыть' : 'Показать'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {creating && phrase && <span className={check.ok ? 'field__hint' : 'field__warn'}>Фраза {LEVEL[check.level]}. {check.hint}</span>}
        </label>
        {creating && (
          <>
            <div className="row">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  const p = generatePhrase();
                  setPhrase(p);
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
            <label className="check small">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              Понимаю: если забуду фразу, восстановить настройки будет невозможно.
            </label>
          </>
        )}
        <label className="check small">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Запомнить на этом устройстве (не вводить каждый раз). Не включайте на чужом компьютере.
        </label>
        {error && <Alert kind="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
