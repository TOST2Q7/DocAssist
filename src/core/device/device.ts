import { useSyncExternalStore } from 'react';
import { uid } from '../util/id';

/*
 * Устройство и метки изменений. У каждого изменения, которое уходит на Google Диск, есть метка:
 * дата, время и устройство («18.10.2026, 17:40 · Chrome на Windows»). По ней при расхождении
 * человек понимает, какая версия откуда и когда.
 * Имя устройства можно поменять (страница «Google»); хранится в браузере.
 */

export interface Stamp {
  /** Когда (ISO). */
  at: string;
  /** Имя устройства, как его назвал человек. */
  device: string;
  /** Постоянный номер устройства (браузера). */
  deviceId: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
}

const KEY = 'docassist.device';

/** Имя по браузеру и системе: «Chrome на Windows», «Safari на iPhone». */
export function guessDeviceName(ua: string): string {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'устройстве';
  const browser = /YaBrowser/.test(ua)
    ? 'Яндекс Браузер'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari/.test(ua)
              ? 'Safari'
              : 'Браузер';
  return `${browser} на ${os}`;
}

let cache: DeviceInfo | null = null;
const listeners = new Set<() => void>();

function load(): DeviceInfo {
  if (cache) return cache;
  let stored: Partial<DeviceInfo> = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DeviceInfo>;
  } catch {
    /* нет памяти браузера */
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  cache = { id: stored.id || uid('dev_'), name: stored.name?.trim() || guessDeviceName(ua) };
  save(cache);
  return cache;
}

function save(d: DeviceInfo) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* без памяти браузера имя будет угадываться каждый раз */
  }
}

export function getDevice(): DeviceInfo {
  return load();
}

export function setDeviceName(name: string): void {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  cache = { ...load(), name: name.trim().slice(0, 60) || guessDeviceName(ua) };
  save(cache);
  for (const fn of [...listeners]) fn();
}

export function useDevice(): DeviceInfo {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getDevice,
  );
}

/** Метка «сейчас, на этом устройстве». */
export function makeStamp(at: Date = new Date()): Stamp {
  const d = load();
  return { at: at.toISOString(), device: d.name, deviceId: d.id };
}

/** «18.10.2026, 17:40 · Chrome на Windows» (части, которых нет, пропускаются). */
export function formatStamp(s?: Partial<Stamp> | null): string {
  if (!s) return 'неизвестно когда';
  const d = s.at ? new Date(s.at) : null;
  const when =
    d && !Number.isNaN(d.getTime()) ? d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return [when, s.device].filter(Boolean).join(' · ') || 'неизвестно когда';
}

/** Это устройство? */
export function isThisDevice(s?: Partial<Stamp> | null): boolean {
  return !!s?.deviceId && s.deviceId === load().id;
}
