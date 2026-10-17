import { useMemo } from 'react';
import { defineDocType } from '@/core/schema/docType';
import { getDocStore, useDocStore } from '@/core/workspace/docStore';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { SETTINGS_FILE } from './constants';
import { MAILING_MARKS } from './member-card/fill';

/* Настройки приложения: «Генератор документов/settings.json». */

export interface GeneratorSettings {
  /** Знак у «информ. рассылка», когда человек согласен на рассылку. */
  mark?: string;
}

export const settingsDocType = defineDocType<GeneratorSettings>({
  type: 'docassist/doc-generator-settings',
  version: 1,
  migrations: {},
  empty: () => ({}),
});

export function useGeneratorSettings() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? getDocStore(workspace, SETTINGS_FILE, settingsDocType) : null), [workspace]);
  const state = useDocStore(store);
  const data = state?.data;
  return useMemo(
    () => ({
      mark: data?.mark ?? MAILING_MARKS.check,
      setMark(mark: string) {
        if (!state?.tooNew && !state?.broken) store?.update((d) => ({ ...d, mark }));
      },
    }),
    [data, state?.tooNew, state?.broken, store],
  );
}
