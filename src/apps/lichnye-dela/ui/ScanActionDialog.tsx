import { ArrowRight, FolderOutput, PenLine } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HANDOUT_FOLDER, putToHandout } from '@/core/handout/handout';
import { fioText, type PersonRecord } from '@/core/people/people';
import { joinPath, parentPath } from '@/core/storage/types';
import { useVariables } from '@/core/variables/variables';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import { APP_ID } from '../constants';
import { casePath, type CasesApi, type PersonCase } from '../model/cases';
import { shortFio } from '../model/names';
import { personGender, placeholderValues } from '../model/placeholders';
import { planNames, SCAN_PERSON_KEYS, SCAN_PLACEHOLDERS, type PlannedName } from '../model/scanNames';
import { useTemplates } from '../model/templates';
import { fileTitle } from '../model/transfer';
import { useFolderFiles } from './hooks';

/** Поле шаблона имени с кнопками меток: метка вставляется туда, где стоит курсор. */
export function ScanNameField({ value, onChange, label = 'Шаблон имени файла' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const chip = (key: string, hint?: string) => (
    <button key={key} type="button" className="chip dela-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(`{${key}}`)} data-tip={hint}>
      {`{${key}}`}
    </button>
  );
  return (
    <div className="field">
      <label className="field__label" htmlFor="dela-scan-name">
        {label}
      </label>
      <input id="dela-scan-name" ref={ref} className="input" value={value} onChange={(e) => onChange(e.target.value)} data-novars="" autoComplete="off" />
      <span className="field__hint">Любой текст и метки в фигурных скобках — они заменятся данными. Расширение (.jpg, .pdf) добавится само.</span>
      <div className="row dela-chips">
        {SCAN_PLACEHOLDERS.map((p) => chip(p.key, p.hint))}
        <span className="faint small">·</span>
        {SCAN_PERSON_KEYS.map((k) => chip(k))}
      </div>
    </div>
  );
}

/** Предпросмотр: было → станет, с предупреждениями. */
export function NamesPreview({ plan }: { plan: PlannedName[] }) {
  const unknown = [...new Set(plan.flatMap((p) => p.unknown))];
  const empty = [...new Set(plan.flatMap((p) => p.empty))];
  return (
    <div className="stack stack--s">
      <div className="list dela-names">
        {plan.map((p) => (
          <div key={p.rel} className="list__item dela-names__row">
            <span className="dela-names__from">{p.from}</span>
            <ArrowRight size={14} className="faint" />
            <span className={`dela-names__to ${p.to === p.from ? 'faint' : ''}`}>{p.to === p.from ? 'без изменений' : p.to}</span>
          </div>
        ))}
      </div>
      {unknown.length > 0 && (
        <Alert kind="error">
          Таких меток нет: {unknown.map((k) => `{${k}}`).join(', ')} — они останутся в имени как есть. Проверьте написание.
        </Alert>
      )}
      {empty.length > 0 && <Alert kind="warning">У человека не заполнено: {empty.map((k) => `{${k}}`).join(', ')} — в имени будет пусто.</Alert>}
    </div>
  );
}

interface Props {
  mode: 'rename' | 'handout';
  record: PersonRecord;
  c: PersonCase;
  cases: CasesApi;
  /** Пути внутри личной папки. */
  rels: string[];
  onClose: () => void;
  onDone?: () => void;
}

export function ScanActionDialog({ mode, record, c, cases, rels, onClose, onDone }: Props) {
  const { workspace } = useWorkspace();
  const templates = useTemplates();
  const vars = useVariables();
  const toast = useToast();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(templates.scanName);
  const [edited, setEdited] = useState(false);
  const [remember, setRemember] = useState(true);
  const [rename, setRename] = useState(true);
  const [move, setMove] = useState(true);
  const [busy, setBusy] = useState(false);
  // Шаблон загрузился после открытия окна.
  useEffect(() => {
    if (!edited) setTemplate(templates.scanName);
  }, [templates.scanName, edited]);

  const dir = parentPath(rels[0] ?? '');
  const here = useFolderFiles(casePath(c, dir));
  const there = useFolderFiles(HANDOUT_FOLDER);
  const taken = (mode === 'rename' ? here : there) ?? [];
  const plan = useMemo(() => {
    const ctx = { values: placeholderValues(record, c), gender: personGender(record.fields), vars: vars.items };
    const items = rels.map((rel) => ({ rel, doc: fileTitle(c, rel) }));
    return planNames(mode === 'handout' && !rename ? '{Имя файла}' : template, items, taken.map((e) => e.name), ctx, mode === 'rename');
  }, [record, c, vars.items, rels, mode, rename, template, taken]);
  const useTemplate = mode === 'rename' || rename;
  const changedTemplate = template.trim() !== templates.scanName;

  const apply = async () => {
    if (!workspace) return;
    setBusy(true);
    try {
      if (useTemplate && changedTemplate && remember) templates.setScanName(template);
      if (mode === 'rename') {
        let n = 0;
        for (const p of plan) {
          if (p.to === p.from) continue;
          const to = joinPath(parentPath(p.rel), p.to);
          await workspace.moveFile(casePath(c, p.rel), casePath(c, to));
          cases.renameFile(c.personId, p.rel, to);
          n++;
        }
        toast(n ? `Переименовано файлов: ${n}` : 'Имена уже такие');
      } else {
        const who = shortFio(fioText(record.fields));
        for (const p of plan) {
          const note = c.files[p.rel];
          await putToHandout(workspace, casePath(c, p.rel), {
            name: p.to,
            move,
            source: APP_ID,
            label: fileTitle(c, p.rel),
            who,
            meta: { personId: c.personId, rel: p.rel, ...(note?.kind ? { kind: note.kind } : {}), ...(note?.title ? { title: note.title } : {}) },
          });
          if (move) cases.forgetFile(c.personId, p.rel);
        }
        toast(`${move ? 'Перемещено' : 'Скопировано'} в «${HANDOUT_FOLDER}»: ${plan.length}`, { label: 'Открыть', run: () => navigate('/apps/lichnye-dela?view=handout') });
      }
      onDone?.();
      onClose();
    } catch (e) {
      toast(`Не получилось: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const count = rels.length;
  return (
    <Modal
      title={mode === 'rename' ? `Переименовать по шаблону (${count})` : `В «${HANDOUT_FOLDER}» (${count})`}
      wide
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={() => void apply()} disabled={busy || !plan.length || (mode === 'rename' && plan.every((p) => p.to === p.from))}>
            {mode === 'rename' ? <PenLine size={16} /> : <FolderOutput size={16} />} {mode === 'rename' ? 'Переименовать' : move ? 'Переместить' : 'Скопировать'}
          </button>
        </>
      }
    >
      <div className="stack">
        {mode === 'handout' && (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              «{HANDOUT_FOLDER}» — временная папка в рабочей папке для файлов, которые нужно отдать или куда-то загрузить. Отдали — очистите её
              (раздел «{HANDOUT_FOLDER}» вверху). Перемещённый файл можно вернуть в личную папку.
            </p>
            <div className="segmented" role="group" aria-label="Как положить">
              <button aria-pressed={move} onClick={() => setMove(true)}>
                Переместить
              </button>
              <button aria-pressed={!move} onClick={() => setMove(false)}>
                Копировать (оставить в личной папке)
              </button>
            </div>
            <label className="check">
              <input type="checkbox" checked={rename} onChange={(e) => setRename(e.target.checked)} /> Переименовать по шаблону
            </label>
          </>
        )}
        {useTemplate && (
          <>
            <ScanNameField
              value={template}
              onChange={(v) => {
                setEdited(true);
                setTemplate(v);
              }}
            />
            {changedTemplate && (
              <label className="check small">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Запомнить шаблон для следующего раза
              </label>
            )}
          </>
        )}
        <NamesPreview plan={plan} />
      </div>
    </Modal>
  );
}
