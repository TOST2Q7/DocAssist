import type { GramotkaIndex } from './types';

/*
 * Две копии одной грамотки (один номер): какая новее. Даты для этого не годятся (часы можно перевести), поэтому
 * сравнивается счёт правок по каждому мастеру. В одной копии есть все правки другой и ещё новые — она новее;
 * у каждой есть правки, которых нет в другой, — копии разошлись, решает человек.
 */

export type Order = 'same' | 'newer' | 'older' | 'diverged';

/** Как копия a относится к копии b. */
export function compareEdits(a: Record<string, number>, b: Record<string, number>): Order {
  let more = false;
  let less = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    if (x > y) more = true;
    if (x < y) less = true;
  }
  if (more && less) return 'diverged';
  if (more) return 'newer';
  if (less) return 'older';
  return 'same';
}

/** Счёт правок после слияния: всё, что было в обеих копиях. */
export function mergeEdits(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

export type DiffItem =
  | { kind: 'field'; id: string; mine?: string; theirs?: string }
  | { kind: 'section'; id: string; mine?: unknown; theirs?: unknown }
  | { kind: 'file'; id: string; mine?: { size: number; modified: number }; theirs?: { size: number; modified: number } };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Чем различаются две копии: поля, разделы приложений, файлы. Файлы сравниваются по размеру и времени изменения. */
export function diffIndexes(mine: GramotkaIndex, theirs: GramotkaIndex, sameFile: (path: string) => boolean): DiffItem[] {
  const out: DiffItem[] = [];
  for (const id of new Set([...Object.keys(mine.person.fields), ...Object.keys(theirs.person.fields)])) {
    const a = mine.person.fields[id];
    const b = theirs.person.fields[id];
    if ((a ?? '') !== (b ?? '')) out.push({ kind: 'field', id, mine: a, theirs: b });
  }
  for (const id of new Set([...Object.keys(mine.sections), ...Object.keys(theirs.sections)])) {
    if (!same(mine.sections[id], theirs.sections[id])) out.push({ kind: 'section', id, mine: mine.sections[id], theirs: theirs.sections[id] });
  }
  for (const id of new Set([...Object.keys(mine.files), ...Object.keys(theirs.files)])) {
    const a = mine.files[id];
    const b = theirs.files[id];
    if (a && b && sameFile(id)) continue;
    out.push({ kind: 'file', id, mine: a && { size: a.size, modified: a.modified }, theirs: b && { size: b.size, modified: b.modified } });
  }
  return out;
}

/** Выбор человека по каждому различию: оставить своё или взять из пришедшей копии. */
export type MergeChoice = Record<string, 'mine' | 'theirs'>;

export const diffKey = (d: Pick<DiffItem, 'kind' | 'id'>) => `${d.kind}:${d.id}`;

/**
 * Оглавление после слияния. Файлы «из пришедшей копии» отмечаются в takeFiles — их куски нужно перенести.
 * Не решённое человеком остаётся своим.
 */
export function mergeIndexes(mine: GramotkaIndex, theirs: GramotkaIndex, diff: DiffItem[], choice: MergeChoice): { index: GramotkaIndex; takeFiles: string[] } {
  const fields = { ...mine.person.fields };
  const sections = { ...mine.sections };
  const files = { ...mine.files };
  const takeFiles: string[] = [];
  for (const d of diff) {
    if (choice[diffKey(d)] !== 'theirs') continue;
    if (d.kind === 'field') {
      if (d.theirs === undefined) delete fields[d.id];
      else fields[d.id] = d.theirs;
    } else if (d.kind === 'section') {
      if (d.theirs === undefined) delete sections[d.id];
      else sections[d.id] = d.theirs;
    } else if (theirs.files[d.id]) {
      files[d.id] = theirs.files[d.id];
      takeFiles.push(d.id);
    } else delete files[d.id];
  }
  return {
    index: {
      ...mine,
      person: { ...mine.person, fields },
      sections,
      files,
      dirs: [...new Set([...mine.dirs, ...theirs.dirs])],
      edits: mergeEdits(mine.edits, theirs.edits),
    },
    takeFiles,
  };
}
