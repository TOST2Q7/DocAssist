import { CheckCircle2, Download, FileText, Loader2, PackageCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fioText, usePeople } from '@/core/people/people';
import { extName } from '@/core/storage/types';
import { downloadBytes } from '@/core/util/download';
import { formatBytes } from '@/core/util/format';
import { uid } from '@/core/util/id';
import { useVariables } from '@/core/variables/variables';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { Modal } from '@/ui/Modal';
import { useToast } from '@/ui/Toast';
import { TRANSFER_REASONS, WORD_TEMPLATES_FOLDER } from '../constants';
import { safeName, type CasesApi } from '../model/cases';
import { shortFio } from '../model/names';
import { useTemplates } from '../model/templates';
import {
  buildTransferPackage,
  dateStamp,
  DEFAULT_OPTIONS,
  emptyTransferForm,
  freeFolder,
  packageFolder,
  savePackage,
  transferRecord,
  transferSides,
  zipPackage,
  type PackageFile,
  type PackageOptions,
  type TransferForm,
} from '../model/transfer';
import { useFolderFiles } from './hooks';
import { prepareImage } from './imagePrep';
import { sideText, useApplyTransfer } from './TransfersView';

interface Props {
  personIds: string[];
  cases: CasesApi;
  onClose: () => void;
}

interface Done {
  id: string;
  folder: string;
  zipName: string;
  zip: Uint8Array;
  files: PackageFile[];
  warnings: string[];
  people: string[];
  applied: boolean;
}

