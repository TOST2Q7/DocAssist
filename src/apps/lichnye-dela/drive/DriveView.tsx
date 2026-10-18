import { CloudUpload, ExternalLink, Folder, FolderPlus, Link2, Loader2, Palette, PenLine, RefreshCw, Trash2, UserRound, Users, Unlink } from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { getDevice } from '@/core/device/device';
import { ensureToken, errorText, FOLDER_COLORS, folderUrl, googleAvailability, useGoogleAuth } from '@/core/google';
import { fioText, usePeople } from '@/core/people/people';
import { useVariables } from '@/core/variables/variables';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { GoogleBar } from '@/ui/GoogleBar';
import { Menu } from '@/ui/Menu';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import { SECTIONS } from '../constants';
import type { CasesApi } from '../model/cases';
import { useTemplates } from '../model/templates';
import { assignPerson, checkDrive, colorNode, connectRoot, createChild, linkChildren, localFiles, pushFiles, recordRows, renameNode, trashNode, unlinkNode, type Progress } from './engine';
import { childrenOf, DEFAULT_RULES, personNode, personStatus, useDriveDoc, type DriveNode, type DriveRules } from './model';
import { makeNameFor } from './names';

/*
 * Вкладка «Google Диск»: подключённая папка, древо папок (его ведёт сам человек: создаёт папки, привязывает
 * существующие, отмечает папки бойцов) и правила оформления — имена и цвета папок, имена сканов.
 */

