import { useMemo } from 'react';
import { defineDocType } from '@/core/schema/docType';
import { buildDocx, type DocBlock } from '@/core/docx/write';
import { getDocStore, useDocStore } from '@/core/workspace/docStore';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import type { Workspace } from '@/core/workspace/workspace';
import { uid } from '@/core/util/id';
import { TEMPLATES_FILE } from '../constants';
import { fillText } from './placeholders';
import { DEFAULT_SCAN_NAME } from './scanNames';

/*
 * Тексты документов — как в обычном заявлении: «шапка» справа (кому и от кого), заголовок по центру,
 * текст абзацами, внизу дата и подпись. Всё с метками {ФИО}, {Новый отряд}… — меняется в «Шаблонах».
 * В файле «Личные дела/templates.json» хранится только то, что изменено, и свои шаблоны.
 */

export interface TextTemplate {
  id: string;
  title: string;
  /** Кому и от кого — в правой половине листа, построчно. */
  header: string;
  /** Заголовок по центру («Заявление»). */
  heading: string;
  /** Строки под заголовком по центру («бойца отряда …»). */
  subheading: string;
  /** Текст: каждая строка — абзац с отступом. */
  body: string;
  /** Внизу слева (дата, должность) и справа (подпись). */
  signLeft: string;
  signRight: string;
  /** Включать в пакет перевода по умолчанию. */
  forTransfer: boolean;
  builtin?: boolean;
}

export const DEFAULT_TEMPLATES: TextTemplate[] = [
  {
    id: 'transfer-request',
    title: 'Заявление о переводе',
    header: 'Командиру отряда {Новый отряд}\n{Командир нового отряда:кому}\nбойца отряда {Отряд}\n{ФИО:кого}\nтел. {Телефон}',
    heading: 'Заявление',
    subheading: '',
    body: 'Прошу перевести меня из отряда {Отряд} в отряд {Новый отряд} с {Дата перевода} в связи с {Причина}.',
    signLeft: '{Сегодня}',
    signRight: '__________ / {ФИО:подпись}',
    forTransfer: true,
  },
  {
    id: 'transfer-petition',
    title: 'Ходатайство о переводе',
    header: 'Командиру отряда {Новый отряд}\n{Командир нового отряда:кому}',
    heading: 'Ходатайство',
    subheading: '',
    body:
      'Прошу принять в отряд {Новый отряд} в порядке перевода бойца отряда {Отряд} {ФИО:кого}, {Дата рождения} г. р., с {Дата перевода}.\n' +
      '{Он|Она} состоит в Российских студенческих отрядах с {Дата вступления}, номер членского билета {Членский билет}.\n' +
      'Характеристика прилагается.',
    signLeft: 'Командир отряда {Отряд}\n{Сегодня}',
    signRight: '__________ / {Командир прежнего отряда:подпись}',
    forTransfer: true,
  },
  {
    id: 'characteristic',
    title: 'Характеристика',
    header: '',
    heading: 'Характеристика',
    subheading: 'бойца отряда {Отряд}\n{ФИО:кого}, {Дата рождения} г. р.',
    body: '{Характеристика}',
    signLeft: 'Командир отряда {Отряд}\n{Сегодня}',
    signRight: '__________ / {Командир прежнего отряда:подпись}',
    forTransfer: true,
  },
];

const DEFAULT_BY_ID = new Map(DEFAULT_TEMPLATES.map((t) => [t.id, t]));

/** Заготовка характеристики — вставляется в личной папке уже с подставленными данными. */
export const CHARACTERISTIC_DRAFT =
  '{ФИО}, {Дата рождения} г. р., состоит в отряде {Отряд} с {Дата вступления}, должность — {Должность}.\n' +
  'За время пребывания в отряде {зарекомендовал|зарекомендовала} себя как ответственный, дисциплинированный и исполнительный боец. ' +
  'Добросовестно относится к поручениям, активно участвует в жизни отряда, пользуется уважением товарищей.\n' +
  '{Достижения в тексте}\n' +
  'Нарушений устава Российских студенческих отрядов не имеет.';

export interface TemplatesDoc {
  /** Изменённые встроенные (по id) и свои шаблоны. */
  templates: Record<string, Partial<TextTemplate>>;
  /** Шаблон имени файла скана (если изменён). */
  scanName?: string;
}

export const templatesDocType = defineDocType<TemplatesDoc>({
  type: 'lichnye-dela/templates',
  version: 1,
  migrations: {},
  empty: () => ({ templates: {} }),
});

