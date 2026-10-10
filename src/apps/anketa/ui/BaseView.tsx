import { ChevronDown, ChevronRight, CircleAlert, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBaseTree } from '@/core/base/base';
import { chainText, stepText, type BaseTree, type Step, type TreeNode } from '@/core/base/tree';
import { PERSON_FIELDS } from '@/core/schema/fields';
import { findAbbreviations } from '@/shared/cell/abbr';
import { PART_CHECK_BY_ID } from '@/shared/cell/partChecks';
import { parseOrder } from '@/shared/cell/template';
import { useToast } from '@/ui/Toast';
import { WorkspaceGate } from '@/ui/WorkspaceGate';
import type { AnketaChecker } from '../lua/checker';
import { useChecker, useChecks, useTreeNames } from './hooks';
import '../anketa.css';

/*
 * База: древа «ключ:значение», которыми пользуется проверка анкет.
 * Здесь можно посмотреть, удалить и добавить вручную: тег (что это: республика, район, улица…) + само слово.
 */

/** Что можно добавить в древо: ключ, приписка (тег), проверка, уровень в древе. */
interface TagOption {
  id: string;
  /** Ключ узла. */
  k: string;
  keyTitle: string;
  abbr?: string;
  abbrTitle?: string;
  after?: boolean;
  /** Проверка части конструктора (id или функция библиотеки). */
  part?: string;
  /** Или проверка столбца целиком (для списков из базы). */
  field?: string;
  /** Уровень в древе (меньше — выше). */
  level: number;
}

/** Что можно добавить в древо: части конструктора и столбцы, которые берут значения из этого древа (base.check). */
function optionsFor(tree: string, checker: AnketaChecker): { options: TagOption[]; fields: string[] } {
  const options: TagOption[] = [];
  const fields: string[] = [];
  const seen = new Set<string>();
  const push = (o: TagOption) => {
    if (seen.has(o.id)) return;
    seen.add(o.id);
    options.push(o);
  };
  for (const f of PERSON_FIELDS) {
    const check = checker.checks.fields[f.id];
    const use = checker.usage(f.id);
    const t = check?.template;
    if (use.parts && t && t.tree === tree) {
      fields.push(f.label);
      const { order } = parseOrder(t.order, t.keys.length);
      order.forEach((ki, level) => {
        const k = t.keys[ki];
        if (!k.tags.length) push({ id: `${k.id}|`, k: k.id, keyTitle: k.title, part: k.check, level });
        for (const tg of k.tags) push({ id: `${k.id}|${tg.abbr}`, k: k.id, keyTitle: k.title, abbr: tg.abbr, abbrTitle: tg.title, after: tg.after, part: k.check, level });
      });
    }
    for (const b of use.bases) {
      if (b.tree !== tree) continue;
      fields.push(f.label);
      if (b.inside) push({ id: `${b.inside.key}|`, k: b.inside.key, keyTitle: b.inside.title, field: b.inside.key, level: 0 });
      push({ id: `${b.key}|`, k: b.key, keyTitle: b.title, field: b.key, level: b.inside ? 1 : 0 });
    }
  }
  return { options, fields: [...new Set(fields)] };
}

/** Почему слово не подходит под проверку части или столбца (null — подходит). */
function whyNot(opt: TagOption, value: string, checker: AnketaChecker): string | null {
  if (opt.part !== undefined) {
    if (checker.partFits(opt.part, value)) return null;
    return `Не подходит под проверку части «${opt.keyTitle}»: ${PART_CHECK_BY_ID.get(opt.part)?.title.toLowerCase() ?? opt.part}`;
  }
  if (opt.field) {
    const { result } = checker.test(opt.field, value, { trees: new Map() });
    const err = result.issues.find((i) => i.level === 'error' && !i.base);
    return err ? `Не подходит под проверку «${opt.keyTitle}»: ${err.text}` : null;
  }
  return null;
}

const optionLabel = (o: TagOption) => (o.abbr ? `${o.abbrTitle} (${o.abbr}) — ${o.keyTitle}` : `${o.keyTitle} (без приписки)`);

