import { useEffect } from 'react';
import { getSeen, mergeSeen, subscribeSeen } from '../registry/badges';
import { defineDocType } from '../schema/docType';
import { getThemePref, setThemePref, subscribeTheme, type ThemePref } from '../theme';
import { getDocStore } from '../workspace/docStore';
import { useWorkspace } from '../workspace/WorkspaceContext';

/*
 * Настройки интерфейса (тема, просмотренные «Новое!») хранятся в браузере и дублируются в рабочую
 * папку: «.docassist/prefs.json». Откроете ту же папку в другом браузере — настройки вернутся.
 */

export interface Prefs {
  theme?: ThemePref;
  seen?: Record<string, string>;
}

export const prefsDocType = defineDocType<Prefs>({ type: 'docassist/prefs', version: 1, migrations: {}, empty: () => ({}) });

export function usePrefsSync() {
  const { workspace } = useWorkspace();
  useEffect(() => {
    if (!workspace) return;
    const store = getDocStore(workspace, workspace.systemPath('prefs.json'), prefsDocType);
    let ready = false;
    const save = () => {
      if (!ready) return;
      const next: Prefs = { theme: getThemePref(), seen: getSeen() };
      if (JSON.stringify(next) !== JSON.stringify(store.get().data)) store.update(() => next);
    };
    void store.load().then(() => {
      const d = store.get().data;
      if (d.theme && d.theme !== getThemePref()) setThemePref(d.theme);
      if (d.seen) mergeSeen(d.seen);
      ready = !store.get().tooNew && !store.get().broken;
      save();
    });
    const offTheme = subscribeTheme(save);
    const offSeen = subscribeSeen(save);
    return () => {
      offTheme();
      offSeen();
    };
  }, [workspace]);
}
