import { FileText } from 'lucide-react';
import type { AppManifest } from '@/core/registry/types';

// Пример будущего приложения: карточка уже видна, но открыть его пока нельзя (status: 'soon').
const manifest: AppManifest = {
  id: 'doc-generator',
  title: 'Генератор документов',
  summary: 'Заполнение шаблонов Word данными из проверенных анкет и глобальных переменных: заявления, списки, справки.',
  icon: FileText,
  status: 'soon',
  version: '0.0.0',
  folder: 'Генератор документов',
  requiresWorkspace: true,
  order: 20,
};

export default manifest;
