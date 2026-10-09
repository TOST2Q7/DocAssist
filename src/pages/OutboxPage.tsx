import { Check, Copy, Download, ExternalLink, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addPath } from '@/core/base/base';
import type { Step } from '@/core/base/tree';
import {
  contributionsAsText,
  contributionsFileDocType,
  githubIssueUrl,
  useOutbox,
  type ContributionsFile,
} from '@/core/outbox/outbox';
import { upgrade, wrap } from '@/core/schema/docType';
import { downloadBytes, pickFiles } from '@/core/util/download';
import { formatDateTime, todayStamp } from '@/core/util/format';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from '@/ui/Alert';
import { useToast } from '@/ui/Toast';
import { WorkspaceGate } from '@/ui/WorkspaceGate';

function OutboxView() {
  const outbox = useOutbox();
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<ContributionsFile | null>(null);
  const newItems = outbox.items.filter((c) => c.status === 'new');
  const chosen = useMemo(() => {
    const base = selected.size ? outbox.items.filter((c) => selected.has(c.id)) : newItems;
    return base;
  }, [selected, outbox.items, newItems]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const saveFile = () => {
    downloadBytes(
      JSON.stringify(wrap(contributionsFileDocType, outbox.toFile(chosen)), null, 2),
      `docassist_предложения_${todayStamp()}.json`,
      'application/json',
    );
    outbox.markSent(chosen.map((c) => c.id));
    setSelected(new Set());
  };

  const copyText = async () => {
    await navigator.clipboard?.writeText(contributionsAsText(chosen) + '\n\n' + JSON.stringify(outbox.toFile(chosen)));
    toast('Текст скопирован — вставьте его в сообщение разработчику');
  };

  const openIssue = () => {
    window.open(githubIssueUrl(chosen, outbox.toFile(chosen)), '_blank', 'noopener');
    outbox.markSent(chosen.map((c) => c.id));
    setSelected(new Set());
  };

  const loadFile = async () => {
    const [file] = await pickFiles('.json,application/json', false);
    if (!file) return;
    try {
      setImported(upgrade(contributionsFileDocType, JSON.parse(await file.text())).data);
    } catch (e) {
      toast(`Не удалось прочитать файл: ${e instanceof Error ? e.message : e}`);
    }
  };

  const isPath = (e: unknown): e is Step[] => Array.isArray(e) && e.length > 0 && e.every((s) => s && typeof s.k === 'string' && typeof s.v === 'string');

  const applyImported = async () => {
    if (!workspace || !imported) return;
    let added = 0;
    let skipped = 0;
    for (const item of imported.items) {
      if (!isPath(item.entry)) {
        skipped++;
        continue;
      }
      if (await addPath(workspace, item.dictionary, item.entry, { source: 'import', share: false })) added++;
    }
    toast(`Добавлено в базу: ${added}${skipped ? ` · пропущено записей старого формата: ${skipped}` : ''}`);
    setImported(null);
  };

  return (
    <div className="stack stack--l">
      <div className="stack">
        {outbox.items.length === 0 ? (
          <div className="card empty">
            Пока пусто. Когда вы подтвердите или добавите в базу новое значение (например, село или улицу), оно появится здесь.
          </div>
        ) : (
          <div className="list">
            {outbox.items.map((c) => (
              <label key={c.id} className="list__item" style={{ cursor: 'pointer' }}>
                <input type="checkbox" className="check" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                <div className="list__main">
                  <div className="list__title">{c.label}</div>
                  <div className="list__sub">
                    {c.dictionary} · {formatDateTime(c.createdAt)}
                  </div>
                </div>
                {c.status === 'sent' ? (
                  <span className="badge badge--updated">
                    <Check size={12} /> отправлено
                  </span>
                ) : (
                  <span className="badge badge--new">новое</span>
                )}
                <button
                  className="icon-btn"
                  aria-label="Убрать из списка"
                  data-tip="Убрать из списка"
                  onClick={(e) => {
                    e.preventDefault();
                    outbox.remove(c.id);
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </label>
            ))}
          </div>
        )}
        {outbox.items.length > 0 && (
          <div className="card stack">
            <strong>
              Отправить {selected.size ? `выбранные (${chosen.length})` : `новые (${chosen.length})`}
            </strong>
            <div className="row">
              <button className="btn btn--primary" onClick={saveFile} disabled={!chosen.length}>
                <Download size={16} /> Сохранить файл
              </button>
              <button className="btn" onClick={copyText} disabled={!chosen.length}>
                <Copy size={16} /> Скопировать текст
              </button>
              <button className="btn" onClick={openIssue} disabled={!chosen.length}>
                <ExternalLink size={16} /> Через GitHub
              </button>
              <span className="spacer" />
              <button className="btn btn--ghost btn--sm" onClick={outbox.clearSent}>
                Убрать отправленные
              </button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Файл или текст можно переслать в Telegram, ВКонтакте или по почте. «Через GitHub» откроет готовое сообщение
              (нужен аккаунт GitHub). Отправляются только значения базы (места, улицы, списки) — никаких персональных данных анкет.
            </p>
          </div>
        )}
      </div>

      <section className="stack">
        <h2>Для разработчика: принять предложения</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Загрузите файл, присланный пользователем, — новые значения добавятся в вашу базу.
        </p>
        <div>
          <button className="btn" onClick={loadFile}>
            <Upload size={16} /> Загрузить файл предложений
          </button>
        </div>
        {imported && (
          <div className="card stack">
            <div>
              Файл от версии {imported.appVersion}, {formatDateTime(imported.exportedAt)}. Записей: {imported.items.length}.
            </div>
            <ul className="small" style={{ margin: 0 }}>
              {imported.items.map((i) => (
                <li key={i.id}>
                  [{i.dictionary}] {i.label}
                </li>
              ))}
            </ul>
            <div className="row">
              <button className="btn btn--primary" onClick={() => void applyImported()}>
                Добавить в мою базу
              </button>
              <button className="btn btn--ghost" onClick={() => setImported(null)}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function OutboxPage() {
  return (
    <div className="page page--narrow">
      <div className="page-head">
        <h1>Предложения в общую базу</h1>
        <p>Новые значения, которые вы подтвердили или добавили в базу. Перешлите их разработчику — они войдут в следующую версию для всех.</p>
      </div>
      <Alert kind="info">
        Сейчас пересылка делается вручную (файл, текст или GitHub), потому что приложение работает без сервера. Позже можно
        подключить автоматическую отправку — см. «О программе».
      </Alert>
      <div style={{ height: 16 }} />
      <WorkspaceGate>
        <OutboxView />
      </WorkspaceGate>
    </div>
  );
}
