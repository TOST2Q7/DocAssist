import { lazy } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { AppManifest } from '@/core/registry/types';
import { APP_FOLDER } from './constants';

const manifest: AppManifest = {
  id: 'anketa',
  title: 'Проверка анкет',
  summary: 'Проверка таблицы анкет: формат из блоков, значения из базы и древо адресов. Индивидуальное — галочкой у каждого. Исправления и новая таблица.',
  description:
    'Каждый из 35 столбцов анкеты проверяется по своему правилу: формат из блоков (телефон, дата, число от … до …), список значений из базы или древо с конструктором (адреса и место рождения). База сначала пустая — значения попадают в неё, когда вы их подтверждаете. Паспорт, СНИЛС, ИНН, телефон и другое индивидуальное всегда подтверждается отдельно, повторы у разных людей — ошибка. Таблицу можно открыть из файла или вставить через Ctrl+V.',
  icon: ClipboardCheck,
  status: 'beta',
  version: '0.4.0',
  folder: APP_FOLDER,
  requiresWorkspace: true,
  badges: [{ kind: 'updated', label: 'Формат из блоков' }],
  baseView: lazy(() => import('./ui/BaseView')),
  order: 10,
  component: lazy(() => import('./AnketaApp')),
};

export default manifest;
