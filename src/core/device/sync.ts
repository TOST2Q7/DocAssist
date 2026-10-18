import type { Stamp } from './device';

/*
 * Общий механизм расхождений «устройство ↔ Google Диск». Одни и те же правила для настроек и для файлов.
 *
 * У каждого элемента три состояния: как сейчас на устройстве, как сейчас на Диске и как было при последней
 * сверке (база). Сравниваем отпечатки (контрольные суммы):
 *   - одинаковые — всё в порядке;
 *   - изменилось только на устройстве — отправить на Диск;
 *   - изменилось только на Диске — взять с Диска;
 *   - изменилось и там, и там (по-разному) — расхождение: решает человек, по меткам «дата, время, устройство».
 */

export type SyncAction = 'same' | 'push' | 'pull' | 'conflict';

/** Что делать с элементом. Отпечаток undefined — элемента нет на этой стороне. */
export function decideSync(local: string | undefined, remote: string | undefined, base: string | undefined): SyncAction {
  if (local === remote) return 'same';
  if (remote === undefined) return 'push';
  if (local === undefined) return 'pull';
  if (base !== undefined && local === base) return 'pull';
  if (base !== undefined && remote === base) return 'push';
  return 'conflict';
}

/** Одна сторона расхождения — что показать человеку. */
export interface ConflictSide {
  stamp?: Partial<Stamp> | null;
  /** Размер, число записей и т. п. */
  details?: string;
  /** Ссылка на картинку для миниатюры (если есть). */
  imageUrl?: string;
}

export interface Conflict {
  id: string;
  /** Что расходится: «Шаблоны документов», «Паспорт — Фамилия И. О.jpg». */
  title: string;
  local: ConflictSide;
  remote: ConflictSide;
  /** Можно ли сохранить обе версии (для файлов). */
  allowBoth?: boolean;
}

/**
 * Решение человека:
 *  - keep — какая версия верная;
 *  - overwrite — переписать другую сторону верной версией (иначе другая сторона остаётся как есть).
 */
export interface ConflictChoice {
  id: string;
  keep: 'local' | 'remote' | 'both';
  overwrite: boolean;
}
