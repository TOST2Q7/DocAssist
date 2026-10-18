import { GOOGLE_API_KEY, GOOGLE_APP_ID } from './config';
import { ensureToken } from './auth';
import { FOLDER_MIME } from './drive';
import { GoogleError } from './errors';
import { GAPI_SRC, loadScript } from './loader';

/*
 * Окно выбора Google (Google Picker). Человек видит в нём весь свой Диск (и папки, которые ему открыли),
 * а приложение получает доступ только к тому, что выбрано. Так «показывают» файлы приложению.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi?: { load(name: string, cb: () => void): void };
  }
}

export interface PickOptions {
  kind: 'files' | 'folders' | 'spreadsheets';
  multiple?: boolean;
  /** Открыть сразу в этой папке. */
  parentId?: string;
  title?: string;
  /** Показать только эти файлы (например, чтобы одним выбором показать все файлы дела). */
  fileIds?: string[];
}

export interface PickedItem {
  id: string;
  name: string;
  mimeType: string;
  parentId?: string;
  url?: string;
  sizeBytes?: number;
}

let pickerReady: Promise<void> | null = null;

/** Загрузить окно выбора заранее (вместе с кнопкой), чтобы оно открылось сразу по нажатию. */
export function preparePicker(): Promise<void> {
  if (!pickerReady) {
    pickerReady = loadScript(GAPI_SRC).then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (!window.gapi) return reject(new GoogleError('other', 'Окно выбора Google не загрузилось.'));
          window.gapi.load('picker', () => resolve());
        }),
    );
    pickerReady.catch(() => (pickerReady = null));
  }
  return pickerReady;
}

function views(p: any, o: PickOptions): any[] {
  const make = () => {
    const v =
      o.kind === 'spreadsheets'
        ? new p.DocsView(p.ViewId.SPREADSHEETS)
        : o.kind === 'folders'
          ? new p.DocsView(p.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true).setMimeTypes(FOLDER_MIME)
          : new p.DocsView(p.ViewId.DOCS).setIncludeFolders(true);
    if (o.fileIds?.length && typeof v.setFileIds === 'function') v.setFileIds(o.fileIds.join(','));
    return v;
  };
  if (o.parentId) return [make().setParent(o.parentId)];
  const label = (v: any, text: string) => {
    if (typeof v.setLabel === 'function') v.setLabel(text);
    return v;
  };
  // Папки, которые выдал админ, лежат в «Доступные мне», а не в «Моём диске».
  return [label(make().setOwnedByMe(false), 'Доступные мне'), label(make().setOwnedByMe(true), 'Мой диск'), label(make().setEnableDrives(true), 'Общие диски')];
}

/** Открыть окно выбора. Пустой список — человек закрыл окно. Вызывать из обработчика нажатия. */
export async function pick(o: PickOptions): Promise<PickedItem[]> {
  if (!GOOGLE_API_KEY || !GOOGLE_APP_ID) throw new GoogleError('other', 'Окно выбора Google не настроено (нет API-ключа или номера проекта).');
  const token = await ensureToken();
  await preparePicker();
  const p = (window as any).google?.picker;
  if (!p) throw new GoogleError('other', 'Окно выбора Google не загрузилось.');
  return new Promise<PickedItem[]>((resolve) => {
    let b = new p.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setAppId(GOOGLE_APP_ID)
      .setLocale('ru')
      .setOrigin(window.location.origin)
      .setCallback((data: any) => {
        const action = data[p.Response.ACTION];
        if (action === p.Action.CANCEL) resolve([]);
        if (action !== p.Action.PICKED) return;
        const docs: any[] = data[p.Response.DOCUMENTS] ?? [];
        resolve(
          docs.map((d) => ({
            id: d[p.Document.ID],
            name: d[p.Document.NAME],
            mimeType: d[p.Document.MIME_TYPE],
            parentId: d[p.Document.PARENT_ID],
            url: d[p.Document.URL],
            sizeBytes: d[p.Document.SIZE_BYTES] ? Number(d[p.Document.SIZE_BYTES]) : undefined,
          })),
        );
      });
    for (const v of views(p, o)) b = b.addView(v);
    if (o.multiple) b = b.enableFeature(p.Feature.MULTISELECT_ENABLED);
    if (o.title) b = b.setTitle(o.title);
    b.build().setVisible(true);
  });
}
