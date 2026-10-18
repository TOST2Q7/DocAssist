import { IS_SINGLE_FILE } from '../config';

/*
 * Настройки проекта Google (Google Cloud Console → «APIs & Services»).
 * Как получить значения — docs/GOOGLE-SETUP.md. Они не секретные: Google пускает только с адресов,
 * вписанных в Client ID, а API-ключ ограничен адресом сайта. Секрета (client secret) здесь нет и быть не должно.
 */

/** OAuth Client ID типа «Веб-приложение»: «…apps.googleusercontent.com». */
export const GOOGLE_CLIENT_ID = '';
/** API-ключ — нужен только окну выбора файлов (Google Picker). */
export const GOOGLE_API_KEY = '';
/** Номер проекта (Project number) — окно выбора с ним выдаёт приложению доступ к выбранным файлам. */
export const GOOGLE_APP_ID = '';

/**
 * Доступ, который просит приложение: только файлы, созданные приложением или выбранные человеком в окне Google
 * (drive.file — без проверки Google и без лимита пользователей), плюс почта — показать, кто вошёл.
 */
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];

export type GoogleAvailability =
  | { ok: true }
  | { ok: false; reason: 'single-file' | 'insecure' | 'not-configured' };

/** Можно ли работать с Google здесь и сейчас. */
export function googleAvailability(): GoogleAvailability {
  // Версия-файл открыта с file:// — у неё нет адреса, Google такую страницу не пускает.
  if (IS_SINGLE_FILE) return { ok: false, reason: 'single-file' };
  if (typeof window !== 'undefined' && !window.isSecureContext) return { ok: false, reason: 'insecure' };
  if (!GOOGLE_CLIENT_ID) return { ok: false, reason: 'not-configured' };
  return { ok: true };
}

export const AVAILABILITY_TEXT: Record<Exclude<GoogleAvailability, { ok: true }>['reason'], string> = {
  'single-file':
    'В версии-файле (DocAssist.html) работа с Google недоступна: у файла нет адреса сайта, и Google его не пускает. Установите приложение с сайта — там всё работает.',
  insecure: 'Страница открыта без защищённого соединения (https) — Google не разрешит вход.',
  'not-configured': 'Google ещё не подключён к приложению: разработчику нужно вписать ключи проекта Google (docs/GOOGLE-SETUP.md).',
};
