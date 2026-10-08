import { FolderOpen, HardDrive, KeyRound, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Alert } from './Alert';

/** Показывает содержимое, только когда рабочая папка открыта. Иначе — выбор папки. */
export function WorkspaceGate({ children, asPage = false }: { children: ReactNode; asPage?: boolean }) {
  const { status } = useWorkspace();
  if (status.state === 'ready') return <>{children}</>;
  return asPage ? (
    <div className="page page--narrow">
      <WorkspaceChooser />
    </div>
  ) : (
    <WorkspaceChooser compact />
  );
}

export function WorkspaceChooser({ compact = false }: { compact?: boolean }) {
  const { status, fsSupported, openFolder, useBrowserStorage, restorePermission } = useWorkspace();

  if (status.state === 'loading') {
    return (
      <div className="loading">
        <Loader2 className="spin" size={20} /> Открываем рабочую папку…
      </div>
    );
  }

  if (status.state === 'needs-permission') {
    return (
      <div className="card stack">
        <h2>Нужно разрешение</h2>
        <p className="muted">
          Браузер просит заново подтвердить доступ к папке <strong>«{status.name}»</strong>. Это стандартная защита: после
          перезапуска браузера доступ нужно подтвердить одним нажатием.
        </p>
        <div className="row">
          <button className="btn btn--primary" onClick={restorePermission}>
            <KeyRound size={18} /> Разрешить доступ
          </button>
          <button className="btn" onClick={openFolder}>
            Выбрать другую папку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {!compact && (
        <div className="page-head">
          <h2>Выберите рабочую папку</h2>
          <p>Все файлы и настройки хранятся в ней — на вашем устройстве. В интернет ничего не отправляется.</p>
        </div>
      )}
      {status.state === 'error' && <Alert kind="error">Не удалось открыть рабочую папку: {status.message}</Alert>}
      <div className="grid-2">
        <div className="card stack">
          <div className="row">
            <FolderOpen size={22} className="brand-icon" />
            <h3 style={{ margin: 0 }}>Папка на компьютере</h3>
          </div>
          <p className="muted small">
            Приложение работает прямо с файлами в выбранной папке: кладёте туда таблицы — они видны в приложении, результаты
            сохраняются туда же.
          </p>
          {fsSupported ? (
            <button className="btn btn--primary" onClick={openFolder}>
              Выбрать папку
            </button>
          ) : (
            <Alert kind="warning">
              Этот браузер не умеет работать с папками на диске. Подходят Chrome, Edge, Яндекс Браузер или Opera на компьютере.
            </Alert>
          )}
        </div>
        <div className="card stack">
          <div className="row">
            <HardDrive size={22} className="brand-icon" />
            <h3 style={{ margin: 0 }}>Хранилище браузера</h3>
          </div>
          <p className="muted small">
            Для телефонов и браузеров без доступа к папкам. Файлы загружаются в приложение кнопкой «Загрузить», а результаты
            скачиваются. Данные живут в этом браузере на этом устройстве.
          </p>
          <button className={`btn ${fsSupported ? '' : 'btn--primary'}`} onClick={useBrowserStorage}>
            Использовать хранилище браузера
          </button>
        </div>
      </div>
    </div>
  );
}
