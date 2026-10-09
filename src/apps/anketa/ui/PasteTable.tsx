import { ClipboardPaste } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { looksLikeHeader, matchColumns, PERSON_FIELDS } from '@/core/schema/fields';
import { parseCsv, writeXlsx } from '@/core/tables/tables';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';

/*
 * Таблица из буфера обмена: выделите строки в Excel или Google Таблицах, нажмите Ctrl+C,
 * а здесь — Ctrl+V. Строка заголовков не обязательна: без неё столбцы понимаются по порядку формы анкеты.
 * Вставка сохраняется в рабочую папку как обычная таблица .xlsx — дальше с ней работают как с файлом.
 */

/** Разобрать текст из буфера: строки — переводы строк, столбцы — табуляция (как копирует Excel). */
export function parseClipboardTable(text: string): string[][] {
  const rows = parseCsv(text.replace(/\r\n?/g, '\n'), '\t').map((r) => r.map((c) => c.replace(/ /g, ' ')));
  while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) rows.pop();
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Похож ли текст на таблицу (а не на одно значение). */
export const isTableText = (text: string) => text.includes('\t') || text.trim().split('\n').length > 1;

export interface PastedTable {
  headers: string[];
  rows: string[][];
  /** Была ли в данных строка заголовков. */
  hadHeader: boolean;
}

export function toTable(matrix: string[][]): PastedTable {
  const width = Math.max(0, ...matrix.map((r) => r.length));
  const fit = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  if (matrix.length && looksLikeHeader(matrix[0])) return { headers: fit(matrix[0]).map((h, i) => h.trim() || `Столбец ${i + 1}`), rows: matrix.slice(1).map(fit), hadHeader: true };
  return { headers: Array.from({ length: width }, (_, i) => PERSON_FIELDS[i]?.label ?? `Столбец ${i + 1}`), rows: matrix.map(fit), hadHeader: false };
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}-${p(d.getMinutes())}`;
};

/** Слушать Ctrl+V вне полей ввода. В поле ввода вставка работает как обычно. */
export function usePasteTable(onText: (text: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.closest('.modal'))) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!isTableText(text)) return;
      e.preventDefault();
      onText(text);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onText, enabled]);
}

export function PasteDialog({ initial, onClose, onCreated }: { initial: string; onClose: () => void; onCreated: (path: string) => void }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [text, setText] = useState(initial);
  const [name, setName] = useState(`Вставка ${stamp()}`);
  const table = useMemo(() => (text.trim() ? toTable(parseClipboardTable(text)) : null), [text]);
  const columns = useMemo(() => (table ? matchColumns(table.headers) : []), [table]);
  const fio = (r: string[]) => ['person.lastName', 'person.firstName', 'person.middleName'].map((id) => r[columns.indexOf(id)] ?? '').filter(Boolean).join(' ');

  const readClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      toast('Браузер не дал прочитать буфер — вставьте в поле вручную (долгое нажатие → «Вставить»)');
    }
  };

  const create = async () => {
    if (!workspace || !table?.rows.length) return;
    const file = `${(name.trim() || `Вставка ${stamp()}`).replace(/[\\/:*?"<>|]/g, '_')}.xlsx`;
    if ((await workspace.stat(file)) && !confirm(`Файл «${file}» уже есть в рабочей папке. Заменить?`)) return;
    await workspace.writeBytes(file, writeXlsx(table.headers, table.rows, 'Анкеты'));
    toast(`Таблица «${file}» сохранена в рабочую папку`);
    onCreated(file);
  };

  return (
    <Modal
      title="Таблица из буфера обмена"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={create} disabled={!table?.rows.length}>
            Создать таблицу ({table?.rows.length ?? 0} чел.)
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Выделите строки в Excel или Google Таблицах, нажмите Ctrl+C, а здесь — Ctrl+V. Строка заголовков не обязательна: без
          неё столбцы понимаются по порядку анкеты (Отметка времени, Регион, Фамилия…).
        </p>
        {!initial && (
          <div className="row">
            <button className="btn btn--sm" onClick={readClipboard}>
              <ClipboardPaste size={14} /> Вставить из буфера
            </button>
          </div>
        )}
        <textarea className="input mono paste-area" value={text} onChange={(e) => setText(e.target.value)} rows={initial ? 4 : 6} placeholder="Вставьте сюда строки таблицы" aria-label="Данные таблицы" />
        {table && (
          <div className="card card--flat stack stack--s small">
            <div>
              Строк: <strong>{table.rows.length}</strong> · столбцов: <strong>{table.headers.length}</strong> ·{' '}
              {table.hadHeader ? 'первая строка — заголовки' : 'заголовков нет — столбцы по порядку анкеты'} · распознано столбцов:{' '}
              {columns.filter(Boolean).length}
            </div>
            {table.rows.slice(0, 5).map((r, i) => (
              <div key={i} className="muted">
                {i + 1}. {fio(r) || r.slice(0, 3).join(' · ')}
              </div>
            ))}
            {table.rows.length > 5 && <div className="faint">и ещё {table.rows.length - 5}</div>}
            {!table.hadHeader && table.headers.length !== PERSON_FIELDS.length && (
              <div style={{ color: 'var(--warning)' }}>
                В анкете {PERSON_FIELDS.length} столбцов, а вставлено {table.headers.length} — проверьте, что копировали строки целиком, начиная с первого столбца.
              </div>
            )}
          </div>
        )}
        <label className="field">
          <span className="field__label">Имя файла</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
