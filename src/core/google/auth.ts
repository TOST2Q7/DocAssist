import { useEffect, useSyncExternalStore } from 'react';
import { Emitter } from '../util/events';
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, googleAvailability } from './config';
import { GoogleError } from './errors';
import { connectAuth, gfetch } from './http';
import { GIS_SRC, loadScript } from './loader';

/*
 * Вход в Google (Google Identity Services, «модель токена»).
 * - Токен — временный пропуск примерно на час. Хранится только в памяти: не в рабочей папке, не в копиях,
 *   не в «Скопировать настройки». Долгоживущего ключа у браузерного приложения нет.
 * - Новый токен можно попросить только по нажатию кнопки (иначе браузер заблокирует окно). Если человек уже
 *   разрешал доступ, окно мелькнёт без вопросов.
 * - Почта запоминается на устройстве, чтобы не выбирать аккаунт каждый раз.
 */

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; hint?: string }): void;
}
interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
    hint?: string;
  }): TokenClient;
  hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export interface GoogleAuthState {
  /** Скрипт Google загружен и готов открыть окно входа. */
  ready: boolean;
  signedIn: boolean;
  busy: boolean;
  email?: string;
  expiresAt?: number;
  error?: string;
}

const HINT_KEY = 'docassist.google.hint';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let state: GoogleAuthState = { ready: false, signedIn: false, busy: false };
let token: string | null = null;
let client: TokenClient | null = null;
let preparing: Promise<void> | null = null;
let pending: { resolve: (t: string) => void; reject: (e: unknown) => void } | null = null;
const listeners = new Set<() => void>();

/** Вход выполнен (почта известна) — например, чтобы подтянуть личные настройки. */
export const signedInEvents = new Emitter<{ email?: string }>();

function set(patch: Partial<GoogleAuthState>) {
  state = { ...state, ...patch };
  for (const fn of [...listeners]) fn();
}

function readHint(): string | undefined {
  try {
    return localStorage.getItem(HINT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
function writeHint(email: string | undefined) {
  try {
    if (email) localStorage.setItem(HINT_KEY, email);
    else localStorage.removeItem(HINT_KEY);
  } catch {
    /* без памяти браузера — просто будем спрашивать аккаунт */
  }
}

/** Действующий токен (не меньше минуты до конца) или null. */
export function getToken(): string | null {
  return token && state.expiresAt && state.expiresAt - Date.now() > 60_000 ? token : null;
}

function dropToken(error?: string) {
  token = null;
  set({ signedIn: false, expiresAt: undefined, busy: false, error });
}

connectAuth(getToken, () => dropToken('Вход в Google истёк — войдите снова.'));

function oauth2(): GoogleOAuth2 {
  const o = window.google?.accounts?.oauth2;
  if (!o) throw new GoogleError('other', 'Скрипт входа Google не загрузился.');
  return o;
}

async function onToken(r: TokenResponse) {
  const p = pending;
  pending = null;
  if (r.error || !r.access_token) {
    dropToken(r.error === 'access_denied' ? 'Вход отменён.' : `Google не выдал доступ: ${r.error_description ?? r.error ?? 'неизвестно'}`);
    p?.reject(new GoogleError('auth', state.error ?? 'Вход отменён.'));
    return;
  }
  if (!oauth2().hasGrantedAllScopes(r, DRIVE_SCOPE)) {
    dropToken('Нужно разрешить доступ к файлам Google Диска — поставьте галочку в окне Google.');
    p?.reject(new GoogleError('auth', state.error!));
    return;
  }
  token = r.access_token;
  set({ signedIn: true, busy: false, error: undefined, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 });
  try {
    const me = await gfetch<{ email?: string }>('https://www.googleapis.com/oauth2/v3/userinfo', { retries: 1 });
    if (me?.email) {
      set({ email: me.email });
      writeHint(me.email);
    }
  } catch {
    /* почта нужна только для показа — без неё работаем */
  }
  p?.resolve(token);
  signedInEvents.emit({ email: state.email });
}

/** Загрузить скрипт входа заранее — вызывать, когда на экране появляется кнопка Google. */
export function prepareGoogle(): Promise<void> {
  if (!googleAvailability().ok) return Promise.resolve();
  if (!preparing) {
    preparing = loadScript(GIS_SRC)
      .then(() => {
        client = oauth2().initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: GOOGLE_SCOPES.join(' '),
          callback: (r) => void onToken(r),
          error_callback: (e) => {
            const p = pending;
            pending = null;
            const msg = e.type === 'popup_failed_to_open' ? 'Браузер не открыл окно Google — разрешите всплывающие окна для этого сайта.' : 'Окно входа закрыто.';
            dropToken(msg);
            p?.reject(new GoogleError('auth', msg));
          },
          hint: readHint(),
        });
        set({ ready: true });
      })
      .catch((e) => {
        preparing = null;
        set({ error: e instanceof Error ? e.message : String(e) });
        throw e;
      });
  }
  return preparing;
}

/**
 * Войти (или обновить пропуск). Вызывать прямо из обработчика нажатия.
 * selectAccount — показать выбор аккаунта (сменить аккаунт).
 */
export async function signIn(selectAccount = false): Promise<string> {
  const av = googleAvailability();
  if (!av.ok) throw new GoogleError('other', 'Google недоступен здесь.');
  await prepareGoogle();
  if (!client) throw new GoogleError('other', 'Скрипт входа Google не загрузился.');
  pending?.reject(new GoogleError('auth', 'Вход начат заново.'));
  set({ busy: true, error: undefined });
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    const hint = selectAccount ? undefined : (state.email ?? readHint());
    client!.requestAccessToken({ prompt: selectAccount ? 'select_account' : '', ...(hint ? { hint } : {}) });
  });
}

/** Действующий токен; если истёк — войти заново (только из обработчика нажатия). */
export async function ensureToken(): Promise<string> {
  return getToken() ?? signIn();
}

/** Выйти и отозвать доступ, выданный в этом браузере. */
export async function signOut(forget = true): Promise<void> {
  const t = token;
  dropToken();
  if (forget) {
    writeHint(undefined);
    set({ email: undefined });
  }
  if (t) {
    try {
      oauth2().revoke(t);
    } catch {
      /* отзыв — по возможности */
    }
  }
}

export function getAuthState(): GoogleAuthState {
  return state;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Состояние входа для интерфейса; заодно заранее загружает скрипт Google. */
export function useGoogleAuth(): GoogleAuthState {
  useEffect(() => {
    void prepareGoogle().catch(() => undefined);
  }, []);
  return useSyncExternalStore(subscribe, getAuthState);
}

/** Почта, с которой входили на этом устройстве (до входа). */
export function rememberedEmail(): string | undefined {
  return state.email ?? readHint();
}
