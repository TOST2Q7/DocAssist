import { useEffect, useState } from 'react';
import { APP_VERSION, GITHUB_OWNER, GITHUB_REPO, RELEASE_BRANCH } from '../config';

/*
 * Проверка последней версии на GitHub — единственный сетевой запрос приложения.
 * Отправляется только GET-запрос за номером версии; данные пользователя никуда не уходят.
 */

export interface UpdateInfo {
  latest: string;
  current: string;
  hasUpdate: boolean;
  checkedAt: number;
}

const CACHE_KEY = 'docassist.update';
const DAY = 24 * 60 * 60 * 1000;

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${RELEASE_BRANCH}/package.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub ответил ${res.status}`);
  const pkg = (await res.json()) as { version?: string };
  if (!pkg.version) throw new Error('В ответе нет номера версии');
  const info: UpdateInfo = {
    latest: pkg.version,
    current: APP_VERSION,
    hasUpdate: compareVersions(pkg.version, APP_VERSION) > 0,
    checkedAt: Date.now(),
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(info));
  } catch {
    /* не критично */
  }
  return info;
}

export function cachedUpdateInfo(): UpdateInfo | null {
  try {
    const info = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as UpdateInfo | null;
    if (!info) return null;
    // Если приложение уже обновилось — пересчитываем флаг.
    return { ...info, current: APP_VERSION, hasUpdate: compareVersions(info.latest, APP_VERSION) > 0 };
  } catch {
    return null;
  }
}

/** Тихая проверка раз в сутки, если есть интернет. */
export function useUpdateCheck(): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(cachedUpdateInfo);
  useEffect(() => {
    const cached = cachedUpdateInfo();
    if (cached && Date.now() - cached.checkedAt < DAY) return;
    if (!navigator.onLine) return;
    checkForUpdate().then(setInfo, () => {
      /* нет сети или репозиторий закрыт — молча пропускаем */
    });
  }, []);
  return info;
}
