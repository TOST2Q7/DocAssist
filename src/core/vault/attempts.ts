import { VaultError } from './vault';

/*
 * Пауза после неверных попыток: пароль, фраза, временный ключ. Подбор через само приложение становится
 * медленным (подбор по украденному файлу это не останавливает — его замедляет только долгое получение ключа).
 * Счётчик — в памяти браузера, чтобы перезагрузка страницы его не сбрасывала.
 */

const KEY = 'docassist.attempts';
/** Сколько ошибок можно подряд без паузы. */
const FREE = 3;

interface State {
  fails: number;
  until: number;
}

const memory: Record<string, State> = {};

function read(scope: string): State {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, State>;
    return all[scope] ?? memory[scope] ?? { fails: 0, until: 0 };
  } catch {
    return memory[scope] ?? { fails: 0, until: 0 };
  }
}

function write(scope: string, st: State) {
  memory[scope] = st;
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, State>;
    all[scope] = st;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* без памяти браузера — до перезагрузки */
  }
}

/** Пауза растёт: 30 с после трёх ошибок, потом 1, 2, 4… минуты (не больше часа). */
export function pauseFor(fails: number): number {
  if (fails < FREE) return 0;
  return Math.min(30_000 * 2 ** (fails - FREE), 3_600_000);
}

/** Сколько секунд ещё ждать (0 — можно пробовать). */
export function waitLeft(scope: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((read(scope).until - now) / 1000));
}

/**
 * Попытка: если ещё идёт пауза — ошибка «подождите»; неверный пароль (VaultError 'wrong-phrase') — счётчик растёт;
 * успех — счётчик сбрасывается.
 */
export async function attempt<T>(scope: string, fn: () => Promise<T>, now = () => Date.now()): Promise<T> {
  const left = waitLeft(scope, now());
  if (left > 0) throw new VaultError('too-many', `Слишком много неверных попыток. Подождите ${waitText(left)}.`);
  try {
    const out = await fn();
    write(scope, { fails: 0, until: 0 });
    return out;
  } catch (e) {
    if (e instanceof VaultError && e.kind === 'wrong-phrase') {
      const fails = read(scope).fails + 1;
      write(scope, { fails, until: now() + pauseFor(fails) });
    }
    throw e;
  }
}

export function waitText(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  return `${Math.ceil(seconds / 60)} мин`;
}
