import { Copy, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { markSeen } from '@/core/registry/badges';
import { variablesDocType, useVariables } from '@/core/variables/variables';
import { VAR_KINDS, type Variable, type VarKind } from '@/core/variables/types';
import { upgrade, wrap } from '@/core/schema/docType';
import { downloadBytes, pickFiles } from '@/core/util/download';
import { formatDateTime, todayStamp } from '@/core/util/format';
import { uid } from '@/core/util/id';
import { Alert } from '@/ui/Alert';
import { SaveVarDialog } from '@/ui/SaveVarDialog';
import { useToast } from '@/ui/Toast';
import { WorkspaceGate } from '@/ui/WorkspaceGate';

function VariablesView() {
  const vars = useVariables();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<VarKind | ''>('');
  const [editing, setEditing] = useState<Variable | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vars.items.filter(
      (v) => (!kind || v.kind === kind) && (!q || [v.key, v.label, v.value].some((s) => s.toLowerCase().includes(q))),
    );
  }, [vars.items, query, kind]);

  const exportJson = () => {
    downloadBytes(JSON.stringify(wrap(variablesDocType, { items: vars.items }), null, 2), `переменные_${todayStamp()}.json`, 'application/json');
  };

  const importJson = async () => {
    const [file] = await pickFiles('.json,application/json', false);
    if (!file) return;
    try {
      const { data } = upgrade(variablesDocType, JSON.parse(await file.text()));
      const existing = new Set(vars.items.map((v) => v.key.toLowerCase()));
      const fresh = data.items.filter((v) => !existing.has(v.key.toLowerCase())).map((v) => ({ ...v, id: uid('var_') }));
      vars.replaceAll([...vars.items, ...fresh]);
      toast(`Добавлено переменных: ${fresh.length}${fresh.length < data.items.length ? ` (повторы пропущены: ${data.items.length - fresh.length})` : ''}`);
    } catch (e) {
      toast(`Не удалось прочитать файл: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="stack">
      {vars.error && <Alert kind="error">{vars.error}. Исправьте или удалите файл в папке .docassist — до этого изменения не сохраняются.</Alert>}
      {vars.readOnly && !vars.error && <Alert kind="warning">Файл переменных создан более новой версией DocAssist — изменения недоступны. Обновите приложение.</Alert>}
      <div className="row">
        <input className="input" style={{ flex: '1 1 220px' }} placeholder="Поиск по ключу, названию, значению" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" style={{ flex: '0 1 200px' }} value={kind} onChange={(e) => setKind(e.target.value as VarKind | '')}>
          <option value="">Все типы</option>
          {Object.entries(VAR_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button className="btn btn--primary" onClick={() => setCreating(true)} disabled={vars.readOnly}>
          <Plus size={18} /> Добавить
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          {vars.items.length === 0
            ? 'Переменных пока нет. Добавьте их здесь или нажмите ☆ рядом с полем в любом приложении.'
            : 'Ничего не найдено.'}
        </div>
      ) : (
        <div className="list">
          {list.map((v) => (
            <div key={v.id} className="list__item">
              <div className="list__main">
                <div className="row row--nowrap">
                  <span className="list__title">{v.label}</span>
                  <span className="chip mono small">&lt;{v.key}&gt;</span>
                  <span className="badge">{VAR_KINDS[v.kind]?.label ?? v.kind}</span>
                </div>
                <div className="var-value">{v.value}</div>
                <div className="list__sub">
                  {v.source ? `${v.source} · ` : ''}изменено {formatDateTime(v.updatedAt)}
                </div>
              </div>
              <button
                className="icon-btn"
                data-tip="Копировать значение"
                aria-label="Копировать значение"
                onClick={() => navigator.clipboard?.writeText(v.value).then(() => toast('Скопировано'))}
              >
                <Copy size={18} />
              </button>
              <button className="icon-btn" data-tip="Изменить" aria-label="Изменить" onClick={() => setEditing(v)} disabled={vars.readOnly}>
                <Pencil size={18} />
              </button>
              <button
                className="icon-btn"
                data-tip="Удалить"
                aria-label="Удалить"
                disabled={vars.readOnly}
                onClick={() => {
                  vars.remove(v.id);
                  toast(`Удалено: <${v.key}>`, { label: 'Вернуть', run: () => vars.replaceAll([...vars.items]) });
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <button className="btn btn--sm" onClick={exportJson} disabled={!vars.items.length}>
          <Download size={16} /> Экспорт в файл
        </button>
        <button className="btn btn--sm" onClick={importJson} disabled={vars.readOnly}>
          <Upload size={16} /> Импорт из файла
        </button>
      </div>

      {creating && <SaveVarDialog initial={{ value: '', label: '', kind: 'text' }} onClose={() => setCreating(false)} />}
      {editing && <SaveVarDialog initial={editing} existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function VariablesPage() {
  useEffect(() => markSeen('menu:variables'), []);
  return (
    <div className="page page--narrow">
      <div className="page-head">
        <h1>Глобальные переменные</h1>
        <p>
          Значения, которые нужны часто и в разных местах: ФИО, телефоны, адреса, названия. В любом поле ввода нажмите{' '}
          <kbd>Ctrl</kbd>+<kbd>Пробел</kbd> — появится список переменных. Начните писать ключ или часть значения, чтобы сузить список.
        </p>
      </div>
      <WorkspaceGate>
        <VariablesView />
      </WorkspaceGate>
    </div>
  );
}
