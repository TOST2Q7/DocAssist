import { useEffect, useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'docassist.theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let pref = readPref();
const listeners = new Set<() => void>();

function resolved(p: ThemePref): 'light' | 'dark' {
  if (p === 'system') return media?.matches ? 'dark' : 'light';
  return p;
}

function apply() {
  document.documentElement.setAttribute('data-theme', resolved(pref));
  listeners.forEach((l) => l());
}

media?.addEventListener('change', () => {
  if (pref === 'system') apply();
});

export function setThemePref(p: ThemePref) {
  pref = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* не критично */
  }
  apply();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => pref);
  const theme = useSyncExternalStore(subscribe, () => resolved(pref));
  useEffect(() => apply(), []);
  return { pref: current, theme, setPref: setThemePref, toggle: () => setThemePref(theme === 'dark' ? 'light' : 'dark') };
}
