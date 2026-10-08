import { ArrowLeft, Download, Loader2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FIELD_BY_ID, PERSON_FIELDS } from '@/core/schema/fields';
import { baseName } from '@/core/storage/types';
import { plural } from '@/core/util/format';
import { Alert } from '@/ui/Alert';
import { useToast } from '@/ui/Toast';
import { editCount } from '../model/session';
import { ExportDialog } from './ExportDialog';
import { FixAllDialog, type Change } from './FixAllDialog';
import { useCheckContext, useSession, useTable, useTableModel } from './hooks';
import { PeopleList } from './PeopleList';
import { personChanges, PersonView } from './PersonView';
import type { TableData } from '@/core/tables/tables';

interface Props {
  path: string;
  sheet?: string;
  row: number | null;
  onRow: (row: number | null) => void;
  onSheet: (sheet: string) => void;
  onClose: () => void;
}

export function Workbench(props: Props) {
  const state = useTable(props.path, props.sheet);
  if (state.status === 'loading')
    return (
      <div className="loading">
        <Loader2 className="spin" size={20} /> Читаем таблицу…
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="stack">
        <Alert kind="error">Не удалось прочитать таблицу: {state.message}</Alert>
        <button className="btn" onClick={props.onClose} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> К выбору таблицы
        </button>
      </div>
    );
  return <Loaded {...props} table={state.table} size={state.size} lastModified={state.lastModified} />;
}

function Loaded({ path, row, onRow, onSheet, onClose, table, size, lastModified }: Props & { table: TableData; size: number; lastModified: number }) {
  const fileName = baseName(path);
  const ctx = useCheckContext();
  const s = useSession(fileName);
  const model = useTableModel(table, s.session, ctx);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [fixAll, setFixAll] = useState<Change[] | null>(null);

  // Запоминаем, с каким файлом связан сеанс.
  useEffect(() => {
    if (!s.loaded || s.readOnly) return;
    const src = s.session.source;
    if (src.name !== fileName || src.sheet !== table.sheetName || src.size !== size || src.lastModified !== lastModified) {
      s.setSource({ name: fileName, sheet: table.sheetName, size, lastModified });
    }
  }, [s.loaded]);

  // Правки, у которых исходное значение в файле поменялось.
  const conflicts = useMemo(() => {
    let n = 0;
    for (const [r, cols] of Object.entries(s.session.edits)) {
      for (const [c, e] of Object.entries(cols)) if ((table.rows[Number(r)]?.[Number(c)] ?? '') !== e.orig) n++;
    }
    return n;
  }, [s.session.edits, table.rows]);

  const unmapped = PERSON_FIELDS.filter((f) => !model.columns.includes(f.id));
  const mappedCount = model.columns.filter(Boolean).length;
  const totals = model.results.reduce((a, r) => ({ e: a.e + r.counts.error, w: a.w + r.counts.warning, g: a.g + r.counts.glued }), { e: 0, w: 0, g: 0 });
  const edits = editCount(s.session);

  const allChanges = () => model.results.flatMap((r) => personChanges(r, model.values[r.row], table.rows[r.row], table.headers, model.names[r.row]));

  const apply = (changes: Change[]) => s.setCells(changes.map((c) => ({ row: c.row, col: c.col, value: c.to, orig: table.rows[c.row][c.col] ?? '' })));

  if (row !== null && row >= 0 && row < model.results.length) {
    return (
      <PersonView
        model={model}
        headers={table.headers}
        originals={table.rows[row]}
        row={row}
        reviewed={s.session.reviewed}
        readOnly={s.readOnly}
        fileLabel={fileName}
        onSelect={(r) => onRow(r === null ? null : Math.max(0, Math.min(model.results.length - 1, r)))}
        onChangeCell={(col, value) => s.setCell(row, col, value, table.rows[row][col] ?? '')}
        onApply={apply}
        onIgnore={(key) => s.ignore(row, key, true)}
        onToggleReviewed={() => s.toggleReviewed(row)}
      />
    );
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="icon-btn" onClick={onClose} aria-label="К выбору таблицы" data-tip="К выбору таблицы">
          <ArrowLeft size={20} />
        </button>
        <div className="spacer">
          <h2 style={{ margin: 0 }}>{fileName}</h2>
          <div className="small muted">
            {model.results.length} {plural(model.results.length, ['человек', 'человека', 'человек'])} · ошибок {totals.e} · замечаний {totals.w}
            {totals.g ? ` · слипшихся ${totals.g}` : ''} · правок {edits} · проверено {s.session.reviewed.length}
          </div>
        </div>
        {table.sheetNames.length > 1 && (
          <select className="select" style={{ width: 'auto' }} value={table.sheetName} onChange={(e) => onSheet(e.target.value)} aria-label="Лист">
            {table.sheetNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        )}
        <button className="btn" onClick={() => setFixAll(allChanges())} disabled={s.readOnly}>
          <Wand2 size={16} /> Исправить у всех
        </button>
        <button className="btn btn--primary" onClick={() => setExporting(true)}>
          <Download size={16} /> Новая таблица
        </button>
      </div>

      {s.error && <Alert kind="error">{s.error}. Правки к этой таблице не сохраняются, пока файл не исправлен или не удалён.</Alert>}
      {s.readOnly && !s.error && <Alert kind="warning">Правки к этой таблице сохранены более новой версией DocAssist — сейчас доступен только просмотр.</Alert>}
      {conflicts > 0 && (
        <Alert kind="warning">
          Таблица изменилась после прошлого сеанса: у {conflicts} {plural(conflicts, ['правки', 'правок', 'правок'])} исходное значение в файле другое.
          Проверьте их или{' '}
          <button className="btn btn--sm" onClick={() => confirm('Сбросить все правки и отметки для этой таблицы?') && s.resetAll()}>
            сбросьте правки
          </button>
        </Alert>
      )}
      <details className="card card--flat mapping">
        <summary>
          Распознано столбцов: <strong>{mappedCount}</strong> из {table.headers.length}
          {unmapped.length > 0 && <span className="muted"> · не найдено в таблице: {unmapped.length}</span>}
        </summary>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Столбец в таблице</th>
                <th>Понят как</th>
              </tr>
            </thead>
            <tbody>
              {table.headers.map((h, i) => (
                <tr key={i}>
                  <td>{h}</td>
                  <td>{model.columns[i] ? FIELD_BY_ID.get(model.columns[i]!)?.label : <span className="faint">— (проверяются только пробелы)</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unmapped.length > 0 && <p className="small muted">Нет в таблице: {unmapped.map((f) => f.label).join(', ')}.</p>}
      </details>

      <PeopleList model={model} reviewed={s.session.reviewed} onOpen={(r) => onRow(r)} />

      {exporting && (
        <ExportDialog
          model={model}
          headers={table.headers}
          originals={table.rows}
          session={s.session}
          fileName={fileName}
          sheetName={table.sheetName}
          onClose={() => setExporting(false)}
        />
      )}
      {fixAll && (
        <FixAllDialog
          changes={fixAll}
          onClose={() => setFixAll(null)}
          onApply={(c) => {
            apply(c);
            setFixAll(null);
            toast(`Применено исправлений: ${c.length}`);
          }}
        />
      )}
    </div>
  );
}
