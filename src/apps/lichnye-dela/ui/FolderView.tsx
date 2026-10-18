import { Award, Camera, Download, ExternalLink, FileText, FolderOutput, FolderPlus, PenLine, Plus, ScanLine, Star, Trash2, Upload, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fioText, usePeople, type PersonRecord } from '@/core/people/people';
import { baseName, joinPath, type FsEntry } from '@/core/storage/types';
import { downloadBytes, mimeFor, pickFiles } from '@/core/util/download';
import { formatBytes } from '@/core/util/format';
import { useVariables } from '@/core/variables/variables';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { Menu, type MenuAction } from '@/ui/Menu';
import { useToast } from '@/ui/Toast';
import { ACHIEVEMENT_LEVELS, guessScanKind, REQUIRED_SCANS, SCAN_KINDS, SECTION_BY_ID, type SectionId } from '../constants';
import { casePath, folderNameFor, type CasesApi, type PersonCase } from '../model/cases';
import { fillText, makeResolver, personGender, placeholderValues } from '../model/placeholders';
import { CHARACTERISTIC_DRAFT, templateDocx, useTemplates } from '../model/templates';
import { fileName, isImageName } from '../model/transfer';
import { shortFio } from '../model/names';
import { CaseDrive, DriveMark, useDriveMarks } from '../drive/CaseDrive';
import { Preview, Thumb } from './files';
import { openFile, saveFiles, useFolderFiles } from './hooks';
import { ScanActionDialog } from './ScanActionDialog';

interface SectionProps {
  c: PersonCase;
  cases: CasesApi;
  readOnly: boolean;
}

/** Кнопки файла: открыть, скачать, удалить. */
function useFileActions(c: PersonCase, cases: CasesApi) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const drive = useDriveMarks();
  return {
    preview,
    setPreview,
    open(rel: string) {
      if (!workspace) return;
      if (isImageName(rel)) setPreview(casePath(c, rel));
      else void openFile(workspace, casePath(c, rel));
    },
    async download(rel: string) {
      const bytes = await workspace?.readBytes(casePath(c, rel));
      if (bytes) downloadBytes(bytes, baseName(rel), mimeFor(rel));
    },
    async remove(rel: string) {
      if (!workspace || !confirm(`Удалить «${baseName(rel)}» из личной папки?`)) return;
      await workspace.remove(casePath(c, rel));
      cases.forgetFile(c.personId, rel);
      toast(`Удалено: ${baseName(rel)}`);
      await drive.onRemoved(rel);
    },
  };
}

function useSection(c: PersonCase, section: SectionId) {
  const dir = SECTION_BY_ID[section].folder;
  const files = useFolderFiles(casePath(c, dir));
  return { dir, files: files ?? [], loaded: files !== null, rel: (e: FsEntry) => joinPath(dir, e.name) };
}

async function upload(ws: ReturnType<typeof useWorkspace>['workspace'], c: PersonCase, section: SectionId): Promise<string[]> {
  if (!ws) return [];
  const s = SECTION_BY_ID[section];
  const files = await pickFiles(s.accept, true);
  const names = await saveFiles(ws, casePath(c, s.folder), files);
  return names.map((n) => joinPath(s.folder, n));
}

