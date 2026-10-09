import { BookCheck, Check, CircleAlert, Copy, Database, RotateCcw, Star, Wand2, XCircle } from 'lucide-react';
import { normalizeHeader, type FieldDef } from '@/core/schema/fields';
import { Menu } from '@/ui/Menu';
import type { FieldResult, FieldStatus, Issue } from '../model/types';
import { Diff, MarkedValue } from './Marks';

interface Props {
  /** Номер столбца в форме (с единицы). */
  num: number;
  field: FieldResult;
  def?: FieldDef;
  header: string;
  original: string;
  current: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  /** Галочка «проверено, верно» у индивидуального значения. */
  onConfirmPerson: (on: boolean) => void;
  /** Подтвердить новое значение: добавить в базу (и поставить галочку, если поле индивидуальное). */
  onConfirmBase: () => void;
  onSaveVar: () => void;
  onCopy: () => void;
}

const STATUS_LABEL: Record<FieldStatus, string> = {
  ok: 'Верно',
  error: 'Ошибка',
  warn: 'Нужно подтвердить',
};

export function IssueIcon({ issue }: { issue: Pick<Issue, 'level'> }) {
  if (issue.level === 'error') return <XCircle size={16} className="ic ic--error" aria-label="Ошибка" />;
  return <CircleAlert size={16} className="ic ic--confirm" aria-label="Предупреждение" />;
}

function StatusIcon({ status }: { status: FieldStatus }) {
  const label = STATUS_LABEL[status];
  if (status === 'ok') return <Check size={18} className="ic ic--ok" aria-label={label} />;
  if (status === 'error') return <XCircle size={18} className="ic ic--error" aria-label={label} />;
  return <CircleAlert size={18} className="ic ic--confirm" aria-label={label} />;
}

export function FieldRow({ num, field, def, header, original, current, readOnly, onChange, onConfirmPerson, onConfirmBase, onSaveVar, onCopy }: Props) {
  const status = field.status;
  const id = `f-${field.col}`;
  const changed = current !== original;
  const label = def?.label ?? header;
  const long = current.length > 50 || field.parts !== undefined;
  const blocking = field.issues.some((i) => i.level === 'error' && !i.confirmable);
  const otherPlace = field.issues.some((i) => i.confirmable);
  const base = field.confirm?.base;
  const person = field.confirm?.person;

  return (
    <div className={`frow frow--${status}`}>
      <div className="frow__head">
        <StatusIcon status={status} />
        <label htmlFor={id} className="frow__label">
          <span className="frow__num">{num}.</span> {label}
        </label>
        {changed && <span className="badge badge--updated">изменено</span>}
        {person && field.confirmed && <span className="badge badge--confirmed">проверено</span>}
        <span className="spacer" />
        <Menu
          label={`Действия с полем «${label}»`}
          actions={[
            { label: 'Сохранить в переменные', icon: <Star size={16} />, onClick: onSaveVar, disabled: !current.trim() },
            { label: 'Скопировать значение', icon: <Copy size={16} />, onClick: onCopy, disabled: !current },
            { label: 'Вернуть как в файле', icon: <RotateCcw size={16} />, onClick: () => onChange(original), disabled: !changed || readOnly },
          ]}
        />
      </div>
      {def && normalizeHeader(def.label) !== normalizeHeader(header) && <div className="frow__col small faint">Столбец в таблице: {header}</div>}

      {long ? (
        <textarea
          id={id}
          className={`input ${status === 'error' ? 'input--error' : ''}`}
          value={current}
          rows={Math.min(4, Math.max(2, Math.ceil(current.length / 60)))}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input id={id} className={`input ${status === 'error' ? 'input--error' : ''}`} value={current} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
      )}

      <MarkedValue value={current} issues={field.issues} />

      {field.parts && field.parts.length > 0 && (
        <div className="parts" aria-label="Части ячейки">
          {field.parts.map((p, i) => (
            <span key={i} className={`part part--${p.state}`} title={PART_TITLE[p.state]}>
              <span className="part__level">{p.title}</span>
              <span className="part__text">{p.text}</span>
              {p.state === 'known' && <Database size={12} className="ic ic--ok" aria-label="есть в базе" />}
            </span>
          ))}
        </div>
      )}

      {field.fix !== undefined && field.fix !== current && (
        <div className="suggest">
          <div className="suggest__text">
            <span className="small muted">Исправление: </span>
            <Diff from={current} to={field.fix} />
          </div>
          <button className="btn btn--sm btn--primary" onClick={() => onChange(field.fix!)} disabled={readOnly}>
            <Wand2 size={14} /> Применить
          </button>
        </div>
      )}

      {field.issues.length > 0 && (
        <ul className="issues">
          {field.issues.map((issue, k) => (
            <li key={k} className={`issue issue--${issue.level}`}>
              <IssueIcon issue={issue} />
              <span className="issue__msg">{issue.text}</span>
              {issue.fix !== undefined && issue.fix !== current && issue.fix !== field.fix && (
                <span className="issue__actions">
                  <button className="btn btn--sm" onClick={() => onChange(issue.fix!)} disabled={readOnly}>
                    Исправить
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!blocking && (base || person) && (
        <div className="confirm-row">
          {base ? (
            <button className={`btn btn--sm ${otherPlace ? 'btn--danger' : 'btn--confirm'}`} onClick={onConfirmBase} disabled={readOnly}>
              <BookCheck size={14} /> {otherPlace ? 'Это другое место — добавить в базу' : person ? 'Верно — подтвердить и добавить в базу' : 'Верно — добавить в базу'}
            </button>
          ) : (
            <label className={`check confirm-check ${field.confirmed ? 'is-on' : ''}`}>
              <input type="checkbox" checked={field.confirmed} disabled={readOnly} onChange={(e) => onConfirmPerson(e.target.checked)} />
              Проверено, значение верное
            </label>
          )}
          {base && <span className="small faint confirm-row__where">→ {base.tree}</span>}
        </div>
      )}

      {changed && (
        <div className="small faint frow__orig">
          В файле: <span>{original || '(пусто)'}</span>
        </div>
      )}
    </div>
  );
}

const PART_TITLE: Record<string, string> = {
  known: 'Есть в базе',
  new: 'Нет в базе — нужно подтвердить',
  error: 'Ошибка',
  off: 'Не сохраняется в древо (только формат)',
  plain: 'С базой сверится после исправления ошибок',
};
