import { useState } from 'react';
import { suggestKey, useVariables, validateKey } from '@/core/variables/variables';
import { VAR_KINDS, type Variable, type VarKind } from '@/core/variables/types';
import { Modal } from './Modal';
import { useToast } from './Toast';

interface Props {
  initial: { value: string; label: string; kind: VarKind; key?: string; source?: string };
  /** Редактирование существующей переменной. */
  existing?: Variable;
  onClose: () => void;
}

export function SaveVarDialog({ initial, existing, onClose }: Props) {
  const vars = useVariables();
  const toast = useToast();
  const [label, setLabel] = useState(existing?.label ?? initial.label);
  const [kind, setKind] = useState<VarKind>(existing?.kind ?? initial.kind);
  const [key, setKey] = useState(existing?.key ?? initial.key ?? suggestKey(initial.kind, vars.items));
  const [value, setValue] = useState(existing?.value ?? initial.value);
  const keyError = validateKey(key, vars.items, existing?.id);
  const sameValue = !existing && vars.items.find((v) => v.value === value && v.kind === kind);

  const save = () => {
    if (keyError || !value.trim()) return;
    if (existing) {
      vars.update(existing.id, { key, label, value, kind });
      toast(`Переменная <${key}> обновлена`);
    } else {
      vars.add({ key, label: label || key, value, kind, source: initial.source });
      toast(`Сохранено в переменные: <${key}>`);
    }
    onClose();
  };

  return (
    <Modal
      title={existing ? 'Изменить переменную' : 'Сохранить в переменные'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={save} disabled={!!keyError || !value.trim()}>
            Сохранить
          </button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span className="field__label">Название</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Например: ФИО командира" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span className="field__label">Ключ для подстановки</span>
            <input className={`input mono ${keyError ? 'input--error' : ''}`} value={key} onChange={(e) => setKey(e.target.value.trim())} />
            {keyError ? <span className="field__error">{keyError}</span> : <span className="field__hint">В полях пишется как &lt;{key}&gt;</span>}
          </label>
          <label className="field">
            <span className="field__label">Тип</span>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as VarKind)}>
              {Object.entries(VAR_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field__label">Значение</span>
          <textarea className="input" value={value} onChange={(e) => setValue(e.target.value)} rows={2} />
        </label>
        {sameValue && <p className="small muted">Такое значение уже сохранено как &lt;{sameValue.key}&gt;.</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
