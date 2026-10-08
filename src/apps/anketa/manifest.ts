import { lazy } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { AppManifest } from '@/core/registry/types';
import { APP_FOLDER } from './constants';

const manifest: AppManifest = {
  id: 'anketa',
  title: 'Проверка анкет',
  summary: 'Загрузите таблицу анкет — приложение найдёт ошибки, слипшиеся слова и неверные адреса, предложит исправления и соберёт новую таблицу.',
  description:
    'Проверяет каждое поле анкеты по шаблонам: адреса (по дереву регион → район → село → улица), СНИЛС и ИНН (по контрольным суммам), паспорт, даты, телефоны, почту. Сверяет поля между собой и ищет дубли.',
  icon: ClipboardCheck,
  status: 'beta',
  version: '0.1.0',
  folder: APP_FOLDER,
  requiresWorkspace: true,
  badges: [{ kind: 'new' }],
  order: 10,
  component: lazy(() => import('./AnketaApp')),
};

export default manifest;
