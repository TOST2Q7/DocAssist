import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { writeCsv, writeXlsx } from '@/core/tables/tables';
import { downloadBytes, mimeFor } from '@/core/util/download';
import { todayStamp } from '@/core/util/format';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import { RESULTS_FOLDER } from '../constants';
import type { AnketaSession } from '../model/session';
import { Counters } from './Counters';
import type { TableModel } from './hooks';

interface Props {
  model: TableModel;
  headers: string[];
  originals: string[][];
  session: AnketaSession;
  fileName: string;
  sheetName: string;
  onClose: () => void;
}

type Quick = 'all' | 'ready' | 'reviewed' | 'none';

export function ExportDialog({ model, headers, originals, session, fileName, sheetName, onClose }: Props) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(model.results.filter((r) => r.ready).map((r) => r.row)));
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [withNotes, setWithNotes] = useState(true);
  const [withChanges, setWithChanges] = useState(false);
  const base = fileName.replace(/\.[^.]+$/, '');
  const [name, setName] = useState(`${base}_исправлено_${todayStamp()}`);
  const [query, setQuery] = useState('');

  const quick = (q: Quick) => {
    const rows = model.results.filter((r) => (q === 'all' ? true : q === 'ready' ? r.ready : q === 'reviewed' ? session.reviewed.includes(r.row) : false));
    setSelected(new Set(rows.map((r) => r.row)));
  };
  const toggle = (row: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(row)) n.delete(row);
      else n.add(row);
      return n;
    });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return model.results.filter((r) => !q || model.names[r.row].toLowerCase().includes(q));
  }, [model, query]);

  const build = () => {
    const rows = model.results.filter((r) => selected.has(r.row));
    const outHeaders = [...headers];
    if (withNotes) outHeaders.push('Замечания', 'Принято как есть');
    if (withChanges) outHeaders.push('Изменения');
    const out = rows.map((r) => {
      const values = [...model.values[r.row]];
      if (withNotes) {
        const label = (col: number, id: string | null) => (id && FIELD_BY_ID.get(id)?.label) || headers[col];
        values.push(
          r.fields
            .filter((f) => !f.accepted)
            .flatMap((f) => f.issues.map((i) => `${label(f.col, f.fieldId)}: ${i.level === 'confirm' ? 'подтвердить — ' : ''}${i.message}`))
            .join('; '),
          r.fields
            .filter((f) => f.accepted && f.issues.length)
            .map((f) => `${label(f.col, f.fieldId)}: ${f.issues.map((i) => i.message).join(', ')}`)
            .join('; '),
        );
      }
      if (withChanges) {
        values.push(
          Object.keys(session.edits[r.row] ?? {})
            .map((col) => `${headers[Number(col)]}: «${originals[r.row][Number(col)]}» → «${model.values[r.row][Number(col)]}»`)
            .join('; '),
        );
      }
      return values;
    });
    return { outHeaders, out, count: rows.length };
  };

  const save = async () => {
    const { outHeaders, out, count } = build();
    const fileOut = `${name.trim() || base}.${format}`;
    const data = format === 'xlsx' ? writeXlsx(outHeaders, out, sheetName) : writeCsv(outHeaders, out);
    if (workspace) await workspace.writeBytes(`${RESULTS_FOLDER}/${fileOut}`, data);
    downloadBytes(data, fileOut, mimeFor(fileOut));
    toast(`Готово: ${count} чел. → «${RESULTS_FOLDER}/${fileOut}»`);
    onClose();
  };

  return (
    <Modal
      title="Новая таблица с исправлениями"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={save} disabled={!selected.size}>
            <Download size={16} /> Сохранить ({selected.size})
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Исходный файл не меняется. Новая таблица сохранится в папку «{RESULTS_FOLDER}» и скачается. Все значения пишутся как текст —
          Excel не потеряет ведущие нули и не превратит даты в числа.
        </p>
        <div className="grid-2">
          <label className="field">
            <span className="field__label">Имя файла</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span className="field__label">Формат</span>
            <div className="segmented" role="group">
              <button aria-pressed={format === 'xlsx'} onClick={() => setFormat('xlsx')}>
                Excel (.xlsx)
              </button>
              <button aria-pressed={format === 'csv'} onClick={() => setFormat('csv')}>
                CSV
              </button>
            </div>
          </div>
        </div>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={withNotes} onChange={(e) => setWithNotes(e.target.checked)} /> Столбцы «Замечания» и «Принято как есть»
          </label>
          <label className="check">
            <input type="checkbox" checked={withChanges} onChange={(e) => setWithChanges(e.target.checked)} /> Столбец «Изменения»
          </label>
        </div>
        <div className="row">
          <strong className="spacer">Кого включить</strong>
          <button className="btn btn--sm" onClick={() => quick('all')}>
            Всех
          </button>
          <button className="btn btn--sm" onClick={() => quick('ready')}>
            Готовых
          </button>
          <button className="btn btn--sm" onClick={() => quick('reviewed')}>
            Просмотренных
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => quick('none')}>
            Снять всех
          </button>
        </div>
        {!model.results.some((r) => r.ready) && (
          <p className="small muted" style={{ margin: 0 }}>
            Готовых анкет пока нет (у всех есть ошибки или неподтверждённое). Если нужно выгрузить как есть — нажмите «Всех»: в
            столбце «Замечания» будет видно, что осталось.
          </p>
        )}
        <input className="input" placeholder="Поиск по ФИО" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по ФИО" />
        <div className="list export-list">
          {visible.map((r) => (
            <label key={r.row} className="list__item" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(r.row)} onChange={() => toggle(r.row)} />
              <span className="list__main">
                <span className="list__title">{model.names[r.row] || `Строка ${r.row + 1}`}</span>
              </span>
              {session.reviewed.includes(r.row) && <span className="badge">просмотрено</span>}
              <Counters counts={r.counts} compact />
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
