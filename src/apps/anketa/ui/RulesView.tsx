import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { uid } from '@/core/util/id';
import { checkAddress } from '@/shared/address/check';
import { BUILTIN_TEMPLATES, type AddressTemplate } from '@/shared/address/template';
import { LEVEL_LABELS, LEVEL_ORDER, type Level } from '@/shared/address/types';
import { useGazetteer } from '@/shared/address/useGazetteer';
import { Alert } from '@/ui/Alert';
import { Modal } from '@/ui/Modal';
import { PHONE_STYLES, allTemplates, type PhoneStyle } from '../model/rules';
import { useRules } from './hooks';

const SAMPLE = 'Респ. хакасия ул.Ленина, село Аскиз, дом 1 кв 5, 655700';
const SAMPLE_BIRTH = 'республика хакасия, аскизский район, село Аскиз';
const sampleFor = (t: AddressTemplate) => (t.order === 'small-to-big' ? SAMPLE_BIRTH : SAMPLE);
const ADDRESS_FIELDS = ['person.regAddress', 'person.factAddress', 'person.birthPlace'];

function Preview({ template, sample }: { template: AddressTemplate; sample: string }) {
  const { gaz } = useGazetteer();
  const r = useMemo(() => checkAddress(sample, template, gaz), [sample, template, gaz]);
  return <div className="preview mono-ish">{r.suggestion || '—'}</div>;
}

