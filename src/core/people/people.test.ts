import { describe, expect, it } from 'vitest';
import { completePerson, upsertPerson, type PersonRecord } from './people';

const person = { 'person.lastName': 'Фамилия', 'person.firstName': 'Имя', 'person.birthDate': '01.01.2000' };

describe('база людей', () => {
  it('новый человек добавляется, пустые значения не сохраняются', () => {
    const r = upsertPerson([], { ...person, 'edu.group': ' ' }, 'test', 'T1');
    expect(r.how).toBe('added');
    expect(r.records).toEqual([{ id: r.id, fields: person, savedAt: 'T1', source: 'test' }]);
  });

  it('повторное сохранение обновляет запись и не теряет поля, о которых сохраняющий не знает', () => {
    const records: PersonRecord[] = [{ id: 'p1', fields: { ...person, 'edu.group': 'И-11', 'work.place': 'ООО «Название»' }, savedAt: 'T0', source: 'doc-generator' }];
    const r = upsertPerson(records, { ...person, 'edu.group': 'И-12', 'person.phone': '' }, 'anketa', 'T1');
    expect(r).toMatchObject({ how: 'updated', id: 'p1' });
    expect(r.records[0].fields).toEqual({ ...person, 'edu.group': 'И-12', 'work.place': 'ООО «Название»' });
  });

  it('дописать: непустые значения заменяют прежние, остальное остаётся', () => {
    const records: PersonRecord[] = [
      { id: 'p1', fields: { ...person, 'person.phone': '8(000)000-00-00' }, savedAt: 'T0', source: 'anketa' },
      { id: 'p2', fields: { 'person.lastName': 'Петров' }, savedAt: 'T0', source: 'anketa' },
    ];
    const out = completePerson(records, 'p1', { 'edu.group': 'И-12', 'person.phone': '' }, 'T1');
    expect(out[0]).toEqual({ id: 'p1', fields: { ...person, 'person.phone': '8(000)000-00-00', 'edu.group': 'И-12' }, savedAt: 'T1', source: 'anketa' });
    expect(out[1]).toBe(records[1]);
  });
});

describe('база людей на грамотках', () => {
  const PHRASE = 'лампа ворона северный компот гитара';

  async function open() {
    const { MemoryAdapter } = await import('../storage/memoryAdapter');
    const { Workspace } = await import('../workspace/workspace');
    const { GramotkiStore } = await import('../gramotka/store');
    const ws = new Workspace(new MemoryAdapter());
    await ws.init();
    const store = new GramotkiStore(ws);
    await store.init();
    await store.createOwner(PHRASE, 'Мастер', false);
    return { ws, store, GramotkiStore };
  }

  it('новый человек — новая грамотка; тот же ФИО и дата рождения — та же грамотка, чужие поля не теряются', async () => {
    const { savePerson, completeIn } = await import('./people');
    const { ws, store, GramotkiStore } = await open();
    const a = await savePerson(store, { ...person, 'edu.group': 'И-11' }, 'anketa');
    expect(a.how).toBe('added');
    completeIn(store, a.id, { 'work.place': 'ООО «Название»' });
    const b = await savePerson(store, { 'person.lastName': ' фамилия ', 'person.firstName': 'ИМЯ', 'person.birthDate': '01.01.2000', 'edu.group': 'И-12', 'person.phone': '' }, 'anketa');
    expect(b).toEqual({ id: a.id, how: 'updated' });
    // Тёзка с другой датой рождения — отдельный человек.
    const c = await savePerson(store, { ...person, 'person.birthDate': '02.02.2002' }, 'anketa');
    expect(c.how).toBe('added');
    expect(store.snapshot().people).toHaveLength(2);
    // После закрытия и открытия фразой — всё на месте.
    await store.lock();
    const again = new GramotkiStore(ws);
    await again.init();
    await again.unlock(PHRASE, false);
    const saved = again.snapshot().people.find((p) => p.id === a.id)!;
    expect(saved.fields).toMatchObject({ 'edu.group': 'И-12', 'work.place': 'ООО «Название»' });
    expect(saved.fields['person.phone']).toBeUndefined();
  }, 40_000);

  it('двойное нажатие «сохранить» не создаёт двух грамоток', async () => {
    const { savePerson } = await import('./people');
    const { store } = await open();
    const [x, y] = await Promise.all([savePerson(store, person, 'a'), savePerson(store, person, 'a')]);
    expect(x.id).toBe(y.id);
    expect(store.snapshot().people).toHaveLength(1);
  }, 30_000);

  it('много людей подряд: у каждого своя грамотка, номера разные', async () => {
    const { savePerson } = await import('./people');
    const { store } = await open();
    const ids = new Set<string>();
    for (let i = 0; i < 25; i++) ids.add((await savePerson(store, { 'person.lastName': `Фамилия${i}`, 'person.firstName': 'Имя' }, 'test')).id);
    expect(ids.size).toBe(25);
    expect(store.snapshot().people).toHaveLength(25);
  }, 60_000);

  it('ручной ввод заменяет данные; закрытые грамотки не меняются', async () => {
    const { savePerson, putIn } = await import('./people');
    const { GramotkiClosedError } = await import('../gramotka/react');
    const { store } = await open();
    const { id } = await savePerson(store, { ...person, 'person.phone': '8(000)000-00-00' }, 'a');
    putIn(store, id, { ...person, 'person.phone': '', 'person.email': 'mail@example.com' }, 'lichnye-dela');
    expect(store.item(id)!.fields).toEqual({ ...person, 'person.email': 'mail@example.com' });
    await store.lock();
    expect(() => putIn(store, id, person, 'x')).toThrow(GramotkiClosedError);
  }, 30_000);
});