export function TransferDialog({ personIds, cases, onClose }: Props) {
  const { workspace } = useWorkspace();
  const people = usePeople();
  const vars = useVariables();
  const templates = useTemplates();
  const toast = useToast();
  const apply = useApplyTransfer(cases);
  const wordFiles = (useFolderFiles(WORD_TEMPLATES_FOLDER) ?? []).filter((e) => extName(e.name) === 'docx' && !e.name.startsWith('~$'));

  const [ids, setIds] = useState(personIds);
  const [form, setForm] = useState<TransferForm>(() => ({ ...emptyTransferForm(), ...cases.lastTransfer }));
  const [opts, setOpts] = useState<PackageOptions>(() => ({ ...DEFAULT_OPTIONS, templates: templates.list.filter((t) => t.forTransfer).map((t) => t.id), word: [] }));
  const [wordTouched, setWordTouched] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  // Свои шаблоны Word по умолчанию включены (пока их не трогали).
  const wordKey = wordFiles.map((e) => e.name).join('|');
  useEffect(() => {
    if (!wordTouched) setOpts((o) => ({ ...o, word: wordKey ? wordKey.split('|') : [] }));
  }, [wordKey, wordTouched]);
  // Шаблоны загрузились позже открытия окна.
  useEffect(() => {
    if (templates.loaded) setOpts((o) => ({ ...o, templates: o.templates.length ? o.templates : templates.list.filter((t) => t.forTransfer).map((t) => t.id) }));
  }, [templates.loaded, templates.list]);

  const persons = useMemo(() => ids.map((id) => people.records.find((r) => r.id === id)).filter((r) => !!r), [ids, people.records]);
  const others = people.records.filter((r) => !ids.includes(r.id)).sort((a, b) => fioText(a.fields).localeCompare(fioText(b.fields), 'ru'));
  const set = (k: keyof TransferForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const opt = <K extends keyof PackageOptions>(k: K, v: PackageOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const toggleIn = (k: 'templates' | 'word', id: string, on: boolean) => setOpts((o) => ({ ...o, [k]: on ? [...o[k], id] : o[k].filter((x) => x !== id) }));

  const checks: string[] = [];
  if (!form.toSquad.trim()) checks.push('Не указан новый отряд.');
  for (const r of persons) if (!r.fields['rso.squad']) checks.push(`${fioText(r.fields)}: не указан текущий отряд.`);
  if (opts.templates.includes('characteristic')) for (const r of persons) if (!cases.get(r.id)?.characteristic.trim()) checks.push(`${fioText(r.fields)}: характеристика не написана.`);

  const build = async () => {
    if (!workspace || !persons.length) return;
    setProgress('Готовим личные папки');
    try {
      const list = [];
      for (const r of persons) list.push({ record: r, case: await cases.ensure(r.id, r.fields) });
      const res = await buildTransferPackage({ ws: workspace, people: list, form, options: opts, templates: templates.list, vars: vars.items, prepareImage, onProgress: setProgress });
      setProgress('Сохраняем в рабочую папку');
      const folder = await freeFolder(workspace, packageFolder(list, res.name));
      await savePackage(workspace, folder, res.files);
      const zip = zipPackage(res.files);
      const who = list.length === 1 ? shortFio(fioText(list[0].record.fields)) : `${list.length} чел`;
      const zipName = `${safeName(`Перевод — ${who} — ${dateStamp(form.date)}`)}.zip`;
      downloadBytes(zip, zipName, 'application/zip');
      const id = uid('tr_');
      for (const p of list) cases.addTransfer(p.record.id, transferRecord(p.record.fields, form, id, folder, list.length));
      cases.setLastTransfer({ toSquad: form.toSquad, toBranch: form.toBranch, toDirection: form.toDirection, commanderFrom: form.commanderFrom, commanderTo: form.commanderTo, reason: form.reason });
      setDone({ id, folder, zipName, zip, files: res.files, warnings: res.warnings, people: list.map((p) => p.record.id), applied: false });
    } catch (e) {
      toast(`Не удалось собрать пакет: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgress(null);
    }
  };

  if (done) {
    const to = transferSides({}, form).to;
    return (
      <Modal
        title="Пакет перевода готов"
        wide
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={() => downloadBytes(done.zip, done.zipName, 'application/zip')}>
              <Download size={16} /> Скачать архив ещё раз
            </button>
            <button className="btn btn--primary" onClick={onClose}>
              Готово
            </button>
          </>
        }
      >
        <div className="stack">
          <Alert kind="success">
            Архив «{done.zipName}» скачан. Всё сохранено и в рабочую папку: <strong>{done.folder}</strong>.
          </Alert>
          {done.warnings.length > 0 && (
            <Alert kind="warning">
              <strong>Проверьте:</strong>
              <ul className="dela-warnings">
                {done.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}
          <div className="list dela-package">
            {done.files.map((f) => (
              <div key={f.path} className="list__item">
                <FileText size={18} className="faint" />
                <div className="list__main">
                  <div className="list__title small">{f.path}</div>
                  <div className="list__sub">
                    {f.title} · {formatBytes(f.data.byteLength)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="card card--flat row">
            <div className="spacer small">
              Когда перевод состоится, отметьте это — в данные {done.people.length > 1 ? 'бойцов' : 'бойца'} запишется новый отряд ({to.squad || 'без изменений'}
              {to.branch ? `, ${to.branch}` : ''}). Это можно сделать и позже — в разделе «Перевод» у бойца.
            </div>
            <button
              className="btn"
              disabled={done.applied || cases.readOnly}
              onClick={() => {
                const n = apply(done.people, { id: done.id, to });
                setDone({ ...done, applied: true });
                toast(`Новый отряд записан: ${n} чел.`);
              }}
            >
              <CheckCircle2 size={16} /> {done.applied ? 'Записано' : 'Перевод уже состоялся'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const field = (k: keyof TransferForm, label: string, extra: Record<string, string> = {}, hint?: string) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" value={form[k]} onChange={(e) => set(k, e.target.value)} autoComplete="off" {...extra} />
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );

  return (
    <Modal
      title={persons.length > 1 ? `Перевод: ${persons.length} чел.` : 'Перевод бойца'}
      wide
      onClose={() => !progress && onClose()}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={!!progress}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={() => void build()} disabled={!!progress || !persons.length || cases.readOnly}>
            {progress ? <Loader2 size={16} className="spin" /> : <PackageCheck size={16} />} {progress ?? 'Сформировать пакет'}
          </button>
        </>
      }
    >
      <div className="stack">
        <fieldset className="fieldset stack stack--s">
          <legend>Бойцы</legend>
          {persons.map((r) => (
            <div key={r.id} className="row row--nowrap">
              <span className="spacer">
                <strong>{fioText(r.fields)}</strong>
                <span className="small muted"> · сейчас: {sideText({ squad: r.fields['rso.squad'] ?? '', branch: r.fields['rso.branch'] ?? '' })}</span>
              </span>
              {persons.length > 1 && (
                <button className="icon-btn icon-btn--sm" onClick={() => setIds(ids.filter((x) => x !== r.id))} aria-label={`Убрать ${fioText(r.fields)}`}>
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          {others.length > 0 && (
            <select className="select" value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])} aria-label="Добавить бойца">
              <option value="">+ Добавить бойца к этому переводу…</option>
              {others.map((r) => (
                <option key={r.id} value={r.id}>
                  {fioText(r.fields)}
                  {r.fields['rso.squad'] ? ` · ${r.fields['rso.squad']}` : ''}
                </option>
              ))}
            </select>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend>Куда и когда</legend>
          <div className="grid-2">
            {field('toSquad', 'Новый отряд', { 'data-field': 'rso.squad', 'data-kind': 'organization', placeholder: '«Название»' })}
            {field('toBranch', 'Региональное отделение', { 'data-field': 'rso.branch', 'data-kind': 'organization' }, 'Пусто — то же, что сейчас')}
            {field('toDirection', 'Направление', { 'data-field': 'rso.direction' }, 'Пусто — без изменений')}
            {field('toPosition', 'Должность в новом отряде', { 'data-field': 'rso.position' }, 'Пусто — без изменений')}
            {field('date', 'Дата перевода', { placeholder: 'ДД.ММ.ГГГГ', inputMode: 'numeric', 'data-kind': 'date' })}
            <label className="field">
              <span className="field__label">Причина: «в связи с …»</span>
              <input className="input" value={form.reason} onChange={(e) => set('reason', e.target.value)} list="dela-reasons" placeholder="переездом" autoComplete="off" />
              <datalist id="dela-reasons">
                {TRANSFER_REASONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Подписи</legend>
          <div className="grid-2">
            {field('commanderFrom', 'Командир прежнего отряда', { 'data-kind': 'fio', placeholder: 'Фамилия Имя Отчество' }, 'Подписывает ходатайство и характеристику')}
            {field('commanderTo', 'Командир нового отряда', { 'data-kind': 'fio', placeholder: 'Фамилия Имя Отчество' }, 'Кому адресованы заявление и ходатайство — склоняется само')}
          </div>
        </fieldset>

        <fieldset className="fieldset stack stack--s">
          <legend>Документы</legend>
          <div className="dela-checks">
            {templates.list.map((t) => (
              <label key={t.id} className="check">
                <input type="checkbox" checked={opts.templates.includes(t.id)} onChange={(e) => toggleIn('templates', t.id, e.target.checked)} /> {t.title}
              </label>
            ))}
            {wordFiles.map((e) => (
              <label key={e.name} className="check">
                <input
                  type="checkbox"
                  checked={opts.word.includes(e.name)}
                  onChange={(ev) => {
                    setWordTouched(true);
                    toggleIn('word', e.name, ev.target.checked);
                  }}
                />{' '}
                {e.name.replace(/\.docx$/i, '')} <span className="badge">Word</span>
              </label>
            ))}
            <label className="check">
              <input type="checkbox" checked={opts.card} onChange={(e) => opt('card', e.target.checked)} /> Личная карточка (с фото)
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.table} onChange={(e) => opt('table', e.target.checked)} /> Таблица со всеми данными (Excel)
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.inventory} onChange={(e) => opt('inventory', e.target.checked)} /> Опись документов
            </label>
          </div>
          <span className="small muted">
            Тексты документов меняются в «Шаблоны документов». Свои бланки Word с метками {'{ФИО}'}, {'{Новый отряд}'}… кладите в «{WORD_TEMPLATES_FOLDER}».
          </span>
        </fieldset>

        <fieldset className="fieldset stack stack--s">
          <legend>Фото и сканы</legend>
          <div className="dela-checks">
            <label className="check">
              <input type="checkbox" checked={opts.photo} onChange={(e) => opt('photo', e.target.checked)} /> Основное фото
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.crop34} disabled={!opts.photo} onChange={(e) => opt('crop34', e.target.checked)} /> обрезать до 3×4
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.scans} onChange={(e) => opt('scans', e.target.checked)} /> Сканы документов
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.achievementFiles} onChange={(e) => opt('achievementFiles', e.target.checked)} /> Грамоты и дипломы
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.characteristicFiles} onChange={(e) => opt('characteristicFiles', e.target.checked)} /> Файлы характеристики
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.compress} onChange={(e) => opt('compress', e.target.checked)} /> Сжать картинки (JPEG, до 2000 px)
            </label>
          </div>
          <span className="small muted">Файлы получат понятные имена: «01 Паспорт (разворот с фото) — Иванов И. И.jpg». Исходные файлы в личной папке не меняются.</span>
        </fieldset>

        {checks.length > 0 && (
          <Alert kind="warning">
            <ul className="dela-warnings">
              {checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            Пакет можно собрать и так — пустые места останутся пустыми.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
