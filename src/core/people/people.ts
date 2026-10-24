import { useMemo } from 'react';
import { ensureOpen, GramotkiClosedError, useGramotki } from '../gramotka/react';
import type { GramotkiStatus, GramotkiStore } from '../gramotka/store';
import { useWorkspace } from '../workspace/WorkspaceContext';

/*
 * База людей — проверенные («актуальные») данные людей на общем языке полей (person.lastName, passport.series…).
 * Каждый человек — своя грамотка (src/core/gramotka): данные хранятся только в ней, закрытые фразой мастера.
 * Её заполняют приложения: «Проверка анкет» сохраняет готовые анкеты, «Личные дела» — ручной ввод всех полей,
 * «Генератор документов» дописывает то, чего не хватило для документа (в том числе поля вне анкеты — место работы).
 * По ней работает кнопка «Проверить с актуальной информацией» и проверка уникальности («уже было» у другого человека).
 * В «Предложения в базу» не попадает — это персональные данные.
 */

export interface PersonRecord {
  /** Номер грамотки. */
  id: string;
  /** Значения по идентификаторам полей. */
  fields: Record<string, string>;
  savedAt: string;
  source: string;
}

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

const clean = (fields: Record<string, string>) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim() !== ''));

/** Добавить человека или обновить его запись (тот же ФИО и та же дата рождения). Новая запись — с пустым id (его даст грамотка). */
export function upsertPerson(
  records: PersonRecord[],
  fields: Record<string, string>,
  source: string,
  now = new Date().toISOString(),
): { records: PersonRecord[]; id: string; how: 'added' | 'updated' } {
  const cleaned = clean(fields);
  const same = records.find((r) => fioKey(r.fields) === fioKey(cleaned) && (r.fields['person.birthDate'] ?? '') === (cleaned['person.birthDate'] ?? ''));
  if (!same) {
    const record: PersonRecord = { id: '', fields: cleaned, savedAt: now, source };
    return { records: [...records, record], id: record.id, how: 'added' };
  }
  // Поля, о которых сохраняющий не знает (их дописало другое приложение), остаются.
  const kept = Object.fromEntries(Object.entries(same.fields).filter(([id]) => !(id in fields)));
  const record: PersonRecord = { id: same.id, fields: { ...kept, ...cleaned }, savedAt: now, source };
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

// ---------- База людей поверх грамоток (без React — для экранов и проверок) ----------

const queues = new WeakMap<GramotkiStore, Promise<unknown>>();

/** Сохранения по очереди: двойное нажатие не создаст двух грамоток одному человеку. */
function serial<T>(store: GramotkiStore, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(store) ?? Promise.resolve()).then(fn, fn);
  queues.set(
    store,
    next.catch(() => undefined),
  );
  return next;
}

/** Сохранить человека: тот же ФИО и та же дата рождения — обновить его грамотку, иначе — новая грамотка. */
export function savePerson(store: GramotkiStore, fields: Record<string, string>, source: string): Promise<{ id: string; how: 'added' | 'updated' }> {
  return serial(store, async () => {
    const r = upsertPerson(store.snapshot().people, fields, source);
    if (r.how === 'added') return { id: await store.create(clean(fields), source), how: 'added' as const };
    store.setPerson(r.id, r.records.find((x) => x.id === r.id)!.fields, source);
    return { id: r.id, how: 'updated' as const };
  });
}

/** Дописать: непустые значения заменяют прежние, остальные поля не меняются. */
export function completeIn(store: GramotkiStore, id: string, fields: Record<string, string>): void {
  const g = store.item(id);
  if (!g) throw new GramotkiClosedError();
  store.setPerson(id, completePerson([{ id, fields: g.fields, savedAt: '', source: g.index.person.source }], id, fields)[0].fields, g.index.person.source);
}

/** Заменить данные человека (ручной ввод). Пустые значения не сохраняются. */
export function putIn(store: GramotkiStore, id: string, fields: Record<string, string>, source: string): void {
  if (!store.item(id)) throw new GramotkiClosedError();
  store.setPerson(id, clean(fields), source);
}

export function usePeople() {
  const { workspace } = useWorkspace();
  const { store, snap } = useGramotki();
  const records = snap.people;
  const status: GramotkiStatus = snap.status;
  return useMemo(() => {
    /** Открыть грамотки (окно фразы), если закрыты. */
    const open = async (reason: string) => {
      if (!workspace || !store || !(await ensureOpen(workspace, reason))) throw new GramotkiClosedError();
      return store;
    };
    const add = async (fields: Record<string, string>, source: string): Promise<string> => (await open('Чтобы добавить человека')).create(clean(fields), source);
    /** Сохранить человека и узнать номер его грамотки. */
    const upsert = async (fields: Record<string, string>, source: string) => savePerson(await open('Чтобы сохранить данные человека'), fields, source);
    return {
      records,
      /** Можно показывать: грамотки открыты или их не открыть без фразы (тогда записей нет). */
      loaded: status === 'open' || status === 'locked' || status === 'new',
      /** Грамотки открыты — данные людей доступны. */
      available: status === 'open',
      status,
      /** Менять можно только открытые грамотки (иначе сначала — фраза). */
      readOnly: status !== 'open',
      /** Попросить открыть грамотки (окно фразы). */
      open: () => (workspace ? ensureOpen(workspace) : Promise.resolve(false)),
      /** Записи прямо сейчас (после open() в том же обработчике records ещё прежние). */
      current: (): PersonRecord[] => store?.snapshot().people ?? [],
      /**
       * Сохранить человека. Запись с тем же ФИО и той же датой рождения обновляется,
       * иначе создаётся новая грамотка. Пустые значения не сохраняются.
       */
      async save(fields: Record<string, string>, source: string): Promise<'added' | 'updated'> {
        return (await upsert(fields, source)).how;
      },
      upsert,
      /** Новый человек — новая грамотка. Возвращает её номер. */
      add,
      /** Дописать данные в запись человека (например, то, чего не хватило для документа). */
      complete(id: string, fields: Record<string, string>) {
        if (!store) throw new GramotkiClosedError();
        completeIn(store, id, fields);
      },
      /** Заменить данные человека (ручной ввод). Пустые значения не сохраняются. */
      put(id: string, fields: Record<string, string>, source: string) {
        if (!store) throw new GramotkiClosedError();
        putIn(store, id, fields, source);
      },
      /** Удалить человека вместе с его грамоткой (все файлы). */
      async remove(id: string) {
        await store?.remove(id);
      },
    };
  }, [records, status, store, workspace]);
}

export type PeopleApi = ReturnType<typeof usePeople>;
