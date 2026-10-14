import { Download, FilePlus2, FileText, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { docxPlaceholders, fillDocx } from '@/core/docx/fill';
import { fioText, usePeople, type PersonRecord } from '@/core/people/people';
import { extName, type FsEntry } from '@/core/storage/types';
import { downloadBytes, mimeFor, pickFiles } from '@/core/util/download';
import { formatDateTime } from '@/core/util/format';
import { useVariables } from '@/core/variables/variables';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { useToast } from '@/ui/Toast';
import { WORD_TEMPLATES_FOLDER } from '../constants';
import type { PersonCase } from '../model/cases';
import { useCases } from '../model/cases';
import { makeResolver, personGender, placeholderValues, PLACEHOLDER_GROUPS, type TransferValues } from '../model/placeholders';
import { emptyTemplate, isModified, templateBlocks, templateDocx, useTemplates, type TextTemplate } from '../model/templates';
import { DocPreview } from './DocPreview';
import { NamesPreview, ScanNameField } from './ScanActionDialog';
import { DEFAULT_SCAN_NAME, planNames } from '../model/scanNames';
import { saveFiles, useFolderFiles } from './hooks';

/** Пример для предпросмотра — нейтральные данные, а не чьи-то настоящие. */
const SAMPLE: PersonRecord = {
  id: 'sample',
  savedAt: '',
  source: '',
  fields: {
    'person.lastName': 'Примеров',
    'person.firstName': 'Пример',
    'person.middleName': 'Примерович',
    'person.gender': 'Мужской',
    'person.birthDate': '01.01.2005',
    'person.phone': '8(000)000-00-00',
    'rso.squad': '«Название»',
    'rso.branch': 'Региональное отделение',
    'rso.position': 'Боец',
    'rso.joinDate': '01.10.2024',
    'rso.cardNumber': '00-00 000',
  },
};
const SAMPLE_CASE: Pick<PersonCase, 'characteristic' | 'achievements'> = {
  characteristic: 'Текст характеристики из личной папки.\nКаждая строка — отдельный абзац.',
  achievements: [{ id: 'a', date: '2025', title: 'Грамота', level: 'Штаб' }],
};
const SAMPLE_TRANSFER: TransferValues = {
  date: '01.09.2026',
  reason: 'переездом',
  toSquad: '«Новый отряд»',
  toBranch: '',
  toDirection: '',
  toPosition: '',
  commanderFrom: 'Командиров Командир Командирович',
  commanderTo: 'Начальникова Анна Сергеевна',
};

type FieldKey = 'header' | 'heading' | 'subheading' | 'body' | 'signLeft' | 'signRight';

function Palette({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <details className="card card--flat dela-palette" open>
      <summary className="small">
        <strong>Метки</strong> <span className="muted">— нажмите, чтобы вставить в поле, где стоит курсор</span>
      </summary>
      {PLACEHOLDER_GROUPS.map((g) => (
        <div key={g.title} className="dela-palette__group">
          <span className="small faint">{g.title}</span>
          <div className="row">
            {g.items.map((p) => (
              <button key={p.key} type="button" className="chip dela-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(`{${p.key}}`)} data-tip={p.hint}>
                {`{${p.key}}`}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        Глобальные переменные тоже работают: {'{ключ}'}. Падеж — к любому имени: {'{Командир нового отряда:кому}'}. Слово по полу — {'{он|она}'}.
      </p>
    </details>
  );
}

function Editor({ t, onSave, onReset, person, personCase }: { t: TextTemplate; onSave: (t: TextTemplate) => void; onReset: () => void; person: PersonRecord; personCase?: Pick<PersonCase, 'characteristic' | 'achievements'> }) {
  const vars = useVariables();
  const last = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const set = (k: keyof TextTemplate, v: string | boolean) => onSave({ ...t, [k]: v });
  const resolver = () => makeResolver(placeholderValues(person, personCase, SAMPLE_TRANSFER), personGender(person.fields), vars.items);
  const blocks = templateBlocks(t, resolver().resolve);

  const insert = (token: string) => {
    const cur = last.current;
    if (!cur) {
      navigator.clipboard?.writeText(token);
      return;
    }
    const { key, el } = cur;
    const v = t[key];
    const start = el.selectionStart ?? v.length;
    const end = el.selectionEnd ?? start;
    onSave({ ...t, [key]: v.slice(0, start) + token + v.slice(end) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const area = (key: FieldKey, label: string, rows: number, hint?: string) => (
    <label className="field">
      <span className="field__label">{label}</span>
      {rows === 1 ? (
        <input className="input" value={t[key]} data-novars="" onFocus={(e) => (last.current = { key, el: e.currentTarget })} onChange={(e) => set(key, e.target.value)} />
      ) : (
        <textarea className="input" value={t[key]} rows={rows} data-novars="" onFocus={(e) => (last.current = { key, el: e.currentTarget })} onChange={(e) => set(key, e.target.value)} />
      )}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );

  return (
    <div className="dela-tpl">
      <div className="stack">
        <div className="row">
          <label className="field spacer">
            <span className="field__label">Название документа</span>
            <input className="input" value={t.title} onChange={(e) => set('title', e.target.value)} />
          </label>
        </div>
        <label className="check small">
          <input type="checkbox" checked={t.forTransfer} onChange={(e) => set('forTransfer', e.target.checked)} /> Включать в пакет перевода по умолчанию
        </label>
        {area('header', 'Шапка — кому и от кого (справа)', 5)}
        {area('heading', 'Заголовок по центру', 1)}
        {area('subheading', 'Под заголовком', 2)}
        {area('body', 'Текст', 7, 'Каждая строка — абзац с отступом. Пустая строка — пустая строка в документе.')}
        <div className="grid-2">
          {area('signLeft', 'Внизу слева', 2)}
          {area('signRight', 'Внизу справа', 2)}
        </div>
        <Palette onInsert={insert} />
      </div>
      <div className="stack">
        <div className="row">
          <strong className="spacer">Как получится</strong>
          {t.builtin && isModified(t) && (
            <button className="btn btn--sm" onClick={() => confirm(`Вернуть «${t.title}» как было?`) && onReset()}>
              <RotateCcw size={14} /> Как было
            </button>
          )}
          {!t.builtin && (
            <button className="btn btn--sm btn--danger" onClick={() => confirm(`Удалить шаблон «${t.title}»?`) && onReset()}>
              <Trash2 size={14} /> Удалить
            </button>
          )}
          <button className="btn btn--sm" onClick={() => downloadBytes(templateDocx(t, resolver().resolve), `${t.title || 'Документ'} — пример.docx`, mimeFor('a.docx'))}>
            <Download size={14} /> Word
          </button>
        </div>
        <DocPreview blocks={blocks} />
      </div>
    </div>
  );
}

function WordTemplates({ person, personCase }: { person: PersonRecord; personCase?: Pick<PersonCase, 'characteristic' | 'achievements'> }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const vars = useVariables();
  const files = (useFolderFiles(WORD_TEMPLATES_FOLDER) ?? []).filter((e) => extName(e.name) === 'docx' && !e.name.startsWith('~$'));
  const [found, setFound] = useState<Record<string, string[] | string>>({});
  const resolver = () => makeResolver(placeholderValues(person, personCase, SAMPLE_TRANSFER), personGender(person.fields), vars.items);

  const key = files.map((f) => `${f.name}:${f.lastModified}`).join('|');
  useEffect(() => {
    if (!workspace) return;
    let alive = true;
    (async () => {
      const out: Record<string, string[] | string> = {};
      for (const f of files) {
        const bytes = await workspace.readBytes(f.path);
        try {
          out[f.name] = bytes ? await docxPlaceholders(bytes) : [];
        } catch (e) {
          out[f.name] = e instanceof Error ? e.message : String(e);
        }
      }
      if (alive) setFound(out);
    })();
    return () => {
      alive = false;
    };
    // files меняется вместе с key.
  }, [workspace, key]);

  const tryFill = async (f: FsEntry) => {
    const bytes = await workspace?.readBytes(f.path);
    if (!bytes) return;
    const r = await fillDocx(bytes, resolver().resolve);
    downloadBytes(r.data, f.name.replace(/\.docx$/i, ' — пример.docx'), mimeFor(f.name));
  };

  return (
    <section className="card stack">
      <div className="section-title">
        <h3 className="spacer" style={{ margin: 0 }}>
          Свои бланки Word
        </h3>
        <button
          className="btn btn--sm"
          onClick={async () => {
            if (!workspace) return;
            const picked = (await pickFiles('.docx', true)).filter((f) => /\.docx$/i.test(f.name));
            const names = await saveFiles(workspace, WORD_TEMPLATES_FOLDER, picked);
            if (names.length) toast(`Добавлено бланков: ${names.length}`);
          }}
        >
          <Upload size={14} /> Добавить .docx
        </button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Официальный бланк вашего штаба или РО: откройте его в Word, впишите метки в фигурных скобках там, где нужны данные — {'{ФИО:кого}'},{' '}
        {'{Дата рождения}'}, {'{Новый отряд}'}… — и сохраните как .docx. Оформление бланка сохранится, метки заменятся данными бойца. Бланки лежат в
        «{WORD_TEMPLATES_FOLDER}» и попадают в пакет перевода.
      </p>
      {files.length === 0 ? (
        <div className="small faint">Пока нет своих бланков.</div>
      ) : (
        <div className="list">
          {files.map((f) => {
            const keys = found[f.name];
            const unknown = Array.isArray(keys) ? keys.filter((k) => resolver().resolve(k) === undefined) : [];
            return (
              <div key={f.path} className="list__item list__item--col">
                <div className="row row--nowrap">
                  <FileText size={18} className="brand-icon" />
                  <span className="spacer list__title">{f.name}</span>
                  <span className="small faint">{formatDateTime(f.lastModified)}</span>
                  <button className="icon-btn" onClick={() => void tryFill(f)} aria-label="Пример" data-tip="Заполнить примером и скачать">
                    <Download size={18} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={async () => {
                      if (!workspace || !confirm(`Удалить бланк «${f.name}»?`)) return;
                      await workspace.remove(f.path);
                      toast('Бланк удалён');
                    }}
                    aria-label="Удалить"
                    data-tip="Удалить"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="small">
                  {typeof keys === 'string' ? (
                    <span className="field__error">{keys}</span>
                  ) : !keys ? (
                    <span className="faint">Читаем метки…</span>
                  ) : keys.length === 0 ? (
                    <span className="field__warn">Меток не найдено — документ попадёт в пакет как есть.</span>
                  ) : (
                    <span className="muted">
                      Метки: {keys.map((k) => `{${k}}`).join(', ')}
                      {unknown.length > 0 && <span className="field__error"> · неизвестные: {unknown.map((k) => `{${k}}`).join(', ')}</span>}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Шаблон имени файлов сканов: «Переименовать по шаблону» и «В „Для выдачи“» в личной папке. */
function ScanNameCard({ person, personCase }: { person: PersonRecord; personCase?: Pick<PersonCase, 'characteristic' | 'achievements'> }) {
  const templates = useTemplates();
  const vars = useVariables();
  // Своё состояние поля: сохранённый шаблон без пробелов по краям, а набирать их нужно.
  const [value, setValue] = useState(templates.scanName);
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!edited) setValue(templates.scanName);
  }, [templates.scanName, edited]);
  const ctx = { values: placeholderValues(person, personCase), gender: personGender(person.fields), vars: vars.items };
  const plan = planNames(
    value,
    [
      { rel: 'Сканы/IMG_0001.jpg', doc: 'Паспорт (разворот с фото)' },
      { rel: 'Сканы/скан.pdf', doc: 'СНИЛС' },
    ],
    [],
    ctx,
  );
  return (
    <section className="card stack">
      <div className="section-title">
        <h3 className="spacer" style={{ margin: 0 }}>
          Имена файлов сканов
        </h3>
        {templates.scanName !== DEFAULT_SCAN_NAME && (
          <button
            className="btn btn--sm"
            onClick={() => {
              templates.setScanName(DEFAULT_SCAN_NAME);
              setValue(DEFAULT_SCAN_NAME);
            }}
            disabled={templates.readOnly}
          >
            <RotateCcw size={14} /> Как было
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        По этому шаблону сканы переименовываются в личной папке («Переименовать по шаблону») и при отправке в «Для выдачи». В окне переименования шаблон
        можно поменять на месте.
      </p>
      <ScanNameField
        value={value}
        onChange={(v) => {
          setEdited(true);
          setValue(v);
          templates.setScanName(v);
        }}
      />
      <div className="small muted">Как получится:</div>
      <NamesPreview plan={plan} />
    </section>
  );
}

export function TemplatesView() {
  const templates = useTemplates();
  const people = usePeople();
  const cases = useCases();
  const [selected, setSelected] = useState<string>('transfer-request');
  const [personId, setPersonId] = useState('');
  const person = useMemo(() => people.records.find((r) => r.id === personId) ?? SAMPLE, [people.records, personId]);
  const personCase = person === SAMPLE ? SAMPLE_CASE : cases.get(person.id);
  const t = templates.list.find((x) => x.id === selected) ?? templates.list[0];

  if (!templates.loaded) return <div className="loading">Загрузка…</div>;
  return (
    <div className="stack">
      <div className="row">
        <div className="segmented segmented--wrap" role="tablist" aria-label="Документ">
          {templates.list.map((x) => (
            <button key={x.id} role="tab" aria-selected={x.id === t.id} aria-pressed={x.id === t.id} onClick={() => setSelected(x.id)}>
              {x.title || 'Без названия'}
              {x.builtin && isModified(x) ? ' •' : ''}
            </button>
          ))}
        </div>
        <button
          className="btn btn--sm"
          disabled={templates.readOnly}
          onClick={() => {
            const n = emptyTemplate();
            templates.save(n);
            setSelected(n.id);
          }}
        >
          <FilePlus2 size={14} /> Новый документ
        </button>
        <span className="spacer" />
        <label className="row small">
          <span className="muted">Пример:</span>
          <select className="select" style={{ width: 'auto' }} value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Чьи данные в примере">
            <option value="">нейтральный пример</option>
            {people.records.map((r) => (
              <option key={r.id} value={r.id}>
                {fioText(r.fields)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {t && (
        <section className="card">
          <Editor key={t.id} t={t} person={person} personCase={personCase} onSave={(x) => templates.save(x)} onReset={() => templates.reset(t.id)} />
        </section>
      )}
      <ScanNameCard person={person} personCase={personCase} />
      <WordTemplates person={person} personCase={personCase} />
      <p className="small muted">
        Изменения сохраняются сами — в «Личные дела/templates.json» (только то, что изменено). Личная карточка, таблица и опись собираются
        автоматически.
      </p>
    </div>
  );
}

