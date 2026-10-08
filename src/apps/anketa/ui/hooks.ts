import { useEffect, useMemo, useRef, useState } from 'react';
import { useDictionary } from '@/core/dictionaries/dictionaries';
import { ENUMS } from '@/core/schema/enums';
import { matchColumns } from '@/core/schema/fields';
import { readTable, type TableData } from '@/core/tables/tables';
import { getDocStore, useDocStore } from '@/core/workspace/docStore';
import { useWorkspace, useWorkspaceRevision } from '@/core/workspace/WorkspaceContext';
import { useGazetteer } from '@/shared/address/useGazetteer';
import { APP_FOLDER } from '../constants';
import { DEFAULT_RULES, rulesDocType, type AnketaRules } from '../model/rules';
import { rowValues, sessionDocType, sessionPath, type AnketaSession, type CellEdit } from '../model/session';
import { countIssues, type FieldResult, type PersonResult } from '../model/types';
import { toSimple } from '../validation/dates';
import { checkPerson, findDuplicates, type CheckContext, type EnumUserData } from '../validation';

// ---------- Правила ----------

export function useRules() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? getDocStore(workspace, `${APP_FOLDER}/rules.json`, rulesDocType) : null), [workspace]);
  const state = useDocStore(store);
  const data = state?.data;
  const rules = useMemo<AnketaRules>(() => ({ ...DEFAULT_RULES, ...data, addressTemplates: { ...DEFAULT_RULES.addressTemplates, ...data?.addressTemplates } }), [data]);
  return {
    rules,
    loaded: !!state?.loaded,
    readOnly: !!state?.tooNew || !!state?.broken,
    error: state?.error,
    update(patch: Partial<AnketaRules>) {
      store?.update((d) => ({ ...d, ...patch }));
    },
  };
}

// ---------- Справочники-списки ----------

export function useEnumData(): Record<string, EnumUserData> {
  // ENUMS — постоянный список, поэтому вызов хуков в цикле безопасен.
  const dicts = ENUMS.map((e) => ({ id: e.id, d: useDictionary<string>(e.id) }));
  const deps = dicts.flatMap((x) => [x.d.entries, x.d.hidden]);
  return useMemo(() => {
    const out: Record<string, EnumUserData> = {};
    for (const { id, d } of dicts) out[id] = { values: d.entries.map((e) => e.value), hidden: d.hidden };
    return out;
  }, deps);
}

export function useCheckContext(): CheckContext {
  const { gaz } = useGazetteer();
  const { rules } = useRules();
  const enums = useEnumData();
  return useMemo(() => ({ gaz, rules, enums, now: toSimple(new Date()) }), [gaz, rules, enums]);
}

// ---------- Таблица ----------

export type TableState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; table: TableData; size: number; lastModified: number };

