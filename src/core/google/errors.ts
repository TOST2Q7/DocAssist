/*
 * Ошибки Google — по-русски и по видам, чтобы приложение знало, что делать дальше:
 * повторить, попросить войти, предложить показать файл в окне Google или сказать, что права выдаёт админ.
 */

export type GoogleErrorKind =
  /** Вход истёк или отозван — войти снова. */
  | 'auth'
  /** Человек не показывал этот файл приложению — открыть окно выбора Google. */
  | 'notAuthorized'
  /** Нет прав на Диске (только просмотр, чужой файл) — права выдаёт админ. */
  | 'permission'
  /** Файла нет или нет доступа: Google их не различает. */
  | 'notFound'
  /** Слишком часто — подождать и повторить. */
  | 'rateLimit'
  /** Закончилось место на Диске. */
  | 'quota'
  /** Нет связи. */
  | 'network'
  /** Временная ошибка на стороне Google. */
  | 'server'
  | 'other';

export class GoogleError extends Error {
  constructor(
    readonly kind: GoogleErrorKind,
    message: string,
    readonly status = 0,
    readonly reason = '',
  ) {
    super(message);
    this.name = 'GoogleError';
  }
}

export const ERROR_TEXT: Record<GoogleErrorKind, string> = {
  auth: 'Вход в Google истёк или отменён. Нажмите «Войти в Google» ещё раз.',
  notAuthorized: 'Этот файл ещё не показан приложению. Выберите его в окне Google — это нужно сделать один раз.',
  permission: 'Нет прав на это действие на Google Диске. Права выдаёт владелец папки (админ).',
  notFound: 'Файл не найден на Google Диске: его удалили или закрыли к нему доступ.',
  rateLimit: 'Google просит подождать: слишком много действий подряд. Повторите через минуту.',
  quota: 'На Google Диске закончилось место.',
  network: 'Нет связи с Google. Проверьте интернет и повторите.',
  server: 'Google временно не отвечает. Повторите чуть позже.',
  other: 'Google вернул ошибку.',
};

const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'sharingRateLimitExceeded', 'RATE_LIMIT_EXCEEDED']);
const PERMISSION_REASONS = new Set(['insufficientFilePermissions', 'insufficientPermissions', 'forbidden', 'cannotAddParent', 'PERMISSION_DENIED']);

interface ErrorBody {
  error?: { code?: number; message?: string; status?: string; errors?: { reason?: string; message?: string }[]; details?: { reason?: string }[] } | string;
  error_description?: string;
}

/** Ошибка по ответу Google (статус и тело ответа). */
export function errorFromResponse(status: number, body: unknown): GoogleError {
  const b = (body ?? {}) as ErrorBody;
  const e = typeof b.error === 'object' ? b.error : undefined;
  const reason = e?.errors?.[0]?.reason ?? e?.details?.[0]?.reason ?? e?.status ?? (typeof b.error === 'string' ? b.error : '');
  const raw = e?.message ?? b.error_description ?? '';
  const make = (kind: GoogleErrorKind) => new GoogleError(kind, raw && kind === 'other' ? `${ERROR_TEXT.other} ${raw}` : ERROR_TEXT[kind], status, reason);

  if (status === 401) return make('auth');
  if (reason === 'appNotAuthorizedToFile') return make('notAuthorized');
  if (status === 429 || RATE_REASONS.has(reason)) return make('rateLimit');
  if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded') return make('quota');
  if (status === 404) return make('notFound');
  if (status === 403 && (PERMISSION_REASONS.has(reason) || !reason)) return make('permission');
  if (status >= 500) return make('server');
  return make('other');
}

/** Стоит ли повторить запрос через паузу. */
export function isRetryable(err: unknown): boolean {
  return err instanceof GoogleError && (err.kind === 'rateLimit' || err.kind === 'server' || err.kind === 'network');
}

/** Текст ошибки для человека. */
export function errorText(err: unknown): string {
  if (err instanceof GoogleError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
