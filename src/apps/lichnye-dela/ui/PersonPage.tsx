import { ArrowLeft, ArrowRightLeft, ClipboardCopy, FileSpreadsheet, FileText, Trash2 } from 'lucide-react';
import { useBlocker } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { fioText, usePeople } from '@/core/people/people';
import { PERSON_FIELDS } from '@/core/schema/fields';
import { imageType } from '@/core/docx/image';
import { writeXlsxBook } from '@/core/tables/tables';
import { downloadBytes, mimeFor } from '@/core/util/download';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { GramotkiGate } from '@/ui/GramotkiGate';
import { Menu } from '@/ui/Menu';
import { useToast } from '@/ui/Toast';
import { APP_ID } from '../constants';
import { cardDocx } from '../model/card';
import { casePath, type CasesApi } from '../model/cases';
import { shortFio } from '../model/names';
import { fileName, mainPhoto } from '../model/transfer';
import { FolderView } from './FolderView';
import { prepareImage } from './imagePrep';
import { PersonEditor } from './PersonEditor';
import { TransfersView } from './TransfersView';

export type PersonTab = 'data' | 'folder' | 'transfer';

const TABS: { id: PersonTab; label: string }[] = [
  { id: 'data', label: 'Данные' },
  { id: 'folder', label: 'Личная папка' },
  { id: 'transfer', label: 'Перевод' },
];

interface Props {
  personId: string;
  tab: PersonTab;
  cases: CasesApi;
  onTab: (tab: PersonTab) => void;
  onBack: () => void;
  onTransfer: (ids: string[]) => void;
}

export function PersonPage({ personId, tab, cases, onTab, onBack, onTransfer }: Props) {
  const people = usePeople();
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [dirty, setDirty] = useState(false);
  const onDirty = useCallback((d: boolean) => setDirty(d), []);
  const record = people.records.find((r) => r.id === personId);
  const c = cases.get(personId);

  // Несохранённые данные: спросить перед уходом с вкладки или страницы.
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (confirm('Есть несохранённые изменения в данных бойца. Уйти без сохранения?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  if (!people.available) return <GramotkiGate>{null}</GramotkiGate>;
  if (!record) {
    return (
      <div className="card empty stack">
        <div>Такого человека нет в базе людей — возможно, его удалили или передали другому мастеру.</div>
        <div>
          <button className="btn" onClick={onBack}>
            <ArrowLeft size={16} /> К списку
          </button>
        </div>
      </div>
    );
  }
  const fio = fioText(record.fields) || '(без ФИО)';
  const short = shortFio(fio);

  const save = (fields: Record<string, string>) => {
    people.put(record.id, fields, APP_ID);
    toast('Сохранено в грамотке');
  };

  const downloadCard = async () => {
    let photo: Uint8Array | undefined;
    if (workspace && c) {
      const rel = await mainPhoto(workspace, c);
      const raw = rel ? await workspace.readBytes(casePath(c, rel)) : null;
      if (raw) photo = (await prepareImage(raw, { maxSide: 800, crop34: true })) ?? (imageType(raw) ? raw : undefined);
    }
    const name = fileName('Личная карточка', short, 'docx');
    downloadBytes(cardDocx(record, c, photo), name, mimeFor(name));
  };
  const downloadTable = () => {
    const name = fileName('Данные', short, 'xlsx');
    const data = writeXlsxBook([
      { name: 'Карточка', headers: ['Поле', 'Значение'], rows: PERSON_FIELDS.map((f) => [f.label, record.fields[f.id] ?? '']) },
      { name: 'Строка анкеты', headers: PERSON_FIELDS.map((f) => f.label), rows: [PERSON_FIELDS.map((f) => record.fields[f.id] ?? '')] },
      ...(c?.achievements.length ? [{ name: 'Достижения', headers: ['Дата', 'Достижение', 'Уровень'], rows: c.achievements.map((a) => [a.date, a.title, a.level ?? '']) }] : []),
    ]);
    downloadBytes(data, name, mimeFor(name));
  };
  const copyRow = async () => {
    const row = PERSON_FIELDS.map((f) => (record.fields[f.id] ?? '').replace(/[\t\n]+/g, ' ')).join('\t');
    try {
      await navigator.clipboard.writeText(row);
      toast('Строка скопирована — вставьте в таблицу анкет (Ctrl+V)');
    } catch {
      toast('Браузер не дал скопировать');
    }
  };
  const remove = async () => {
    if (!confirm(`Удалить «${fio}» насовсем — вместе с грамоткой (все данные, фото, сканы и документы)?\n\nЕсли боец уходит к другому мастеру, лучше оформить «Перевод».`)) return;
    await people.remove(record.id);
    toast(`Удалено: ${fio}`);
    onBack();
  };

  return (
    <div className="stack">
      <div className="dela-person-head card">
        <button className="icon-btn" onClick={onBack} aria-label="К списку" data-tip="К списку">
          <ArrowLeft size={20} />
        </button>
        <div className="spacer">
          <h2 style={{ margin: 0 }}>{fio}</h2>
          <div className="small muted">{[record.fields['rso.squad'], record.fields['rso.position'], record.fields['person.birthDate'] && `${record.fields['person.birthDate']} г. р.`].filter(Boolean).join(' · ') || 'Заполните данные'}</div>
        </div>
        <button className="btn" onClick={() => onTransfer([record.id])} disabled={cases.readOnly}>
          <ArrowRightLeft size={16} /> Перевод
        </button>
        <Menu
          label="Ещё"
          actions={[
            { label: 'Личная карточка (Word)', icon: <FileText size={16} />, onClick: () => void downloadCard() },
            { label: 'Данные в Excel', icon: <FileSpreadsheet size={16} />, onClick: downloadTable },
            { label: 'Скопировать строкой для таблицы', icon: <ClipboardCopy size={16} />, onClick: () => void copyRow() },
            { label: 'Удалить из базы', icon: <Trash2 size={16} />, onClick: () => void remove(), disabled: people.readOnly },
          ]}
        />
      </div>
      <div className="segmented" role="tablist" aria-label="Разделы бойца">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id} onClick={() => onTab(t.id)}>
            {t.label}
            {t.id === 'data' && dirty ? ' •' : ''}
          </button>
        ))}
      </div>
      {tab === 'data' ? (
        <PersonEditor record={record} readOnly={people.readOnly} onSave={save} onDirty={onDirty} />
      ) : tab === 'folder' ? (
        <FolderView record={record} cases={cases} />
      ) : (
        <TransfersView record={record} cases={cases} onTransfer={() => onTransfer([record.id])} />
      )}
    </div>
  );
}