export function useTable(path: string, sheet?: string): TableState {
  const { workspace } = useWorkspace();
  const rev = useWorkspaceRevision(path);
  const [state, setState] = useState<TableState>({ status: 'loading' });
  useEffect(() => {
    if (!workspace) return;
    let alive = true;
    setState({ status: 'loading' });
    (async () => {
      try {
        const [bytes, stat] = await Promise.all([workspace.readBytes(path), workspace.stat(path)]);
        if (!bytes) throw new Error('Файл не найден в рабочей папке');
        const table = readTable(bytes, path, sheet);
        if (alive) setState({ status: 'ready', table, size: stat?.size ?? bytes.byteLength, lastModified: stat?.lastModified ?? 0 });
      } catch (e) {
        if (alive) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspace, path, sheet, rev]);
  return state;
}

// ---------- Сеанс правок ----------

export function useSession(fileName: string) {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? getDocStore(workspace, sessionPath(APP_FOLDER, fileName), sessionDocType) : null), [workspace, fileName]);
  const state = useDocStore(store);
  const session = state?.data ?? sessionDocType.empty();

  return useMemo(() => {
    const update = (fn: (s: AnketaSession) => AnketaSession) => store?.update(fn);
    return {
      session,
      loaded: !!state?.loaded,
      readOnly: !!state?.tooNew || !!state?.broken,
      error: state?.error,
      setSource(src: AnketaSession['source']) {
        update((s) => ({ ...s, source: src }));
      },
      setCell(row: number, col: number, value: string, orig: string) {
        update((s) => {
          const rowEdits: Record<string, CellEdit> = { ...(s.edits[row] ?? {}) };
          if (value === orig) delete rowEdits[col];
          else rowEdits[col] = { orig, value };
          const edits: AnketaSession['edits'] = { ...s.edits, [row]: rowEdits };
          if (!Object.keys(rowEdits).length) delete edits[row];
          return { ...s, edits };
        });
      },
      setCells(changes: { row: number; col: number; value: string; orig: string }[]) {
        update((s) => {
          const edits = { ...s.edits };
          for (const c of changes) {
            const rowEdits: Record<string, CellEdit> = { ...(edits[c.row] ?? {}) };
            if (c.value === c.orig) delete rowEdits[c.col];
            else rowEdits[c.col] = { orig: c.orig, value: c.value };
            edits[c.row] = rowEdits;
            if (!Object.keys(rowEdits).length) delete edits[c.row];
          }
          return { ...s, edits };
        });
      },
      toggleReviewed(row: number) {
        update((s) => ({ ...s, reviewed: s.reviewed.includes(row) ? s.reviewed.filter((r) => r !== row) : [...s.reviewed, row] }));
      },
      ignore(row: number, key: string, on: boolean) {
        update((s) => {
          const list = new Set(s.ignored[row] ?? []);
          if (on) list.add(key);
          else list.delete(key);
          return { ...s, ignored: { ...s.ignored, [row]: [...list] } };
        });
      },
      resetAll() {
        update((s) => ({ ...s, edits: {}, reviewed: [], ignored: {} }));
      },
    };
  }, [session, state?.loaded, state?.tooNew, state?.broken, state?.error, store]);
}

// ---------- Результаты проверки ----------

export const issueKey = (col: number, code: string) => `${col}:${code}`;

export interface TableModel {
  columns: (string | null)[];
  values: string[][];
  names: string[];
  results: PersonResult[];
}

export function personName(values: string[], columns: (string | null)[]): string {
  const get = (id: string) => values[columns.indexOf(id)]?.trim() ?? '';
  return [get('person.lastName'), get('person.firstName'), get('person.middleName')].filter(Boolean).join(' ');
}

/** Проверка всех строк с кэшем: пересчитываются только изменённые строки. */
export function useTableModel(table: TableData, session: AnketaSession, ctx: CheckContext): TableModel {
  const columns = useMemo(() => matchColumns(table.headers), [table.headers]);
  const cache = useRef(new Map<number, { key: string; ctx: CheckContext; res: PersonResult }>());

  const values = useMemo(() => table.rows.map((r, i) => rowValues(r, session, i)), [table.rows, session.edits]);
  const names = useMemo(() => values.map((v) => personName(v, columns)), [values, columns]);

  const base = useMemo(
    () =>
      values.map((v, row) => {
        const key = v.join('\u0001');
        const hit = cache.current.get(row);
        if (hit && hit.key === key && hit.ctx === ctx) return hit.res;
        const res = checkPerson(row, v, columns, ctx);
        cache.current.set(row, { key, ctx, res });
        return res;
      }),
    [values, columns, ctx],
  );

  const dupes = useMemo(() => findDuplicates(values, columns, names), [values, columns, names]);

  const results = useMemo(
    () =>
      base.map((r) => {
        const ignored = new Set(session.ignored[r.row] ?? []);
        const extra = dupes.get(r.row);
        if (!ignored.size && !extra) return r;
        const fields: FieldResult[] = r.fields.map((f) => {
          const dup = extra?.get(f.col);
          const issues = (dup ? [...f.issues, dup] : f.issues).filter((i) => !ignored.has(issueKey(f.col, i.code)));
          return issues === f.issues ? f : { ...f, issues };
        });
        return { ...r, fields, counts: countIssues(fields) };
      }),
    [base, dupes, session.ignored],
  );

  return { columns, values, names, results };
}
