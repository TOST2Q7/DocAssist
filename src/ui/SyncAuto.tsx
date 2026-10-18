import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorText, signedInEvents } from '@/core/google';
import { getSyncPrefs, hasRememberedKey, runSync, setPendingConflicts } from '@/core/sync/personal';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { useToast } from './Toast';

/**
 * При входе в Google — подтянуть личные настройки, если перенос включён на этом устройстве.
 * Фраза не запомнена — подсказать ввести её; расхождения — предложить решить на странице «Google».
 */
export function SyncAuto() {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();
  useEffect(
    () =>
      signedInEvents.on(() => {
        const prefs = getSyncPrefs();
        if (!workspace || !prefs.enabled || !prefs.auto) return;
        void (async () => {
          if (!(await hasRememberedKey())) {
            toast('Личные настройки на Google Диске: введите контрольную фразу, чтобы подтянуть их.', { label: 'Ввести', run: () => navigate('/google#sync') });
            return;
          }
          try {
            const step = await runSync(workspace);
            if (step.kind === 'conflicts') {
              setPendingConflicts(step);
              toast(`Личные настройки: версии разошлись (${step.conflicts.length}).`, { label: 'Решить', run: () => navigate('/google#sync') });
            } else if (step.kind === 'need-phrase') {
              toast('Личные настройки: фраза не подошла к файлу на Диске — введите её заново.', { label: 'Ввести', run: () => navigate('/google#sync') });
            } else if (step.summary.pulled || step.summary.pushed) {
              toast(`Личные настройки сверены: получено ${step.summary.pulled}, отправлено ${step.summary.pushed}.`);
            }
          } catch (e) {
            toast(`Личные настройки не сверены: ${errorText(e)}`);
          }
        })();
      }),
    [workspace, toast, navigate],
  );
  return null;
}
