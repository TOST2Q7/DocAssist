import { useEffect, useMemo, useRef, useState } from 'react';
import { addPath, useBaseTrees } from '@/core/base/base';
import { usePeople } from '@/core/people/people';
import { looksLikeHeader, matchColumns, PERSON_FIELDS } from '@/core/schema/fields';
import { readTable, type TableData } from '@/core/tables/tables';
import { getDocStore, useDocStore } from '@/core/workspace/docStore';
import { useWorkspace, useWorkspaceRevision } from '@/core/workspace/WorkspaceContext';
import type { Workspace } from '@/core/workspace/workspace';
import { APP_FOLDER, APP_ID } from '../constants';
import { applyUniqueness, checkPerson, type CheckContext } from '../check/engine';
import { allTreeNames, resolveRules, rulesDocType, type FieldRule } from '../model/rules';
import { rowValues, sessionDocType, sessionPath, type AnketaSession, type CellEdit } from '../model/session';
import type { BaseAddition, PersonResult } from '../model/types';

// ---------- Правила ----------

export function useRules() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? getDocStore(workspace, `${APP_FOLDER}/rules.json`, rulesDocType) : null), [workspace]);
  const state = useDocStore(store);
  const data = state?.data;
  const rules = useMemo(() => resolveRules(data), [data]);
  return {
    rules,
    loaded: !!state?.loaded,
    readOnly: !!state?.tooNew || !!state?.broken,
    error: state?.error,
    /** Сохранить правило поля целиком. */
    setField(fieldId: string, rule: FieldRule) {
      store?.update((d) => ({ ...d, fields: { ...d.fields, [fieldId]: rule } }));
    },
    /** Вернуть правило поля по умолчанию. */
    resetField(fieldId: string) {
      store?.update((d) => {
        const fields = { ...d.fields };
        delete fields[fieldId];
        return { ...d, fields };
      });
    },
    isCustom(fieldId: string) {
      return !!data?.fields?.[fieldId];
    },
  };
}

// ---------- Контекст проверки ----------

export function useCheckContext(): CheckContext & { loaded: boolean } {
  const { rules } = useRules();
  const names = useMemo(() => allTreeNames(rules), [rules]);
  const base = useBaseTrees(names);
  const people = usePeople();
  return useMemo(() => ({ rules, trees: base.trees, people: people.records, loaded: base.loaded && people.loaded }), [rules, base, people.records, people.loaded]);
}

/** Подтвердить: добавить путь в базу (и в «Предложения в базу»). */
export function confirmBase(ws: Workspace, b: BaseAddition): Promise<boolean> {
  return addPath(ws, b.tree, b.path, { source: APP_ID });
}

// ---------- Таблица ----------

/**
 * Если у таблицы нет строки заголовков (первая строка — уже данные), столбцы понимаются по порядку формы:
 * «Отметка времени», «Регион», «Фамилия»…
 */
export function withFormHeaders(table: TableData): TableData {
  if (!table.headers.length || looksLikeHeader(table.headers)) return table;
  const headers = table.headers.map((_, i) => PERSON_FIELDS[i]?.label ?? `Столбец ${i + 1}`);
  const first = table.headers.map((h) => (/^Столбец \d+$/.test(h) ? '' : h));
  return { ...table, headers, rows: [first, ...table.rows], sourceRows: [(table.sourceRows[0] ?? 2) - 1, ...table.sourceRows] };
}

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
        const table = withFormHeaders(readTable(bytes, path, sheet));
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
    const setOne = (edits: AnketaSession['edits'], row: number, col: number, value: string, orig: string) => {
      const rowEdits: Record<string, CellEdit> = { ...(edits[row] ?? {}) };
      if (value === orig) delete rowEdits[col];
      else rowEdits[col] = { orig, value };
      if (Object.keys(rowEdits).length) edits[row] = rowEdits;
      else delete edits[row];
    };
    const setConfirmed = (confirmed: AnketaSession['confirmed'], row: number, col: number, value: string | null) => {
      const r = { ...(confirmed[row] ?? {}) };
      if (value === null) delete r[col];
      else r[col] = value;
      if (Object.keys(r).length) confirmed[row] = r;
      else delete confirmed[row];
    };
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
          const edits = { ...s.edits };
          setOne(edits, row, col, value, orig);
          return { ...s, edits };
        });
      },
      setCells(changes: { row: number; col: number; value: string; orig: string }[]) {
        update((s) => {
          const edits = { ...s.edits };
          for (const c of changes) setOne(edits, c.row, c.col, c.value, c.orig);
          return { ...s, edits };
        });
      },
      toggleReviewed(row: number) {
        update((s) => ({ ...s, reviewed: s.reviewed.includes(row) ? s.reviewed.filter((r) => r !== row) : [...s.reviewed, row] }));
      },
      /** Галочка «проверено, верно» у индивидуального значения (null — снять). */
      confirm(row: number, col: number, value: string | null) {
        update((s) => {
          const confirmed = { ...s.confirmed };
          setConfirmed(confirmed, row, col, value);
          return { ...s, confirmed };
        });
      },
      confirmMany(items: { row: number; col: number; value: string }[]) {
        update((s) => {
          const confirmed = { ...s.confirmed };
          for (const i of items) setConfirmed(confirmed, i.row, i.col, i.value);
          return { ...s, confirmed };
        });
      },
      resetAll() {
        update((s) => ({ ...s, edits: {}, reviewed: [], confirmed: {} }));
      },
    };
  }, [session, state?.loaded, state?.tooNew, state?.broken, state?.error, store]);
}

// ---------- Результаты проверки ----------

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

  const edits = session.edits;
  const values = useMemo(() => table.rows.map((r, i) => rowValues(r, { ...session, edits }, i)), [table.rows, edits]); // session меняется вместе с edits
  const names = useMemo(() => values.map((v) => personName(v, columns)), [values, columns]);
  const confirmed = session.confirmed;

  const base = useMemo(
    () =>
      values.map((v, row) => {
        const conf = confirmed[row] ?? {};
        const key = v.join('\u0001') + '\u0002' + JSON.stringify(conf);
        const hit = cache.current.get(row);
        if (hit && hit.key === key && hit.ctx === ctx) return hit.res;
        const res = checkPerson(row, v, columns, ctx, conf);
        cache.current.set(row, { key, ctx, res });
        return res;
      }),
    [values, columns, ctx, confirmed],
  );

  const results = useMemo(() => applyUniqueness(base, values, columns, names, ctx), [base, values, columns, names, ctx]);
  return { columns, values, names, results };
}