function TemplateEditor({ initial, onSave, onClose }: { initial: AddressTemplate; onSave: (t: AddressTemplate) => void; onClose: () => void }) {
  const [t, setT] = useState<AddressTemplate>(initial);
  const [sample, setSample] = useState(sampleFor(initial));
  const set = <K extends keyof AddressTemplate>(k: K, v: AddressTemplate[K]) => setT((x) => ({ ...x, [k]: v }));
  const setPart = (level: Level, key: 'prefix' | 'suffix', v: string) =>
    setT((x) => ({ ...x, parts: { ...x.parts, [level]: { ...x.parts?.[level], [key]: v } } }));

  const sel = <K extends keyof AddressTemplate>(k: K, label: string, options: [AddressTemplate[K], string][]) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="select" value={String(t[k])} onChange={(e) => set(k, options.find(([v]) => String(v) === e.target.value)![0])}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Modal
      title={initial.name ? `Шаблон: ${initial.name}` : 'Новый шаблон'}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" disabled={!t.name.trim()} onClick={() => onSave(t)}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field__label">Название</span>
          <input className="input" value={t.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <div className="grid-3">
          {sel('order', 'Порядок', [
            ['big-to-small', 'От региона к дому'],
            ['small-to-big', 'От дома к региону'],
          ])}
          <label className="field">
            <span className="field__label">Разделитель</span>
            <select className="select" value={t.separator} onChange={(e) => set('separator', e.target.value)}>
              <option value=", ">запятая и пробел «, »</option>
              <option value=" ">пробел « »</option>
              <option value="; ">точка с запятой «; »</option>
            </select>
          </label>
          {sel('typeStyle', 'Типы', [
            ['short', 'Сокращённо: ул., д., с.'],
            ['full', 'Полностью: улица, дом, село'],
          ])}
          {sel('regionStyle', 'Регион', [
            ['short', 'Респ. Хакасия'],
            ['full', 'Республика Хакасия'],
          ])}
          {sel('index', 'Индекс', [
            ['required', 'Обязателен'],
            ['optional', 'Если есть'],
            ['never', 'Не указывать'],
          ])}
          {sel('region', 'Регион обязателен', [
            ['required', 'Да (добавить по базе)'],
            ['optional', 'Нет'],
          ])}
          {sel('district', 'Район', [
            ['keep', 'Как написано'],
            ['always', 'Всегда (добавить по базе)'],
            ['never', 'Не указывать'],
          ])}
          {sel('country', 'Страна', [
            ['never', 'Не указывать'],
            ['keep', 'Как написано'],
            ['always', 'Всегда «Россия»'],
          ])}
          {sel('house', 'Номер дома', [
            ['required', 'Обязателен'],
            ['optional', 'Не обязателен'],
          ])}
        </div>
        <details>
          <summary className="small">Приставки и окончания частей (необязательно)</summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Часть</th>
                  <th>Приставка</th>
                  <th>Окончание</th>
                </tr>
              </thead>
              <tbody>
                {LEVEL_ORDER.map((l) => (
                  <tr key={l}>
                    <td>{LEVEL_LABELS[l]}</td>
                    <td>
                      <input className="input" value={t.parts?.[l]?.prefix ?? ''} onChange={(e) => setPart(l, 'prefix', e.target.value)} aria-label={`Приставка: ${LEVEL_LABELS[l]}`} />
                    </td>
                    <td>
                      <input className="input" value={t.parts?.[l]?.suffix ?? ''} onChange={(e) => setPart(l, 'suffix', e.target.value)} aria-label={`Окончание: ${LEVEL_LABELS[l]}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <label className="field">
          <span className="field__label">Проверить на примере</span>
          <input className="input" value={sample} onChange={(e) => setSample(e.target.value)} />
        </label>
        <Preview template={t} sample={sample} />
      </div>
    </Modal>
  );
}

export function RulesView() {
  const { rules, update, readOnly } = useRules();
  const [editing, setEditing] = useState<AddressTemplate | null>(null);
  const templates = allTemplates(rules);

  const saveTemplate = (t: AddressTemplate) => {
    const exists = rules.customTemplates.some((x) => x.id === t.id);
    update({ customTemplates: exists ? rules.customTemplates.map((x) => (x.id === t.id ? t : x)) : [...rules.customTemplates, t] });
    setEditing(null);
  };

  return (
    <div className="stack stack--l">
      {readOnly && <Alert kind="warning">Настройки сохранены более новой версией DocAssist — изменить их можно после обновления.</Alert>}
      <section className="stack">
        <h2>Шаблоны адресов</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Шаблон задаёт, как должен выглядеть правильный адрес. Встроенные шаблоны можно скопировать и поменять под себя.
        </p>
        <div className="grid-3">
          {ADDRESS_FIELDS.map((id) => (
            <label key={id} className="field">
              <span className="field__label">{FIELD_BY_ID.get(id)?.label}</span>
              <select
                className="select"
                value={rules.addressTemplates[id]}
                disabled={readOnly}
                onChange={(e) => update({ addressTemplates: { ...rules.addressTemplates, [id]: e.target.value } })}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="list">
          {templates.map((t) => (
            <div key={t.id} className="list__item">
              <div className="list__main">
                <div className="list__title">
                  {t.name} {t.builtin ? <span className="badge">встроенный</span> : <span className="badge badge--beta">ваш</span>}
                </div>
                <Preview template={t} sample={sampleFor(t)} />
              </div>
              <button
                className="icon-btn"
                data-tip="Копировать"
                aria-label={`Копировать шаблон ${t.name}`}
                disabled={readOnly}
                onClick={() => setEditing({ ...structuredClone(t), id: uid('tpl_'), name: `${t.name} (копия)`, builtin: false })}
              >
                <Copy size={18} />
              </button>
              {!t.builtin && (
                <>
                  <button className="icon-btn" data-tip="Изменить" aria-label={`Изменить шаблон ${t.name}`} disabled={readOnly} onClick={() => setEditing(t)}>
                    <Pencil size={18} />
                  </button>
                  <button
                    className="icon-btn"
                    data-tip="Удалить"
                    aria-label={`Удалить шаблон ${t.name}`}
                    disabled={readOnly}
                    onClick={() => {
                      if (!confirm(`Удалить шаблон «${t.name}»?`)) return;
                      const fallback: Record<string, string> = {};
                      for (const [k, v] of Object.entries(rules.addressTemplates)) fallback[k] = v === t.id ? BUILTIN_TEMPLATES[1].id : v;
                      update({ customTemplates: rules.customTemplates.filter((x) => x.id !== t.id), addressTemplates: fallback });
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Сёла, улицы и районы для проверки по дереву — в разделе <Link to="/dictionaries">Справочники</Link>.
        </p>
      </section>

      <section className="stack">
        <h2>Форматы полей</h2>
        <div className="grid-3">
          <label className="field">
            <span className="field__label">Телефон</span>
            <select className="select" value={rules.phoneStyle} disabled={readOnly} onChange={(e) => update({ phoneStyle: e.target.value as PhoneStyle })}>
              {Object.entries(PHONE_STYLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Кавычки в названиях</span>
            <select className="select" value={rules.quoteStyle} disabled={readOnly} onChange={(e) => update({ quoteStyle: e.target.value as typeof rules.quoteStyle })}>
              <option value="guillemets">«Ёлочки»</option>
              <option value="straight">"Прямые"</option>
              <option value="keep">Не менять</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Пустая дата исключения</span>
            <input className="input" value={rules.emptyDate} disabled={readOnly} onChange={(e) => update({ emptyDate: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Возраст от</span>
            <input className="input" type="number" min={0} value={rules.ageMin} disabled={readOnly} onChange={(e) => update({ ageMin: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="field__label">Возраст до</span>
            <input className="input" type="number" min={0} value={rules.ageMax} disabled={readOnly} onChange={(e) => update({ ageMax: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="field__label">Номер членского билета (рег. выражение)</span>
            <input className="input mono" placeholder="например ^\d{2}-\d{2} \d{3}$" value={rules.cardPattern} disabled={readOnly} onChange={(e) => update({ cardPattern: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={rules.emailLowercase} disabled={readOnly} onChange={(e) => update({ emailLowercase: e.target.checked })} /> Почта строчными буквами
          </label>
          <label className="check">
            <input type="checkbox" checked={rules.squadQuotes} disabled={readOnly} onChange={(e) => update({ squadQuotes: e.target.checked })} /> Название отряда в кавычках
          </label>
        </div>
      </section>
      {editing && <TemplateEditor initial={editing} onSave={saveTemplate} onClose={() => setEditing(null)} />}
    </div>
  );
}
