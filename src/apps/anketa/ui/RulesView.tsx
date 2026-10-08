import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { uid } from '@/core/util/id';
import { checkAddress } from '@/shared/address/check';
import { BUILTIN_TEMPLATES, type AddressParts, type AddressTemplate, type PartRule } from '@/shared/address/template';
import { LEVEL_LABELS, LEVEL_ORDER, type Level } from '@/shared/address/types';
import { useGazetteer } from '@/shared/address/useGazetteer';
import { maskDigits, showMask } from '@/shared/check/mask';
import { Alert } from '@/ui/Alert';
import { Modal } from '@/ui/Modal';
import { PHONE_MASKS, allTemplates } from '../model/rules';
import { useRules } from './hooks';

const SAMPLE = 'Респ. хакасия ул.Ленина, село Аскиз, дом 1 кв 5, 655700';
const SAMPLE_BIRTH = 'республика хакасия, аскизский район, село Аскиз';
const sampleFor = (t: AddressTemplate) => (t.order === 'small-to-big' ? SAMPLE_BIRTH : SAMPLE);
const ADDRESS_FIELDS = ['person.regAddress', 'person.factAddress', 'person.birthPlace'];

function Preview({ template, sample }: { template: AddressTemplate; sample: string }) {
  const { gaz } = useGazetteer();
  const r = useMemo(() => checkAddress(sample, template, gaz), [sample, template, gaz]);
  return <div className="preview">{r.canonical || '—'}</div>;
}

const RULES: [PartRule, string][] = [
  ['required', 'обязательно'],
  ['optional', 'если есть'],
  ['never', 'не указывать'],
];

const PART_LABELS: Record<keyof AddressParts, string> = {
  index: 'Индекс',
  country: 'Страна «Россия»',
  region: 'Регион',
  district: 'Район (для сёл)',
  street: 'Улица',
  house: 'Дом',
  building: 'Корпус / строение',
  flat: 'Квартира',
};

const PART_CHOICES: Record<keyof AddressParts, PartRule[]> = {
  index: ['required', 'optional', 'never'],
  country: ['required', 'optional', 'never'],
  region: ['required', 'optional'],
  district: ['required', 'optional', 'never'],
  street: ['required', 'optional', 'never'],
  house: ['required', 'optional', 'never'],
  building: ['optional', 'never'],
  flat: ['optional', 'never'],
};

