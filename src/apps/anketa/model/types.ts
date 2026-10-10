import type { Step } from '@/core/base/tree';

/** error — ошибка; warn — предупреждение (снимается галочкой «Проверено»); info — совет, ни на что не влияет. */
export type Level = 'error' | 'warn' | 'info';

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
  /** «Нет в базе» — снимается добавлением в базу. */
  base?: boolean;
  /** Предупреждение снято галочкой «Проверено». */
  resolved?: boolean;
  /** Проигнорировано (кнопкой «Игнорировать»). */
  ignored?: boolean;
  /** Ошибка в коде проверки, а не в значении. */
  script?: boolean;
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
  /** Проверить уникальность: вместе с какими полями и сверять ли с базой людей. */
  unique?: { with: string[]; people: boolean };
  /** Значения, которые проверка запомнила (remember) — их видят другие ячейки: cell("…").vars. */
  vars?: Record<string, unknown>;
}

export interface Counts {
  error: number;
  /** Требуют подтверждения. */
  warn: number;
  /** Проигнорировано замечаний. */
  ignored: number;
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
    ignored: fields.reduce((n, f) => n + f.issues.filter((i) => i.ignored).length, 0),
  };
}

/** Статус поля по замечаниям: проигнорированное и снятое галочкой не считается. */
export function statusOf(issues: Issue[]): FieldStatus {
  if (issues.some((i) => i.level === 'error' && !i.ignored)) return 'error';
  if (issues.some((i) => i.level === 'warn' && !i.resolved && !i.ignored)) return 'warn';
  return 'ok';
}

export const isReady = (c: Counts) => c.error + c.warn === 0;
