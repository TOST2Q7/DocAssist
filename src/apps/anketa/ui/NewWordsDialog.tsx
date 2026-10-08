import { useMemo, useState } from 'react';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import type { IssueAction, PersonResult } from '../model/types';
import { DICT_TITLES } from '../check/dicts';
import { ENUM_BY_ID } from '@/core/schema/enums';
import { actionKey, actionLabel, applyDictionaryAction, isDirectAction } from './hooks';

/*
 * «Новые слова» — всё, что встретилось в анкетах, но ещё не подтверждено:
 * сёла, улицы, индексы, имена, отряды, учебные заведения, подразделения…
 * Человек проверяет список и подтверждает — значения попадают в справочник
 * (и в «Предложения в базу»), после чего такие анкеты проходят проверку.
 */

interface Item {
  key: string;
  action: IssueAction;
  label: string;
  section: string;
  where: string[];
}

function sectionOf(a: IssueAction): string {
  if (a.kind === 'add-place') return a.type === 'ul' || (a.type && ['prkt', 'per', 'br', 'sh', 'nab', 'pl', 'proezd', 'tup', 'alleya', 'trakt', 'liniya'].includes(a.type)) ? 'Улицы' : 'Населённые пункты';
  if (a.kind === 'add-postal') return 'Почтовые индексы';
  return DICT_TITLES[a.dict] ?? ENUM_BY_ID.get(a.dict)?.title ?? a.dict;
}

/** Порядок добавления: сначала крупное (сёла), потом то, что внутри (улицы, индексы), потом слова. */
const order = (a: IssueAction) => (a.kind === 'add-place' ? (a.parentPath?.length ?? 0) : a.kind === 'add-postal' ? 50 : 100);

export function collectNewWords(results: PersonResult[], names: string[], headers: string[]): Item[] {
  const map = new Map<string, Item>();
  for (const r of results) {
    for (const f of r.fields) {
      if (f.accepted) continue;
      for (const i of f.issues) {
        if (!i.action) continue;
        const key = actionKey(i.action);
        const where = `${names[r.row] || `строка ${r.row + 1}`} — ${(f.fieldId && FIELD_BY_ID.get(f.fieldId)?.label) || headers[f.col]}`;
        const item = map.get(key);
        if (item) {
          if (!item.where.includes(where)) item.where.push(where);
        } else map.set(key, { key, action: i.action, label: actionLabel(i.action), section: sectionOf(i.action), where: [where] });
      }
    }
  }
  return [...map.values()];
}

export function NewWordsDialog({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const direct = items.filter((i) => isDirectAction(i.action));
  const manual = items.filter((i) => !isDirectAction(i.action));
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const sections = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of direct) m.set(i.section, [...(m.get(i.section) ?? []), i]);
    return [...m.entries()];
  }, [direct]);
  const chosen = direct.filter((i) => !off.has(i.key));

  const toggle = (key: string) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const apply = async () => {
    if (!workspace) return;
    setBusy(true);
    let added = 0;
    for (const i of [...chosen].sort((a, b) => order(a.action) - order(b.action))) {
      if (await applyDictionaryAction(workspace, i.action)) added++;
    }
    setBusy(false);
    toast(`Подтверждено и добавлено в справочник: ${added}`);
    onClose();
  };

  return (
    <Modal
      title={`Новые слова: ${items.length}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" disabled={!chosen.length || busy} onClick={apply}>
            Подтвердить выбранные ({chosen.length})
          </button>
        </>
      }
    >
      {items.length === 0 ? (
        <p className="muted">Всё уже есть в справочниках.</p>
      ) : (
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            Проверьте каждое значение по документам или карте. После подтверждения оно станет образцом: такие же значения в
            других анкетах будут проходить проверку, а с ошибками — нет. Подтверждённое попадёт в «Предложения в базу».
          </p>
          <div className="row small">
            <button className="btn btn--sm btn--ghost" onClick={() => setOff(new Set())}>
              Выбрать всё
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => setOff(new Set(direct.map((i) => i.key)))}>
              Снять всё
            </button>
          </div>
          {sections.map(([title, list]) => (
            <section key={title} className="stack stack--s">
              <strong className="small">{title}</strong>
              {list.map((i) => (
                <label key={i.key} className="fix-item">
                  <input type="checkbox" checked={!off.has(i.key)} onChange={() => toggle(i.key)} />
                  <div className="fix-item__body">
                    <div>{i.label}</div>
                    <div className="small faint">
                      {i.where.slice(0, 3).join('; ')}
                      {i.where.length > 3 ? ` и ещё ${i.where.length - 3}` : ''}
                    </div>
                  </div>
                </label>
              ))}
            </section>
          ))}
          {manual.length > 0 && (
            <section className="stack stack--s">
              <strong className="small">Нужно уточнить в анкете ({manual.length})</strong>
              <p className="small muted" style={{ margin: 0 }}>
                Для этих слов не хватает данных (тип или где находится) — откройте анкету и нажмите «Добавить в справочник…».
              </p>
              {manual.map((i) => (
                <div key={i.key} className="small">
                  {i.label} <span className="faint">— {i.where[0]}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
