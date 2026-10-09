import { BookCheck, ChevronLeft, ChevronRight, Eye, EyeOff, List, SearchCheck, Star, UserPlus, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePeople } from '@/core/people/people';
import { FIELD_BY_ID, PERSON_FIELDS } from '@/core/schema/fields';
import type { VarKind } from '@/core/variables/types';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { SaveVarDialog } from '@/ui/SaveVarDialog';
import { useToast } from '@/ui/Toast';
import { APP_ID } from '../constants';
import type { FieldResult, PersonResult } from '../model/types';
import { Counters } from './Counters';
import { FieldRow } from './FieldRow';
import { FixAllDialog, type Change } from './FixAllDialog';
import { confirmBase, type TableModel } from './hooks';
import { collectNewWords, NewWordsDialog } from './NewWordsDialog';
import { PeopleCheckDialog, runPeopleCheck, type PeopleCheckResult } from './PeopleCheck';
import { PersonPicker } from './PersonPicker';

interface Props {
  model: TableModel;
  headers: string[];
  /** Исходные значения этой строки (как в файле). */
  originals: string[];
  row: number;
  reviewed: number[];
  readOnly: boolean;
  fileLabel: string;
  onSelect: (row: number | null) => void;
  onChangeCell: (col: number, value: string) => void;
  onApply: (changes: Change[]) => void;
  onConfirm: (col: number, value: string | null) => void;
  onConfirmMany: (items: { row: number; col: number; value: string }[]) => void;
  onToggleReviewed: () => void;
}

/** Исправления для анкеты: каждое поле, у которого есть правильная запись, отличная от написанного. */
export function personChanges(result: PersonResult, values: string[], originals: string[], headers: string[], who?: string): Change[] {
  return result.fields
    .filter((f) => f.fix !== undefined && f.fix !== values[f.col])
    .map((f) => ({ row: result.row, col: f.col, from: values[f.col], to: f.fix!, orig: originals[f.col] ?? '', who, fieldId: f.fieldId, header: headers[f.col] }));
}

/** Значения строки на общем языке полей — для базы людей. */
export function personFields(values: string[], columns: (string | null)[]): Record<string, string> {
  const out: Record<string, string> = {};
  columns.forEach((id, i) => id && (out[id] = values[i] ?? ''));
  return out;
}