/** Встроенные с правками + свои шаблоны. */
export function mergeTemplates(doc: TemplatesDoc): TextTemplate[] {
  const builtins = DEFAULT_TEMPLATES.map((t) => ({ ...t, ...doc.templates[t.id], id: t.id, builtin: true }));
  const own = Object.entries(doc.templates)
    .filter(([id]) => !DEFAULT_BY_ID.has(id))
    .map(([id, t]) => ({ ...emptyTemplate(), ...t, id, builtin: false }));
  return [...builtins, ...own];
}

export function emptyTemplate(): TextTemplate {
  return { id: uid('t_'), title: 'Новый документ', header: '', heading: '', subheading: '', body: '', signLeft: '{Сегодня}', signRight: '__________ / {ФИО:подпись}', forTransfer: false };
}

/** Изменено ли что-то во встроенном шаблоне. */
export function isModified(t: TextTemplate): boolean {
  const d = DEFAULT_BY_ID.get(t.id);
  if (!d) return false;
  return (['title', 'header', 'heading', 'subheading', 'body', 'signLeft', 'signRight', 'forTransfer'] as const).some((k) => t[k] !== d[k]);
}

const lines = (s: string) => s.split('\n');

/** Блоки документа: метки уже заменены. */
export function templateBlocks(t: TextTemplate, resolve: (key: string) => string | undefined): DocBlock[] {
  const fill = (s: string) => fillText(s, resolve);
  const blocks: DocBlock[] = [];
  const header = fill(t.header).trim();
  if (header) {
    for (const l of lines(header)) blocks.push({ type: 'p', text: l, indentLeft: 85 });
    blocks.push({ type: 'p' }, { type: 'p' });
  }
  const heading = fill(t.heading).trim();
  if (heading) blocks.push({ type: 'p', text: heading, align: 'center', bold: true, keepNext: true });
  const sub = fill(t.subheading).trim();
  for (const l of sub ? lines(sub) : []) blocks.push({ type: 'p', text: l, align: 'center', keepNext: true });
  if (heading || sub) blocks.push({ type: 'p' });
  for (const l of lines(fill(t.body))) {
    const text = l.trim();
    blocks.push(text ? { type: 'p', text, align: 'both', firstLine: 12.5 } : { type: 'p' });
  }
  const left = fill(t.signLeft).trim();
  const right = fill(t.signRight).trim();
  if (left || right) {
    blocks.push({ type: 'p' }, { type: 'p' });
    blocks.push({ type: 'table', borders: false, widths: [1, 1], rows: [[{ text: left }, { text: right, align: 'right' }]] });
  }
  return blocks;
}

export function templateDocx(t: TextTemplate, resolve: (key: string) => string | undefined): Uint8Array {
  return buildDocx(templateBlocks(t, resolve));
}

export function templatesStore(ws: Workspace) {
  return getDocStore(ws, TEMPLATES_FILE, templatesDocType);
}

export function useTemplates() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? templatesStore(workspace) : null), [workspace]);
  const state = useDocStore(store);
  const doc = state?.data;
  return useMemo(() => {
    const list = mergeTemplates(doc ?? { templates: {} });
    return {
      loaded: !!state?.loaded,
      readOnly: !!state?.tooNew || !!state?.broken,
      list,
      /** Сохранить шаблон: у встроенного — только отличия от исходного. */
      save(t: TextTemplate) {
        const d = DEFAULT_BY_ID.get(t.id);
        const { builtin: _b, id: _id, ...rest } = t;
        void _b;
        void _id;
        const patch: Partial<TextTemplate> = d ? Object.fromEntries(Object.entries(rest).filter(([k, v]) => d[k as keyof TextTemplate] !== v)) : rest;
        store?.update((x) => {
          const templates = { ...x.templates };
          if (d && !Object.keys(patch).length) delete templates[t.id];
          else templates[t.id] = patch;
          return { ...x, templates };
        });
      },
      /** Встроенный — вернуть как было, свой — удалить. */
      reset(id: string) {
        store?.update((x) => {
          const templates = { ...x.templates };
          delete templates[id];
          return { ...x, templates };
        });
      },
      /** Шаблон имени файла скана. */
      scanName: doc?.scanName?.trim() || DEFAULT_SCAN_NAME,
      setScanName(v: string) {
        const next = v.trim();
        store?.update((x) => ({ ...x, scanName: next && next !== DEFAULT_SCAN_NAME ? next : undefined }));
      },
    };
  }, [doc, state?.loaded, state?.tooNew, state?.broken, store]);
}
