import type { AddToDictionaryAction, AddressPart } from '@/shared/address/check';

export type Severity = 'error' | 'warning' | 'info';
export type Category = 'glued' | 'format' | 'order' | 'tree' | 'missing' | 'dictionary' | 'typo' | 'consistency' | 'duplicate';

export interface AddEnumAction {
  kind: 'add-enum';
  dict: string;
  value: string;
}

export type IssueAction = AddToDictionaryAction | AddEnumAction;

export interface Issue {
  code: string;
  severity: Severity;
  category: Category;
  message: string;
  /** Участок значения для подсветки [start, end). */
  span?: [number, number];
  /** Полностью исправленное значение поля для этого замечания. */
  fix?: string;
  action?: IssueAction;
}

export interface FieldResult {
  fieldId: string | null;
  col: number;
  value: string;
  /** Итоговое предлагаемое значение (все безопасные исправления вместе). */
  suggestion?: string;
  issues: Issue[];
  /** Части адреса — для адресных полей. */
  parts?: AddressPart[];
  /** Короткая справка под полем: «19 лет», «Хакасия». */
  meta?: string;
}

export interface Counts {
  error: number;
  warning: number;
  info: number;
  glued: number;
}

export interface PersonResult {
  row: number;
  fields: FieldResult[];
  counts: Counts;
}

export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function countIssues(fields: FieldResult[]): Counts {
  const c: Counts = { error: 0, warning: 0, info: 0, glued: 0 };
  for (const f of fields) {
    for (const i of f.issues) {
      if (i.category === 'glued') c.glued++;
      else c[i.severity]++;
    }
  }
  return c;
}
