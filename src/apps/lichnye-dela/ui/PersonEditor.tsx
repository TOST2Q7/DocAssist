import { ChevronDown, ChevronRight, CircleAlert, RotateCcw, Save, Wand2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { usePeople, type PersonRecord } from '@/core/people/people';
import { FIELD_BY_ID, PERSON_FIELDS } from '@/core/schema/fields';
import { FIELD_GROUPS, LONG_FIELDS } from '../model/groups';
import { checkField, FIELD_MASKS, FIELD_OPTIONS, findDuplicates, type FieldNote } from '../model/validate';

interface Props {
  record: PersonRecord;
  readOnly: boolean;
  /** Сохранить (поля целиком). */
  onSave: (fields: Record<string, string>) => void;
  /** Есть несохранённые изменения. */
  onDirty: (dirty: boolean) => void;
}

const PLACEHOLDERS: Record<string, string> = {
  'person.birthDate': 'ДД.ММ.ГГГГ',
  'passport.issueDate': 'ДД.ММ.ГГГГ',
  'rso.joinDate': 'ДД.ММ.ГГГГ',
  'rso.leaveDate': 'ДД.ММ.ГГГГ',
  'rso.checkMark': 'ДД.ММ.ГГГГ',
  'meta.timestamp': 'ДД.ММ.ГГГГ ЧЧ:ММ:СС',
  'rso.squad': '«Название»',
  'person.vk': 'https://vk.com/…',
  'person.email': 'name@example.com',
};

const NUMERIC = new Set(['passport.series', 'passport.number', 'person.inn', 'edu.course']);

function Notes({ notes, onFix, readOnly }: { notes: FieldNote[]; onFix: (v: string) => void; readOnly: boolean }) {
  if (!notes.length) return null;
  return (
    <ul className="dela-notes">
      {notes.map((n, i) => (
        <li key={i} className={`dela-note dela-note--${n.level}`}>
          {n.level === 'error' ? <XCircle size={14} /> : <CircleAlert size={14} />}
          <span className="spacer">{n.text}</span>
          {n.fix !== undefined && !readOnly && (
            <button type="button" className="btn btn--sm" onClick={() => onFix(n.fix!)} data-tip={`Исправить на «${n.fix}»`}>
              <Wand2 size={14} /> {n.fix.length > 24 ? 'Исправить' : n.fix}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PersonEditor({ record, readOnly, onSave, onDirty }: Props) {
  const people = usePeople();
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...record.fields }));
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(FIELD_GROUPS.map((g) => [g.id, !g.collapsed || g.ids.some((id) => record.fields[id])])));

  // Запись сохранили в другом месте (например, перевод) — подхватить, если здесь ничего не меняли.
  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(draft), ...Object.keys(record.fields)]);
    return [...keys].some((k) => (draft[k] ?? '') !== (record.fields[k] ?? ''));
  }, [draft, record.fields]);
  useEffect(() => {
    if (!dirty) setDraft({ ...record.fields });
  }, [record]);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (id: string, v: string) => setDraft((d) => ({ ...d, [id]: v }));
  const dups = useMemo(() => findDuplicates(draft, people.records, record.id), [draft, people.records, record.id]);
  const notesOf = (id: string): FieldNote[] => [...checkField(id, draft[id] ?? '', draft), ...(dups[id] ? [{ level: 'error' as const, text: `Такое же значение у другого человека: ${dups[id]}` }] : [])];
  const filled = PERSON_FIELDS.filter((f) => (draft[f.id] ?? '').trim()).length;
  const allNotes = PERSON_FIELDS.flatMap((f) => notesOf(f.id));
  const errors = allNotes.filter((n) => n.level === 'error').length;
  const fixes = PERSON_FIELDS.flatMap((f) => {
    const fix = notesOf(f.id).find((n) => n.fix !== undefined)?.fix;
    return fix === undefined ? [] : [[f.id, fix] as const];
  });
  const canSave = dirty && !readOnly && !!(draft['person.lastName'] ?? '').trim();

  const save = () => {
    if (!canSave) return;
    const clean = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''));
    setDraft(clean);
    onSave(clean);
  };

  const control = (id: string) => {
    const def = FIELD_BY_ID.get(id)!;
    const value = draft[id] ?? '';
    const notes = notesOf(id);
    const cls = `input ${notes.some((n) => n.level === 'error') ? 'input--error' : ''}`;
    const common = { id: `pf-${id}`, value, readOnly, 'data-field': id, 'data-kind': def.varKind } as const;
    const options = FIELD_OPTIONS[id];
    return (
      <div key={id} className={`field dela-field ${LONG_FIELDS.has(id) ? 'dela-field--wide' : ''}`}>
        <label className="field__label" htmlFor={`pf-${id}`}>
          {def.label}
          {value !== (record.fields[id] ?? '') && <span className="badge badge--updated dela-changed">изменено</span>}
        </label>
        {options ? (
          <select className="select" {...common} disabled={readOnly} onChange={(e) => set(id, e.target.value)}>
            <option value="">—</option>
            {!options.includes(value) && value && <option value={value}>{value}</option>}
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : LONG_FIELDS.has(id) ? (
          <textarea className={cls} {...common} rows={value.length > 70 ? 3 : 2} onChange={(e) => set(id, e.target.value)} />
        ) : (
          <input
            className={cls}
            {...common}
            autoComplete="off"
            inputMode={NUMERIC.has(id) || FIELD_MASKS[id] || PLACEHOLDERS[id] === 'ДД.ММ.ГГГГ' ? 'numeric' : undefined}
            placeholder={PLACEHOLDERS[id] ?? (FIELD_MASKS[id] ? FIELD_MASKS[id].replace(/9/g, '0') : undefined)}
            onChange={(e) => set(id, e.target.value)}
          />
        )}
        <Notes notes={notes} readOnly={readOnly} onFix={(v) => set(id, v)} />
      </div>
    );
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="row small muted">
        <span>
          Заполнено {filled} из {PERSON_FIELDS.length}
        </span>
        {errors > 0 && <span className="badge dela-badge--error">ошибок: {errors}</span>}
        <span className="spacer" />
        {fixes.length > 1 && !readOnly && (
          <button type="button" className="btn btn--sm" onClick={() => setDraft((d) => ({ ...d, ...Object.fromEntries(fixes) }))}>
            <Wand2 size={14} /> Исправить всё ({fixes.length})
          </button>
        )}
      </div>
      {FIELD_GROUPS.map((g) => {
        const isOpen = open[g.id];
        const groupErrors = g.ids.reduce((n, id) => n + notesOf(id).filter((x) => x.level === 'error').length, 0);
        return (
          <section key={g.id} className="card dela-group">
            <button type="button" className="dela-group__head" onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))} aria-expanded={isOpen}>
              {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <strong className="spacer">{g.title}</strong>
              {groupErrors > 0 && <span className="badge dela-badge--error">{groupErrors}</span>}
              <span className="small faint">
                {g.ids.filter((id) => (draft[id] ?? '').trim()).length}/{g.ids.length}
              </span>
            </button>
            {isOpen && <div className="dela-grid">{g.ids.map(control)}</div>}
          </section>
        );
      })}
      {!readOnly && (
        <div className={`dela-savebar ${dirty ? 'is-dirty' : ''}`}>
          <span className="spacer small">{dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены в базе людей'}</span>
          <button type="button" className="btn" onClick={() => setDraft({ ...record.fields })} disabled={!dirty}>
            <RotateCcw size={16} /> Отменить
          </button>
          <button type="submit" className="btn btn--primary" disabled={!canSave}>
            <Save size={16} /> Сохранить
          </button>
        </div>
      )}
    </form>
  );
}