function NodeRow({ node, tree, depth, titles, canNest, onAdd, onRemove }: { node: TreeNode; tree: BaseTree; depth: number; titles: Map<string, string>; canNest: (n: TreeNode) => boolean; onAdd: (n: TreeNode) => void; onRemove: (n: TreeNode) => void }) {
  const [open, setOpen] = useState(depth === 0 && node.children.length < 8);
  return (
    <div>
      <div className="tree-row" style={{ paddingLeft: depth * 18 }}>
        {node.children.length ? (
          <button className="icon-btn icon-btn--sm" onClick={() => setOpen(!open)} aria-label={open ? 'Свернуть' : 'Развернуть'} aria-expanded={open}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span style={{ width: 30, display: 'inline-block' }} />
        )}
        <span className="spacer">
          <span className="faint small">{titles.get(node.k) ?? node.k}: </span>
          {stepText(node)} {node.children.length > 0 && <span className="faint small">({node.children.length})</span>}
        </span>
        {canNest(node) && (
          <button className="icon-btn icon-btn--sm" onClick={() => onAdd(node)} data-tip="Добавить внутрь" aria-label={`Добавить внутрь ${stepText(node)}`}>
            <Plus size={16} />
          </button>
        )}
        <button className="icon-btn icon-btn--sm" onClick={() => onRemove(node)} data-tip="Удалить" aria-label={`Удалить ${stepText(node)}`}>
          <Trash2 size={16} />
        </button>
      </div>
      {open && node.children.map((c) => <NodeRow key={c.id} node={c} tree={tree} depth={depth + 1} titles={titles} canNest={canNest} onAdd={onAdd} onRemove={onRemove} />)}
    </div>
  );
}

function AddForm({ tree, parent, options, checker, onClearParent, onAdd }: { tree: BaseTree; parent: TreeNode | null; options: TagOption[]; checker: AnketaChecker; onClearParent: () => void; onAdd: (path: Step[]) => void }) {
  const levelOfKey = (k: string) => {
    const levels = options.filter((o) => o.k === k).map((o) => o.level);
    return levels.length ? Math.min(...levels) : -1;
  };
  const fitting = parent ? options.filter((o) => o.level > levelOfKey(parent.k)) : options;
  const [tagId, setTagId] = useState('');
  const [word, setWord] = useState('');
  const opt = options.find((o) => o.id === tagId) ?? fitting[0] ?? options[0];
  const value = word.trim();

  const warnings: string[] = [];
  const abbrs = value ? findAbbreviations(value) : [];
  if (abbrs.length) warnings.push(`Приписки писать не нужно — сохранится неправильно! Уберите «${abbrs.join('», «')}»: приписка задаётся тегом.`);
  if (value && opt) {
    const why = whyNot(opt, value, checker);
    if (why) warnings.push(why);
  }
  if (word && word !== value) warnings.push('Лишние пробелы в начале или в конце — будут убраны.');
  if (parent && opt && opt.level <= levelOfKey(parent.k)) warnings.push(`По порядку древа «${opt.keyTitle}» не бывает внутри «${stepText(parent)}».`);
  const path: Step[] = opt ? [...(parent ? tree.pathOf(parent) : []), { k: opt.k, v: value, ...(opt.abbr ? { t: opt.abbr } : {}), ...(opt.after ? { a: true } : {}) }] : [];
  const exists = value && tree.has(path);

  return (
    <form
      className="card card--flat stack stack--s add-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value || !opt || exists) return;
        onAdd(path);
        setWord('');
      }}
    >
      <strong className="small">Добавить вручную</strong>
      <div className="small">
        Куда: {parent ? <strong>{chainText(tree.pathOf(parent))}</strong> : <strong>верхний уровень</strong>}
        {parent && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClearParent}>
            <X size={14} /> на верхний уровень
          </button>
        )}
        <span className="faint"> · чтобы добавить внутрь, нажмите «+» у узла</span>
      </div>
      <div className="row row--nowrap add-form__row">
        <select className="select" value={opt?.id ?? ''} onChange={(e) => setTagId(e.target.value)} aria-label="Тег">
          {fitting.length > 0 && fitting.length < options.length && (
            <optgroup label="Подходят по порядку древа">
              {fitting.map((o) => (
                <option key={o.id} value={o.id}>
                  {optionLabel(o)}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={fitting.length < options.length && fitting.length ? 'Все' : 'Тег'}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {optionLabel(o)}
              </option>
            ))}
          </optgroup>
        </select>
        <input className="input" value={word} onChange={(e) => setWord(e.target.value)} placeholder={opt?.abbr ? `Только слово, без «${opt.abbr}»` : 'Слово'} aria-label="Слово" />
        <button className="btn btn--primary" type="submit" disabled={!value || !!exists}>
          <Plus size={16} /> {warnings.length ? 'Добавить всё равно' : 'Добавить'}
        </button>
      </div>
      {value && opt && (
        <div className="small muted">
          Сохранится: <span className="mono">{stepText(path[path.length - 1])}</span>
          {opt.abbr ? ' — так часть должна быть написана в анкете' : ''}
        </div>
      )}
      {exists && <div className="small" style={{ color: 'var(--error)' }}>Такое уже есть в базе.</div>}
      {warnings.map((w) => (
        <div key={w} className="add-form__warn small">
          <CircleAlert size={14} /> {w}
        </div>
      ))}
    </form>
  );
}

