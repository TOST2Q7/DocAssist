import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';

/*
 * Бейджи — универсальные метки для карточек приложений и пунктов меню.
 * «Новое!» показывается, пока пользователь не откроет пункт (или до даты until).
 */
export type BadgeKind = 'new' | 'beta' | 'soon' | 'updated' | 'count' | 'warning';

export interface BadgeDef {
  kind: BadgeKind;
  /** Свой текст вместо стандартного. */
  label?: string;
  /** До какой даты показывать (ISO). */
  until?: string;
  /** Скрывать после того, как пользователь открыл пункт. По умолчанию — да для 'new' и 'updated'. */
  hideWhenSeen?: boolean;
}

export type AppStatus = 'stable' | 'beta' | 'soon';

export interface AppManifest {
  /** Постоянный идентификатор (латиница), используется в URL и в данных. Менять нельзя. */
  id: string;
  title: string;
  /** Одна строка для карточки и меню. */
  summary: string;
  /** Подробное описание для главной страницы. */
  description?: string;
  icon: LucideIcon;
  status: AppStatus;
  /** Версия приложения-модуля: при её смене бейдж «Обновлено» снова покажется. */
  version: string;
  /** Папка приложения внутри рабочей папки. */
  folder: string;
  /** Нужна ли открытая рабочая папка. */
  requiresWorkspace: boolean;
  badges?: BadgeDef[];
  /** Порядок на главной (меньше — выше). */
  order?: number;
  /** Ленивая загрузка интерфейса (код приложения грузится только при открытии). */
  component?: LazyExoticComponent<ComponentType>;
}

export interface MenuItem {
  id: string;
  title: string;
  to: string;
  icon: LucideIcon;
  badges?: BadgeDef[];
  /** Динамический бейдж-счётчик (например, число предложений). */
  counter?: 'outbox';
}