export function PersonView({ model, headers, originals, row, reviewed, readOnly, fileLabel, onSelect, onChangeCell, onApply, onConfirm, onConfirmMany, onToggleReviewed }: Props) {
  const result = model.results[row];
  const values = model.values[row];
  const name = model.names[row] || `Строка ${row + 1}`;
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [fixAll, setFixAll] = useState<Change[] | null>(null);
  const [newWords, setNewWords] = useState(false);
  const [check, setCheck] = useState<PeopleCheckResult | null>(null);
  const [saveVar, setSaveVar] = useState<{ value: string; label: string; kind: VarKind; key?: string } | null>(null);
  const { workspace } = useWorkspace();
  const people = usePeople();
  const toast = useToast();

  const isReviewed = reviewed.includes(row);
  const changes = personChanges(result, values, originals, headers);
  const words = useMemo(() => collectNewWords([result], model.names, headers), [result, model.names, headers]);

  const confirmField = async (f: FieldResult) => {
    if (!workspace) return;
    if (f.confirm?.base) await confirmBase(workspace, f.confirm.base);
    if (f.confirm?.person) onConfirm(f.col, values[f.col] ?? '');
    toast(f.confirm?.base ? `Добавлено в базу «${f.confirm.base.tree}»` : 'Подтверждено');
  };

  const checkActual = async () => {
    if (!workspace) return;
    const r = await runPeopleCheck(workspace, [result], model, people.records, onConfirmMany);
    setCheck(r[0]);
  };

  const saveToPeople = () => {
    const how = people.save(personFields(values, model.columns), APP_ID);
    toast(how === 'added' ? `${name}: сохранено в базу людей` : `${name}: запись в базе людей обновлена`);
  };

  const fio = [values[model.columns.indexOf('person.lastName')], values[model.columns.indexOf('person.firstName')], values[model.columns.indexOf('person.middleName')]]
    .filter(Boolean)
    .join(' ');

  const numOf = (f: FieldResult) => {
    const i = f.fieldId ? PERSON_FIELDS.findIndex((x) => x.id === f.fieldId) : -1;
    return i >= 0 ? i + 1 : f.col + 1;
  };
  const visible = onlyIssues ? result.fields.filter((f) => f.status !== 'ok') : result.fields;

  return (
    <div className="stack">
      <div className="person-bar">
        <button className="icon-btn" onClick={() => onSelect(null)} data-tip="К списку" aria-label="К списку людей">
          <List size={20} />
        </button>
        <button className="icon-btn" onClick={() => onSelect(row - 1)} disabled={row === 0} aria-label="Предыдущий" data-tip="Предыдущий">
          <ChevronLeft size={20} />
        </button>
        <PersonPicker names={model.names} results={model.results} reviewed={reviewed} current={row} onSelect={onSelect} />
        <button className="icon-btn" onClick={() => onSelect(row + 1)} disabled={row >= model.results.length - 1} aria-label="Следующий" data-tip="Следующий">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className={`person-head card ${result.ready ? 'person-head--ready' : ''}`}>
        <div className="person-head__main">
          <h2>{name}</h2>
          <div className="row small muted">
            <span>{fileLabel}</span>
            <span>·</span>
            <span>строка {row + 1}</span>
            <Counters counts={result.counts} />
          </div>
        </div>
        <div className="row">
          <button className="btn btn--primary" onClick={() => setFixAll(changes)} disabled={readOnly || !changes.length}>
            <Wand2 size={16} /> Исправить по шаблону ({changes.length})
          </button>
          <button className="btn btn--confirm" onClick={() => setNewWords(true)} disabled={readOnly || !words.length}>
            <BookCheck size={16} /> Новые слова ({words.length})
          </button>
          <button className="btn" onClick={checkActual} disabled={readOnly || !fio} data-tip="Найти человека в базе людей по ФИО и отметить совпавшие поля">
            <SearchCheck size={16} /> Проверить с актуальной информацией
          </button>
          <button className="btn" onClick={saveToPeople} disabled={!result.ready || people.readOnly} data-tip={result.ready ? 'Сохранить проверенные данные в базу людей' : 'Сначала исправьте и подтвердите всё'}>
            <UserPlus size={16} /> В базу людей
          </button>
          <button className="btn" onClick={() => setSaveVar({ value: fio, label: `ФИО: ${fio}`, kind: 'fio' })} disabled={!fio}>
            <Star size={16} /> ФИО в переменные
          </button>
          <label className="check small">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
            Только с замечаниями
          </label>
        </div>
      </div>

      <div className="fields">
        {visible.map((f) => {
          const def = f.fieldId ? FIELD_BY_ID.get(f.fieldId) : undefined;
          return (
            <div key={f.col} className="card field-card">
              <FieldRow
                num={numOf(f)}
                field={f}
                def={def}
                header={headers[f.col]}
                original={originals[f.col] ?? ''}
                current={values[f.col] ?? ''}
                readOnly={readOnly}
                onChange={(v) => onChangeCell(f.col, v)}
                onConfirmPerson={(on) => onConfirm(f.col, on ? (values[f.col] ?? '') : null)}
                onConfirmBase={() => void confirmField(f)}
                onCopy={() => navigator.clipboard?.writeText(values[f.col] ?? '').then(() => toast('Скопировано'))}
                onSaveVar={() =>
                  setSaveVar({
                    value: values[f.col] ?? '',
                    label: `${def?.label ?? headers[f.col]}${fio ? ` (${fio})` : ''}`,
                    kind: def?.varKind ?? 'text',
                  })
                }
              />
            </div>
          );
        })}
        {onlyIssues && !visible.length && <div className="card empty">Замечаний нет — анкета готова.</div>}
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn" onClick={() => onSelect(row - 1)} disabled={row === 0}>
          <ChevronLeft size={16} /> Предыдущий
        </button>
        <button className={`btn ${isReviewed ? 'btn--done' : ''}`} onClick={onToggleReviewed} aria-pressed={isReviewed}>
          {isReviewed ? <Eye size={16} /> : <EyeOff size={16} />} {isReviewed ? 'Просмотрено' : 'Отметить просмотренной'}
        </button>
        <button
          className="btn btn--primary"
          onClick={() => {
            if (!isReviewed) onToggleReviewed();
            if (row < model.results.length - 1) onSelect(row + 1);
          }}
        >
          Следующий <ChevronRight size={16} />
        </button>
      </div>

      {fixAll && (
        <FixAllDialog
          changes={fixAll}
          onClose={() => setFixAll(null)}
          onApply={(c) => {
            onApply(c);
            setFixAll(null);
            toast(`Применено исправлений: ${c.length}`);
          }}
        />
      )}
      {newWords && <NewWordsDialog items={words} onClose={() => setNewWords(false)} />}
      {check && <PeopleCheckDialog results={[check]} headers={headers} model={model} onClose={() => setCheck(null)} />}
      {saveVar && <SaveVarDialog initial={{ ...saveVar, source: `Проверка анкет: ${fileLabel}` }} onClose={() => setSaveVar(null)} />}
    </div>
  );
}