function PhotosSection({ c, cases, readOnly }: SectionProps) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const { files, rel } = useSection(c, 'photos');
  const act = useFileActions(c, cases);
  const main = c.photo ?? files.map(rel).find(isImageName);
  return (
    <section className="card stack">
      <div className="section-title">
        <Camera size={18} className="brand-icon" />
        <h3 className="spacer" style={{ margin: 0 }}>
          Фотографии
        </h3>
        <button
          className="btn btn--sm"
          disabled={readOnly}
          onClick={async () => {
            const added = await upload(workspace, c, 'photos');
            if (added.length && !c.photo) cases.update(c.personId, (x) => ({ ...x, photo: added.find(isImageName) }));
            if (added.length) toast(`Добавлено фото: ${added.length}`);
          }}
        >
          <Upload size={14} /> Добавить
        </button>
      </div>
      {files.length === 0 ? (
        <div className="small muted">Фото на документы — светлый фон, лицо по центру. Для пакета перевода оно обрежется до 3×4.</div>
      ) : (
        <div className="dela-thumbs">
          {files.map((e) => {
            const r = rel(e);
            const isMain = r === main;
            return (
              <div key={e.path} className={`dela-tile ${isMain ? 'is-main' : ''}`}>
                <Thumb path={e.path} onClick={() => act.open(r)} />
                <div className="dela-tile__bar">
                  <DriveMark rel={r} />
                  <button
                    className={`icon-btn icon-btn--sm ${isMain ? 'brand-icon' : ''}`}
                    onClick={() => cases.update(c.personId, (x) => ({ ...x, photo: r }))}
                    disabled={readOnly || isMain}
                    aria-label="Основное фото"
                    data-tip={isMain ? 'Основное фото — в карточку и пакет перевода' : 'Сделать основным'}
                  >
                    <Star size={16} fill={isMain ? 'currentColor' : 'none'} />
                  </button>
                  <button className="icon-btn icon-btn--sm" onClick={() => void act.download(r)} aria-label="Скачать" data-tip="Скачать">
                    <Download size={16} />
                  </button>
                  <button className="icon-btn icon-btn--sm" onClick={() => void act.remove(r)} disabled={readOnly} aria-label="Удалить" data-tip="Удалить">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {act.preview && <Preview path={act.preview} onClose={() => act.setPreview(null)} />}
    </section>
  );
}

interface FileRowProps extends SectionProps {
  rel: string;
  entry: FsEntry;
  kinds?: string[];
  act: ReturnType<typeof useFileActions>;
  /** Галочка выбора (для действий с несколькими файлами). */
  selected?: boolean;
  onSelect?: (on: boolean) => void;
  /** Дополнительные пункты меню «⋯». */
  extra?: MenuAction[];
}

function FileRow({ c, cases, rel, entry, readOnly, kinds, act, selected, onSelect, extra = [] }: FileRowProps) {
  const note = c.files[rel] ?? {};
  return (
    <div className={`list__item dela-file ${selected ? 'is-selected' : ''}`}>
      {onSelect && <input type="checkbox" className="dela-file__check" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Отметить ${entry.name}`} />}
      <Thumb path={entry.path} onClick={() => act.open(rel)} />
      <div className="list__main stack stack--s">
        <div className="list__title">
          {entry.name} <DriveMark rel={rel} />
        </div>
        <div className="list__sub">{formatBytes(entry.size)}</div>
        {kinds && (
          <div className="row row--nowrap">
            <select className="select select--sm" value={note.kind ?? ''} disabled={readOnly} onChange={(e) => cases.setFileNote(c.personId, rel, { ...note, kind: e.target.value || undefined })} aria-label="Что это за документ">
              <option value="">Что это?</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            {note.kind === 'Другое' && (
              <input className="input input--sm" placeholder="Название" value={note.title ?? ''} readOnly={readOnly} onChange={(e) => cases.setFileNote(c.personId, rel, { ...note, title: e.target.value })} aria-label="Название документа" />
            )}
          </div>
        )}
      </div>
      <Menu
        label={`Действия с файлом «${entry.name}»`}
        actions={[
          { label: 'Открыть', icon: <ExternalLink size={16} />, onClick: () => act.open(rel) },
          { label: 'Скачать', icon: <Download size={16} />, onClick: () => void act.download(rel) },
          ...extra,
          { label: 'Удалить', icon: <Trash2 size={16} />, onClick: () => void act.remove(rel), disabled: readOnly },
        ]}
      />
    </div>
  );
}

function ScansSection({ c, cases, readOnly, record }: SectionProps & { record: PersonRecord }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const { files, rel } = useSection(c, 'scans');
  const act = useFileActions(c, cases);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<{ mode: 'rename' | 'handout'; rels: string[] } | null>(null);
  const have = new Set(files.map((e) => c.files[rel(e)]?.kind).filter(Boolean));
  const missing = REQUIRED_SCANS.filter((k) => !have.has(k));
  const all = files.map(rel);
  const chosen = all.filter((r) => selected.has(r));
  // Ничего не отмечено — действие для всех сканов.
  const target = chosen.length ? chosen : all;
  const select = (r: string, on: boolean) =>
    setSelected((x) => {
      const n = new Set(x);
      if (on) n.add(r);
      else n.delete(r);
      return n;
    });
  return (
    <section className="card stack">
      <div className="section-title">
        <ScanLine size={18} className="brand-icon" />
        <h3 className="spacer" style={{ margin: 0 }}>
          Сканы документов
        </h3>
        <button
          className="btn btn--sm"
          disabled={readOnly}
          onClick={async () => {
            const added = await upload(workspace, c, 'scans');
            for (const r of added) {
              const kind = guessScanKind(baseName(r));
              if (kind) cases.setFileNote(c.personId, r, { kind });
            }
            if (added.length) toast(`Добавлено сканов: ${added.length}. Укажите, что это за документы.`);
          }}
        >
          <Upload size={14} /> Добавить
        </button>
      </div>
      {missing.length > 0 && (
        <div className="row small">
          <span className="muted">Нет скана:</span>
          {missing.map((k) => (
            <span key={k} className="chip">
              {k}
            </span>
          ))}
        </div>
      )}
      {files.length > 0 ? (
        <>
          <div className="row dela-scan-tools">
            <label className="check small">
              <input type="checkbox" checked={chosen.length === all.length} onChange={(e) => setSelected(e.target.checked ? new Set(all) : new Set())} aria-label="Отметить все сканы" />
              {chosen.length ? `Отмечено ${chosen.length}` : 'Все'}
            </label>
            <span className="spacer" />
            <button className="btn btn--sm" disabled={readOnly} onClick={() => setAction({ mode: 'rename', rels: target })} data-tip="Имя файла по шаблону с данными человека">
              <PenLine size={14} /> Переименовать{chosen.length ? '' : ' все'}
            </button>
            <button className="btn btn--sm" disabled={readOnly} onClick={() => setAction({ mode: 'handout', rels: target })} data-tip="Во временную папку для отдачи и загрузки">
              <FolderOutput size={14} /> В «Для выдачи»
            </button>
          </div>
          <div className="list">
            {files.map((e) => {
              const r = rel(e);
              return (
                <FileRow
                  key={e.path}
                  c={c}
                  cases={cases}
                  readOnly={readOnly}
                  rel={r}
                  entry={e}
                  kinds={SCAN_KINDS}
                  act={act}
                  selected={selected.has(r)}
                  onSelect={(on) => select(r, on)}
                  extra={[
                    { label: 'Переименовать по шаблону', icon: <PenLine size={16} />, onClick: () => setAction({ mode: 'rename', rels: [r] }), disabled: readOnly },
                    { label: 'В «Для выдачи»', icon: <FolderOutput size={16} />, onClick: () => setAction({ mode: 'handout', rels: [r] }), disabled: readOnly },
                  ]}
                />
              );
            })}
          </div>
        </>
      ) : (
        <div className="small muted">Картинки (JPEG, PNG) или PDF. На телефоне можно сразу сфотографировать документ.</div>
      )}
      {act.preview && <Preview path={act.preview} onClose={() => act.setPreview(null)} />}
      {action && <ScanActionDialog mode={action.mode} rels={action.rels} record={record} c={c} cases={cases} onClose={() => setAction(null)} onDone={() => setSelected(new Set())} />}
    </section>
  );
}

function AchievementsSection({ c, cases, readOnly }: SectionProps) {
  const { workspace } = useWorkspace();
  const { files, rel } = useSection(c, 'achievements');
  const act = useFileActions(c, cases);
  const [form, setForm] = useState({ date: '', title: '', level: '', file: '' });
  const linked = new Set(c.achievements.map((a) => a.file).filter(Boolean));
  const free = files.filter((e) => !linked.has(rel(e)));

  const add = () => {
    if (!form.title.trim()) return;
    cases.addAchievement(c.personId, { date: form.date.trim(), title: form.title.trim(), ...(form.level ? { level: form.level } : {}), ...(form.file ? { file: form.file } : {}) });
    setForm({ date: '', title: '', level: '', file: '' });
  };

  return (
    <section className="card stack">
      <div className="section-title">
        <Award size={18} className="brand-icon" />
        <h3 className="spacer" style={{ margin: 0 }}>
          Достижения
        </h3>
      </div>
      {c.achievements.length > 0 && (
        <div className="list">
          {c.achievements.map((a) => (
            <div key={a.id} className="list__item">
              <div className="list__main">
                <div className="list__title">{a.title}</div>
                <div className="list__sub">{[a.date, a.level].filter(Boolean).join(' · ')}</div>
              </div>
              {a.file && (
                <button className="btn btn--sm btn--ghost" onClick={() => act.open(a.file!)} data-tip={baseName(a.file)}>
                  <FileText size={14} /> файл
                </button>
              )}
              <button
                className="icon-btn"
                disabled={readOnly}
                onClick={() => confirm(`Удалить достижение «${a.title}»?${a.file ? '\nФайл останется в папке «Достижения».' : ''}`) && cases.removeAchievement(c.personId, a.id)}
                aria-label="Удалить достижение"
                data-tip="Удалить"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <form
          className="card card--flat stack stack--s"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="dela-ach-form">
            <input className="input" placeholder="Дата (ДД.ММ.ГГГГ или год)" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Дата" />
            <input className="input" placeholder="Грамота за победу в конкурсе …" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Достижение" data-kind="text" />
            <select className="select" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} aria-label="Уровень">
              <option value="">Уровень</option>
              {ACHIEVEMENT_LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <select className="select dela-grow" value={form.file} onChange={(e) => setForm({ ...form, file: e.target.value })} aria-label="Файл">
              <option value="">Без файла</option>
              {free.map((e) => (
                <option key={e.path} value={rel(e)}>
                  {e.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const added = await upload(workspace, c, 'achievements');
                if (added[0]) setForm((f) => ({ ...f, file: added[0] }));
              }}
            >
              <Upload size={16} /> Загрузить грамоту
            </button>
            <button type="submit" className="btn btn--primary" disabled={!form.title.trim()}>
              <Plus size={16} /> Добавить
            </button>
          </div>
        </form>
      )}
      {free.length > 0 && (
        <details>
          <summary className="small muted">Файлы без записи ({free.length})</summary>
          <div className="list" style={{ marginTop: 8 }}>
            {free.map((e) => (
              <FileRow key={e.path} c={c} cases={cases} readOnly={readOnly} rel={rel(e)} entry={e} act={act} />
            ))}
          </div>
        </details>
      )}
      {act.preview && <Preview path={act.preview} onClose={() => act.setPreview(null)} />}
    </section>
  );
}

function CharacteristicSection({ c, cases, readOnly, record }: SectionProps & { record: PersonRecord }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const vars = useVariables();
  const templates = useTemplates();
  const { files, rel } = useSection(c, 'characteristic');
  const act = useFileActions(c, cases);
  const [text, setText] = useState(c.characteristic);
  useEffect(() => setText(c.characteristic), [c.characteristic]);
  const resolver = () => makeResolver(placeholderValues(record, c), personGender(record.fields), vars.items);

  const save = (v: string) => {
    setText(v);
    cases.update(c.personId, (x) => ({ ...x, characteristic: v }));
  };
  const draft = () => {
    if (text.trim() && !confirm('Заменить текст характеристики заготовкой?')) return;
    const filled = fillText(CHARACTERISTIC_DRAFT, resolver().resolve)
      .split('\n')
      .filter((l) => l.trim())
      .join('\n');
    save(filled);
    toast('Заготовка вставлена — допишите своими словами');
  };
  const download = async () => {
    const t = templates.list.find((x) => x.id === 'characteristic');
    if (!t || !workspace) return;
    const data = templateDocx(t, resolver().resolve);
    const name = fileName('Характеристика', shortFio(fioText(record.fields)), 'docx');
    downloadBytes(data, name, mimeFor(name));
  };

  return (
    <section className="card stack">
      <div className="section-title">
        <PenLine size={18} className="brand-icon" />
        <h3 className="spacer" style={{ margin: 0 }}>
          Характеристика
        </h3>
        <button className="btn btn--sm" onClick={draft} disabled={readOnly}>
          <Wand2 size={14} /> Заготовка
        </button>
        <button className="btn btn--sm" onClick={() => void download()} disabled={!text.trim()}>
          <Download size={14} /> Word
        </button>
      </div>
      <textarea className="input dela-characteristic" value={text} readOnly={readOnly} rows={8} placeholder="Текст характеристики: каждый абзац — с новой строки. «Заготовка» вставит начало с данными бойца." onChange={(e) => save(e.target.value)} />
      <div className="small muted">
        Текст попадает в документ «Характеристика» (его вид — в «Шаблонах документов») и в пакет перевода. Подписанный скан характеристики можно положить сюда же:
      </div>
      <div className="row">
        <button
          className="btn btn--sm"
          disabled={readOnly}
          onClick={async () => {
            const added = await upload(workspace, c, 'characteristic');
            if (added.length) toast(`Добавлено файлов: ${added.length}`);
          }}
        >
          <Upload size={14} /> Добавить скан или файл
        </button>
      </div>
      {files.length > 0 && (
        <div className="list">
          {files.map((e) => (
            <FileRow key={e.path} c={c} cases={cases} readOnly={readOnly} rel={rel(e)} entry={e} act={act} />
          ))}
        </div>
      )}
      {act.preview && <Preview path={act.preview} onClose={() => act.setPreview(null)} />}
    </section>
  );
}

/** Файлы в самой личной папке, вне разделов, — например, перетащенные в окно сайта как «Другое». */
function OtherFilesSection({ c, cases, readOnly }: SectionProps) {
  const files = useFolderFiles(c.folder) ?? [];
  const act = useFileActions(c, cases);
  if (!files.length) return null;
  return (
    <section className="card stack">
      <div className="section-title">
        <FileText size={18} className="brand-icon" />
        <h3 className="spacer" style={{ margin: 0 }}>
          Другие файлы
        </h3>
      </div>
      <div className="list">
        {files.map((e) => (
          <FileRow key={e.path} c={c} cases={cases} readOnly={readOnly} rel={e.name} entry={e} act={act} />
        ))}
      </div>
      {act.preview && <Preview path={act.preview} onClose={() => act.setPreview(null)} />}
    </section>
  );
}

export function FolderView({ record, cases }: { record: PersonRecord; cases: CasesApi }) {
  const [, setParams] = useSearchParams();
  const toast = useToast();
  const people = usePeople();
  const { workspace } = useWorkspace();
  const c = cases.get(record.id);
  const [busy, setBusy] = useState(false);
  const readOnly = cases.readOnly;
  const expected = useMemo(() => folderNameFor(record.fields), [record.fields]);

  if (!cases.loaded) return <div className="loading">Загрузка…</div>;
  if (!c) {
    return (
      <div className="card empty stack">
        <FolderPlus size={32} className="faint" style={{ margin: '0 auto' }} />
        <div>Личной папки ещё нет.</div>
        <div className="small">В ней будут фотографии, сканы документов, достижения и характеристика.</div>
        <div>
          <button
            className="btn btn--primary"
            disabled={busy || readOnly || people.readOnly}
            onClick={async () => {
              setBusy(true);
              try {
                const made = await cases.ensure(record.id, record.fields);
                toast(`Создана папка «${made.folder}»`);
              } finally {
                setBusy(false);
              }
            }}
          >
            <FolderPlus size={16} /> Создать личную папку
          </button>
        </div>
      </div>
    );
  }

  const renamed = baseName(c.folder) !== expected && !baseName(c.folder).startsWith(`${expected} (`);
  return (
    <div className="stack">
      <div className="row small muted">
        <span>
          Папка: <strong>{c.folder}</strong>
        </span>
        {renamed && workspace && (
          <button
            className="btn btn--sm"
            disabled={busy || readOnly}
            onClick={async () => {
              setBusy(true);
              try {
                const folder = await cases.renameFolder(record.id, record.fields);
                if (folder) toast(`Папка переименована: ${folder}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            Переименовать по ФИО: «{expected}»
          </button>
        )}
      </div>
      {readOnly && <Alert kind="warning">Сведения личных дел открыты только для чтения (файл создан более новой версией DocAssist или повреждён).</Alert>}
      <CaseDrive c={c} record={record} cases={cases} onOpenDriveTab={() => setParams({ view: 'drive' })}>
        <div className="dela-sections">
          <PhotosSection c={c} cases={cases} readOnly={readOnly} />
          <ScansSection c={c} cases={cases} readOnly={readOnly} record={record} />
          <AchievementsSection c={c} cases={cases} readOnly={readOnly} />
          <CharacteristicSection c={c} cases={cases} readOnly={readOnly} record={record} />
          <OtherFilesSection c={c} cases={cases} readOnly={readOnly} />
        </div>
      </CaseDrive>
    </div>
  );
}

