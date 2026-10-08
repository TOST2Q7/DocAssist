import type { AppManifest } from './types';

/*
 * Реестр приложений собирается автоматически: каждое приложение — папка
 * src/apps/<id>/ с файлом manifest.ts. Чтобы добавить приложение, достаточно
 * создать новую папку — главная страница и меню подхватят его сами.
 */

const modules = import.meta.glob<{ default: AppManifest }>('../../apps/*/manifest.ts', { eager: true });

export const APPS: AppManifest[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title, 'ru'));

export function getApp(id: string): AppManifest | undefined {
  return APPS.find((a) => a.id === id);
}

export function appPath(app: AppManifest): string {
  return `/apps/${app.id}`;
}
