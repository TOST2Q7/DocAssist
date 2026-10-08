import { ChevronDown, ChevronRight, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDictionary } from '@/core/dictionaries/dictionaries';
import { APPS } from '@/core/registry/apps';
import type { DictionaryView } from '@/core/registry/types';
import { ENUMS, type EnumDef } from '@/core/schema/enums';
import { nodeKey, type AddressDictValue, type GeoNode, type Gazetteer, type UserGeoEntry, type UserPostalEntry } from '@/shared/address/gazetteer';
import { AddPlaceDialog } from '@/shared/address/ui/AddPlaceDialog';
import { useGazetteer } from '@/shared/address/useGazetteer';
import { useToast } from '@/ui/Toast';
import { WorkspaceGate } from '@/ui/WorkspaceGate';

const isPostal = (v: AddressDictValue): v is UserPostalEntry => v.op === 'postal';

function TreeNode({ node, gaz, depth, onAdd, onRemove, onRemovePostal }: {
  node: GeoNode;
  gaz: Gazetteer;
  depth: number;
  onAdd: (n: GeoNode) => void;
  onRemove: (n: GeoNode) => void;
  onRemovePostal: (n: GeoNode, index: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const children = gaz.childrenOf(node.id);
  return (
    <div>
      <div className="tree-row" style={{ paddingLeft: depth * 18 }}>
        {children.length ? (
          <button className="icon-btn icon-btn--sm" onClick={() => setOpen(!open)} aria-label={open ? 'Свернуть' : 'Развернуть'} aria-expanded={open}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span style={{ width: 30, display: 'inline-block' }} />
        )}
        <span className="spacer">
          {gaz.label(node)} {children.length > 0 && <span className="faint small">({children.length})</span>}
          {node.postal.map((p) => (
            <span key={p} className="chip chip--postal small">
              {p}
              <button className="icon-btn icon-btn--sm chip__x" onClick={() => onRemovePostal(node, p)} aria-label={`Удалить индекс ${p}`} title="Удалить индекс">
                <X size={12} />
              </button>
            </span>
          ))}
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
      {open && children.map((c) => <TreeNode key={c.id} node={c} gaz={gaz} depth={depth + 1} onAdd={onAdd} onRemove={onRemove} onRemovePostal={onRemovePostal} />)}
    </div>
  );
}

function AddressDictionary() {
  const { gaz, dict } = useGazetteer();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [addTo, setAddTo] = useState<GeoNode | null>(null);
  const regions = gaz.childrenOf(gaz.root.id);
  const places = dict.entries.filter((e) => !isPostal(e.value)).length;
  const postals = dict.entries.length - places;

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    return [...gaz.nodes.values()].filter((n) => n.type !== 'country' && (n.name.toLowerCase().includes(q) || n.postal.some((p) => p.startsWith(q)))).slice(0, 50);
  }, [query, gaz]);

  const remove = (node: GeoNode) => {
    const parent = gaz.parentOf(node);
    if (!parent) return;
    const path = gaz.pathOf(parent).join('/');
    const entry = dict.entries.find((e) => !isPostal(e.value) && nodeKey(e.value.type, e.value.name) === node.key && e.value.parentPath.join('/') === path);
    if (entry && confirm(`Удалить «${gaz.label(node)}» из справочника?`)) {
      dict.remove(entry.id);
      toast(`Удалено: ${gaz.label(node)}`);
    }
  };

  const removePostal = (node: GeoNode, index: string) => {
    const path = gaz.pathOf(node).join('/');
    const entry = dict.entries.find((e) => isPostal(e.value) && e.value.index === index && e.value.path.join('/') === path);
    if (entry && confirm(`Удалить индекс ${index} у «${gaz.label(node)}»?`)) {
      dict.remove(entry.id);
      toast(`Удалён индекс ${index}`);
    }
  };

  const save = (entry: UserGeoEntry, label: string) => {
    void dict.add(entry, { label, source: 'dictionaries' });
    toast(`Добавлено: ${label}`);
    setAddTo(null);
  };

  const row = (n: GeoNode) => (
    <TreeNode key={n.id} node={n} gaz={gaz} depth={0} onAdd={setAddTo} onRemove={remove} onRemovePostal={removePostal} />
  );

  return (
    <section className="stack">
      <div className="section-title">
        <h2>Адреса</h2>
        <span className="muted small">
          ваших населённых пунктов и улиц: {places}, индексов: {postals}
        </span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Дерево «регион → район → населённый пункт → улица» с подтверждёнными индексами. Адрес проходит проверку, только если его
        части есть в дереве. Новые значения подтверждаются из анкет кнопкой «Подтвердить» или здесь вручную.
      </p>
      <input className="input" placeholder="Поиск: Аскиз, Абакан, 655700…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="card tree">
        {found ? (
          found.length ? (
            found.map((n) => (
              <div key={n.id}>
                {row(n)}
                <div className="small faint" style={{ paddingLeft: 36, marginTop: -6, marginBottom: 4 }}>
                  {gaz.chain(gaz.parentOf(n) ?? n)}
                </div>
              </div>
            ))
          ) : (
            <div className="empty">Ничего не найдено</div>
          )
        ) : (
          regions.map(row)
        )}
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
    void dict.add(v, { label: `${def.title}: ${v}`, source: 'dictionaries' });
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
                className="icon-btn icon-btn--sm chip__x"
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
            <button className="icon-btn icon-btn--sm chip__x" onClick={() => dict.remove(e.id)} aria-label={`Удалить ${e.value}`} title="Удалить">
              <Trash2 size={14} />
            </button>
          </span>
        ))}
      </div>
      {!def.closed && (
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
      )}
      <span className="small faint">
        {def.closed ? 'Закрытый список: другие значения — ошибка' : 'Новое значение нужно подтвердить — после этого оно допустимо'}
      </span>
    </div>
  );
}

