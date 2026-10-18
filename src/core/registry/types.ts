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
  /** Коротко, одной фразой простыми словами — для плитки на обложке главной. Нет — берётся summary. */
  tagline?: string;
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
  /** Файлы настроек приложения (пути в рабочей папке) — для «Скопировать настройки». Переменные, словарь и данные людей сюда не входят. */
  settingsFiles?: string[];
  /**
   * Что из данных приложения можно переносить между устройствами через личный Google Диск (зашифровано контрольной
   * фразой, src/core/sync). Настройки из settingsFiles переносятся и так — здесь то, что сверх них.
   */
  syncGroups?: SyncGroupDef[];
  badges?: BadgeDef[];
  /** Порядок на главной (меньше — выше). */
  order?: number;
  /** Раздел приложения на странице «База данных» (просмотр и ручное добавление). Грузится только при открытии. */
  baseView?: LazyExoticComponent<ComponentType>;
  /**
   * Окно для файлов, перетащенных в любое место сайта (src/ui/FileDrop.tsx): что за файл, на чьё имя, куда сохранить.
   * Используется первое приложение, у которого оно есть. Грузится только при первом перетаскивании.
   */
  fileDrop?: LazyExoticComponent<ComponentType<FileDropProps>>;
  /** Ленивая загрузка интерфейса (код приложения грузится только при открытии). */
  component?: LazyExoticComponent<ComponentType>;
}

export interface SyncGroupDef {
  /** Постоянный идентификатор группы. */
  id: string;
  title: string;
  hint?: string;
  /** Пути файлов в рабочей папке. */
  files: string[];
  /** Включена по умолчанию. */
  default?: boolean;
  /** Здесь личные данные людей — предупредить перед включением. */
  personal?: boolean;
}

export interface FileDropProps {
  /** Файлы по порядку; пока окно открыто, в конец могут добавиться новые. */
  files: File[];
  onClose: () => void;
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
