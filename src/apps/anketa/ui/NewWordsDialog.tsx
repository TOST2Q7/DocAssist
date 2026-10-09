import { useMemo, useState } from 'react';
import { stepText } from '@/core/base/tree';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import type { BaseAddition, PersonResult } from '../model/types';
import { confirmBase } from './hooks';

/*
 * «Новые слова» — всё, чего ещё нет в базе: места, улицы, должности, отряды, учебные заведения…
 * Человек проверяет список и подтверждает — значения попадают в базу (и в «Предложения в базу»).
 * Индивидуальные значения (паспорт, СНИЛС, телефон…) сюда не попадают: их подтверждают у каждого отдельно.
 */

export interface NewWord {
  key: string;
  base: BaseAddition;
  where: string[];
}

export function collectNewWords(results: PersonResult[], names: string[], headers: string[]): NewWord[] {
  const map = new Map<string, NewWord>();
  for (const r of results) {
    for (const f of r.fields) {
      const base = f.confirm?.base;
      if (!base || f.confirm?.person) continue;
      if (f.issues.some((i) => i.level === 'error')) continue;
      const key = JSON.stringify([base.tree, base.path.map((s) => [s.k, s.v])]);
      const where = `${names[r.row] || `строка ${r.row + 1}`} — ${(f.fieldId && FIELD_BY_ID.get(f.fieldId)?.label) || headers[f.col]}`;
      const item = map.get(key);
      if (item) {
        if (!item.where.includes(where)) item.where.push(where);
      } else map.set(key, { key, base, where: [where] });
    }
  }
  return [...map.values()];
}

/** Путь с отмеченными новыми частями. */
export function PathLabel({ base }: { base: BaseAddition }) {
  return (
    <span className="path">
      {base.path.map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="faint"> → </span>}
          <span className={i >= base.known ? 'path__new' : 'path__known'}>{stepText(s)}</span>
        </span>
      ))}
    </span>
  );
}

export function NewWordsDialog({ items, onClose }: { items: NewWord[]; onClose: () => void }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const sections = useMemo(() => {
    const m = new Map<string, NewWord[]>();
    for (const i of items) m.set(i.base.tree, [...(m.get(i.base.tree) ?? []), i]);
    return [...m.entries()];
  }, [items]);
  const chosen = items.filter((i) => !off.has(i.key));

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
    // Сначала полные пути (с индексом), чтобы короткие (без индекса) легли внутрь них, а не рядом.
    for (const i of [...chosen].sort((a, b) => b.base.path.length - a.base.path.length)) if (await confirmBase(workspace, i.base)) added++;
    setBusy(false);
    toast(`Добавлено в базу: ${added}`);
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
        <p className="muted">Всё уже есть в базе.</p>
      ) : (
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            Проверьте каждое значение по документам или карте. После подтверждения оно попадёт в базу: такие же значения в
            других анкетах будут проходить проверку. Новые части выделены. Индивидуальные значения (паспорт, телефон…) здесь не
            показываются — их подтверждают галочкой у каждого человека.
          </p>
          <div className="row small">
            <button className="btn btn--sm btn--ghost" onClick={() => setOff(new Set())}>
              Выбрать всё
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => setOff(new Set(items.map((i) => i.key)))}>
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
                    <PathLabel base={i.base} />
                    <div className="small faint">
                      {i.where.slice(0, 3).join('; ')}
                      {i.where.length > 3 ? ` и ещё ${i.where.length - 3}` : ''}
                    </div>
                  </div>
                </label>
              ))}
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
