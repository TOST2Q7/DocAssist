/*
 * Гра́мотка — папка на одного человека, закрытая своим ключом: данные (поля общего языка), разделы приложений,
 * файлы. Грамотей — пропуск к ней, вшитый в саму грамотку: ключ данных, закрытый ключом владельца (или временным
 * ключом перевода, или замком разработчика), и сведения о пропуске.
 */

/** Мастер: кто ведёт грамотки. Имя — как подписался сам. */
export interface OwnerInfo {
  id: string;
  name: string;
}

/** Что за пропуск. */
export type PassKind = 'own' | 'transfer' | 'sealed';

/** Сведения внутри пропуска (подменить нельзя: изменённый пропуск не откроется). */
export interface PassMeta {
  v: 1;
  kind: PassKind;
  /** Поколение ключа данных: растёт, когда ключ меняется (после приёма перевода). */
  gen: number;
  /** Кому выдан (свой пропуск). */
  owner?: OwnerInfo;
  /** Кто выдал (перевод, запечатанная копия). */
  from?: OwnerInfo;
  /** Когда выдан. */
  at: string;
  /** До какого времени действует (перевод). */
  until?: string;
  /** Состояние журнала: сколько записей и отпечаток последней — по нему видно, что журнал не тронут. */
  journal: { count: number; last: string };
}

/** Файл внутри грамотки. */
export interface GramotkaFile {
  /** Номер куска (имя файла с закрытыми байтами). */
  piece: string;
  size: number;
  modified: number;
}

/** Метка изменения: когда, кто, на каком устройстве. */
export interface EditStamp {
  at: string;
  by: string;
  byName: string;
  device: string;
}

/** Оглавление — всё, кроме самих файлов. */
export interface GramotkaIndex {
  v: 1;
  /** Данные человека на общем языке полей (person.lastName, passport.series…). */
  person: { fields: Record<string, string>; savedAt: string; source: string };
  /** Разделы приложений: у каждого приложения свой (id приложения → его данные). */
  sections: Record<string, unknown>;
  /** Файлы: путь внутри папки человека → кусок. */
  files: Record<string, GramotkaFile>;
  /** Пустые папки (разделы). */
  dirs: string[];
  /** Счёт правок по каждой копии (мастер, устройство, рабочая папка): по нему видно, какая из двух копий новее или что они разошлись. */
  edits: Record<string, number>;
  last?: EditStamp;
  created: { at: string; by: string };
}

/** Ярлык запечатанной копии: что видно прежнему мастеру (сама грамотка ему больше не открывается). */
export interface SealedLabel {
  fio: string;
  at: string;
  /** Срок временного ключа, выданного при переводе. */
  until?: string;
}

/** Событие журнала (без ФИО человека). */
export type JournalEvent = 'created' | 'transfer' | 'accepted';

export interface JournalEntry {
  n: number;
  event: JournalEvent;
  at: string;
  by: OwnerInfo;
  device: string;
  gen: number;
  /** Отпечаток предыдущей записи (у первой — пусто). */
  prev: string;
  /** Срок временного ключа (перевод). */
  until?: string;
}
