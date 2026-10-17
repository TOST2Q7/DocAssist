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
