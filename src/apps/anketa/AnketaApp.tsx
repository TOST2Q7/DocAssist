import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BaseView from './ui/BaseView';
import { FilePicker } from './ui/FilePicker';
import { LuaHelp } from './ui/LuaHelp';
import { PasteDialog, usePasteTable } from './ui/PasteTable';
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
  const tabParam = params.get('tab');
  const tab = tabParam === 'rules' || tabParam === 'base' || tabParam === 'help' ? tabParam : 'check';
  const file = params.get('file');
  const sheet = params.get('sheet') ?? undefined;
  const rowParam = params.get('row');
  const row = rowParam !== null && /^\d+$/.test(rowParam) ? Number(rowParam) : null;

  // Ctrl+V с таблицей (вне полей ввода) — новая таблица из буфера.
  const [pasted, setPasted] = useState<string | null>(null);
  usePasteTable(
    useCallback((text: string) => setPasted(text), []),
    tab === 'check',
  );

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
          <button role="tab" aria-selected={tab === 'base'} aria-pressed={tab === 'base'} onClick={() => set({ tab: 'base' })}>
            База
          </button>
          <button role="tab" aria-selected={tab === 'help'} aria-pressed={tab === 'help'} onClick={() => set({ tab: 'help' })}>
            Справка
          </button>
        </div>
      </div>
      {tab === 'rules' ? (
        <RulesView onHelp={() => set({ tab: 'help' })} />
      ) : tab === 'help' ? (
        <LuaHelp />
      ) : tab === 'base' ? (
        <BaseView />
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
        <FilePicker onOpen={(p) => set({ file: p, row: null })} onPaste={() => setPasted('')} />
      )}
      {pasted !== null && (
        <PasteDialog
          initial={pasted}
          onClose={() => setPasted(null)}
          onCreated={(p) => {
            setPasted(null);
            set({ tab: null, file: p, row: null, sheet: null });
          }}
        />
      )}
    </div>
  );
}