function FolderDialog({ title, name: initial, color: initialColor, onSave, onClose }: { title: string; name?: string; color?: string; onSave: (name: string, color?: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial ?? '');
  const [color, setColor] = useState(initialColor);
  const showName = initial !== undefined || !initialColor;
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <span className="spacer" />
          <button className="btn btn--primary" disabled={showName && !name.trim()} onClick={() => onSave(name.trim(), color)}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="stack">
        {showName && (
          <label className="field">
            <span className="field__label">Название папки</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <ColorPicker value={color} onChange={setColor} />
      </div>
    </Modal>
  );
}

function ColorPicker({ value, onChange }: { value?: string; onChange: (c?: string) => void }) {
  return (
    <div className="field">
      <span className="field__label">Цвет папки на Google Диске</span>
      <div className="row">
        <button type="button" className={`chip ${!value ? 'is-selected' : ''}`} onClick={() => onChange(undefined)}>
          без цвета
        </button>
        {FOLDER_COLORS.map((c) => (
          <button
            key={c.rgb}
            type="button"
            className={`dela-color ${value?.toLowerCase() === c.rgb ? 'is-selected' : ''}`}
            style={{ background: c.rgb }}
            onClick={() => onChange(c.rgb)}
            aria-label={c.title}
            data-tip={c.title}
          />
        ))}
      </div>
    </div>
  );
}

function PersonDialog({ onPick, onClose }: { onPick: (personId: string) => void; onClose: () => void }) {
  const people = usePeople();
  const [q, setQ] = useState('');
  const list = people.records.filter((r) => fioText(r.fields).toLowerCase().includes(q.toLowerCase().trim())).slice(0, 50);
  return (
    <Modal title="Чья это папка?" onClose={onClose}>
      <div className="stack">
        <input className="input" placeholder="Фамилия или имя" value={q} onChange={(e) => setQ(e.target.value)} data-kind="name" />
        <div className="owner-list">
          {list.map((r) => (
            <button key={r.id} type="button" className="owner-opt" onClick={() => onPick(r.id)}>
              <span className="owner-opt__name">{fioText(r.fields) || '(без ФИО)'}</span>
              <span className="owner-opt__sub">{[r.fields['rso.squad'], r.fields['person.birthDate']].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
          {!list.length && <div className="small muted" style={{ padding: 8 }}>Никого не нашли в базе людей.</div>}
        </div>
      </div>
    </Modal>
  );
}

function RulesCard({ rules, onChange, readOnly }: { rules: DriveRules; onChange: (r: DriveRules) => void; readOnly: boolean }) {
  return (
    <details className="card stack">
      <summary>
        <strong>Правила оформления на Google Диске</strong>
        <span className="small muted"> — как приложение называет и красит папки и файлы</span>
      </summary>
      <div className="stack" style={{ marginTop: 10 }}>
        <label className="field">
          <span className="field__label">Имя папки бойца</span>
          <input className="input" value={rules.personFolder} readOnly={readOnly} onChange={(e) => onChange({ ...rules, personFolder: e.target.value })} data-novars="" />
          <span className="field__hint">Метки в фигурных скобках: {'{Фамилия} {Имя} {Отчество} {ФИО:кратко} {Дата рождения} {Отряд}'}.</span>
        </label>
        <ColorPicker value={rules.personColor} onChange={(c) => onChange({ ...rules, personColor: c })} />
        <div className="stack stack--s">
          <span className="field__label">Папки разделов внутри папки бойца</span>
          {SECTIONS.map((s) => {
            const r = rules.sections[s.id] ?? { name: s.folder };
            return (
              <div key={s.id} className="row">
                <span className="small muted" style={{ minWidth: 150 }}>
                  {s.title}
                </span>
                <input className="input input--sm" value={r.name} readOnly={readOnly} onChange={(e) => onChange({ ...rules, sections: { ...rules.sections, [s.id]: { ...r, name: e.target.value } } })} aria-label={`Папка «${s.title}»`} />
                <select className="select select--sm" value={r.color ?? ''} disabled={readOnly} onChange={(e) => onChange({ ...rules, sections: { ...rules.sections, [s.id]: { ...r, color: e.target.value || undefined } } })} aria-label="Цвет">
                  <option value="">без цвета</option>
                  {FOLDER_COLORS.map((c) => (
                    <option key={c.rgb} value={c.rgb}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <label className="check small">
          <input type="checkbox" checked={rules.scanNames} disabled={readOnly} onChange={(e) => onChange({ ...rules, scanNames: e.target.checked })} />
          Сканы на Диске называть по шаблону имени сканов (его меняют в «Переименовать по шаблону»), если указано, что это за документ
        </label>
        <div className="row">
          <button className="btn btn--sm btn--ghost" disabled={readOnly} onClick={() => onChange(DEFAULT_RULES)}>
            Вернуть правила по умолчанию
          </button>
        </div>
        <span className="small muted">Правила применяются к новым папкам и файлам. Уже созданное на Диске не переименовывается само.</span>
      </div>
    </details>
  );
}

export function DriveView({ cases }: { cases: CasesApi }) {
  const { workspace } = useWorkspace();
  const auth = useGoogleAuth();
  const toast = useToast();
  const people = usePeople();
  const vars = useVariables();
  const templates = useTemplates();
  const { store, doc, loaded, readOnly } = useDriveDoc();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'create' | 'rename' | 'color' | 'person'; node: DriveNode } | null>(null);
  const av = googleAvailability();
  const nameOf = useMemo(() => new Map(people.records.map((r) => [r.id, fioText(r.fields)])), [people.records]);

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!store) return;
    setBusy(label);
    try {
      await ensureToken();
      await fn();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const pushAll = () =>
    run('pushAll', async () => {
      if (!workspace) return;
      let sent = 0;
      let failed = 0;
      const linked = cases.cases.filter((c) => personNode(store!.get().data, c.personId));
      for (const [i, c] of linked.entries()) {
        const record = people.records.find((r) => r.id === c.personId);
        if (!record) continue;
        const d = store!.get().data;
        const nameFor = makeNameFor(d, c, record, templates.scanName, vars.items);
        const rows = personStatus(await localFiles(workspace, c), d.files.filter((f) => f.personId === c.personId), getDevice().id, nameFor);
        recordRows(store!, rows);
        setProgress({ done: i, total: linked.length });
        const r = await pushFiles(workspace, store!, c, rows, nameFor);
        sent += r.ok;
        failed += r.failed.length;
      }
      toast(`Отправлено на Google Диск: ${sent}${failed ? `, не получилось: ${failed}` : ''}. Бойцов с папкой на Диске: ${linked.length}.`);
    });

  if (!av.ok || !auth.signedIn) return <GoogleBar hint="Войдите в Google, чтобы подключить папку на Google Диске." />;
  if (!loaded) return <div className="loading">Загрузка…</div>;

  const renderRow = (node: DriveNode, depth: number): ReactNode => {
    const kids = childrenOf(doc, node.id);
    const isRoot = node.id === doc.root;
    return (
      <Fragment key={node.id}>
        <div className="tree-row dela-drive-row" style={{ paddingLeft: depth * 20 + 4 }}>
          <Folder size={18} style={{ color: node.color ?? 'var(--text-faint)' }} fill={node.color ? 'currentColor' : 'none'} />
          <span className="spacer">
            <span className={node.state ? 'chip--off' : ''}>{node.name}</span>{' '}
            {node.personId && !node.section && (
              <span className="chip chip--user">
                <UserRound size={12} /> {nameOf.get(node.personId) || 'боец'}
              </span>
            )}
            {node.section && <span className="chip">раздел: {SECTIONS.find((s) => s.id === node.section)?.title}</span>}
            {doc.peopleParent === node.id && <span className="chip">сюда — новые папки бойцов</span>}
            {node.state && <span className="chip chip--error">{node.state === 'trashed' ? 'в корзине' : 'пропала'}</span>}
          </span>
          <a className="icon-btn icon-btn--sm" href={folderUrl(node.id)} target="_blank" rel="noreferrer" aria-label="Открыть на Google Диске" data-tip="Открыть на Google Диске">
            <ExternalLink size={16} />
          </a>
          <Menu
            label={`Действия с папкой «${node.name}»`}
            actions={[
              { label: 'Создать папку внутри', icon: <FolderPlus size={16} />, onClick: () => setDialog({ kind: 'create', node }), disabled: readOnly || !!node.state },
              { label: 'Привязать папки, которые уже есть внутри', icon: <Link2 size={16} />, onClick: () => void run('link', async () => void toast(`Привязано папок: ${(await linkChildren(store!, node.id)).length}`)), disabled: readOnly },
              { label: 'Новые папки бойцов создавать здесь', icon: <Users size={16} />, onClick: () => store!.update((d) => ({ ...d, peopleParent: node.id })), disabled: readOnly || !!node.personId },
              node.personId && !node.section
                ? { label: 'Это не папка бойца', icon: <UserRound size={16} />, onClick: () => assignPerson(store!, node, null), disabled: readOnly }
                : { label: 'Это папка бойца…', icon: <UserRound size={16} />, onClick: () => setDialog({ kind: 'person', node }), disabled: readOnly || isRoot || !!node.section },
              { label: 'Переименовать', icon: <PenLine size={16} />, onClick: () => setDialog({ kind: 'rename', node }), disabled: readOnly },
              { label: 'Цвет папки', icon: <Palette size={16} />, onClick: () => setDialog({ kind: 'color', node }), disabled: readOnly },
              {
                label: isRoot ? 'Отключить папку от приложения' : 'Убрать из древа (на Диске останется)',
                icon: <Unlink size={16} />,
                onClick: () => confirm(`Убрать «${node.name}»${kids.length ? ' и всё внутри' : ''} из древа приложения? На Google Диске ничего не удалится.`) && unlinkNode(store!, node),
                disabled: readOnly,
              },
              ...(isRoot
                ? []
                : [
                    {
                      label: 'В корзину на Google Диске',
                      icon: <Trash2 size={16} />,
                      onClick: () => confirm(`Переместить «${node.name}» со всем содержимым в корзину Google Диска?`) && void run('trash', () => trashNode(store!, node)),
                      disabled: readOnly,
                    },
                  ]),
            ]}
          />
        </div>
        {kids.map((k) => renderRow(k, depth + 1))}
      </Fragment>
    );
  };

  const root = doc.nodes.find((n) => n.id === doc.root);
  return (
    <div className="stack">
      <GoogleBar />
      {!root ? (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Подключите папку на Google Диске</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Выберите папку, которую вам выдали для работы (обычно она в разделе «Доступные мне»). Нужны права редактора. Внутри неё вы сами
            ведёте древо: создаёте папки отрядов и бойцов или привязываете те, что уже есть, — приложение видит только их.
          </p>
          <div>
            <button className="btn btn--primary" disabled={!!busy || readOnly} onClick={() => void run('connect', async () => void ((await connectRoot(store!)) && toast('Папка подключена')))}>
              {busy === 'connect' ? <Loader2 size={16} className="spin" /> : <Link2 size={16} />} Выбрать папку на Google Диске
            </button>
          </div>
        </section>
      ) : (
        <section className="card stack">
          <div className="section-title">
            <Folder size={18} className="brand-icon" />
            <h2 className="spacer" style={{ margin: 0 }}>
              Папки на Google Диске
            </h2>
            <button className="btn btn--sm" disabled={!!busy} onClick={() => void run('check', async () => {
              const r = await checkDrive(store!);
              toast(`Диск проверен: изменилось ${r.changed}, пропало ${r.missing}${r.noAccess ? `, не показано приложению ${r.noAccess}` : ''}.`);
            })}>
              {busy === 'check' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Проверить Диск
            </button>
            <button className="btn btn--sm btn--primary" disabled={!!busy} onClick={() => void pushAll()} data-tip="Новые и изменённые файлы всех бойцов, у которых есть папка на Диске">
              {busy === 'pushAll' ? <Loader2 size={14} className="spin" /> : <CloudUpload size={14} />} Отправить всё изменённое
            </button>
          </div>
          {progress && <progress value={progress.done} max={progress.total} style={{ width: '100%' }} />}
          <div className="tree">
            {renderRow(root, 0)}
          </div>
          <div className="small muted">
            Папки бойцов: отметьте папку как «папку бойца» или создайте её из личной папки бойца (вкладка «Личная папка»). Файлы бойцов
            приложение раскладывает внутри по правилам ниже.
          </div>
        </section>
      )}
      {root && <RulesCard rules={doc.rules} readOnly={readOnly} onChange={(rules) => store!.update((d) => ({ ...d, rules }))} />}
      {readOnly && <Alert kind="warning">Файл связи с Google Диском открыт только для чтения (создан более новой версией или повреждён).</Alert>}
      {dialog?.kind === 'create' && (
        <FolderDialog
          title={`Новая папка в «${dialog.node.name}»`}
          name=""
          onClose={() => setDialog(null)}
          onSave={(name, color) => {
            setDialog(null);
            void run('create', async () => void toast(`Создана папка «${(await createChild(store!, dialog.node.id, name, color)).name}»`));
          }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <FolderDialog
          title="Переименовать папку"
          name={dialog.node.name}
          color={dialog.node.color}
          onClose={() => setDialog(null)}
          onSave={(name, color) => {
            setDialog(null);
            void run('rename', async () => {
              if (name !== dialog.node.name) await renameNode(store!, dialog.node, name);
              if (color && color !== dialog.node.color) await colorNode(store!, dialog.node, color);
            });
          }}
        />
      )}
      {dialog?.kind === 'color' && (
        <FolderDialog
          title={`Цвет папки «${dialog.node.name}»`}
          color={dialog.node.color ?? FOLDER_COLORS[0].rgb}
          onClose={() => setDialog(null)}
          onSave={(_, color) => {
            setDialog(null);
            if (color) void run('color', () => colorNode(store!, dialog.node, color));
          }}
        />
      )}
      {dialog?.kind === 'person' && (
        <PersonDialog
          onClose={() => setDialog(null)}
          onPick={(personId) => {
            assignPerson(store!, dialog.node, personId);
            setDialog(null);
            toast(`Папка «${dialog.node.name}» — папка бойца ${nameOf.get(personId) ?? ''}`);
          }}
        />
      )}
    </div>
  );
}
