import { CircleCheck, CircleSlash, CircleX } from 'lucide-react';
import type { PersonRecord } from '@/core/people/people';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { formatDateTime } from '@/core/util/format';
import type { Workspace } from '@/core/workspace/workspace';
import { Modal } from '@/ui/Modal';
import { matchWithPeople } from '../check/engine';
import type { PersonResult } from '../model/types';
import { confirmBase, type TableModel } from './hooks';

/*
 * «Проверить с актуальной информацией»: ищем человека в базе людей по ФИО.
 * Нашли — все совпавшие поля отмечаются проверенными (галочки, новые значения — в базу),
 * несовпавшие остаются как были и перечисляются. Не нашли — так и пишем.
 */

export interface PeopleCheckResult {
  row: number;
  name: string;
  found: boolean;
  /** Сколько записей с таким ФИО. */
  total: number;
  record?: PersonRecord;
  /** Совпало и отмечено проверенным. */
  confirmed: number[];
  /** Совпало, но значение не проходит формат — не отмечено. */
  matchedWithErrors: number[];
  differ: { col: number; base: string; value: string }[];
}

export async function runPeopleCheck(
  ws: Workspace,
  results: PersonResult[],
  model: TableModel,
  records: PersonRecord[],
  confirmMany: (items: { row: number; col: number; value: string }[]) => void,
): Promise<PeopleCheckResult[]> {
  const out: PeopleCheckResult[] = [];
  const marks: { row: number; col: number; value: string }[] = [];
  for (const res of results) {
    const values = model.values[res.row];
    const name = model.names[res.row] || `Строка ${res.row + 1}`;
    const m = matchWithPeople(values, model.columns, records);
    if (!m) {
      out.push({ row: res.row, name, found: false, total: 0, confirmed: [], matchedWithErrors: [], differ: [] });
      continue;
    }
    const confirmed: number[] = [];
    const matchedWithErrors: number[] = [];
    for (const col of m.matched) {
      const f = res.fields[col];
      if (!f) continue;
      if (f.issues.some((i) => i.level === 'error' && !i.confirmable)) {
        matchedWithErrors.push(col);
        continue;
      }
      if (f.confirm?.base) await confirmBase(ws, f.confirm.base);
      if (f.confirm?.person && !f.confirmed) marks.push({ row: res.row, col, value: values[col] ?? '' });
      confirmed.push(col);
    }
    out.push({
      row: res.row,
      name,
      found: true,
      total: m.total,
      record: m.record,
      confirmed,
      matchedWithErrors,
      differ: m.differ.map((d) => ({ ...d, value: values[d.col] ?? '' })),
    });
  }
  if (marks.length) confirmMany(marks);
  return out;
}

const label = (model: TableModel, headers: string[], col: number) => {
  const id = model.columns[col];
  return (id && FIELD_BY_ID.get(id)?.label) || headers[col];
};

function One({ r, model, headers }: { r: PeopleCheckResult; model: TableModel; headers: string[] }) {
  if (!r.found) {
    return (
      <div className="people-check people-check--none">
        <CircleSlash size={18} className="faint" />
        <div>
          <strong>{r.name}</strong>
          <div className="small muted">В базе людей нет записей с таким ФИО.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="people-check stack stack--s">
      <div className="row">
        <CircleCheck size={18} className="ic ic--ok" />
        <strong className="spacer">{r.name}</strong>
        {r.record && <span className="small faint">запись от {formatDateTime(r.record.savedAt)}</span>}
      </div>
      {r.total > 1 && <div className="small muted">С таким ФИО записей: {r.total}. Взята та, где совпало больше всего полей.</div>}
      <div className="small">
        Совпало и отмечено проверенным: <strong>{r.confirmed.length}</strong>
        {r.confirmed.length > 0 && <span className="muted"> — {r.confirmed.map((c) => label(model, headers, c)).join(', ')}</span>}
      </div>
      {r.matchedWithErrors.length > 0 && (
        <div className="small muted">Совпало, но не по формату (сначала исправьте): {r.matchedWithErrors.map((c) => label(model, headers, c)).join(', ')}</div>
      )}
      {r.differ.length > 0 ? (
        <div className="stack stack--s">
          <div className="small">
            Не совпало (оставлено как было): <strong>{r.differ.length}</strong>
          </div>
          <ul className="differ">
            {r.differ.map((d) => (
              <li key={d.col}>
                <CircleX size={14} className="ic ic--error" />
                <span>
                  <strong>{label(model, headers, d.col)}</strong>: в анкете «{d.value || '(пусто)'}», в базе «{d.base}»
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="small muted">Несовпадений нет.</div>
      )}
    </div>
  );
}

export function PeopleCheckDialog({ results, model, headers, onClose }: { results: PeopleCheckResult[]; model: TableModel; headers: string[]; onClose: () => void }) {
  const found = results.filter((r) => r.found);
  return (
    <Modal
      title="Проверка с актуальной информацией"
      wide
      onClose={onClose}
      footer={
        <button className="btn btn--primary" onClick={onClose}>
          Готово
        </button>
      }
    >
      <div className="stack">
        {results.length > 1 && (
          <p className="small muted" style={{ margin: 0 }}>
            Найдено в базе людей: {found.length} из {results.length}. Отмечено проверенных полей: {found.reduce((n, r) => n + r.confirmed.length, 0)}.
          </p>
        )}
        {(results.length > 1 ? [...found, ...results.filter((r) => !r.found)] : results).map((r) => (
          <One key={r.row} r={r} model={model} headers={headers} />
        ))}
      </div>
    </Modal>
  );
}
