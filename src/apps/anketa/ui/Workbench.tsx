import { ArrowLeft, BookCheck, Download, Loader2, SearchCheck, UserPlus, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { usePeople } from '@/core/people/people';
import { FIELD_BY_ID, PERSON_FIELDS } from '@/core/schema/fields';
import { baseName } from '@/core/storage/types';
import type { TableData } from '@/core/tables/tables';
import { plural } from '@/core/util/format';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { useToast } from '@/ui/Toast';
import { APP_ID } from '../constants';
import { editCount } from '../model/session';
import { ExportDialog } from './ExportDialog';
import { FixAllDialog, type Change } from './FixAllDialog';
import { useCheckContext, useSession, useTable, useTableModel } from './hooks';
import { collectNewWords, NewWordsDialog } from './NewWordsDialog';
import { PeopleCheckDialog, runPeopleCheck, type PeopleCheckResult } from './PeopleCheck';
import { PeopleList } from './PeopleList';
import { personChanges, personFields, PersonView } from './PersonView';

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
  const { workspace } = useWorkspace();
  const people = usePeople();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [fixAll, setFixAll] = useState<Change[] | null>(null);
  const [newWords, setNewWords] = useState(false);
  const [check, setCheck] = useState<PeopleCheckResult[] | null>(null);

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
  const totals = model.results.reduce((a, r) => ({ e: a.e + r.counts.error, w: a.w + r.counts.warn }), { e: 0, w: 0 });
  const ready = model.results.filter((r) => r.ready);
  const words = useMemo(() => collectNewWords(model.results, model.names, table.headers), [model.results, model.names, table.headers]);
  const edits = editCount(s.session);

  const allChanges = () => model.results.flatMap((r) => personChanges(r, model.values[r.row], table.rows[r.row], table.headers, model.names[r.row]));
  const apply = (changes: Change[]) => s.setCells(changes.map((c) => ({ row: c.row, col: c.col, value: c.to, orig: table.rows[c.row][c.col] ?? '' })));

  const checkAll = async () => {
    if (!workspace) return;
    if (!people.records.length) {
      toast('База людей пока пустая — сравнивать не с чем');
      return;
    }
    setCheck(await runPeopleCheck(workspace, model.results, model, people.records, s.confirmMany));
  };

  const saveReady = () => {
    let added = 0;
    let updated = 0;
    for (const r of ready) {
      if (people.save(personFields(model.values[r.row], model.columns), APP_ID) === 'added') added++;
      else updated++;
    }
    toast(`База людей: добавлено ${added}, обновлено ${updated}`);
  };

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
        onConfirm={(col, value) => s.confirm(row, col, value)}
        onConfirmMany={s.confirmMany}
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
            Готово {ready.length} из {model.results.length} · полей с ошибками {totals.e} · подтвердить {totals.w} · правок {edits}
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={model.results.length} aria-valuenow={ready.length} aria-label="Готовые анкеты">
            <div className="progress__bar" style={{ width: `${model.results.length ? (ready.length / model.results.length) * 100 : 0}%` }} />
          </div>
        </div>
        {table.sheetNames.length > 1 && (
          <select className="select" style={{ width: 'auto' }} value={table.sheetName} onChange={(e) => onSheet(e.target.value)} aria-label="Лист">
            {table.sheetNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        )}
      </div>
      <div className="row toolbar">
        <button className="btn" onClick={() => setFixAll(allChanges())} disabled={s.readOnly}>
          <Wand2 size={16} /> Исправить у всех по шаблону
        </button>
        <button className="btn btn--confirm" onClick={() => setNewWords(true)} disabled={s.readOnly || !words.length}>
          <BookCheck size={16} /> Новые слова ({words.length})
        </button>
        <button className="btn" onClick={checkAll} disabled={s.readOnly}>
          <SearchCheck size={16} /> Проверить всех с актуальной информацией
        </button>
        <button className="btn" onClick={saveReady} disabled={!ready.length || people.readOnly} data-tip="Сохранить готовые анкеты в базу людей">
          <UserPlus size={16} /> Готовых в базу людей ({ready.length})
        </button>
        <span className="spacer" />
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
          {unmapped.length > 0 && <span className="muted"> · нет в таблице: {unmapped.length}</span>}
        </summary>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>№</th>
                <th>Столбец в таблице</th>
                <th>Понят как</th>
              </tr>
            </thead>
            <tbody>
              {table.headers.map((h, i) => (
                <tr key={i}>
                  <td className="faint">{i + 1}</td>
                  <td>{h}</td>
                  <td>{model.columns[i] ? FIELD_BY_ID.get(model.columns[i]!)?.label : <span className="faint">— (только лишние пробелы)</span>}</td>
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
      {newWords && <NewWordsDialog items={words} onClose={() => setNewWords(false)} />}
      {check && <PeopleCheckDialog results={check} model={model} headers={table.headers} onClose={() => setCheck(null)} />}
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
