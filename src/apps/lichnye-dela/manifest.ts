import { lazy } from 'react';
import { BookUser } from 'lucide-react';
import type { AppManifest } from '@/core/registry/types';
import { APP_FOLDER, TEMPLATES_FILE } from './constants';

const manifest: AppManifest = {
  id: 'lichnye-dela',
  title: 'Личные дела',
  tagline: 'Данные бойца, фото и сканы, документы для перевода',
  summary: 'Ручной ввод всех данных бойца в базу людей и личная папка: фото, сканы, достижения, характеристика. Перевод бойца — документы, таблица, фото и сканы одним архивом.',
  description:
    'Добавляете бойца по ФИО и заполняете все 35 полей анкеты вручную — с подсказками формата и исправлениями. Для каждого создаётся личная папка: фотографии, сканы документов с подписями, достижения с грамотами и характеристика (с заготовкой по данным бойца). Перевод одного или нескольких бойцов: заявление, ходатайство, характеристика, личная карточка с фото, свои бланки Word с метками, таблица Excel со всеми данными, фото 3×4 и сканы с понятными именами, опись.',
  icon: BookUser,
  status: 'beta',
  version: '0.1.0',
  folder: APP_FOLDER,
  settingsFiles: [TEMPLATES_FILE],
  requiresWorkspace: true,
  badges: [{ kind: 'new' }],
  order: 15,
  component: lazy(() => import('./LichnyeDelaApp')),
  // Файл, перетащенный в любое место сайта: что это и на чьё имя — и в личную папку.
  fileDrop: lazy(() => import('./ui/IncomingDialog')),
};

export default manifest;
