import { Braces } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { findVarTokens, useVariables } from '@/core/variables/variables';
import { VAR_KINDS, type VarKind } from '@/core/variables/types';

/*
 * Поле ввода с поддержкой глобальных переменных:
 * - кнопка { } показывает сохранённые значения (сначала подходящие по типу);
 * - можно написать <ключ> — появится предложение подставить значение.
 */

interface Props {
  value: string;
  onChange: (v: string) => void;
  kind?: VarKind;
  multiline?: boolean;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  onBlur?: () => void;
  ariaLabel?: string;
}

export function VarInput({ value, onChange, kind, multiline, placeholder, id, invalid, onBlur, ariaLabel }: Props) {
  const vars = useVariables();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const tokens = findVarTokens(value);
  const resolved = tokens.length ? vars.resolve(value) : value;
  const canResolve = tokens.length > 0 && resolved !== value;
  const list = vars.byKind(kind);
  const cls = `input ${invalid ? 'input--error' : ''}`;

  return (
    <div className="var-input" ref={wrapRef}>
      <div className="var-input__row">
        {multiline ? (
          <textarea
            id={id}
            className={cls}
            value={value}
            rows={Math.min(4, Math.max(2, Math.ceil(value.length / 60)))}
            placeholder={placeholder}
            aria-label={ariaLabel}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
          />
        ) : (
          <input
            id={id}
            className={cls}
            value={value}
            placeholder={placeholder}
            aria-label={ariaLabel}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          />
        )}
        {list.length > 0 && (
          <button
            type="button"
            className="icon-btn"
            data-tip="Подставить переменную"
            aria-label="Подставить переменную"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <Braces size={18} />
          </button>
        )}
      </div>
      {canResolve && (
        <div className="var-input__resolve small">
          <span className="muted">Переменные: </span>
          <span className="mono">{resolved}</span>{' '}
          <button type="button" className="btn btn--sm" onClick={() => onChange(resolved)}>
            Подставить
          </button>
        </div>
      )}
      {open && (
        <div className="var-input__menu" role="listbox">
          <div className="var-input__hint small faint">
            Нажмите, чтобы подставить значение. Или напишите в поле <code>&lt;ключ&gt;</code>.
          </div>
          {list.map((v) => (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={false}
              className="var-input__opt"
              onClick={() => {
                onChange(v.value);
                setOpen(false);
              }}
            >
              <span className="var-input__opt-main">
                <span className="var-input__opt-label">{v.label}</span>
                <span className="var-input__opt-value">{v.value}</span>
              </span>
              <span className="var-input__opt-key mono small">&lt;{v.key}&gt;</span>
              {kind && v.kind === kind && <span className="badge badge--beta">{VAR_KINDS[v.kind].label}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
