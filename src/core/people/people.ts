import { useMemo } from 'react';
import { defineDocType } from '../schema/docType';
import { uid } from '../util/id';
import { getDocStore, useDocStore } from '../workspace/docStore';
import { useWorkspace } from '../workspace/WorkspaceContext';
import type { Workspace } from '../workspace/workspace';

/*
 * База людей — проверенные («актуальные») данные людей на общем языке полей (person.lastName, passport.series…).
 * Её заполняют приложения: «Проверка анкет» сохраняет готовые анкеты, «Генератор документов» дописывает то, чего
 * не хватило для документа (в том числе поля вне анкеты — место работы).
 * По ней работает кнопка «Проверить с актуальной информацией» и проверка уникальности («уже было» у другого человека).
 * Файл: .docassist/people.json. В «Предложения в базу» не попадает — это персональные данные.
 */

export interface PersonRecord {
  id: string;
  /** Значения по идентификаторам полей. */
  fields: Record<string, string>;
  savedAt: string;
  source: string;
}

export interface PeopleDoc {
  records: PersonRecord[];
}

export const peopleDocType = defineDocType<PeopleDoc>({
  type: 'docassist/people',
  version: 1,
  migrations: {},
  empty: () => ({ records: [] }),
});

export const FIO_FIELDS = ['person.lastName', 'person.firstName', 'person.middleName'] as const;

/** Ключ ФИО для поиска: без учёта регистра, «ё» и лишних пробелов. */
export function fioKey(fields: Record<string, string | undefined>): string {
  return FIO_FIELDS.map((id) => (fields[id] ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

export function fioText(fields: Record<string, string | undefined>): string {
  return FIO_FIELDS.map((id) => fields[id]?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

export function peopleStore(ws: Workspace) {
  return getDocStore(ws, ws.systemPath('people.json'), peopleDocType);
}

/** Добавить человека или обновить его запись (тот же ФИО и та же дата рождения). */
export function upsertPerson(
  records: PersonRecord[],
  fields: Record<string, string>,
  source: string,
  now = new Date().toISOString(),
): { records: PersonRecord[]; id: string; how: 'added' | 'updated' } {
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim() !== ''));
  const same = records.find((r) => fioKey(r.fields) === fioKey(clean) && (r.fields['person.birthDate'] ?? '') === (clean['person.birthDate'] ?? ''));
  if (!same) {
    const record: PersonRecord = { id: uid('p_'), fields: clean, savedAt: now, source };
    return { records: [...records, record], id: record.id, how: 'added' };
  }
  // Поля, о которых сохраняющий не знает (их дописало другое приложение), остаются.
  const kept = Object.fromEntries(Object.entries(same.fields).filter(([id]) => !(id in fields)));
  const record: PersonRecord = { id: same.id, fields: { ...kept, ...clean }, savedAt: now, source };
  return { records: records.map((r) => (r.id === same.id ? record : r)), id: same.id, how: 'updated' };
}

/** Дописать значения в запись: непустые заменяют прежние, остальные поля записи не меняются. */
export function completePerson(records: PersonRecord[], id: string, fields: Record<string, string>, now = new Date().toISOString()): PersonRecord[] {
  const add = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim() !== ''));
  return records.map((r) => (r.id === id ? { ...r, fields: { ...r.fields, ...add }, savedAt: now } : r));
}

/** Найти записи с таким ФИО. */
export function findByFio(records: PersonRecord[], fields: Record<string, string | undefined>): PersonRecord[] {
  const key = fioKey(fields);
  if (!key) return [];
  return records.filter((r) => fioKey(r.fields) === key);
}

export function usePeople() {
  const { workspace } = useWorkspace();
  const store = useMemo(() => (workspace ? peopleStore(workspace) : null), [workspace]);
  const state = useDocStore(store);
  const records = state?.data.records;
  return useMemo(() => {
    const list = records ?? [];
    /** Сохранить человека и узнать id его записи. */
    const upsert = (fields: Record<string, string>, source: string): { id: string; how: 'added' | 'updated' } => {
      const r = upsertPerson(store?.get().data.records ?? list, fields, source);
      store?.update(() => ({ records: r.records }));
      return { id: r.id, how: r.how };
    };
    return {
      records: list,
      loaded: !!state?.loaded,
      readOnly: !!state?.tooNew || !!state?.broken,
      /**
       * Сохранить человека. Запись с тем же ФИО и той же датой рождения обновляется,
       * иначе добавляется новая. Пустые значения не сохраняются.
       */
      save(fields: Record<string, string>, source: string): 'added' | 'updated' {
        return upsert(fields, source).how;
      },
      upsert,
      /** Дописать данные в запись человека (например, то, чего не хватило для документа). */
      complete(id: string, fields: Record<string, string>) {
        store?.update((d) => ({ records: completePerson(d.records, id, fields) }));
      },
      remove(id: string) {
        store?.update((d) => ({ records: d.records.filter((r) => r.id !== id) }));
      },
    };
  }, [records, state?.loaded, state?.tooNew, state?.broken, store]);
}
