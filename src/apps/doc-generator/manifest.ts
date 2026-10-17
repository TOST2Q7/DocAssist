import { lazy } from 'react';
import { FileText } from 'lucide-react';
import type { AppManifest } from '@/core/registry/types';
import { APP_FOLDER, SETTINGS_FILE } from './constants';

const manifest: AppManifest = {
  id: 'doc-generator',
  title: 'Генератор документов',
  summary: 'Документы Word из базы людей: учётная карточка члена организации. Чего не хватило — дописывается тут же и сохраняется в базу.',
  description:
    'Выберите человека из базы людей — приложение заполнит бланк Word по образцу методического пособия: Times New Roman 12, сетка таблицы не меняется, файл называется «Фамилия И.О. - Учетная карточка члена организации». Недостающие данные подсвечиваются — их можно вписать прямо в форме и дописать в базу людей.',
  icon: FileText,
  status: 'beta',
  version: '0.1.0',
  folder: APP_FOLDER,
  settingsFiles: [SETTINGS_FILE],
  requiresWorkspace: true,
  badges: [{ kind: 'new' }],
  order: 20,
  component: lazy(() => import('./DocGeneratorApp')),
};

export default manifest;
