import { useEffect, useMemo, useRef, useState } from 'react';
import { addDictEntry, useDictionary } from '@/core/dictionaries/dictionaries';
import { ENUMS } from '@/core/schema/enums';
import { matchColumns } from '@/core/schema/fields';
import { readTable, type TableData } from '@/core/tables/tables';
import { getDocStore, useDocStore } from '@/core/workspace/docStore';
import { useWorkspace, useWorkspaceRevision } from '@/core/workspace/WorkspaceContext';
import type { Workspace } from '@/core/workspace/workspace';
import { TYPE_BY_ID } from '@/shared/address/addrTypes';
import { ADDRESS_DICT, useGazetteer } from '@/shared/address/useGazetteer';
import { toSimple } from '@/shared/check/dates';
import type { IssueAction } from '@/shared/check/types';
import { APP_FOLDER, APP_ID } from '../constants';
import { buildContext, type CheckContext, type UserDictionaries } from '../check/context';
import { DICT, type IssuedByEntry, type SpecialtyEntry } from '../check/dicts';
import { applyTableLevel, checkPerson, findDuplicates } from '../check/engine';
import { DEFAULT_RULES, rulesDocType, type AnketaRules } from '../model/rules';
import { rowValues, sessionDocType, sessionPath, type AnketaSession, type CellEdit } from '../model/session';
import type { PersonResult } from '../model/types';

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

// ---------- Справочники ----------

/** Все пользовательские справочники, которыми пользуется проверка. Список постоянный — хуки в цикле безопасны. */
export function useUserDictionaries(): UserDictionaries {
  const enumDicts = ENUMS.map((e) => ({ id: e.id, d: useDictionary<string>(e.id) }));
  const firstNames = useDictionary<string>(DICT.firstNames);
  const patronymics = useDictionary<string>(DICT.patronymics);
  const emailDomains = useDictionary<string>(DICT.emailDomains);
  const issuedBy = useDictionary<IssuedByEntry>(DICT.issuedBy);
  const specialties = useDictionary<SpecialtyEntry>(DICT.specialties);
  const institutions = useDictionary<string>(DICT.institutions);
  const squads = useDictionary<string>(DICT.squads);
  const deps = [
    ...enumDicts.flatMap((x) => [x.d.entries, x.d.hidden]),
    firstNames.entries,
    patronymics.entries,
    emailDomains.entries,
    issuedBy.entries,
    specialties.entries,
    institutions.entries,
    squads.entries,
  ];
  return useMemo(() => {
    const values = <V,>(d: { entries: { value: V }[] }) => d.entries.map((e) => e.value);
    const enums: UserDictionaries['enums'] = {};
    for (const { id, d } of enumDicts) enums[id] = { values: values(d), hidden: d.hidden };
    return {
      enums,
      firstNames: values(firstNames),
      patronymics: values(patronymics),
      emailDomains: values(emailDomains),
      issuedBy: values(issuedBy),
      specialties: values(specialties),
      institutions: values(institutions),
      squads: values(squads),
    };
  }, deps);
}

export function useCheckContext(): CheckContext {
  const { gaz } = useGazetteer();
  const { rules } = useRules();
  const user = useUserDictionaries();
  return useMemo(() => buildContext(gaz, rules, user, toSimple(new Date())), [gaz, rules, user]);
}

/** Подтвердить значение: добавить в справочник (и в «Предложения в базу»). */
export async function applyDictionaryAction(ws: Workspace, a: IssueAction): Promise<boolean> {
  switch (a.kind) {
    case 'add-word':
      return addDictEntry(ws, a.dict, a.value, { label: a.label, source: APP_ID });
    case 'add-postal':
      return addDictEntry(ws, ADDRESS_DICT, { op: 'postal', path: a.path, index: a.index }, { label: a.label, source: APP_ID });
    case 'add-place': {
      if (!a.type || !a.parentPath) return false;
      return addDictEntry(ws, ADDRESS_DICT, { name: a.name, type: a.type, parentPath: a.parentPath }, { label: actionLabel(a), source: APP_ID });
    }
  }
}

/** Можно ли подтвердить одним нажатием (без уточнений в диалоге). */
export const isDirectAction = (a: IssueAction) => a.kind !== 'add-place' || (!!a.type && !!a.parentPath);

export function actionLabel(a: IssueAction): string {
  if (a.kind !== 'add-place') return a.label;
  const t = a.type ? TYPE_BY_ID.get(a.type) : undefined;
  return `${t ? `${t.short} ` : ''}${a.name}${a.parentLabel ? ` → ${a.parentLabel}` : ''}`;
}

export const actionKey = (a: IssueAction) =>
  JSON.stringify(a.kind === 'add-place' ? [a.kind, a.name, a.type, a.parentPath] : a.kind === 'add-postal' ? [a.kind, a.index, a.path] : [a.kind, a.dict, a.value]);

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
    const setOne = (edits: AnketaSession['edits'], row: number, col: number, value: string, orig: string) => {
      const rowEdits: Record<string, CellEdit> = { ...(edits[row] ?? {}) };
      if (value === orig) delete rowEdits[col];
      else rowEdits[col] = { orig, value };
      if (Object.keys(rowEdits).length) edits[row] = rowEdits;
      else delete edits[row];
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
      /** Принять значение поля «как есть» (value = null — снять принятие). */
      accept(row: number, col: number, value: string | null) {
        update((s) => {
          const list = (s.accepted[row] ?? []).filter((a) => a.col !== col);
          if (value !== null) list.push({ col, value, at: new Date().toISOString() });
          return { ...s, accepted: { ...s.accepted, [row]: list } };
        });
      },
      resetAll() {
        update((s) => ({ ...s, edits: {}, reviewed: [], accepted: {} }));
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
  const results = useMemo(() => base.map((r) => applyTableLevel(r, dupes.get(r.row), session.accepted[r.row])), [base, dupes, session.accepted]);

  return { columns, values, names, results };
}
