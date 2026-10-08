import { useSearchParams } from 'react-router-dom';
import { FilePicker } from './ui/FilePicker';
import { RulesView } from './ui/RulesView';
import { Workbench } from './ui/Workbench';
import './anketa.css';

/*
 * «Проверка анкет».
 * Состояние экрана хранится в адресе (?file=…&row=…&tab=…), поэтому работает кнопка «Назад»
 * и можно открыть нужного человека по ссылке.
 */
export default function AnketaApp() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'rules' ? 'rules' : 'check';
  const file = params.get('file');
  const sheet = params.get('sheet') ?? undefined;
  const rowParam = params.get('row');
  const row = rowParam !== null && /^\d+$/.test(rowParam) ? Number(rowParam) : null;

  const set = (patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };

  return (
    <div className="page anketa">
      <div className="anketa__head">
        <div className="spacer">
          <h1>Проверка анкет</h1>
        </div>
        <div className="segmented" role="tablist" aria-label="Разделы">
          <button role="tab" aria-selected={tab === 'check'} aria-pressed={tab === 'check'} onClick={() => set({ tab: null })}>
            Анкеты
          </button>
          <button role="tab" aria-selected={tab === 'rules'} aria-pressed={tab === 'rules'} onClick={() => set({ tab: 'rules' })}>
            Шаблоны и правила
          </button>
        </div>
      </div>
      {tab === 'rules' ? (
        <RulesView />
      ) : file ? (
        <Workbench
          path={file}
          sheet={sheet}
          row={row}
          onRow={(r) => {
            set({ row: r === null ? null : String(r) }, row !== null && r !== null);
            window.scrollTo({ top: 0 });
          }}
          onSheet={(s) => set({ sheet: s, row: null })}
          onClose={() => set({ file: null, row: null, sheet: null })}
        />
      ) : (
        <FilePicker onOpen={(p) => set({ file: p, row: null })} />
      )}
    </div>
  );
}
