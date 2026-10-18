import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HANDOUT_FOLDER } from '@/core/handout/handout';
import { Alert } from '@/ui/Alert';
import { DriveView } from './drive/DriveView';
import { useCases } from './model/cases';
import { HandoutView } from './ui/HandoutView';
import { HelpView } from './ui/HelpView';
import { useFolderFiles } from './ui/hooks';
import { NewPersonDialog } from './ui/NewPersonDialog';
import { PeopleView } from './ui/PeopleView';
import { PersonPage, type PersonTab } from './ui/PersonPage';
import { TemplatesView } from './ui/TemplatesView';
import { TransferDialog } from './ui/TransferDialog';
import './dela.css';

/*
 * «Личные дела»: ручной ввод данных бойца в базу людей, личная папка (фото, сканы, достижения, характеристика)
 * и оформление перевода. Состояние экрана — в адресе (?p=…&tab=…), поэтому работает кнопка «Назад».
 */
export default function LichnyeDelaApp() {
  const [params, setParams] = useSearchParams();
  const cases = useCases();
  const [creating, setCreating] = useState(false);
  const [transfer, setTransfer] = useState<string[] | null>(null);

  const viewParam = params.get('view');
  const view = viewParam === 'templates' || viewParam === 'help' || viewParam === 'handout' || viewParam === 'drive' ? viewParam : 'people';
  const handout = useFolderFiles(HANDOUT_FOLDER)?.length ?? 0;
  const personId = params.get('p');
  const tabParam = params.get('tab');
  const tab: PersonTab = tabParam === 'folder' || tabParam === 'transfer' ? tabParam : 'data';

  const set = (patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };

  return (
    <div className="page dela">
      <div className="dela__head">
        <h1 className="spacer">Личные дела</h1>
        <div className="segmented" role="tablist" aria-label="Разделы">
          <button role="tab" aria-selected={view === 'people'} aria-pressed={view === 'people'} onClick={() => set({ view: null })}>
            Бойцы
          </button>
          <button role="tab" aria-selected={view === 'handout'} aria-pressed={view === 'handout'} onClick={() => set({ view: 'handout', p: null, tab: null })}>
            {HANDOUT_FOLDER}
            {handout ? ` (${handout})` : ''}
          </button>
          <button role="tab" aria-selected={view === 'drive'} aria-pressed={view === 'drive'} onClick={() => set({ view: 'drive', p: null, tab: null })}>
            Google Диск
          </button>
          <button role="tab" aria-selected={view === 'templates'} aria-pressed={view === 'templates'} onClick={() => set({ view: 'templates', p: null, tab: null })}>
            Шаблоны документов
          </button>
          <button role="tab" aria-selected={view === 'help'} aria-pressed={view === 'help'} onClick={() => set({ view: 'help', p: null, tab: null })}>
            Справка
          </button>
        </div>
      </div>
      {cases.error && <Alert kind="error">{cases.error}</Alert>}
      {view === 'templates' ? (
        <TemplatesView />
      ) : view === 'handout' ? (
        <HandoutView cases={cases} />
      ) : view === 'drive' ? (
        <DriveView cases={cases} />
      ) : view === 'help' ? (
        <HelpView />
      ) : personId ? (
        <PersonPage
          key={personId}
          personId={personId}
          tab={tab}
          cases={cases}
          onTab={(t) => set({ tab: t === 'data' ? null : t }, true)}
          onBack={() => set({ p: null, tab: null })}
          onTransfer={setTransfer}
        />
      ) : (
        <PeopleView cases={cases} onOpen={(id) => set({ p: id, tab: null })} onNew={() => setCreating(true)} onTransfer={setTransfer} />
      )}
      {creating && (
        <NewPersonDialog
          cases={cases}
          onClose={() => setCreating(false)}
          onOpen={(id) => {
            setCreating(false);
            set({ view: null, p: id, tab: null });
          }}
        />
      )}
      {transfer && <TransferDialog personIds={transfer} cases={cases} onClose={() => setTransfer(null)} />}
    </div>
  );
}
