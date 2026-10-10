import { lazy } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { AppManifest } from '@/core/registry/types';
import { APP_FOLDER } from './constants';

const manifest: AppManifest = {
  id: 'anketa',
  title: 'Проверка анкет',
  summary: 'Проверка таблицы анкет кодом на Lua с настройками: формат, значения из базы и древо адресов. Индивидуальное — галочкой у каждого. Исправления и новая таблица.',
  description:
    'Каждый из 35 столбцов анкеты проверяется своим кодом на Lua с понятными настройками (переключатели и поля, код — только если нужно): формат, список значений из базы или древо с конструктором (адреса и место рождения). База сначала пустая — значения попадают в неё, когда вы их подтверждаете. Паспорт, СНИЛС, ИНН, телефон и другое индивидуальное всегда подтверждается отдельно, повторы у разных людей — ошибка. Таблицу можно открыть из файла или вставить через Ctrl+V.',
  icon: ClipboardCheck,
  status: 'beta',
  version: '0.5.0',
  folder: APP_FOLDER,
  settingsFiles: [`${APP_FOLDER}/checks.json`],
  requiresWorkspace: true,
  badges: [{ kind: 'updated', label: 'Проверки на Lua' }],
  baseView: lazy(() => import('./ui/BaseView')),
  order: 10,
  component: lazy(() => import('./AnketaApp')),
};

export default manifest;
