import { lazy } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { AppManifest } from '@/core/registry/types';
import { APP_FOLDER } from './constants';

const manifest: AppManifest = {
  id: 'anketa',
  title: 'Проверка анкет',
  summary: 'Загрузите таблицу анкет — приложение найдёт ошибки, подскажет, как их исправить, и соберёт исправленную таблицу.',
  description:
    'Откройте таблицу из файла или вставьте строки через Ctrl+V. Приложение проверит каждую анкету: опечатки, лишние пробелы, даты, телефоны, СНИЛС, адреса и названия. Ошибки подсвечиваются, а рядом — готовое исправление, которое ставится одной кнопкой. Паспорт, СНИЛС, телефон и другие личные данные нужно проверить глазами и отметить галочкой «Проверено». Когда всё готово — скачайте новую таблицу. Исходный файл не меняется.',
  icon: ClipboardCheck,
  status: 'beta',
  version: '0.6.0',
  folder: APP_FOLDER,
  settingsFiles: [`${APP_FOLDER}/checks.json`],
  requiresWorkspace: true,
  badges: [{ kind: 'updated', label: 'Обновлено' }],
  baseView: lazy(() => import('./ui/BaseView')),
  order: 10,
  component: lazy(() => import('./AnketaApp')),
};

export default manifest;
