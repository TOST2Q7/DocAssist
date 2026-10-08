import { BookOpenText, FolderOpen, HelpCircle, Info, Send, Variable } from 'lucide-react';
import type { MenuItem } from './types';

/*
 * Служебные пункты бургер-меню. Новые разделы добавляются сюда —
 * меню и главная страница строятся из этого списка автоматически.
 */
export const SERVICE_MENU: MenuItem[] = [
  { id: 'workspace', title: 'Рабочая папка', to: '/workspace', icon: FolderOpen },
  { id: 'variables', title: 'Глобальные переменные', to: '/variables', icon: Variable, badges: [{ kind: 'new' }] },
  { id: 'dictionaries', title: 'Справочники', to: '/dictionaries', icon: BookOpenText },
  { id: 'outbox', title: 'Предложения в базу', to: '/outbox', icon: Send, counter: 'outbox' },
  { id: 'faq', title: 'Частые вопросы', to: '/faq', icon: HelpCircle },
  { id: 'about', title: 'О программе и обновления', to: '/about', icon: Info },
];
