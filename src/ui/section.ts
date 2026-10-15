import { useLocation } from 'react-router-dom';
import { appPath, getApp } from '@/core/registry/apps';
import { SERVICE_MENU } from '@/core/registry/menu';

/*
 * Текущий раздел сайта — для «где я» в шапке, графы «Лист» в подвале и смены разделов.
 * Раздел — это приложение (/apps/<id>) или служебная страница из меню; главная разделом не считается.
 */

export interface Section {
  /** Ключ раздела: «/apps/anketa», «/faq». Внутри одного раздела не меняется. */
  key: string;
  title: string;
  /** Куда ведёт название раздела в шапке — в начало раздела. */
  to: string;
}

export function sectionKey(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'apps' && parts[1]) return `/apps/${parts[1]}`;
  return parts.length ? `/${parts[0]}` : '/';
}

export function sectionOf(pathname: string): Section | null {
  const key = sectionKey(pathname);
  if (key === '/') return null;
  if (key.startsWith('/apps/')) {
    const app = getApp(key.slice('/apps/'.length));
    return app ? { key, title: app.title, to: appPath(app) } : null;
  }
  const item = SERVICE_MENU.find((m) => m.to === key);
  return item ? { key, title: item.title, to: item.to } : null;
}

export function useSection(): Section | null {
  return sectionOf(useLocation().pathname);
}
