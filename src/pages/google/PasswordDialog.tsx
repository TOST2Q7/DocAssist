import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { runSecurityCheck, type SecurityCheck } from '@/core/security/security';
import { checkPassword } from '@/core/vault/vault';
import { Alert } from '@/ui/Alert';
import { Modal } from '@/ui/Modal';

/*
 * Пароль личных настроек на Google Диске (не короче 4 знаков). Перед вводом — быстрая проверка устройства:
 * если найдено подозрительное (подмена функций, чужая страница вокруг, нет https), предупреждаем, что пароль
 * здесь лучше не вводить. Грамотки закрыты отдельно — своей фразой (src/ui/GramotkiDialog.tsx).
 */

interface Props {
  mode: 'create' | 'enter' | 'change';
  busy?: boolean;
  error?: string;
  onSubmit: (v: { password: string; oldPassword?: string; remember: boolean }) => void;
  onClose: () => void;
}

const LEVEL = ['не подходит', 'слабый', 'хороший', 'надёжный'];

export function PasswordDialog({ mode, busy, error, onSubmit, onClose }: Props) {
  const [password, setPassword] = useState('');
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
  const check = checkPassword(password);
  const ok = creating ? check.ok && password === again && understood && (mode !== 'change' || old.trim()) : password.trim().length > 0;
  const type = show ? 'text' : 'password';
  const submit = () => ok && !busy && onSubmit({ password, oldPassword: mode === 'change' ? old : undefined, remember });

  return (
    <Modal
      title={mode === 'create' ? 'Пароль личных настроек' : mode === 'change' ? 'Сменить пароль' : 'Введите пароль личных настроек'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <span className="spacer" />
          <button className="btn btn--primary" disabled={!ok || busy} onClick={submit}>
            {busy ? 'Подождите…' : mode === 'enter' ? 'Открыть' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
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
              Лучше не вводить пароль здесь. Подробно — в разделе <Link to="/google#security">«Проверка безопасности»</Link>.
            </div>
          </Alert>
        )}
        {creating ? (
          <p className="small muted" style={{ margin: 0 }}>
            Личные настройки на Google Диске закрываются этим паролем — хотя бы 4 знака (например, 4 цифры). Открыть их без него нельзя — ни через ваш
            Google-аккаунт, ни через разработчика. Чем длиннее пароль, тем труднее его подобрать.
          </p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Пароль, который вы придумали, когда включали перенос настроек. Он нигде не хранится и никуда не отправляется.
          </p>
        )}
        {mode === 'change' && (
          <label className="field">
            <span className="field__label">Нынешний пароль (если не запомнен на этом устройстве)</span>
            <input className="input" type={type} autoComplete="off" value={old} onChange={(e) => setOld(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span className="field__label">{mode === 'change' ? 'Новый пароль' : 'Пароль'}</span>
          <div className="row row--nowrap">
            <input className="input" type={type} autoComplete="off" autoCapitalize="none" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Скрыть' : 'Показать'} data-tip={show ? 'Скрыть' : 'Показать'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {creating && password && (
            <span className={check.level >= 2 ? 'field__hint' : 'field__warn'}>
              Пароль {LEVEL[check.level]}. {check.hint}
            </span>
          )}
        </label>
        {creating && (
          <>
            <label className="field">
              <span className="field__label">Повторите пароль</span>
              <input className="input" type={type} autoComplete="off" autoCapitalize="none" spellCheck={false} value={again} onChange={(e) => setAgain(e.target.value)} />
              {again && again !== password && <span className="field__warn">Не совпадает.</span>}
            </label>
            <label className="check small">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              Понимаю: если забуду пароль, восстановить личные настройки будет невозможно.
            </label>
          </>
        )}
        <label className="check small">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Запомнить на этом устройстве (не вводить каждый раз). Не включайте на чужом компьютере.
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
