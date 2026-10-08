import { ChevronDown, ChevronRight, EyeOff, Eye, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDictionary } from '@/core/dictionaries/dictionaries';
import { ENUMS, type EnumDef } from '@/core/schema/enums';
import { nodeKey, type GeoNode, type Gazetteer, type UserGeoEntry } from '@/shared/address/gazetteer';
import { AddPlaceDialog } from '@/shared/address/ui/AddPlaceDialog';
import { useGazetteer } from '@/shared/address/useGazetteer';
import { useToast } from '@/ui/Toast';
import { WorkspaceGate } from '@/ui/WorkspaceGate';

function TreeNode({ node, gaz, depth, onAdd, onRemove, forceOpen }: {
  node: GeoNode;
  gaz: Gazetteer;
  depth: number;
  onAdd: (n: GeoNode) => void;
  onRemove: (n: GeoNode) => void;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const children = gaz.childrenOf(node.id);
  const isOpen = open || forceOpen;
  return (
    <div>
      <div className="tree-row" style={{ paddingLeft: depth * 18 }}>
        {children.length ? (
          <button className="icon-btn icon-btn--sm" onClick={() => setOpen(!isOpen)} aria-label={isOpen ? 'Свернуть' : 'Развернуть'} aria-expanded={isOpen}>
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span style={{ width: 30, display: 'inline-block' }} />
        )}
        <span className="spacer">
          {gaz.label(node)} {children.length > 0 && <span className="faint small">({children.length})</span>}
        </span>
        {node.user && <span className="badge badge--beta">ваше</span>}
        <button className="icon-btn icon-btn--sm" onClick={() => onAdd(node)} data-tip="Добавить внутрь" aria-label={`Добавить внутрь ${gaz.label(node)}`}>
          <Plus size={16} />
        </button>
        {node.user && (
          <button className="icon-btn icon-btn--sm" onClick={() => onRemove(node)} data-tip="Удалить" aria-label={`Удалить ${gaz.label(node)}`}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {isOpen && children.map((c) => <TreeNode key={c.id} node={c} gaz={gaz} depth={depth + 1} onAdd={onAdd} onRemove={onRemove} />)}
    </div>
  );
}

function AddressDictionary() {
  const { gaz, dict } = useGazetteer();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [addTo, setAddTo] = useState<GeoNode | null>(null);
  const regions = gaz.childrenOf(gaz.root.id);
  const userCount = dict.entries.length;

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    return [...gaz.nodes.values()].filter((n) => n.type !== 'country' && n.name.toLowerCase().includes(q)).slice(0, 50);
  }, [query, gaz]);

  const remove = (node: GeoNode) => {
    const parent = gaz.parentOf(node);
    if (!parent) return;
    const path = gaz.pathOf(parent).join('/');
    const entry = dict.entries.find((e) => nodeKey(e.value.type, e.value.name) === node.key && e.value.parentPath.join('/') === path);
    if (entry && confirm(`Удалить «${gaz.label(node)}» из справочника?`)) {
      dict.remove(entry.id);
      toast(`Удалено: ${gaz.label(node)}`);
    }
  };

  const save = (entry: UserGeoEntry, label: string) => {
    dict.add(entry, { label, source: 'dictionaries' });
    toast(`Добавлено: ${label}`);
    setAddTo(null);
  };

  return (
    <section className="stack">
      <div className="section-title">
        <h2>Адреса</h2>
        <span className="muted small">ваших дополнений: {userCount}</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Дерево «регион → район → населённый пункт → улица». По нему проверяется, что, например, Абакан указан в Хакасии. Встроенная
        база небольшая — добавляйте свои сёла и улицы, они уйдут в «Предложения в базу».
      </p>
      <input className="input" placeholder="Поиск: Аскиз, Абакан…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="card tree">
        {found
          ? found.length
            ? found.map((n) => (
                <div key={n.id} className="tree-row">
                  <span className="spacer">
                    {gaz.label(n)} <span className="faint small">— {gaz.chain(gaz.parentOf(n) ?? n)}</span>
                  </span>
                  {n.user && <span className="badge badge--beta">ваше</span>}
                  <button className="icon-btn icon-btn--sm" onClick={() => setAddTo(n)} aria-label="Добавить внутрь" data-tip="Добавить внутрь">
                    <Plus size={16} />
                  </button>
                  {n.user && (
                    <button className="icon-btn icon-btn--sm" onClick={() => remove(n)} aria-label="Удалить" data-tip="Удалить">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            : <div className="empty">Ничего не найдено</div>
          : regions.map((r) => <TreeNode key={r.id} node={r} gaz={gaz} depth={0} onAdd={setAddTo} onRemove={remove} forceOpen={false} />)}
      </div>
      {addTo && <AddPlaceDialog gaz={gaz} initial={{ name: '', type: null, parentPath: gaz.pathOf(addTo) }} onSave={save} onClose={() => setAddTo(null)} />}
    </section>
  );
}

function EnumEditor({ def }: { def: EnumDef }) {
  const dict = useDictionary<string>(def.id);
  const toast = useToast();
  const [value, setValue] = useState('');
  const userValues = dict.entries.map((e) => e.value);
  const add = () => {
    const v = value.trim();
    if (!v || def.values.includes(v) || userValues.includes(v)) return;
    dict.add(v, { label: `${def.title}: ${v}`, source: 'dictionaries' });
    setValue('');
    toast(`Добавлено в «${def.title}»: ${v}`);
  };
  return (
    <div className="card stack stack--s">
      <strong>{def.title}</strong>
      <div className="row">
        {def.values.map((v) => {
          const hidden = dict.hidden.includes(v);
          return (
            <span key={v} className={`chip ${hidden ? 'chip--off' : ''}`}>
              {v}
              <button
                className="icon-btn icon-btn--sm"
                style={{ width: 22, height: 22 }}
                onClick={() => dict.setHidden(v, !hidden)}
                aria-label={hidden ? `Вернуть ${v}` : `Скрыть ${v}`}
                title={hidden ? 'Вернуть' : 'Скрыть (не считать допустимым)'}
              >
                {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </span>
          );
        })}
        {dict.entries.map((e) => (
          <span key={e.id} className="chip chip--user">
            {e.value}
            <button className="icon-btn icon-btn--sm" style={{ width: 22, height: 22 }} onClick={() => dict.remove(e.id)} aria-label={`Удалить ${e.value}`} title="Удалить">
              <Trash2 size={14} />
            </button>
          </span>
        ))}
      </div>
      <form
        className="row row--nowrap"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Новое значение" aria-label={`Новое значение для «${def.title}»`} />
        <button className="btn" type="submit" disabled={!value.trim()}>
          <Plus size={16} /> Добавить
        </button>
      </form>
      <span className="small faint">{def.strict ? 'Значение не из списка — предупреждение' : 'Значение не из списка — только подсказка'}</span>
    </div>
  );
}

export function DictionariesPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Справочники</h1>
        <p>Общая база слов и понятий, по которой работают проверки во всех приложениях. Ваши дополнения хранятся в рабочей папке.</p>
      </div>
      <WorkspaceGate>
        <div className="stack stack--l">
          <AddressDictionary />
          <section className="stack">
            <h2>Списки значений</h2>
            <div className="grid-2">
              {ENUMS.map((def) => (
                <EnumEditor key={def.id} def={def} />
              ))}
            </div>
          </section>
        </div>
      </WorkspaceGate>
    </div>
  );
}
