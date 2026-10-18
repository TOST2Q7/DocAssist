import { LogIn, LogOut, Loader2, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AVAILABILITY_TEXT, errorText, googleAvailability, rememberedEmail, signIn, signOut, useGoogleAuth } from '@/core/google';
import { Alert } from './Alert';
import { useToast } from './Toast';

/*
 * Полоска входа в Google для любого раздела: «Войти в Google» или «вы вошли как …».
 * В версии-файле и без настроек Google — объяснение, почему недоступно.
 */
export function GoogleBar({ hint }: { hint?: string }) {
  const auth = useGoogleAuth();
  const toast = useToast();
  const av = googleAvailability();
  if (!av.ok) {
    return (
      <Alert kind="info">
        {AVAILABILITY_TEXT[av.reason]} <Link to="/google">Подробнее</Link>
      </Alert>
    );
  }
  const login = async (select = false) => {
    try {
      await signIn(select);
    } catch (e) {
      toast(errorText(e));
    }
  };
  if (!auth.signedIn) {
    const known = rememberedEmail();
    return (
      <div className="card card--flat row google-bar">
        <UserRound size={18} className="faint" />
        <span className="spacer small">{hint ?? 'Чтобы работать с Google Диском и Таблицами, войдите в Google.'}</span>
        <button className="btn btn--primary btn--sm" disabled={auth.busy || !auth.ready} onClick={() => void login()}>
          {auth.busy ? <Loader2 size={14} className="spin" /> : <LogIn size={14} />} {known ? `Войти (${known})` : 'Войти в Google'}
        </button>
        {known && (
          <button className="btn btn--ghost btn--sm" disabled={auth.busy || !auth.ready} onClick={() => void login(true)}>
            Другой аккаунт
          </button>
        )}
        {auth.error && <div className="small field__error" style={{ flexBasis: '100%' }}>{auth.error}</div>}
      </div>
    );
  }
  return (
    <div className="card card--flat row google-bar">
      <UserRound size={18} className="brand-icon" />
      <span className="spacer small">
        Google: <strong>{auth.email ?? 'вход выполнен'}</strong>
      </span>
      <button className="btn btn--ghost btn--sm" onClick={() => void signOut(false)} data-tip="Выйти из Google в этом окне">
        <LogOut size={14} /> Выйти
      </button>
    </div>
  );
}
