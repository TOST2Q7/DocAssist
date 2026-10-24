import { Award, Camera, Check, File as FileIcon, FileKey, FileSpreadsheet, Folder, Loader2, PenLine, ScanLine, Search, UserPlus, UserX, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gramotkaPath } from '@/core/gramotka/store';
import { fioText, usePeople } from '@/core/people/people';
import type { FileDropProps } from '@/core/registry/types';
import { extName, joinPath, splitPath } from '@/core/storage/types';
import { MOUNT_ROOT } from '@/core/workspace/workspace';
import { formatBytes, plural } from '@/core/util/format';
import { useVariables } from '@/core/variables/variables';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import { GramotkiNotice } from '@/ui/GramotkiGate';
import { WorkspaceChooser } from '@/ui/WorkspaceGate';
import { ACHIEVEMENT_LEVELS, APP_ID, guessScanKind, SCAN_KINDS } from '../constants';
import { useCases } from '../model/cases';
import { fileStem, fioFields, guessIncomingKind, INCOMING_KIND_BY_ID, INCOMING_KINDS, sectionFolder, strongGuess, type IncomingKind } from '../model/incoming';
import { personGender, placeholderValues } from '../model/placeholders';
import { scanName } from '../model/scanNames';
import { useTemplates } from '../model/templates';
import { isImageName } from '../model/transfer';
import { GramotkaStep } from './GramotkaStep';

/*
 * Окно «Новый файл» — после того как файл перетащили в окно сайта.
 * По пунктам: что за файл → что за скан → на чьё имя закрепить → название и сохранение.
 * Файл ложится в личную папку человека — в тот же раздел и с той же подписью, что и кнопкой «Добавить»
 * на вкладке «Личная папка». Ответы угадываются по имени и типу файла, человек только подтверждает.
 * Несколько файлов идут по очереди: у следующего уже выбраны тот же человек и вид файла.
 * Грамотка (боец целиком) — свой пункт: временный ключ и приём.
 */

type StepId = 'kind' | 'doc' | 'owner' | 'save' | 'gramotka';

const STEP_TITLES: Record<StepId, string> = {
  kind: 'Что за файл',
  doc: 'Какой документ',
  owner: 'На чьё имя закрепить',
  save: 'Название и сохранение',
  gramotka: 'Принять грамотку',
};

const KIND_ICONS: Record<IncomingKind, LucideIcon> = {
  scans: ScanLine,
  photos: Camera,
  achievements: Award,
  characteristic: PenLine,
  table: FileSpreadsheet,
  gramotka: FileKey,
  other: FileIcon,
};

function stepsFor(kind: IncomingKind): StepId[] {
  if (kind === 'gramotka') return ['kind', 'gramotka'];
  if (kind === 'table') return ['kind', 'save'];
  if (kind === 'scans') return ['kind', 'doc', 'owner', 'save'];
  return ['kind', 'owner', 'save'];
}

/** Чей файл: человек из базы, новый (по ФИО) или ничей — только для «Другого». */
type Owner = { personId: string } | { fio: string } | 'none';

interface Answers {
  kind: IncomingKind;
  /** Что за скан — из SCAN_KINDS. */
  doc: string | null;
  /** Название для «Другое». */
  docTitle: string;
  owner: Owner | null;
  /** Название файла без расширения; null — подбирается по ответам. */
  name: string | null;
  /** Сделать фото основным; null — само: если основного ещё нет. */
  mainPhoto: boolean | null;
  achievement: { title: string; date: string; level: string };
  /** Таблицу — сразу открыть в «Проверке анкет». */
  openAfter: boolean;
}

const NO_ACHIEVEMENT = { title: '', date: '', level: '' };

const firstAnswers = (file: File): Answers => ({
  kind: guessIncomingKind(file.name, file.type),
  doc: guessScanKind(file.name) ?? null,
  docTitle: '',
  owner: null,
  name: null,
  mainPhoto: null,
  achievement: NO_ACHIEVEMENT,
  openAfter: true,
});

