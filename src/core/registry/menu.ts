import { BookOpen, Cloud, Database, FolderOpen, HelpCircle, Info, Palette, Send, Variable } from 'lucide-react';
import type { MenuItem } from './types';

/*
 * Служебные пункты бургер-меню. Новые разделы добавляются сюда —
 * меню и главная страница строятся из этого списка автоматически.
 */
export const SERVICE_MENU: MenuItem[] = [
  { id: 'workspace', title: 'Рабочая папка', to: '/workspace', icon: FolderOpen },
  { id: 'variables', title: 'Глобальные переменные', to: '/variables', icon: Variable },
  { id: 'base', title: 'База данных', to: '/base', icon: Database, badges: [{ kind: 'new' }] },
  { id: 'outbox', title: 'Предложения в базу', to: '/outbox', icon: Send, counter: 'outbox' },
  { id: 'google', title: 'Google и безопасность', to: '/google', icon: Cloud, badges: [{ kind: 'new' }] },
  { id: 'help', title: 'Справка: документы ЛСО', to: '/help', icon: BookOpen, badges: [{ kind: 'new' }] },
  { id: 'rso', title: 'Материалы РСО', to: '/rso', icon: Palette, badges: [{ kind: 'new' }] },
  { id: 'faq', title: 'Частые вопросы', to: '/faq', icon: HelpCircle },
  { id: 'about', title: 'О программе и обновления', to: '/about', icon: Info },
];
