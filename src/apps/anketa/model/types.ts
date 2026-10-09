import type { Step } from '@/core/base/tree';

export type Level = 'error' | 'warn';

export interface Issue {
  level: Level;
  text: string;
  /** Подсветить часть значения [начало, конец). */
  span?: [number, number];
  /** Исправление — новое значение поля. */
  fix?: string;
  /** Ошибка снимается подтверждением («это другое место»). */
  confirmable?: boolean;
  /** Напоминание «поставьте галочку» у индивидуального значения. */
  person?: boolean;
}

export interface BaseAddition {
  tree: string;
  path: Step[];
  /** «Респ. Регион → 000000 → с. Примерное». */
  label: string;
  /** Сколько первых частей пути уже есть в базе. */
  known: number;
}

/** Часть ячейки-древа для показа: «Регион: Респ. Регион — есть в базе». */
export interface PartView {
  title: string;
  text: string;
  /** known — есть в базе; new — нет; error — ошибка; off — в древо не сохраняется; plain — с базой не сверялось (сначала исправить ошибки). */
  state: 'known' | 'new' | 'error' | 'off' | 'plain';
}

export type FieldStatus = 'ok' | 'error' | 'warn';

export interface FieldResult {
  col: number;
  fieldId: string | null;
  value: string;
  status: FieldStatus;
  issues: Issue[];
  /** Правильная запись целиком, если она отличается от написанного. */
  fix?: string;
  /** Что даёт подтверждение: галочка у человека и/или добавление в базу. */
  confirm?: { person: boolean; base?: BaseAddition };
  /** Значение подтверждено у этого человека (галочка). */
  confirmed: boolean;
  /** Части ячейки-древа. */
  parts?: PartView[];
  /** Пример правильного значения (из правил) — показывается, когда есть ошибка. */
  example?: string;
}

export interface Counts {
  error: number;
  /** Требуют подтверждения. */
  warn: number;
}

export interface PersonResult {
  row: number;
  fields: FieldResult[];
  counts: Counts;
  /** Анкета готова: нет ни ошибок, ни неподтверждённого. */
  ready: boolean;
}

export function countIssues(fields: FieldResult[]): Counts {
  return {
    error: fields.filter((f) => f.status === 'error').length,
    warn: fields.filter((f) => f.status === 'warn').length,
  };
}

export const isReady = (c: Counts) => c.error + c.warn === 0;
