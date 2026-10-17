import { ArrowLeft, DatabaseZap, Download, Info, RotateCcw, TriangleAlert, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePeople, type PersonRecord } from '@/core/people/people';
import { downloadBytes, mimeFor } from '@/core/util/download';
import { formatDateTime } from '@/core/util/format';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { useToast } from '@/ui/Toast';
import { APP_ID, CARDS_FOLDER } from '../constants';
import { CARD_FIELDS, CARD_SECTIONS, cardFileName, cardValues, fullName, missingFields, type CardField, type CardValues } from '../member-card/fields';
import { cellsFor, fillMemberCard, MAILING_MARKS, placeText, type Placed } from '../member-card/fill';
import { INSTITUTIONS } from '../member-card/institutions';
import type { CardTemplate } from '../member-card/template';
import { useGeneratorSettings } from '../settings';
import { CardPreview } from './CardPreview';
import { SaveToBaseDialog, type BaseChange } from './SaveToBaseDialog';

/** Что вписано в карточку в этом сеансе (до записи в базу). */
export interface CardDraft {
  values: CardValues;
  /** Согласие на информационную рассылку. */
  mailing: boolean;
}

interface Props {
  /** null — новый человек, которого нет в базе. */
  record: PersonRecord | null;
  draft?: CardDraft;
  onDraft: (draft: CardDraft | null) => void;
  template: CardTemplate | null;
  onBack: () => void;
  /** Новый человек сохранён в базу. */
  onAdded: (id: string) => void;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const CITIES = [...new Set(INSTITUTIONS.map((i) => i.city))];

interface FieldProps {
  f: CardField;
  value: string;
  /** Значение в базе людей; undefined — человека нет в базе. */
  base?: string;
  placed?: Placed;
  /** Поле занимает две строки бланка (адрес). */
  twoLines: boolean;
  onChange: (value: string) => void;
}

function FieldBox({ f, value, base, placed, twoLines, onChange }: FieldProps) {
  const t = clean(value);
  const missing = f.required && !t;
  const notInBase = base !== undefined && !base && !!t;
  const changed = base !== undefined && !!base && t !== base;
  const issue = t ? f.check?.(t) : undefined;
  const fix = t ? f.fix?.(t) : undefined;
  const id = `dg-${f.id}`;

  return (
    <div className={`dg-field ${missing ? 'dg-field--missing' : ''} ${notInBase ? 'dg-field--new' : ''}`}>
      <div className="dg-field__head">
        <label htmlFor={id} className="dg-field__label">
          {f.label}
        </label>
        {!f.required && <span className="faint small">необязательно</span>}
        <span className="spacer" />
        {missing && <span className="badge badge--warning">не хватает</span>}
        {notInBase && <span className="badge badge--beta">нет в базе</span>}
        {changed && <span className="badge badge--updated">изменено</span>}
      </div>
      <div className="row row--nowrap">
        {f.long ? (
          <textarea
            id={id}
            className="input"
            rows={2}
            value={value}
            placeholder={f.example ? `Например: ${f.example}` : undefined}
            data-field={f.id}
            data-kind={f.kind}
            onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
          />
        ) : (
          <input
            id={id}
            className="input"
            value={value}
            placeholder={f.example ? `Например: ${f.example}` : undefined}
            data-field={f.id}
            data-kind={f.kind}
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
      {f.id === 'edu.institution' && (
        <select className="select dg-pick" value="" onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Выбрать учебное заведение из методички">
          <option value="">Выбрать из методички…</option>
          {CITIES.map((city) => (
            <optgroup key={city} label={city}>
              {INSTITUTIONS.filter((i) => i.city === city).map((i) => (
                <option key={i.short} value={i.short}>
                  {i.short}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {changed && (
        <div className="small faint row">
          <span>
            В базе: <span className="dg-base">{base}</span>
          </span>
          <button className="btn btn--sm btn--ghost" onClick={() => onChange(base!)}>
            <RotateCcw size={14} /> Вернуть
          </button>
        </div>
      )}
      {issue && (
        <div className="dg-issue small">
          <TriangleAlert size={14} />
          <span>{issue}</span>
          {fix && fix !== t && (
            <button className="btn btn--sm" onClick={() => onChange(fix)}>
              <Wand2 size={14} /> {fix}
            </button>
          )}
        </div>
      )}
      {twoLines && placed && placed.lines.length > 1 && (
        <div className="dg-lines small">
          <span className="muted">В карточке — две строки:</span>
          {placed.lines.map((l, i) => (
            <span key={i} className="dg-lines__line">
              {l}
            </span>
          ))}
        </div>
      )}
      {placed?.overflow &&
        (twoLines ? (
          <div className="dg-issue small">
            <TriangleAlert size={14} />
            <span>Не помещается в две строки карточки — Word перенесёт остаток внутри ячейки. Можно сократить: «Респ.», «г.», «ул.», «д.», «кв.».</span>
          </div>
        ) : (
          <div className="dg-issue dg-issue--note small">
            <Info size={14} />
            <span>Длиннее строки карточки — Word перенесёт текст внутри ячейки, строка станет выше. Сетка не пострадает.</span>
          </div>
        ))}
      <div className="field__hint">
        {f.hint}
        {f.example && (
          <>
            {' '}
            Образец: <span className="mono">{f.example}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function CardEditor({ record, draft, onDraft, template, onBack, onAdded }: Props) {
  const { workspace } = useWorkspace();
  const people = usePeople();
  const toast = useToast();
  const settings = useGeneratorSettings();
  const [saveOpen, setSaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const base = useMemo(() => cardValues(record?.fields), [record]);
  const values = draft?.values ?? base;
  const mailing = draft?.mailing ?? true;
  const name = fullName(values);
  const missing = missingFields(values);
  const changes: BaseChange[] = CARD_FIELDS.map((f) => ({ id: f.id, label: f.label, from: base[f.id] ?? '', to: clean(values[f.id]) })).filter(
    (c) => c.to && c.to !== c.from,
  );
  const added = changes.filter((c) => !c.from);
  const canAdd = !!clean(values['person.lastName']) && !!clean(values['person.firstName']);

  const set = (id: string, v: string) => onDraft({ values: { ...values, [id]: v }, mailing });
  const focusField = (id: string) => {
    const el = document.getElementById(`dg-${id}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
  };

  const saveToBase = (chosen: BaseChange[]) => {
    const fields = Object.fromEntries(chosen.map((c) => [c.id, c.to]));
    if (record) {
      people.complete(record.id, fields);
      toast(`Дописано в базу людей: ${chosen.map((c) => c.label).join(', ')}`);
    } else {
      const r = people.upsert(fields, APP_ID);
      toast(r.how === 'added' ? `${name}: добавлено в базу людей` : `${name}: запись в базе людей дополнена`);
      onAdded(r.id);
    }
    setSaveOpen(false);
  };

  const generate = async () => {
    if (!workspace || !template) return;
    if (missing.length && !confirm(`Не заполнено: ${missing.map((f) => f.label).join(', ')}.\n\nСформировать карточку с пустыми местами?`)) return;
    setBusy(true);
    try {
      const bytes = await fillMemberCard(template.bytes, values, { mark: mailing ? settings.mark : MAILING_MARKS.none });
      const file = cardFileName(values);
      await workspace.writeBytes(`${CARDS_FOLDER}/${file}`, bytes);
      downloadBytes(bytes, file, mimeFor(file));
      const offer = added.length && !people.readOnly && (record || canAdd);
      toast(`Готово: «${CARDS_FOLDER}/${file}»`, offer ? { label: 'Дописать в базу', run: () => setSaveOpen(true) } : undefined);
    } catch (e) {
      toast(`Не удалось сформировать карточку: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card dg-bar">
        <button className="icon-btn" onClick={onBack} aria-label="К списку людей" data-tip="К списку людей">
          <ArrowLeft size={20} />
        </button>
        <div className="dg-bar__main">
          <h2>{name || (record ? '(без ФИО)' : 'Новый человек')}</h2>
          <div className="small muted">
            {record ? `Из базы людей · запись от ${formatDateTime(record.savedAt)}` : 'Нет в базе людей — данные вписываются вручную'}
          </div>
        </div>
        <div className="row">
          {draft && (
            <button className="btn btn--ghost" onClick={() => onDraft(null)} data-tip="Убрать всё, что вписано в этой карточке">
              <RotateCcw size={16} /> Сбросить
            </button>
          )}
          <button
            className="btn"
            onClick={() => setSaveOpen(true)}
            disabled={!changes.length || people.readOnly || (!record && !canAdd)}
            data-tip={!record && !canAdd ? 'Сначала впишите фамилию и имя' : record ? 'Записать вписанное в базу людей' : 'Сохранить человека в базу людей'}
          >
            <DatabaseZap size={16} /> {record ? 'Дописать в базу' : 'Сохранить в базу'} ({changes.length})
          </button>
          <button className="btn btn--primary" onClick={generate} disabled={busy || !template}>
            <Download size={16} /> Скачать карточку
          </button>
        </div>
      </div>

      {missing.length > 0 ? (
        <Alert kind="warning">
          {record ? 'В базе не хватает данных для карточки: ' : 'Для карточки нужно вписать: '}
          {missing.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ', '}
              <button className="link-btn dg-jump" onClick={() => focusField(f.id)}>
                {f.label}
              </button>
            </span>
          ))}
          . Впишите их ниже — поля подсвечены.{record ? ' Потом нажмите «Дописать в базу», чтобы в следующий раз они были.' : ''}
        </Alert>
      ) : (
        <Alert kind="success">
          Всё для карточки есть.
          {added.length > 0 && !people.readOnly && ` Вписанное (${added.map((c) => c.label).join(', ')}) можно дописать в базу людей.`}
        </Alert>
      )}

      <div className="dg-layout">
        <div className="stack">
          {CARD_SECTIONS.map((s) => (
            <section key={s.title} className="card stack">
              <h3 style={{ margin: 0 }}>{s.title}</h3>
              <div className="dg-fields">
                {s.fields.map((f) => {
                  const cells = template ? cellsFor(template.layout, f.id) : undefined;
                  return (
                    <FieldBox
                      key={f.id}
                      f={f}
                      value={values[f.id] ?? ''}
                      base={record ? base[f.id] : undefined}
                      placed={cells && clean(values[f.id]) ? placeText(cells, clean(values[f.id])) : undefined}
                      twoLines={(cells?.length ?? 0) > 1}
                      onChange={(v) => set(f.id, v)}
                    />
                  );
                })}
                {s.title === 'Контакты' && (
                  <div className="dg-field">
                    <div className="dg-field__head">
                      <span className="dg-field__label">Информ. рассылка</span>
                    </div>
                    <label className="check">
                      <input type="checkbox" checked={mailing} onChange={(e) => onDraft({ values, mailing: e.target.checked })} />
                      Согласие на информационную рассылку
                    </label>
                    <div className="row small">
                      <span className="muted">Знак в карточке:</span>
                      <div className="segmented" role="group" aria-label="Знак у «информ. рассылка»">
                        <button aria-pressed={settings.mark === MAILING_MARKS.check} onClick={() => settings.setMark(MAILING_MARKS.check)}>
                          {MAILING_MARKS.check} галочка
                        </button>
                        <button aria-pressed={settings.mark === MAILING_MARKS.box} onClick={() => settings.setMark(MAILING_MARKS.box)}>
                          {MAILING_MARKS.box} в квадрате, как в образце
                        </button>
                      </div>
                    </div>
                    <div className="field__hint">
                      Вместо квадрата из бланка ставится знак-символ — его покажет любой Word. Без согласия — пустой квадрат {MAILING_MARKS.none}.
                    </div>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
        <aside className="dg-side stack">
          <div className="row">
            <strong className="spacer">Как будет в карточке</strong>
            <span className="small faint">нажмите на место — перейти к полю</span>
          </div>
          <CardPreview values={values} layout={template?.layout ?? null} mark={mailing ? settings.mark : MAILING_MARKS.none} onPick={focusField} />
        </aside>
      </div>

      {saveOpen && (
        <SaveToBaseDialog name={name || 'Новый человек'} isNew={!record} changes={changes} onClose={() => setSaveOpen(false)} onSave={saveToBase} />
      )}
    </div>
  );
}