function LearnedDictionary({ view }: { view: DictionaryView }) {
  const dict = useDictionary<unknown>(view.id);
  const toast = useToast();
  const [value, setValue] = useState('');
  const describe = view.describe ?? ((v: unknown) => String(v));
  return (
    <div className="card stack stack--s">
      <div className="row">
        <strong className="spacer">{view.title}</strong>
        <span className="badge">{dict.entries.length}</span>
      </div>
      {view.hint && <span className="small faint">{view.hint}</span>}
      {dict.entries.length === 0 ? (
        <span className="small muted">Пока пусто — значения появятся, когда вы подтвердите их в анкетах.</span>
      ) : (
        <div className="learned">
          {dict.entries.map((e) => (
            <div key={e.id} className="learned__item">
              <span className="spacer">{describe(e.value)}</span>
              <button className="icon-btn icon-btn--sm" onClick={() => dict.remove(e.id)} aria-label={`Удалить ${describe(e.value)}`} title="Удалить">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {view.addable && (
        <form
          className="row row--nowrap"
          onSubmit={(e) => {
            e.preventDefault();
            const v = value.trim();
            if (!v) return;
            void dict.add(v, { label: `${view.title}: ${v}`, source: 'dictionaries' }).then((added) => toast(added ? `Добавлено: ${v}` : 'Уже есть в справочнике'));
            setValue('');
          }}
        >
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Добавить вручную" aria-label={`Добавить в «${view.title}»`} />
          <button className="btn" type="submit" disabled={!value.trim()}>
            <Plus size={16} />
          </button>
        </form>
      )}
    </div>
  );
}

export function DictionariesPage() {
  const views = APPS.flatMap((a) => a.dictionaries ?? []);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Справочники</h1>
        <p>
          По справочникам работает строгая проверка: значение проходит, только если оно известно. Ваши подтверждения хранятся в
          рабочей папке и уходят в «Предложения в базу».
        </p>
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
          {views.length > 0 && (
            <section className="stack">
              <h2>Подтверждённые значения</h2>
              <div className="grid-2">
                {views.map((v) => (
                  <LearnedDictionary key={v.id} view={v} />
                ))}
              </div>
            </section>
          )}
        </div>
      </WorkspaceGate>
    </div>
  );
}