function TemplateEditor({ initial, onSave, onClose }: { initial: AddressTemplate; onSave: (t: AddressTemplate) => void; onClose: () => void }) {
  const [t, setT] = useState<AddressTemplate>(initial);
  const [sample, setSample] = useState(sampleFor(initial));
  const set = <K extends keyof AddressTemplate>(k: K, v: AddressTemplate[K]) => setT((x) => ({ ...x, [k]: v }));
  const setPart = (k: keyof AddressParts, v: PartRule) => setT((x) => ({ ...x, parts: { ...x.parts, [k]: v } as AddressParts }));
  const setAffix = (level: Level, key: 'prefix' | 'suffix', v: string) => setT((x) => ({ ...x, affixes: { ...x.affixes, [level]: { ...x.affixes?.[level], [key]: v } } }));

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
          <label className="field">
            <span className="field__label">Порядок</span>
            <select className="select" value={t.order} onChange={(e) => set('order', e.target.value as AddressTemplate['order'])}>
              <option value="big-to-small">От региона к дому</option>
              <option value="small-to-big">От населённого пункта к стране</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Разделитель</span>
            <select className="select" value={t.separator} onChange={(e) => set('separator', e.target.value)}>
              <option value=", ">запятая и пробел «, »</option>
              <option value=" ">пробел « »</option>
              <option value="; ">точка с запятой «; »</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Типы</span>
            <select className="select" value={t.typeStyle} onChange={(e) => set('typeStyle', e.target.value as AddressTemplate['typeStyle'])}>
              <option value="short">Сокращённо: ул., д., с.</option>
              <option value="full">Полностью: улица, дом, село</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Регион</span>
            <select className="select" value={t.regionStyle} onChange={(e) => set('regionStyle', e.target.value as AddressTemplate['regionStyle'])}>
              <option value="short">Респ. Хакасия</option>
              <option value="full">Республика Хакасия</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Буква в номере дома</span>
            <select className="select" value={t.houseLetter} onChange={(e) => set('houseLetter', e.target.value as AddressTemplate['houseLetter'])}>
              <option value="lower">строчная: 12а</option>
              <option value="upper">прописная: 12А</option>
            </select>
          </label>
        </div>

        <fieldset className="fieldset">
          <legend>Части адреса</legend>
          <div className="grid-3">
            {(Object.keys(PART_LABELS) as (keyof AddressParts)[]).map((k) => (
              <label key={k} className="field">
                <span className="field__label">{PART_LABELS[k]}</span>
                <select className="select" value={t.parts[k]} onChange={(e) => setPart(k, e.target.value as PartRule)}>
                  {RULES.filter(([r]) => PART_CHOICES[k].includes(r)).map(([r, l]) => (
                    <option key={r} value={r}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Что обязательно должно быть в справочнике</legend>
          <div className="row">
            {([
              ['locality', 'Населённый пункт'],
              ['street', 'Улица'],
              ['index', 'Индекс населённого пункта'],
            ] as const).map(([k, l]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={t.verify[k]} onChange={(e) => set('verify', { ...t.verify, [k]: e.target.checked })} /> {l}
              </label>
            ))}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Всё, чего нет в справочнике, нужно один раз подтвердить — после этого значение проходит проверку во всех анкетах.
          </p>
        </fieldset>

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
                      <input className="input" value={t.affixes?.[l]?.prefix ?? ''} onChange={(e) => setAffix(l, 'prefix', e.target.value)} aria-label={`Приставка: ${LEVEL_LABELS[l]}`} />
                    </td>
                    <td>
                      <input className="input" value={t.affixes?.[l]?.suffix ?? ''} onChange={(e) => setAffix(l, 'suffix', e.target.value)} aria-label={`Окончание: ${LEVEL_LABELS[l]}`} />
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

function MaskInput({ label, value, digits, onChange, disabled, hint }: { label: string; value: string; digits?: number; onChange: (v: string) => void; disabled: boolean; hint: string }) {
  const n = maskDigits(value);
  const bad = digits !== undefined && n !== digits;
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className={`input ${bad ? 'input--error' : ''}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      {bad ? <span className="field__error">Нужно ровно {digits} девяток (цифр), а сейчас {n}</span> : <span className="field__hint">{hint.replace('{mask}', showMask(value))}</span>}
    </label>
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
      <Alert kind="info">
        Проверка строгая: значение верно, только если в точности совпадает с шаблоном. Любое отличие — ошибка, а всё, что нельзя
        проверить автоматически (новое село, улица, имя, отряд), нужно один раз подтвердить.
      </Alert>

      <section className="stack">
        <h2>Шаблоны адресов</h2>
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
                <div className="small muted">Пример исправления: «{sampleFor(t)}» →</div>
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
                      for (const [k, v] of Object.entries(rules.addressTemplates)) fallback[k] = v === t.id ? (BUILTIN_TEMPLATES.find((b) => b.id === k.split('.')[1])?.id ?? 'residence') : v;
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
          Сёла, улицы, индексы и другие подтверждённые значения — в разделе <Link to="/dictionaries">Справочники</Link>.
        </p>
      </section>

      <section className="stack">
        <h2>Шаблоны полей</h2>
        <div className="grid-3">
          <label className="field">
            <span className="field__label">Телефон: готовые шаблоны</span>
            <select className="select" value={PHONE_MASKS.includes(rules.phoneMask) ? rules.phoneMask : ''} disabled={readOnly} onChange={(e) => e.target.value && update({ phoneMask: e.target.value })}>
              {!PHONE_MASKS.includes(rules.phoneMask) && <option value="">свой шаблон</option>}
              {PHONE_MASKS.map((m) => (
                <option key={m} value={m}>
                  {showMask(m)}
                </option>
              ))}
            </select>
          </label>
          <MaskInput label="Телефон: маска" value={rules.phoneMask} digits={10} disabled={readOnly} onChange={(v) => update({ phoneMask: v })} hint="9 — цифра. Сейчас: {mask}" />
          <MaskInput label="Номер членского билета: маска" value={rules.cardMask} disabled={readOnly} onChange={(v) => update({ cardMask: v })} hint="9 — цифра. Сейчас: {mask}" />
          <label className="field">
            <span className="field__label">Столбец «Регион»</span>
            <select className="select" value={rules.regionStyle} disabled={readOnly} onChange={(e) => update({ regionStyle: e.target.value as typeof rules.regionStyle })}>
              <option value="full">Республика Хакасия</option>
              <option value="short">Респ. Хакасия</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Кавычки в названиях</span>
            <select className="select" value={rules.quoteStyle} disabled={readOnly} onChange={(e) => update({ quoteStyle: e.target.value as typeof rules.quoteStyle })}>
              <option value="guillemets">«Ёлочки»</option>
              <option value="straight">"Прямые"</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Дата исключения, если её нет</span>
            <input className="input" value={rules.emptyDate} disabled={readOnly} onChange={(e) => update({ emptyDate: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Возраст от (иначе — подтвердить)</span>
            <input className="input" type="number" min={0} value={rules.ageMin} disabled={readOnly} onChange={(e) => update({ ageMin: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="field__label">Возраст до (иначе — подтвердить)</span>
            <input className="input" type="number" min={0} value={rules.ageMax} disabled={readOnly} onChange={(e) => update({ ageMax: Number(e.target.value) })} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={rules.emailLowercase} disabled={readOnly} onChange={(e) => update({ emailLowercase: e.target.checked })} /> Почта только строчными буквами
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          Неизменные шаблоны: дата — ДД.ММ.ГГГГ, СНИЛС — XXX-XXX-XXX XX, ИНН — 12 цифр, паспорт — серия 4 цифры, номер 6 цифр, код
          подразделения — XXX-XXX, ВКонтакте — https://vk.com/…
        </p>
      </section>
      {editing && <TemplateEditor initial={editing} onSave={saveTemplate} onClose={() => setEditing(null)} />}
    </div>
  );
}
