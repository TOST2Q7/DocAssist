import { useMemo } from 'react';
import { APP_VERSION, GITHUB_URL } from '../config';
import { defineDocType } from '../schema/docType';
import { uid } from '../util/id';
import { getDocStore, useDocStore } from '../workspace/docStore';
import { useWorkspace } from '../workspace/WorkspaceContext';
import type { Workspace } from '../workspace/workspace';

/*
 * «Предложения в общую базу».
 *
 * Всё, что пользователь добавляет в базу данных (новые населённые пункты, улицы,
 * значения списков…), автоматически попадает сюда. Отсюда предложения можно
 * переслать разработчику: файлом, текстом или через GitHub Issue.
 * Персональные данные анкет сюда НЕ попадают — только значения древ базы (индивидуальное в базу не пишется).
 */

export interface Contribution {
  id: string;
  createdAt: string;
  /** Кто добавил: id приложения или 'core'. */
  source: string;
  /** Имя древа базы, например «Адреса» или «Должность в СО». */
  dictionary: string;
  /** Человекочитаемое описание: «с. Аскиз → Аскизский р-н, Респ. Хакасия». */
  label: string;
  entry: unknown;
  status: 'new' | 'sent';
}

export interface OutboxDoc {
  items: Contribution[];
}

export const outboxDocType = defineDocType<OutboxDoc>({
  type: 'docassist/outbox',
  version: 1,
  migrations: {},
  empty: () => ({ items: [] }),
});

/** Формат файла, которым пользователь делится с разработчиком. */
export interface ContributionsFile {
  workspace?: string;
  appVersion: string;
  exportedAt: string;
  items: Omit<Contribution, 'status'>[];
}

export const contributionsFileDocType = defineDocType<ContributionsFile>({
  type: 'docassist/contributions',
  version: 1,
  migrations: {},
  empty: () => ({ appVersion: APP_VERSION, exportedAt: new Date().toISOString(), items: [] }),
});

export function outboxStore(ws: Workspace) {
  return getDocStore(ws, ws.systemPath('outbox.json'), outboxDocType);
}

export function addContribution(ws: Workspace, c: Omit<Contribution, 'id' | 'createdAt' | 'status'>) {
  const store = outboxStore(ws);
  void store.load().then(() =>
    store.update((d) => ({ items: [...d.items, { ...c, id: uid('c_'), createdAt: new Date().toISOString(), status: 'new' }] })),
  );
}

export function contributionsAsText(items: Contribution[]): string {
  return items.map((c) => `• [${c.dictionary}] ${c.label}`).join('\n');
}

/** Ссылка на создание Issue в GitHub с заполненным текстом (нужен аккаунт GitHub). */
export function githubIssueUrl(items: Contribution[], file: ContributionsFile): string {
  const json = JSON.stringify(file, null, 1);
  const body = [
    'Предложения в общую базу из DocAssist.',
    '',
    contributionsAsText(items),
    '',
    json.length < 5000 ? '```json\n' + json + '\n```' : '_Файл слишком большой — приложите его к этому сообщению._',
  ].join('\n');
  const params = new URLSearchParams({ title: `Предложения в базу (${items.length})`, body, labels: 'dictionary' });
  return `${GITHUB_URL}/issues/new?${params.toString()}`;
}

export function useOutbox() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? outboxStore(workspace) : null), [workspace]);
  const state = useDocStore(store);
  const items = state?.data.items ?? [];
  return useMemo(
    () => ({
      items,
      newCount: items.filter((c) => c.status === 'new').length,
      markSent(ids: string[]) {
        const set = new Set(ids);
        store?.update((d) => ({ items: d.items.map((c) => (set.has(c.id) ? { ...c, status: 'sent' as const } : c)) }));
      },
      remove(id: string) {
        store?.update((d) => ({ items: d.items.filter((c) => c.id !== id) }));
      },
      clearSent() {
        store?.update((d) => ({ items: d.items.filter((c) => c.status !== 'sent') }));
      },
      toFile(selected: Contribution[]): ContributionsFile {
        return {
          workspace: workspace?.info?.id,
          appVersion: APP_VERSION,
          exportedAt: new Date().toISOString(),
          items: selected.map(({ status: _s, ...rest }) => rest),
        };
      },
    }),
    [items, store, workspace],
  );
}
