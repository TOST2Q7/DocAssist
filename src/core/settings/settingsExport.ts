import { APPS } from '../registry/apps';
import { getThemePref } from '../theme';
import { downloadBytes } from '../util/download';
import type { Workspace } from '../workspace/workspace';

/*
 * «Скопировать настройки» — временная кнопка: все настройки приложений одним текстом, чтобы отправить
 * разработчику и он перенёс их в настройки по умолчанию. Без переменных, словаря подсказок, базы,
 * базы людей и таблиц — там данные людей.
 */

export interface SettingsExport {
  $type: 'docassist/settings-export';
  app: string;
  exportedAt: string;
  theme: string;
  /** Путь в рабочей папке → содержимое файла (как есть, с конвертом версии). */
  files: Record<string, unknown>;
}

export async function collectSettings(ws: Workspace): Promise<SettingsExport> {
  const files: Record<string, unknown> = {};
  for (const app of APPS) {
    for (const path of app.settingsFiles ?? []) {
      const json = await ws.readJson(path).catch(() => undefined);
      if (json !== undefined) files[path] = json;
    }
  }
  return { $type: 'docassist/settings-export', app: __APP_VERSION__, exportedAt: new Date().toISOString(), theme: getThemePref(), files };
}

/** Скопировать в буфер; если браузер не дал — скачать файлом. */
export async function copySettings(ws: Workspace): Promise<'clipboard' | 'file'> {
  const text = JSON.stringify(await collectSettings(ws), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    return 'clipboard';
  } catch {
    downloadBytes(text, `DocAssist-настройки-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    return 'file';
  }
}
