/*
 * Скрипты Google подгружаются только тогда, когда человек открывает раздел с Google, —
 * остальное приложение работает офлайн. Загружать заранее (при показе кнопки), а не по клику:
 * иначе браузер может заблокировать окно входа, открытое «не сразу после нажатия».
 */

const loading = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  let p = loading.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        loading.delete(src);
        el.remove();
        reject(new Error('Не удалось загрузить скрипт Google — нет интернета или он заблокирован.'));
      };
      document.head.appendChild(el);
    });
    loading.set(src, p);
  }
  return p;
}

export const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const GAPI_SRC = 'https://apis.google.com/js/api.js';
