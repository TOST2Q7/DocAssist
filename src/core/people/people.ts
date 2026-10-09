import { useMemo } from 'react';
import { defineDocType } from '../schema/docType';
import { uid } from '../util/id';
import { getDocStore, useDocStore } from '../workspace/docStore';
import { useWorkspace } from '../workspace/WorkspaceContext';
import type { Workspace } from '../workspace/workspace';

/*
 * База людей — проверенные («актуальные») данные людей на общем языке полей (person.lastName, passport.series…).
 * Её заполняют приложения: «Проверка анкет» сохраняет готовые анкеты, а будущее приложение — ручной ввод всех полей.
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
    return {
      records: list,
      loaded: !!state?.loaded,
      readOnly: !!state?.tooNew || !!state?.broken,
      /**
       * Сохранить человека. Запись с тем же ФИО и той же датой рождения обновляется,
       * иначе добавляется новая. Пустые значения не сохраняются.
       */
      save(fields: Record<string, string>, source: string): 'added' | 'updated' {
        const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim() !== ''));
        const same = list.find((r) => fioKey(r.fields) === fioKey(clean) && (r.fields['person.birthDate'] ?? '') === (clean['person.birthDate'] ?? ''));
        const record: PersonRecord = { id: same?.id ?? uid('p_'), fields: clean, savedAt: new Date().toISOString(), source };
        store?.update((d) => ({ records: same ? d.records.map((r) => (r.id === same.id ? record : r)) : [...d.records, record] }));
        return same ? 'updated' : 'added';
      },
      remove(id: string) {
        store?.update((d) => ({ records: d.records.filter((r) => r.id !== id) }));
      },
    };
  }, [records, state?.loaded, state?.tooNew, state?.broken, store]);
}
