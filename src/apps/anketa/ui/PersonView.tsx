import { BookCheck, ChevronLeft, ChevronRight, Eye, EyeOff, List, Star, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { useDictionary } from '@/core/dictionaries/dictionaries';
import type { VarKind } from '@/core/variables/types';
import { AddPlaceDialog } from '@/shared/address/ui/AddPlaceDialog';
import { useGazetteer, ADDRESS_DICT } from '@/shared/address/useGazetteer';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { SaveVarDialog } from '@/ui/SaveVarDialog';
import { useToast } from '@/ui/Toast';
import { APP_ID } from '../constants';
import { fieldStatus, type IssueAction, type PersonResult } from '../model/types';
import { Counters } from './Counters';
import { FieldRow } from './FieldRow';
import { FixAllDialog, type Change } from './FixAllDialog';
import { GROUPS, KNOWN_GROUP_FIELDS } from './groups';
import { actionLabel, applyDictionaryAction, isDirectAction, type TableModel } from './hooks';
import { collectNewWords, NewWordsDialog } from './NewWordsDialog';
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
  onAccept: (col: number, value: string | null) => void;
  onToggleReviewed: () => void;
}

/** Исправления «по шаблону» для анкеты: каждое поле, у которого правильная форма отличается от написанного. */
export function personChanges(result: PersonResult, values: string[], originals: string[], headers: string[], who?: string): Change[] {
  return result.fields
    .filter((f) => !f.accepted && f.canonical !== undefined && f.canonical !== values[f.col])
    .map((f) => ({ row: result.row, col: f.col, from: values[f.col], to: f.canonical!, orig: originals[f.col] ?? '', who, fieldId: f.fieldId, header: headers[f.col] }));
}

type AddPlaceAction = Extract<IssueAction, { kind: 'add-place' }>;

export function PersonView({ model, headers, originals, row, reviewed, readOnly, fileLabel, onSelect, onChangeCell, onApply, onAccept, onToggleReviewed }: Props) {
  const result = model.results[row];
  const values = model.values[row];
  const name = model.names[row] || `Строка ${row + 1}`;
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [fixAll, setFixAll] = useState<Change[] | null>(null);
  const [newWords, setNewWords] = useState(false);
  const [saveVar, setSaveVar] = useState<{ value: string; label: string; kind: VarKind; key?: string } | null>(null);
  const [addPlace, setAddPlace] = useState<AddPlaceAction | null>(null);
  const { gaz } = useGazetteer();
  const { workspace } = useWorkspace();
  const toast = useToast();
  const placeDict = useDictionary(ADDRESS_DICT);

  const byField = useMemo(() => new Map(result.fields.filter((f) => f.fieldId).map((f) => [f.fieldId!, f])), [result]);
  const extraCols = result.fields.filter((f) => !f.fieldId || !KNOWN_GROUP_FIELDS.has(f.fieldId));
  const groups = [...GROUPS.map((g) => ({ ...g, items: g.fields.map((id) => byField.get(id)).filter(Boolean) as typeof result.fields })), { id: 'other', title: 'Прочие столбцы', fields: [], items: extraCols }].filter(
    (g) => g.items.length,
  );
  const isReviewed = reviewed.includes(row);
  const changes = personChanges(result, values, originals, headers);
  const words = useMemo(() => collectNewWords([result], model.names, headers), [result, model.names, headers]);

  const onAction = async (a: IssueAction) => {
    if (!workspace) return;
    if (!isDirectAction(a) && a.kind === 'add-place') {
      setAddPlace(a);
      return;
    }
    const added = await applyDictionaryAction(workspace, a);
    toast(added ? `Подтверждено: ${actionLabel(a)}` : 'Это значение уже есть в справочнике');
  };

  const fio = [values[model.columns.indexOf('person.lastName')], values[model.columns.indexOf('person.firstName')], values[model.columns.indexOf('person.middleName')]]
    .filter(Boolean)
    .join(' ');

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
          <button className="btn" onClick={() => setSaveVar({ value: fio, label: `ФИО: ${fio}`, kind: 'fio' })} disabled={!fio}>
            <Star size={16} /> ФИО в переменные
          </button>
          <label className="check small">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
            Только с замечаниями
          </label>
        </div>
      </div>

      <div className="groups">
        {groups.map((g) => {
          const items = onlyIssues ? g.items.filter((f) => fieldStatus(f) !== 'ok' && fieldStatus(f) !== 'accepted') : g.items;
          if (!items.length) return null;
          return (
            <section key={g.id} className="card group">
              <h3 className="group__title">{g.title}</h3>
              <div className="stack">
                {items.map((f) => {
                  const def = f.fieldId ? FIELD_BY_ID.get(f.fieldId) : undefined;
                  return (
                    <FieldRow
                      key={f.col}
                      field={f}
                      def={def}
                      header={headers[f.col]}
                      original={originals[f.col] ?? ''}
                      current={values[f.col] ?? ''}
                      readOnly={readOnly}
                      onChange={(v) => onChangeCell(f.col, v)}
                      onAccept={(on) => onAccept(f.col, on ? (values[f.col] ?? '') : null)}
                      onAction={onAction}
                      onCopy={() => navigator.clipboard?.writeText(values[f.col] ?? '').then(() => toast('Скопировано'))}
                      onSaveVar={() =>
                        setSaveVar({
                          value: values[f.col] ?? '',
                          label: `${def?.label ?? headers[f.col]}${fio ? ` (${fio})` : ''}`,
                          kind: def?.varKind ?? 'text',
                        })
                      }
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
        {onlyIssues && result.ready && <div className="card empty">Анкета соответствует шаблонам — замечаний нет.</div>}
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
      {saveVar && <SaveVarDialog initial={{ ...saveVar, source: `Проверка анкет: ${fileLabel}` }} onClose={() => setSaveVar(null)} />}
      {addPlace && (
        <AddPlaceDialog
          gaz={gaz}
          initial={{ name: addPlace.name, type: addPlace.type, parentPath: addPlace.parentPath }}
          onClose={() => setAddPlace(null)}
          onSave={(entry, label) => {
            void placeDict.add(entry, { label, source: APP_ID });
            toast(`Добавлено в справочник: ${label}`);
            setAddPlace(null);
          }}
        />
      )}
    </div>
  );
}
