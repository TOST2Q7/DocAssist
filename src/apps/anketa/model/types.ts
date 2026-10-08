import type { FieldCheck, Issue } from '@/shared/check/types';

export type { Issue, IssueAction, Level, Category } from '@/shared/check/types';

export interface FieldResult extends FieldCheck {
  fieldId: string | null;
  col: number;
  value: string;
  /** Значение принято человеком «как есть» (замечания не считаются). */
  accepted?: boolean;
}

export interface Counts {
  /** Ошибки (кроме «слипшихся»). */
  error: number;
  /** Слипшиеся слова — отдельный счётчик. */
  glued: number;
  /** Требуют подтверждения. */
  confirm: number;
  /** Поля, принятые «как есть». */
  accepted: number;
}

export interface PersonResult {
  row: number;
  fields: FieldResult[];
  counts: Counts;
  /** Анкета полностью проверена: нет ни ошибок, ни неподтверждённого. */
  ready: boolean;
}

export function countIssues(fields: FieldResult[]): Counts {
  const c: Counts = { error: 0, glued: 0, confirm: 0, accepted: 0 };
  for (const f of fields) {
    if (f.accepted) {
      if (f.issues.length) c.accepted++;
      continue;
    }
    for (const i of f.issues) {
      if (i.level === 'confirm') c.confirm++;
      else if (i.category === 'glued') c.glued++;
      else c.error++;
    }
  }
  return c;
}

export const isReady = (c: Counts) => c.error + c.glued + c.confirm === 0;

export function fieldStatus(f: FieldResult): 'ok' | 'error' | 'glued' | 'confirm' | 'accepted' {
  if (!f.issues.length) return 'ok';
  if (f.accepted) return 'accepted';
  if (f.issues.some((i: Issue) => i.level === 'error' && i.category !== 'glued')) return 'error';
  if (f.issues.some((i: Issue) => i.category === 'glued')) return 'glued';
  return 'confirm';
}