/** Ответы для следующего файла: тот же человек и вид файла (если имя файла не говорит другого). */
function nextAnswers(prev: Answers, file: File): Answers {
  const kind = strongGuess(file.name, file.type) ?? prev.kind;
  const guessed = guessScanKind(file.name);
  const keep = kind === prev.kind && !guessed;
  return {
    ...prev,
    kind,
    doc: guessed ?? (keep ? prev.doc : null),
    docTitle: keep ? prev.docTitle : '',
    owner: prev.owner === 'none' && kind !== 'other' ? null : prev.owner,
    name: null,
    mainPhoto: null,
    achievement: NO_ACHIEVEMENT,
  };
}

const docLabel = (a: Answers) => (a.doc === 'Другое' ? a.docTitle.trim() || 'Другое' : (a.doc ?? ''));

function answered(a: Answers, step: StepId, name: string): boolean {
  if (step === 'doc') return !!a.doc;
  if (step === 'owner') return a.owner !== null && (a.owner !== 'none' || a.kind === 'other');
  if (step === 'save') return !!name.trim();
  if (step === 'gramotka') return false;
  return true;
}

const ownerKey = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const anketaUrl = (path: string) => `/apps/anketa?file=${encodeURIComponent(path)}`;
const caseUrl = (personId?: string) => (personId ? `/apps/lichnye-dela?p=${encodeURIComponent(personId)}&tab=folder` : '/apps/lichnye-dela');

/** Картинку видно сразу (нажатие — крупнее), остальное — значком. */
function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  useEffect(() => {
    setBig(false);
    if (!file.type.startsWith('image/') && !isImageName(file.name)) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) {
    const Icon = KIND_ICONS[guessIncomingKind(file.name, file.type)];
    return (
      <div className="incoming__thumb">
        <Icon size={28} />
      </div>
    );
  }
  return (
    <button type="button" className={`incoming__thumb ${big ? 'is-big' : ''}`} onClick={() => setBig((b) => !b)} aria-label={big ? 'Уменьшить' : 'Показать крупнее'}>
      {/* HEIC и другие форматы, которые браузер не показывает, — значком. */}
      <img src={url} alt="" onError={() => setUrl(null)} />
    </button>
  );
}

interface Candidate {
  personId: string;
  fio: string;
  key: string;
  sub: string;
}

