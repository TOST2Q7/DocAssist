import { BookCheck, Check, CheckCheck, CircleHelp, Copy, Link2Off, RotateCcw, ShieldCheck, Star, Undo2, Wand2, XCircle } from 'lucide-react';
import { normalizeHeader, type FieldDef } from '@/core/schema/fields';
import { VarInput } from '@/ui/VarInput';
import { Menu } from '@/ui/Menu';
import { fieldStatus, type FieldResult, type Issue, type IssueAction } from '../model/types';
import { Diff, MarkedValue } from './Marks';

interface Props {
  field: FieldResult;
  def?: FieldDef;
  header: string;
  original: string;
  current: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  /** Принять значение «как есть» (true) или снять принятие (false). */
  onAccept: (on: boolean) => void;
  onAction: (action: IssueAction) => void;
  onSaveVar: () => void;
  onCopy: () => void;
}

const STATUS_LABEL = {
  ok: 'Соответствует шаблону',
  error: 'Ошибка',
  glued: 'Слипшиеся слова',
  confirm: 'Нужно подтвердить',
  accepted: 'Принято как есть',
};

export function IssueIcon({ issue }: { issue: Pick<Issue, 'level' | 'category'> }) {
  if (issue.category === 'glued') return <Link2Off size={16} className="ic ic--glued" aria-label="Слиплось" />;
  if (issue.level === 'error') return <XCircle size={16} className="ic ic--error" aria-label="Ошибка" />;
  return <CircleHelp size={16} className="ic ic--confirm" aria-label="Подтвердить" />;
}

function StatusIcon({ status }: { status: ReturnType<typeof fieldStatus> }) {
  const label = STATUS_LABEL[status];
  if (status === 'ok') return <Check size={18} className="ic ic--ok" aria-label={label} />;
  if (status === 'error') return <XCircle size={18} className="ic ic--error" aria-label={label} />;
  if (status === 'glued') return <Link2Off size={18} className="ic ic--glued" aria-label={label} />;
  if (status === 'accepted') return <CheckCheck size={18} className="ic ic--accepted" aria-label={label} />;
  return <CircleHelp size={18} className="ic ic--confirm" aria-label={label} />;
}

function actionButton(a: IssueAction): string {
  if (a.kind === 'add-postal') return 'Подтвердить индекс';
  if (a.kind === 'add-place') return a.type && a.parentPath ? 'Подтвердить' : 'Добавить в справочник…';
  return 'Подтвердить';
}

export function FieldRow({ field, def, header, original, current, readOnly, onChange, onAccept, onAction, onSaveVar, onCopy }: Props) {
  const status = fieldStatus(field);
  const id = `f-${field.col}`;
  const changed = current !== original;
  const canonical = field.canonical !== undefined && field.canonical !== current ? field.canonical : null;
  const long = current.length > 50 || def?.kind === 'address' || def?.kind === 'birthplace';
  const label = def?.label ?? header;

  return (
    <div className={`frow frow--${status}`}>
      <div className="frow__head">
        <StatusIcon status={status} />
        <label htmlFor={id} className="frow__label">
          {label}
        </label>
        {field.meta && <span className="chip chip--meta">{field.meta}</span>}
        {changed && <span className="badge badge--updated">изменено</span>}
        {status === 'accepted' && <span className="badge badge--accepted">принято как есть</span>}
        <span className="spacer" />
        <Menu
          label={`Действия с полем «${label}»`}
          actions={[
            field.accepted
              ? { label: 'Снять «принято как есть»', icon: <Undo2 size={16} />, onClick: () => onAccept(false), disabled: readOnly }
              : {
                  label: 'Принять как есть…',
                  icon: <ShieldCheck size={16} />,
                  onClick: () => {
                    if (confirm(`Принять «${label}» как есть? Замечания по этому значению перестанут считаться. Если значение изменится — проверка вернётся.`)) onAccept(true);
                  },
                  disabled: readOnly || !field.issues.length,
                },
            { label: 'Сохранить в переменные', icon: <Star size={16} />, onClick: onSaveVar, disabled: !current.trim() },
            { label: 'Скопировать значение', icon: <Copy size={16} />, onClick: onCopy, disabled: !current },
            { label: 'Вернуть как в файле', icon: <RotateCcw size={16} />, onClick: () => onChange(original), disabled: !changed || readOnly },
          ]}
        />
      </div>
      {def && normalizeHeader(def.label) !== normalizeHeader(header) && <div className="frow__col small faint">Столбец: {header}</div>}

      <VarInput id={id} value={current} onChange={(v) => !readOnly && onChange(v)} kind={def?.varKind} multiline={long} invalid={status === 'error' || status === 'glued'} />

      {!field.accepted && <MarkedValue value={current} issues={field.issues} />}

      {field.parts && field.parts.length > 0 && (
        <div className="parts" aria-label="Части адреса">
          {field.parts.map((p, i) => (
            <span key={i} className={`part part--${p.status}`} title={p.chain ? `${p.levelLabel}: ${p.chain}` : `${p.levelLabel}: нет в справочнике`}>
              <span className="part__level">{p.levelLabel}</span>
              <span className="part__text">{p.text}</span>
              {p.known && <BookCheck size={12} className="ic ic--ok" aria-label="есть в справочнике" />}
            </span>
          ))}
        </div>
      )}

      {canonical !== null && !field.accepted && (
        <div className="suggest">
          <div className="suggest__text">
            <span className="small muted">По шаблону: </span>
            <Diff from={current} to={canonical} />
          </div>
          <button className="btn btn--sm btn--primary" onClick={() => onChange(canonical)} disabled={readOnly}>
            <Wand2 size={14} /> Применить
          </button>
        </div>
      )}

      {field.issues.length > 0 && (
        <ul className={`issues ${field.accepted ? 'issues--accepted' : ''}`}>
          {field.issues.map((issue, k) => (
            <li key={k} className={`issue issue--${issue.category === 'glued' ? 'glued' : issue.level}`}>
              <IssueIcon issue={issue} />
              <span className="issue__msg">{issue.message}</span>
              {!field.accepted && (
                <span className="issue__actions">
                  {issue.fix !== undefined && issue.fix !== current && issue.fix !== canonical && (
                    <button className="btn btn--sm" onClick={() => onChange(issue.fix!)} disabled={readOnly}>
                      Исправить
                    </button>
                  )}
                  {issue.action && (
                    <button className="btn btn--sm btn--confirm" onClick={() => onAction(issue.action!)} disabled={readOnly}>
                      <BookCheck size={14} /> {actionButton(issue.action)}
                    </button>
                  )}
                  {issue.level === 'confirm' && !issue.action && (
                    <button className="btn btn--sm btn--confirm" onClick={() => onAccept(true)} disabled={readOnly}>
                      <ShieldCheck size={14} /> Подтвердить
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {changed && (
        <div className="small faint frow__orig">
          В файле: <span>{original || '(пусто)'}</span>
        </div>
      )}
    </div>
  );
}
