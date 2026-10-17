import templateUrl from './template.docx?url&inline';
import { dataUrlToBytes, openDocx, tableCells } from '../docx/docx';
import { layoutCard, type CardLayout } from './fill';

/*
 * Бланк учётной карточки члена организации (с 01.01.2026) встроен в приложение — работает офлайн
 * и в версии одним файлом. Разбирается один раз: разметка нужна и форме (что поместится в строку), и заполнению.
 */

export interface CardTemplate {
  bytes: Uint8Array;
  layout: CardLayout;
}

let loading: Promise<CardTemplate> | null = null;

export function loadCardTemplate(): Promise<CardTemplate> {
  loading ??= (async () => {
    const bytes = dataUrlToBytes(templateUrl);
    const doc = await openDocx(bytes);
    return { bytes, layout: layoutCard(tableCells(doc.xml)) };
  })();
  return loading;
}
