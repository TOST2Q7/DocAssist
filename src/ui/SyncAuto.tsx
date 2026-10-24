import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorText, signedInEvents } from '@/core/google';
import { gramotkiStore } from '@/core/gramotka/store';
import { gramotkiSummaryText, gramotkiSyncEnabled, runGramotkiSync } from '@/core/sync/gramotki';
import { getSyncPrefs, hasRememberedKey, runSync, setPendingConflicts } from '@/core/sync/personal';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { useToast } from './Toast';

/**
 * При входе в Google — подтянуть личные настройки, если перенос включён на этом устройстве.
 * Пароль не запомнен — подсказать ввести его; расхождения — предложить решить на странице «Google».
 * Грамотки (если их перенос включён) сверяются следом — только если они уже открыты: фразу при входе не спрашиваем.
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
          if (gramotkiSyncEnabled() && gramotkiStore(workspace).snapshot().status === 'open') {
            void runGramotkiSync(workspace)
              .then((g) => {
                if (!g) return;
                if (g.conflicts.length) toast(`Грамотки: нужно решить ${g.conflicts.length}.`, { label: 'Решить', run: () => navigate('/google#sync') });
                else if (g.downloaded || g.uploaded) toast(gramotkiSummaryText(g));
              })
              .catch((e: unknown) => toast(`Грамотки не сверены: ${errorText(e)}`));
          }
          if (!(await hasRememberedKey())) {
            toast('Личные настройки на Google Диске: введите пароль, чтобы подтянуть их.', { label: 'Ввести', run: () => navigate('/google#sync') });
            return;
          }
          try {
            const step = await runSync(workspace);
            if (step.kind === 'conflicts') {
              setPendingConflicts(step);
              toast(`Личные настройки: версии разошлись (${step.conflicts.length}).`, { label: 'Решить', run: () => navigate('/google#sync') });
            } else if (step.kind === 'need-password') {
              toast('Личные настройки: пароль не подошёл к файлу на Диске — введите его заново.', { label: 'Ввести', run: () => navigate('/google#sync') });
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
