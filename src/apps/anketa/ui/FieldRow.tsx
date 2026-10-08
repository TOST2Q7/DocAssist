import { AlertTriangle, BookPlus, Check, CircleAlert, Copy, Info, Link2Off, RotateCcw, Star, Wand2, XCircle } from 'lucide-react';
import { normalizeHeader, type FieldDef } from '@/core/schema/fields';
import { VarInput } from '@/ui/VarInput';
import { Menu } from '@/ui/Menu';
import type { FieldResult, Issue, IssueAction } from '../model/types';
import { Diff, MarkedValue } from './Marks';

interface Props {
  field: FieldResult;
  def?: FieldDef;
  header: string;
  original: string;
  current: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onIgnore: (code: string) => void;
  onAction: (action: IssueAction) => void;
  onSaveVar: () => void;
  onCopy: () => void;
}

export function fieldStatus(f: FieldResult): 'error' | 'warning' | 'glued' | 'info' | 'ok' {
  if (f.issues.some((i) => i.severity === 'error')) return 'error';
  if (f.issues.some((i) => i.severity === 'warning' && i.category !== 'glued')) return 'warning';
  if (f.issues.some((i) => i.category === 'glued')) return 'glued';
  if (f.issues.length) return 'info';
  return 'ok';
}

const STATUS_LABEL = { error: 'Ошибка', warning: 'Замечание', glued: 'Слипшиеся слова', info: 'Подсказка', ok: 'Всё в порядке' };

export function IssueIcon({ issue }: { issue: Pick<Issue, 'severity' | 'category'> }) {
  if (issue.category === 'glued') return <Link2Off size={16} className="ic ic--glued" aria-label="Слиплось" />;
  if (issue.severity === 'error') return <XCircle size={16} className="ic ic--error" aria-label="Ошибка" />;
  if (issue.severity === 'warning') return <AlertTriangle size={16} className="ic ic--warning" aria-label="Замечание" />;
  return <Info size={16} className="ic ic--info" aria-label="Подсказка" />;
}

function StatusIcon({ status }: { status: ReturnType<typeof fieldStatus> }) {
  const label = STATUS_LABEL[status];
  if (status === 'ok') return <Check size={18} className="ic ic--ok" aria-label={label} />;
  if (status === 'error') return <XCircle size={18} className="ic ic--error" aria-label={label} />;
  if (status === 'warning') return <AlertTriangle size={18} className="ic ic--warning" aria-label={label} />;
  if (status === 'glued') return <Link2Off size={18} className="ic ic--glued" aria-label={label} />;
  return <CircleAlert size={18} className="ic ic--info" aria-label={label} />;
}

export function FieldRow({ field, def, header, original, current, readOnly, onChange, onIgnore, onAction, onSaveVar, onCopy }: Props) {
  const status = fieldStatus(field);
  const id = `f-${field.col}`;
  const changed = current !== original;
  const suggestion = field.suggestion && field.suggestion !== current ? field.suggestion : null;
  const long = current.length > 50 || def?.kind === 'address' || def?.kind === 'birthplace';

  return (
    <div className={`frow frow--${status}`}>
      <div className="frow__head">
        <StatusIcon status={status} />
        <label htmlFor={id} className="frow__label">
          {def?.label ?? header}
        </label>
        {field.meta && <span className="chip chip--meta">{field.meta}</span>}
        {changed && <span className="badge badge--updated">изменено</span>}
        <span className="spacer" />
        <Menu
          label={`Действия с полем «${def?.label ?? header}»`}
          actions={[
            { label: 'Сохранить в переменные', icon: <Star size={16} />, onClick: onSaveVar, disabled: !current.trim() },
            { label: 'Скопировать значение', icon: <Copy size={16} />, onClick: onCopy, disabled: !current },
            { label: 'Вернуть как в файле', icon: <RotateCcw size={16} />, onClick: () => onChange(original), disabled: !changed || readOnly },
          ]}
        />
      </div>
      {def && normalizeHeader(def.label) !== normalizeHeader(header) && <div className="frow__col small faint">Столбец: {header}</div>}

      <VarInput id={id} value={current} onChange={(v) => !readOnly && onChange(v)} kind={def?.varKind} multiline={long} invalid={status === 'error'} />

      <MarkedValue value={current} issues={field.issues} />

      {field.parts && field.parts.length > 0 && (
        <div className="parts" aria-label="Части адреса">
          {field.parts.map((p, i) => (
            <span key={i} className={`part part--${p.status}`} title={p.chain ? `${p.levelLabel}: ${p.chain}` : p.levelLabel}>
              <span className="part__level">{p.levelLabel}</span>
              <span className="part__text">{p.text}</span>
              {p.known && <Check size={12} className="ic ic--ok" aria-label="есть в справочнике" />}
            </span>
          ))}
        </div>
      )}

      {suggestion && (
        <div className="suggest">
          <div className="suggest__text">
            <span className="small muted">Как должно быть: </span>
            <Diff from={current} to={suggestion} />
          </div>
          <button className="btn btn--sm btn--primary" onClick={() => onChange(suggestion)} disabled={readOnly}>
            <Wand2 size={14} /> Применить
          </button>
        </div>
      )}

      {field.issues.length > 0 && (
        <ul className="issues">
          {field.issues.map((issue, k) => (
            <li key={k} className={`issue issue--${issue.category === 'glued' ? 'glued' : issue.severity}`}>
              <IssueIcon issue={issue} />
              <span className="issue__msg">{issue.message}</span>
              <span className="issue__actions">
                {issue.fix !== undefined && issue.fix !== current && issue.fix !== field.suggestion && (
                  <button className="btn btn--sm" onClick={() => onChange(issue.fix!)} disabled={readOnly}>
                    Исправить
                  </button>
                )}
                {issue.action && (
                  <button className="btn btn--sm" onClick={() => onAction(issue.action!)}>
                    <BookPlus size={14} /> В справочник
                  </button>
                )}
                {issue.severity !== 'error' && (
                  <button className="btn btn--sm btn--ghost" onClick={() => onIgnore(issue.code)} title="Скрыть это замечание для этой анкеты">
                    Скрыть
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {changed && (
        <div className="small faint frow__orig">
          В файле: <span className="mono-ish">{original || '(пусто)'}</span>
        </div>
      )}
    </div>
  );
}
