import { useCallback, useSyncExternalStore } from 'react';
import type { BadgeDef, BadgeKind } from './types';

const SEEN_KEY = 'docassist.seen';

export const BADGE_LABELS: Record<BadgeKind, string> = {
  new: 'Новое!',
  beta: 'Бета',
  soon: 'Скоро',
  updated: 'Обновлено',
  count: '',
  warning: '!',
};

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

let seenCache = readSeen();
const listeners = new Set<() => void>();

/** Отметить пункт как просмотренный (бейджи «Новое!»/«Обновлено» исчезнут). */
export function markSeen(itemId: string, version = '1') {
  if (seenCache[itemId] === version) return;
  seenCache = { ...seenCache, [itemId]: version };
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seenCache));
  } catch {
    /* приватный режим — бейдж просто останется */
  }
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Что уже просмотрено — для сохранения в рабочую папку. */
export const getSeen = () => seenCache;
export const subscribeSeen = (fn: () => void) => subscribe(fn);

/** Добавить просмотренное из рабочей папки (другой браузер, та же папка). */
export function mergeSeen(other: Record<string, string>) {
  const next = { ...other, ...seenCache };
  if (JSON.stringify(next) === JSON.stringify(seenCache)) return;
  seenCache = next;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seenCache));
  } catch {
    /* не критично */
  }
  listeners.forEach((l) => l());
}

/** Какие бейджи показывать прямо сейчас. */
export function useVisibleBadges(itemId: string, version: string, badges: BadgeDef[] = []): BadgeDef[] {
  const seen = useSyncExternalStore(subscribe, () => seenCache);
  const isVisible = useCallback(
    (b: BadgeDef) => {
      if (b.until && Date.now() > Date.parse(b.until)) return false;
      const hide = b.hideWhenSeen ?? (b.kind === 'new' || b.kind === 'updated');
      if (hide && seen[itemId] === version) return false;
      return true;
    },
    [seen, itemId, version],
  );
  return badges.filter(isVisible);
}
