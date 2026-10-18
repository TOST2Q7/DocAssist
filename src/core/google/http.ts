import { errorFromResponse, GoogleError, isRetryable } from './errors';

/*
 * Все запросы к Google — только через gfetch:
 * - подставляет пропуск (токен) входа;
 * - при перегрузке Google (429, rateLimitExceeded) и временных сбоях — пауза и повтор с растущей задержкой,
 *   но не бесконечно (лимиты: CLAUDE.md → «Google API»);
 * - 401 — вход истёк: сообщает модулю входа и не повторяет (новое окно входа можно открыть только по нажатию);
 * - остальные ошибки превращает в понятные GoogleError.
 */

type TokenProvider = () => string | null;
let tokenProvider: TokenProvider = () => null;
let onUnauthorized: () => void = () => {};

/** Модуль входа сообщает, где брать токен и что делать, если Google его не принял. */
export function connectAuth(provider: TokenProvider, unauthorized: () => void): void {
  tokenProvider = provider;
  onUnauthorized = unauthorized;
}

let sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Для тестов: не ждать по-настоящему. */
export function setSleepForTests(fn: (ms: number) => Promise<void>): void {
  sleep = fn;
}

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  /** Тело — JSON (заголовок Content-Type ставится сам). */
  json?: unknown;
  /** Что вернуть: разобранный JSON (по умолчанию), байты, текст или сам ответ. */
  as?: 'json' | 'bytes' | 'text' | 'response';
  /** Сколько раз повторять при перегрузке и сбоях (по умолчанию 5). */
  retries?: number;
  /** Без токена (например, загрузка по ссылке, которую уже выдал Google). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/** Задержка перед повтором: 1, 2, 4, 8, 16 с (не больше 32) + случайная добавка, чтобы устройства не стучались разом. */
export function backoffDelay(attempt: number): number {
  return Math.min(32_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 1000);
}

export function withQuery(url: string, query?: RequestOptions['query']): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
  return u.toString();
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Куда можно отправлять пропуск входа: только API Google. Защита от утечки токена по ошибке в коде. */
const TOKEN_HOSTS = new Set(['www.googleapis.com', 'sheets.googleapis.com']);

export function tokenAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && TOKEN_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export async function gfetch<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
  const retries = opts.retries ?? 5;
  const full = withQuery(url, opts.query);
  if (!opts.anonymous && !tokenAllowed(full)) throw new GoogleError('other', 'Запрос не к Google — пропуск входа не отправляется.');
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (!opts.anonymous) {
      const token = tokenProvider();
      if (!token) throw new GoogleError('auth', 'Сначала войдите в Google.', 401);
      headers.Authorization = `Bearer ${token}`;
    }
    let body = opts.body;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json; charset=UTF-8';
      body = JSON.stringify(opts.json);
    }
    let err: GoogleError;
    try {
      const res = await fetch(full, { method: opts.method ?? 'GET', headers, body, signal: opts.signal });
      if (res.ok) {
        if (opts.as === 'response') return res as T;
        if (opts.as === 'bytes') return new Uint8Array(await res.arrayBuffer()) as T;
        if (opts.as === 'text') return (await res.text()) as T;
        return (await readBody(res)) as T;
      }
      err = errorFromResponse(res.status, await readBody(res));
      if (err.kind === 'auth') {
        onUnauthorized();
        throw err;
      }
    } catch (e) {
      if (e instanceof GoogleError) err = e;
      else if (e instanceof DOMException && e.name === 'AbortError') throw e;
      else err = new GoogleError('network', 'Нет связи с Google. Проверьте интернет и повторите.');
      if (err.kind === 'auth') throw err;
    }
    const limit = err.kind === 'network' ? Math.min(retries, 3) : retries;
    if (!isRetryable(err) || attempt >= limit) throw err;
    await sleep(backoffDelay(attempt));
  }
}

export type QueueResult<R> = { ok: true; value: R } | { ok: false; error: unknown };

/**
 * Очередь массовых операций: по несколько одновременно (по умолчанию 3), с прогрессом.
 * Ошибка одного элемента не останавливает остальные — результат по каждому.
 */
export async function runQueue<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  opts: { concurrency?: number; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<QueueResult<R>[]> {
  const results: QueueResult<R>[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const run = async () => {
    while (next < items.length) {
      if (opts.signal?.aborted) return;
      const i = next++;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
      done++;
      opts.onProgress?.(done, items.length);
    }
  };
  const n = Math.max(1, Math.min(opts.concurrency ?? 3, items.length));
  await Promise.all(Array.from({ length: n }, run));
  return results;
}