/** Выбор человека: поиск по базе людей; нового — просто написать ФИО. */
function OwnerStep({ value, kind, candidates, fileName, onChoose }: { value: Owner | null; kind: IncomingKind; candidates: Candidate[]; fileName: string; onChoose: (o: Owner) => void }) {
  const [query, setQuery] = useState(value && value !== 'none' && 'fio' in value ? value.fio : '');
  const [active, setActive] = useState(0);
  const q = ownerKey(query);
  // Фамилия в имени файла («Фамилия паспорт.jpg») — такой человек в списке первым.
  const nameWords = useMemo(() => new Set(ownerKey(fileName).split(/[^\p{L}\p{N}]+/u)), [fileName]);
  const list = useMemo(() => {
    const tokens = q ? q.split(' ') : [];
    return candidates
      .filter((c) => tokens.every((t) => c.key.includes(t)))
      .map((c) => ({ ...c, hint: nameWords.has(c.key.split(' ')[0]) }))
      .sort((x, y) => Number(y.hint) - Number(x.hint));
  }, [candidates, q, nameWords]);
  const fields = q && !list.some((c) => c.key === q) ? fioFields(query) : null;
  const fresh = fields ? fioText(fields) : '';
  const isSelected = (c: Candidate) => !!value && value !== 'none' && 'personId' in value && value.personId === c.personId;

  return (
    <div className="stack stack--s">
      <div className="search-box">
        <Search size={16} className="faint" />
        <input
          className="input"
          data-autofocus=""
          value={query}
          placeholder="Фамилия Имя Отчество"
          aria-label="ФИО"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(list.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (list[active]) onChoose({ personId: list[active].personId });
              else if (fresh) onChoose({ fio: fresh });
            }
          }}
        />
      </div>
      {list.length > 0 && (
        <div className="owner-list" role="listbox" aria-label="Люди">
          {list.slice(0, 100).map((c, i) => (
            <button
              key={c.personId}
              type="button"
              role="option"
              aria-selected={isSelected(c)}
              className={`owner-opt ${i === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => onChoose({ personId: c.personId })}
            >
              <span className="owner-opt__name">{c.fio}</span>
              <span className="owner-opt__sub">{[c.hint && 'есть в имени файла', c.sub].filter(Boolean).join(' · ')}</span>
              {isSelected(c) && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
      {!candidates.length && !q && <div className="small muted">В базе людей пока никого нет — напишите ФИО, и человек добавится.</div>}
      {!!q && !list.length && !fresh && <div className="small muted">Напишите фамилию и имя.</div>}
      <div className="row">
        {fresh && (
          <button type="button" className="btn btn--sm btn--primary" onClick={() => onChoose({ fio: fresh })}>
            <UserPlus size={14} /> Новый человек: «{fresh}»
          </button>
        )}
        {kind === 'other' && (
          <button type="button" className={`btn btn--sm ${value === 'none' ? 'is-selected' : ''}`} aria-pressed={value === 'none'} onClick={() => onChoose('none')}>
            <UserX size={14} /> Не закреплять — просто в рабочую папку
          </button>
        )}
      </div>
    </div>
  );
}

interface Saved {
  /** Путь в рабочей папке. */
  path: string;
  kind: IncomingKind;
  personId?: string;
  openAfter: boolean;
  /** Принятая грамотка: чья и что с ней стало. */
  fio?: string;
  how?: string;
}

/** Где лежит файл — понятными словами: «Грамотка «Фамилия Имя» › Сканы › скан.jpg». */
function placeText(path: string, workspaceLabel: string, fio: string): string {
  const parts = splitPath(path);
  if (parts[0] === MOUNT_ROOT) return [`Грамотка «${fio || 'человека'}»`, ...parts.slice(2)].join(' › ');
  return [workspaceLabel, ...parts].filter(Boolean).join(' › ');
}

export default function IncomingDialog({ files, onClose }: FileDropProps) {
  const { workspace } = useWorkspace();
  const people = usePeople();
  const cases = useCases();
  const templates = useTemplates();
  const vars = useVariables();
  const toast = useToast();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [a, setA] = useState<Answers>(() => firstAnswers(files[0]));
  const [step, setStep] = useState<StepId>('kind');
  const [saved, setSaved] = useState<Saved[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  // Люди, добавленные в этом окне: в базе людей они появятся в списке не сразу.
  const created = useRef(new Map<string, Record<string, string>>());

  const file = files[index];
  const steps = stepsFor(a.kind);
  const at = Math.max(0, steps.indexOf(step));
  const rest = files.length - index - 1;
  const guess = useMemo(() => ({ kind: guessIncomingKind(file.name, file.type), doc: guessScanKind(file.name) }), [file]);
  const patch = (p: Partial<Answers>) => setA((x) => ({ ...x, ...p }));
  const next = (from: StepId, kind = a.kind) => {
    const s = stepsFor(kind);
    setStep(s[s.indexOf(from) + 1] ?? 'save');
  };

  /** Данные человека, за которым закрепляется файл. */
  const ownerOf = (o: Owner | null): { personId?: string; fields: Record<string, string> } | null => {
    if (!o || o === 'none') return null;
    if ('fio' in o) {
      const fields = fioFields(o.fio);
      return fields ? { fields } : null;
    }
    const fields = people.records.find((r) => r.id === o.personId)?.fields ?? created.current.get(o.personId);
    return fields ? { personId: o.personId, fields } : null;
  };

  /** Название по ответам: скан — по шаблону из «Шаблонов документов», остальное — как файл назывался. */
  const nameOf = (x: Answers, f: File): string => {
    if (x.name !== null) return x.name;
    const who = x.kind === 'table' ? null : ownerOf(x.owner);
    if (x.kind !== 'scans' || !x.doc || !who) return fileStem(f.name);
    const c = who.personId ? cases.get(who.personId) : undefined;
    const ctx = { values: placeholderValues({ fields: who.fields }, c), gender: personGender(who.fields), vars: vars.items };
    const doc = x.doc === 'Другое' ? x.docTitle.trim() || fileStem(f.name) : x.doc;
    const to = scanName(templates.scanName, { rel: f.name, doc }, 0, ctx).to;
    const ext = extName(f.name);
    return ext ? to.slice(0, -(ext.length + 1)) : to;
  };

  /** Папка, куда ляжет файл (у нового человека её ещё нет — появится вместе с грамоткой). */
  const folderOf = (x: Answers): string | null => {
    const who = x.kind === 'table' ? null : ownerOf(x.owner);
    if (!who) return '';
    if (!who.personId) return null;
    return joinPath(gramotkaPath(who.personId), sectionFolder(x.kind));
  };

  const name = nameOf(a, file);
  const ext = extName(file.name);
  const toPerson = a.kind !== 'table' && a.owner !== 'none';
  const canSave = !!workspace && !busy && a.kind !== 'gramotka' && steps.every((s) => answered(a, s, name));
  const folder = folderOf(a);

  // Фокус — на главный элемент пункта, чтобы отвечать с клавиатуры.
  useEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [step, index, !!workspace]);

  // Куда именно ляжет файл (с « (2)», если имя занято).
  const want = `${name.trim()}${ext ? `.${ext}` : ''}`;
  useEffect(() => {
    if (!workspace || step !== 'save' || !name.trim()) return;
    if (folder === null) {
      setPreview(want);
      return;
    }
    let alive = true;
    void workspace.freeName(folder, want).then((n) => alive && setPreview(joinPath(folder, n)));
    return () => {
      alive = false;
    };
  }, [workspace, step, folder, want, name, index, saved.length]);

  const candidates = useMemo(() => {
    const out: Candidate[] = [];
    for (const r of people.records) {
      const fio = fioText(r.fields);
      if (!fio) continue;
      const c = cases.get(r.id);
      out.push({ personId: r.id, fio, key: ownerKey(fio), sub: [r.fields['person.birthDate'], r.fields['rso.squad'], c?.files && Object.keys(c.files).length ? 'есть сканы' : ''].filter(Boolean).join(' · ') });
    }
    return out.sort((x, y) => x.fio.localeCompare(y.fio, 'ru'));
  }, [people.records, cases]);

  // Итог — уведомлением после закрытия окна.
  const finish = (done: Saved[]) => {
    onClose();
    if (!done.length) return;
    const table = [...done].reverse().find((d) => d.openAfter);
    if (table) navigate(anketaUrl(table.path));
    const last = done[done.length - 1];
    const who = new Set(done.map((d) => d.personId).filter(Boolean));
    const open = who.size === 1 ? caseUrl([...who][0]) : who.size ? caseUrl() : '/workspace';
    if (done.length === 1 && last.kind === 'table') {
      toast(`Таблица «${last.path}» добавлена в рабочую папку`, last.openAfter ? undefined : { label: 'Открыть', run: () => navigate(anketaUrl(last.path)) });
    } else if (done.length === 1) {
      toast(`Сохранено: ${splitPath(last.path).pop()}`, { label: 'Открыть папку', run: () => navigate(open) });
    } else {
      toast(`Сохранено ${done.length} ${plural(done.length, ['файл', 'файла', 'файлов'])}`, table ? undefined : { label: 'Открыть папку', run: () => navigate(open) });
    }
  };
  // Окно закрывают крестиком или Esc — уже сохранённое всё равно показываем.
  // Обработчик постоянный: Modal при каждой его смене заново ставит фокус.
  const closeRef = useRef(() => finish(saved));
  closeRef.current = () => finish(saved);
  const close = useCallback(() => closeRef.current(), []);

  const goTo = (i: number, prev: Answers) => {
    const n = nextAnswers(prev, files[i]);
    setIndex(i);
    setA(n);
    setStep(n.kind !== prev.kind ? 'kind' : (stepsFor(n.kind).find((s) => s !== 'kind' && !answered(n, s, nameOf(n, files[i]))) ?? 'save'));
    setPreview('');
  };

  const skip = () => (rest > 0 ? goTo(index + 1, a) : finish(saved));

  /** Записать один файл. Новый человек добавляется в базу людей, личная папка создаётся сама. */
  const saveOne = async (f: File, x: Answers): Promise<Saved> => {
    const ws = workspace!;
    const fileExt = extName(f.name);
    const wanted = `${nameOf(x, f).trim()}${fileExt ? `.${fileExt}` : ''}`;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const who = x.kind === 'table' ? null : ownerOf(x.owner);
    if (!who) {
      const n = await ws.freeName('', wanted);
      await ws.writeBytes(n, bytes);
      return { path: n, kind: x.kind, openAfter: x.kind === 'table' && x.openAfter };
    }
    let personId = who.personId;
    if (!personId) {
      personId = await people.add(who.fields, APP_ID);
      created.current.set(personId, who.fields);
    }
    const c = await cases.ensure(personId, who.fields);
    const section = sectionFolder(x.kind);
    const dir = joinPath(c.folder, section);
    const n = await ws.freeName(dir, wanted);
    const rel = joinPath(section, n);
    await ws.writeBytes(joinPath(dir, n), bytes);
    if (x.kind === 'scans' && x.doc) cases.setFileNote(personId, rel, { kind: x.doc, ...(x.doc === 'Другое' && x.docTitle.trim() ? { title: x.docTitle.trim() } : {}) });
    if (x.kind === 'photos' && (x.mainPhoto ?? !c.photo)) cases.update(personId, (p) => ({ ...p, photo: rel }));
    const ach = x.achievement;
    if (x.kind === 'achievements' && ach.title.trim()) {
      cases.addAchievement(personId, { date: ach.date.trim(), title: ach.title.trim(), ...(ach.level ? { level: ach.level } : {}), file: rel });
    }
    return { path: joinPath(dir, n), kind: x.kind, personId, openAfter: false };
  };

  /** Сохранить текущий файл или (all) его и все оставшиеся с теми же ответами. */
  const save = async (all: boolean) => {
    if (!workspace || !canSave) return;
    setBusy(true);
    setError(null);
    const done = [...saved];
    const end = all ? files.length - 1 : index;
    let cur = a;
    let i = index;
    try {
      for (; i <= end; i++) {
        const f = files[i];
        // «Так же»: тот же человек и вид файла; что за скан — по имени файла, если угадывается.
        // Основное фото и запись о достижении — только у первого файла.
        if (i > index) cur = { ...cur, doc: guessScanKind(f.name) ?? a.doc, mainPhoto: null, achievement: NO_ACHIEVEMENT };
        const r = await saveOne(f, cur);
        done.push(r);
        // Новый человек уже в базе — дальше файлы закрепляются за ним.
        if (r.personId) cur = { ...cur, owner: { personId: r.personId } };
      }
    } catch (e) {
      setSaved(done);
      setBusy(false);
      if (i !== index) goTo(i, cur);
      else setA(cur);
      setError(`Не удалось сохранить «${files[i].name}»: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setSaved(done);
    setBusy(false);
    if (i < files.length) goTo(i, cur);
    else finish(done);
  };

  const summary = (s: StepId): string => {
    if (s === 'kind') return INCOMING_KIND_BY_ID[a.kind].title;
    if (s === 'doc') return docLabel(a);
    if (s === 'owner') {
      if (a.owner === 'none') return 'Не закреплять';
      const who = ownerOf(a.owner);
      return who ? `${fioText(who.fields)}${who.personId ? '' : ' (новый)'}` : '';
    }
    return '';
  };

  /** Грамотку приняли — дальше следующий файл или итог. */
  const accepted = (r: { id: string; fio: string; how: string }) => {
    const done = [...saved, { path: gramotkaPath(r.id), kind: 'gramotka' as const, personId: r.id, openAfter: false, fio: r.fio, how: r.how }];
    setSaved(done);
    if (index + 1 < files.length) goTo(index + 1, a);
    else finish(done);
  };

  const body = (s: StepId) => {
    if (s === 'kind') {
      return (
        <div className="choice-grid">
          {INCOMING_KINDS.map((k) => {
            const Icon = KIND_ICONS[k.id];
            return (
              <button
                key={k.id}
                type="button"
                className={`choice ${a.kind === k.id ? 'is-selected' : ''}`}
                aria-pressed={a.kind === k.id}
                data-autofocus={a.kind === k.id ? '' : undefined}
                onClick={() => {
                  patch({ kind: k.id, owner: a.owner === 'none' && k.id !== 'other' ? null : a.owner });
                  next('kind', k.id);
                }}
              >
                <Icon size={20} className="choice__icon" />
                <span className="choice__text">
                  <span className="choice__title">
                    {k.title}
                    {k.id === guess.kind && <span className="badge badge--beta">похоже</span>}
                  </span>
                  <span className="choice__hint">{k.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      );
    }
    if (s === 'doc') {
      return (
        <div className="stack stack--s">
          <div className="choice-grid choice-grid--compact">
            {SCAN_KINDS.map((k, i) => (
              <button
                key={k}
                type="button"
                className={`choice choice--compact ${a.doc === k ? 'is-selected' : ''}`}
                aria-pressed={a.doc === k}
                data-autofocus={a.doc === k || (!a.doc && i === 0) ? '' : undefined}
                onClick={() => {
                  patch({ doc: k });
                  if (k !== 'Другое') next('doc');
                }}
              >
                <span className="choice__title">
                  {k === 'Другое' ? 'Другой документ…' : k}
                  {k === guess.doc && <span className="badge badge--beta">похоже</span>}
                </span>
              </button>
            ))}
          </div>
          {a.doc === 'Другое' && (
            <label className="field">
              <span className="field__label">Как называется документ</span>
              <input
                className="input"
                autoFocus
                value={a.docTitle}
                placeholder="Например: Справка из военкомата"
                onChange={(e) => patch({ docTitle: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    next('doc');
                  }
                }}
              />
            </label>
          )}
        </div>
      );
    }
    if (s === 'gramotka') return <GramotkaStep file={file} onAccepted={accepted} />;
    if (s === 'owner') {
      return (
        <>
        <GramotkiNotice text="Грамотки закрыты — откройте, чтобы выбрать человека из списка." />
        <OwnerStep
          value={a.owner}
          kind={a.kind}
          candidates={candidates}
          fileName={file.name}
          onChoose={(o) => {
            patch({ owner: o });
            next('owner');
          }}
        />
        </>
      );
    }
    const who = ownerOf(a.owner);
    const c = who?.personId ? cases.get(who.personId) : undefined;
    return (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <label className="field">
          <span className="field__label">Название файла</span>
          <span className="input-suffix">
            <input className="input" data-autofocus="" value={name} onChange={(e) => patch({ name: e.target.value })} />
            {ext && <span className="input-suffix__ext">.{ext}</span>}
          </span>
          {a.name !== null && (
            <button type="button" className="link-btn field__hint" onClick={() => patch({ name: null })}>
              Вернуть название по ответам
            </button>
          )}
        </label>
        {a.kind === 'photos' && (
          <label className="check">
            <input type="checkbox" checked={a.mainPhoto ?? !c?.photo} onChange={(e) => patch({ mainPhoto: e.target.checked })} />
            Основное фото — для личной карточки и пакета перевода
          </label>
        )}
        {a.kind === 'achievements' && (
          <div className="stack stack--s">
            <label className="field">
              <span className="field__label">Что за достижение (можно позже)</span>
              <input className="input" value={a.achievement.title} placeholder="Грамота за победу в конкурсе …" data-kind="text" onChange={(e) => patch({ achievement: { ...a.achievement, title: e.target.value } })} />
            </label>
            <div className="grid-2 incoming__ach">
              <input className="input" value={a.achievement.date} placeholder="Дата (ДД.ММ.ГГГГ или год)" aria-label="Дата" onChange={(e) => patch({ achievement: { ...a.achievement, date: e.target.value } })} />
              <select className="select" value={a.achievement.level} aria-label="Уровень" onChange={(e) => patch({ achievement: { ...a.achievement, level: e.target.value } })}>
                <option value="">Уровень</option>
                {ACHIEVEMENT_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        {a.kind === 'table' && (
          <label className="check">
            <input type="checkbox" checked={a.openAfter} onChange={(e) => patch({ openAfter: e.target.checked })} />
            Открыть в «Проверке анкет»
          </label>
        )}
        {workspace && preview && (
          <div className="save-path small">
            <Folder size={14} />
            <span>{placeText(preview, workspace.label, who ? fioText(who.fields) : '')}</span>
          </div>
        )}
        {toPerson && who && !who.personId && <div className="small muted">Для «{fioText(who.fields)}» создастся грамотка — файл ляжет в неё.</div>}
        <button type="submit" hidden />
      </form>
    );
  };

  const last = saved[saved.length - 1];

  return (
    <Modal
      title={files.length > 1 ? `Новый файл — ${index + 1} из ${files.length}` : 'Новый файл'}
      className="incoming"
      onClose={close}
      footer={
        !workspace ? (
          <button className="btn" onClick={close}>
            Отмена
          </button>
        ) : (
          <>
            {files.length > 1 && (
              <button className="btn btn--ghost" onClick={skip} disabled={busy} data-tip="Не сохранять этот файл и перейти к следующему">
                Пропустить
              </button>
            )}
            <span className="spacer" />
            {at > 0 && (
              <button className="btn" onClick={() => setStep(steps[at - 1])} disabled={busy}>
                Назад
              </button>
            )}
            {step === 'gramotka' ? null : step !== 'save' ? (
              <button className="btn btn--primary" onClick={() => next(step)} disabled={!answered(a, step, name)}>
                Далее
              </button>
            ) : (
              <>
                {rest > 0 && (
                  <button className="btn" onClick={() => void save(true)} disabled={!canSave} data-tip="Тот же вид файла и тот же человек для всех оставшихся файлов">
                    Сохранить все ({rest + 1})
                  </button>
                )}
                <button className="btn btn--primary" onClick={() => void save(false)} disabled={!canSave}>
                  {busy && <Loader2 className="spin" size={16} />}
                  {rest > 0 ? 'Сохранить и дальше' : a.kind === 'table' && a.openAfter ? 'Сохранить и открыть' : 'Сохранить'}
                </button>
              </>
            )}
          </>
        )
      }
    >
      <div className="stack" ref={bodyRef}>
        <div className="incoming__file">
          <FilePreview file={file} />
          <div className="incoming__meta">
            <div className="incoming__name">{file.name}</div>
            <div className="small muted">
              {formatBytes(file.size)}
              {rest > 0 && ` · дальше ещё ${rest} ${plural(rest, ['файл', 'файла', 'файлов'])}`}
            </div>
          </div>
        </div>
        {last && <Alert kind="success">{last.kind === 'gramotka' ? `Принято: ${last.fio || 'грамотка'}` : `Сохранено: ${placeText(last.path, workspace?.label ?? '', '')}`}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        {!workspace ? (
          <>
            <Alert kind="info">Файлы хранятся в рабочей папке. Выберите её — и продолжим.</Alert>
            <WorkspaceChooser compact />
          </>
        ) : (
          <>
            <ol className="wizard">
              {steps.map((s, i) => {
                const current = s === step;
                const ok = s !== 'save' && answered(a, s, name);
                const reachable = steps.slice(0, i).every((p) => answered(a, p, name));
                return (
                  <li key={s} className={`wizard__step ${current ? 'is-current' : ok ? 'is-done' : ''}`}>
                    <button type="button" className="wizard__head" onClick={() => setStep(s)} disabled={current || !reachable || busy} aria-current={current ? 'step' : undefined}>
                      <span className="wizard__num">{ok && !current ? <Check size={14} /> : i + 1}</span>
                      <span className="wizard__title">{STEP_TITLES[s]}</span>
                      {!current && <span className="wizard__answer">{summary(s)}</span>}
                    </button>
                    {current && <div className="wizard__body">{body(s)}</div>}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </Modal>
  );
}
