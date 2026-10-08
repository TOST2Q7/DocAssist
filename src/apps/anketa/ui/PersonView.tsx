import { CheckCircle2, ChevronLeft, ChevronRight, Circle, List, Star, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { useDictionary } from '@/core/dictionaries/dictionaries';
import { ENUM_BY_ID } from '@/core/schema/enums';
import type { VarKind } from '@/core/variables/types';
import { AddPlaceDialog } from '@/shared/address/ui/AddPlaceDialog';
import { useGazetteer, ADDRESS_DICT } from '@/shared/address/useGazetteer';
import { addDictEntry } from '@/core/dictionaries/dictionaries';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { SaveVarDialog } from '@/ui/SaveVarDialog';
import { useToast } from '@/ui/Toast';
import type { AddToDictionaryAction } from '@/shared/address/check';
import { APP_ID } from '../constants';
import type { IssueAction, PersonResult } from '../model/types';
import { Counters } from './Counters';
import { FieldRow, fieldStatus } from './FieldRow';
import { FixAllDialog, type Change } from './FixAllDialog';
import { GROUPS, KNOWN_GROUP_FIELDS } from './groups';
import { issueKey, type TableModel } from './hooks';
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
  onIgnore: (key: string) => void;
  onToggleReviewed: () => void;
}

export function personChanges(result: PersonResult, values: string[], originals: string[], headers: string[], who?: string): Change[] {
  return result.fields
    .filter((f) => f.suggestion !== undefined && f.suggestion !== values[f.col])
    .map((f) => ({ row: result.row, col: f.col, from: values[f.col], to: f.suggestion!, orig: originals[f.col] ?? '', who, fieldId: f.fieldId, header: headers[f.col] }));
}

export function PersonView({ model, headers, originals, row, reviewed, readOnly, fileLabel, onSelect, onChangeCell, onApply, onIgnore, onToggleReviewed }: Props) {
  const result = model.results[row];
  const values = model.values[row];
  const name = model.names[row] || `Строка ${row + 1}`;
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [fixAll, setFixAll] = useState<Change[] | null>(null);
  const [saveVar, setSaveVar] = useState<{ value: string; label: string; kind: VarKind; key?: string } | null>(null);
  const [addPlace, setAddPlace] = useState<AddToDictionaryAction | null>(null);
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

  const onAction = (a: IssueAction) => {
    if (!workspace) return;
    if (a.kind === 'add-enum') {
      addDictEntry(workspace, a.dict, a.value, { label: `${ENUM_BY_ID.get(a.dict)?.title ?? a.dict}: ${a.value}`, source: APP_ID });
      toast(`«${a.value}» добавлено в справочник «${ENUM_BY_ID.get(a.dict)?.title ?? a.dict}»`);
    } else setAddPlace(a);
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

      <div className="person-head card">
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
            <Wand2 size={16} /> Исправить всё ({changes.length})
          </button>
          <button className="btn" onClick={() => setSaveVar({ value: fio, label: `ФИО: ${fio}`, kind: 'fio', key: undefined })} disabled={!fio}>
            <Star size={16} /> ФИО в переменные
          </button>
          <button className={`btn ${isReviewed ? 'btn--done' : ''}`} onClick={onToggleReviewed} aria-pressed={isReviewed}>
            {isReviewed ? <CheckCircle2 size={16} /> : <Circle size={16} />} {isReviewed ? 'Проверено' : 'Отметить проверенным'}
          </button>
          <label className="check small">
            <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
            Только с замечаниями
          </label>
        </div>
      </div>

      <div className="groups">
        {groups.map((g) => {
          const items = onlyIssues ? g.items.filter((f) => fieldStatus(f) !== 'ok') : g.items;
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
                      onIgnore={(code) => onIgnore(issueKey(f.col, code))}
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
        {onlyIssues && result.fields.every((f) => fieldStatus(f) === 'ok') && <div className="card empty">Замечаний нет 🎉</div>}
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn" onClick={() => onSelect(row - 1)} disabled={row === 0}>
          <ChevronLeft size={16} /> Предыдущий
        </button>
        <button
          className="btn btn--primary"
          onClick={() => {
            if (!isReviewed) onToggleReviewed();
            if (row < model.results.length - 1) onSelect(row + 1);
          }}
        >
          {isReviewed ? 'Следующий' : 'Проверено, следующий'} <ChevronRight size={16} />
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
      {saveVar && <SaveVarDialog initial={{ ...saveVar, source: `Проверка анкет: ${fileLabel}` }} onClose={() => setSaveVar(null)} />}
      {addPlace && (
        <AddPlaceDialog
          gaz={gaz}
          initial={{ name: addPlace.name, type: addPlace.type, parentPath: addPlace.parentPath }}
          onClose={() => setAddPlace(null)}
          onSave={(entry, label) => {
            placeDict.add(entry, { label, source: APP_ID });
            toast(`Добавлено в справочник: ${label}`);
            setAddPlace(null);
          }}
        />
      )}
    </div>
  );
}
