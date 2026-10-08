import { useEffect, useState } from 'react';
import { APP_VERSION, GITHUB_OWNER, GITHUB_REPO, RELEASE_BRANCH, RELEASES_URL } from '../config';

/*
 * Проверка последней версии на GitHub — единственный сетевой запрос приложения.
 * Сначала смотрим последний релиз, если релизов нет — версию в package.json ветки main.
 * Отправляется только GET-запрос за номером версии; данные пользователя никуда не уходят.
 */

export interface UpdateInfo {
  latest: string;
  current: string;
  hasUpdate: boolean;
  checkedAt: number;
  /** Страница, где скачать новую версию. */
  url: string;
}

const CACHE_KEY = 'docassist.update';
const FAIL_KEY = 'docassist.update.failedAt';
const DAY = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAIL = 6 * 60 * 60 * 1000;

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function latestRelease(): Promise<{ version: string; url: string } | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const r = (await res.json()) as { tag_name?: string; html_url?: string };
    return r.tag_name ? { version: r.tag_name.replace(/^v/, ''), url: r.html_url ?? RELEASES_URL } : null;
  } catch {
    return null;
  }
}

async function versionFromBranch(): Promise<{ version: string; url: string }> {
  const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${RELEASE_BRANCH}/package.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub ответил ${res.status}`);
  const pkg = (await res.json()) as { version?: string };
  if (!pkg.version) throw new Error('В ответе нет номера версии');
  return { version: pkg.version, url: RELEASES_URL };
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const found = (await latestRelease()) ?? (await versionFromBranch());
  const info: UpdateInfo = {
    latest: found.version,
    current: APP_VERSION,
    hasUpdate: compareVersions(found.version, APP_VERSION) > 0,
    checkedAt: Date.now(),
    url: found.url,
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
    return { ...info, url: info.url ?? RELEASES_URL, current: APP_VERSION, hasUpdate: compareVersions(info.latest, APP_VERSION) > 0 };
  } catch {
    return null;
  }
}

let inflight: Promise<UpdateInfo> | null = null;

/** Одна проверка на всё приложение, даже если её запросили несколько компонентов. */
function checkOnce(): Promise<UpdateInfo> {
  inflight ??= checkForUpdate().finally(() => {
    inflight = null;
  });
  return inflight;
}

function recentlyFailed(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(FAIL_KEY) ?? 0) < RETRY_AFTER_FAIL;
  } catch {
    return false;
  }
}

/** Тихая проверка раз в сутки, если есть интернет. После неудачи — повтор не раньше чем через 6 часов. */
export function useUpdateCheck(): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(cachedUpdateInfo);
  useEffect(() => {
    const cached = cachedUpdateInfo();
    if (cached && Date.now() - cached.checkedAt < DAY) return;
    if (!navigator.onLine || recentlyFailed()) return;
    let alive = true;
    checkOnce().then(
      (i) => alive && setInfo(i),
      () => {
        try {
          localStorage.setItem(FAIL_KEY, String(Date.now()));
        } catch {
          /* не критично */
        }
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return info;
}
