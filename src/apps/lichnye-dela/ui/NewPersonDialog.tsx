import { ArrowRight, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { findByFio, fioText, usePeople } from '@/core/people/people';
import { Modal } from '@/ui/Modal';
import { APP_ID } from '../constants';
import type { CasesApi } from '../model/cases';
import { checkField } from '../model/validate';

/*
 * Новый боец: ФИО (и дата рождения — чтобы различать тёзок). Если такой человек уже есть в базе —
 * предлагаем открыть его, а не создавать второго. Остальные данные заполняются на странице бойца.
 */
export function NewPersonDialog({ cases, onClose, onOpen }: { cases: CasesApi; onClose: () => void; onOpen: (id: string) => void }) {
  const people = usePeople();
  const [fields, setFields] = useState<Record<string, string>>({ 'person.lastName': '', 'person.firstName': '', 'person.middleName': '', 'person.birthDate': '' });
  const [busy, setBusy] = useState(false);
  const set = (id: string, v: string) => setFields((f) => ({ ...f, [id]: v }));
  const trimmed = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.replace(/\s+/g, ' ').trim()]));
  const same = findByFio(people.records, trimmed);
  const canCreate = !!trimmed['person.lastName'] && !!trimmed['person.firstName'] && !busy;

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const id = people.put(trimmed, APP_ID);
      await cases.ensure(id, trimmed);
      onOpen(id);
    } finally {
      setBusy(false);
    }
  };

  const input = (id: string, label: string, placeholder?: string) => {
    const note = checkField(id, fields[id])[0];
    return (
      <label className="field">
        <span className="field__label">{label}</span>
        <input className="input" value={fields[id]} placeholder={placeholder} data-field={id} data-kind={id === 'person.birthDate' ? 'date' : 'name'} autoComplete="off" onChange={(e) => set(id, e.target.value)} />
        {note && (
          <span className={note.level === 'error' ? 'field__error' : 'field__warn'}>
            {note.text}
            {note.fix && (
              <>
                {' '}
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => set(id, note.fix!)}>
                  → {note.fix}
                </button>
              </>
            )}
          </span>
        )}
      </label>
    );
  };

  return (
    <Modal
      title="Новый боец"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={create} disabled={!canCreate}>
            <UserPlus size={16} /> {same.length ? 'Всё равно создать' : 'Создать'}
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <p className="small muted" style={{ margin: 0 }}>
          Человек добавится в базу людей (её видят все приложения), и для него создастся личная папка «Личные дела/{fioText(trimmed) || 'ФИО'}» с
          разделами для фото, сканов, достижений и характеристики. Остальные данные — на следующем шаге.
        </p>
        <div className="grid-2">
          {input('person.lastName', 'Фамилия')}
          {input('person.firstName', 'Имя')}
          {input('person.middleName', 'Отчество')}
          {input('person.birthDate', 'Дата рождения', 'ДД.ММ.ГГГГ')}
        </div>
        {same.length > 0 && (
          <div className="alert alert--warning">
            <div className="alert__body stack stack--s">
              <span>Такой человек уже есть в базе людей:</span>
              {same.map((r) => (
                <button key={r.id} type="button" className="btn btn--sm" onClick={() => onOpen(r.id)}>
                  {fioText(r.fields)}
                  {r.fields['person.birthDate'] ? `, ${r.fields['person.birthDate']}` : ''}
                  {r.fields['rso.squad'] ? ` · ${r.fields['rso.squad']}` : ''} <ArrowRight size={14} /> открыть
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