function TreeCard({ name, checker }: { name: string; checker: AnketaChecker }) {
  const base = useBaseTree(name);
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [parent, setParent] = useState<TreeNode | null>(null);
  const { options, fields } = useMemo(() => optionsFor(name, checker), [name, checker]);
  const titles = useMemo(() => new Map(options.map((o) => [o.k, o.keyTitle])), [options]);
  const canNest = (n: TreeNode) => {
    const levels = options.filter((o) => o.k === n.k).map((o) => o.level);
    const own = levels.length ? Math.min(...levels) : -1;
    return options.some((o) => o.level > own);
  };
  const tree = base.tree;
  const parentNode = parent ? (tree.node(parent.id) ?? null) : null;

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    return tree
      .nodes()
      .filter((n) => n.v.toLowerCase().includes(q))
      .slice(0, 50);
  }, [query, tree]);

  const remove = (n: TreeNode) => {
    const inside = n.children.length ? ` и всё, что внутри (${n.children.length})` : '';
    if (!confirm(`Удалить «${chainText(tree.pathOf(n))}»${inside}?`)) return;
    base.remove(tree.pathOf(n));
    if (parent && parent.id.startsWith(n.id)) setParent(null);
    toast(`Удалено: ${stepText(n)}`);
  };

  return (
    <section className="card stack base-card">
      <div className="section-title">
        <h3 style={{ margin: 0 }}>{name}</h3>
        <span className="muted small">
          значений: {tree.size}
          {fields.length ? ` · используют: ${fields.join(', ')}` : ' · проверки сейчас не используют'}
        </span>
      </div>
      {tree.size > 10 && (
        <div className="search-box">
          <Search size={16} className="faint" />
          <input className="input" placeholder="Поиск в древе" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Поиск в «${name}»`} />
        </div>
      )}
      <div className="tree">
        {!base.loaded ? (
          <div className="empty small">Загрузка…</div>
        ) : found ? (
          found.length ? (
            found.map((n) => (
              <div key={n.id}>
                <NodeRow node={n} tree={tree} depth={0} titles={titles} canNest={canNest} onAdd={setParent} onRemove={remove} />
                <div className="small faint" style={{ paddingLeft: 36, marginTop: -6, marginBottom: 4 }}>
                  {chainText(tree.pathOf(n))}
                </div>
              </div>
            ))
          ) : (
            <div className="empty small">Ничего не найдено</div>
          )
        ) : tree.root.children.length ? (
          tree.root.children.map((n) => <NodeRow key={n.id} node={n} tree={tree} depth={0} titles={titles} canNest={canNest} onAdd={setParent} onRemove={remove} />)
        ) : (
          <div className="empty small">Пусто. Значения появятся, когда вы подтвердите их в анкетах или добавите вручную.</div>
        )}
      </div>
      {options.length > 0 && !base.readOnly && (
        <AddForm
          key={parentNode?.id ?? ''}
          tree={tree}
          parent={parentNode}
          options={options}
          checker={checker}
          onClearParent={() => setParent(null)}
          onAdd={(path) => {
            void base.add(path, 'base').then((added) => toast(added ? `Добавлено: ${chainText(path)}` : 'Уже есть в базе'));
          }}
        />
      )}
    </section>
  );
}

export default function BaseView() {
  return (
    <WorkspaceGate>
      <BaseTrees />
    </WorkspaceGate>
  );
}

function BaseTrees() {
  const { checks, loaded } = useChecks();
  const checker = useChecker(checks);
  const names = useTreeNames(checker);
  const [only, setOnly] = useState<string>('');
  if (!loaded) return <div className="loading">Загрузка…</div>;
  const shown = only ? [only] : names;
  return (
    <div className="stack">
      <div className="row">
        <p className="muted small spacer" style={{ margin: 0 }}>
          Древа «ключ:значение» для проверки анкет. Значение есть в базе, только если оно внутри своего родителя: «Примерск» внутри
          «Респ. Регион».
        </p>
        <select className="select" style={{ width: 'auto' }} value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Какое древо показать">
          <option value="">Все древа ({names.length})</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      {shown.map((n) => (
        <TreeCard key={n} name={n} checker={checker} />
      ))}
    </div>
  );
}
