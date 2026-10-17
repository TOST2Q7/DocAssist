import { describe, expect, it } from 'vitest';
import { completePerson, upsertPerson, type PersonRecord } from './people';

const ivan = { 'person.lastName': 'Иванов', 'person.firstName': 'Иван', 'person.birthDate': '01.01.2002' };

describe('база людей', () => {
  it('новый человек добавляется, пустые значения не сохраняются', () => {
    const r = upsertPerson([], { ...ivan, 'edu.group': ' ' }, 'test', 'T1');
    expect(r.how).toBe('added');
    expect(r.records).toEqual([{ id: r.id, fields: ivan, savedAt: 'T1', source: 'test' }]);
  });

  it('повторное сохранение обновляет запись и не теряет поля, о которых сохраняющий не знает', () => {
    const records: PersonRecord[] = [{ id: 'p1', fields: { ...ivan, 'edu.group': 'И-11', 'work.place': 'ООО «Ромашка»' }, savedAt: 'T0', source: 'doc-generator' }];
    const r = upsertPerson(records, { ...ivan, 'edu.group': 'И-12', 'person.phone': '' }, 'anketa', 'T1');
    expect(r).toMatchObject({ how: 'updated', id: 'p1' });
    expect(r.records[0].fields).toEqual({ ...ivan, 'edu.group': 'И-12', 'work.place': 'ООО «Ромашка»' });
  });

  it('дописать: непустые значения заменяют прежние, остальное остаётся', () => {
    const records: PersonRecord[] = [
      { id: 'p1', fields: { ...ivan, 'person.phone': '8(923)123-45-67' }, savedAt: 'T0', source: 'anketa' },
      { id: 'p2', fields: { 'person.lastName': 'Петров' }, savedAt: 'T0', source: 'anketa' },
    ];
    const out = completePerson(records, 'p1', { 'edu.group': 'И-12', 'person.phone': '' }, 'T1');
    expect(out[0]).toEqual({ id: 'p1', fields: { ...ivan, 'person.phone': '8(923)123-45-67', 'edu.group': 'И-12' }, savedAt: 'T1', source: 'anketa' });
    expect(out[1]).toBe(records[1]);
  });
});
