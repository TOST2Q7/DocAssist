import { Download, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP_VERSION, IS_SINGLE_FILE } from '@/core/config';
import { usePrefsSync } from '@/core/settings/prefs';
import { useUpdateCheck } from '@/core/update/checkUpdate';
import { Header } from './Header';
import { Tooltip } from './Tooltip';
import { VarSuggest } from './VarSuggest';

/** Версия-файл сама не обновляется — предлагаем скачать новую со страницы релизов. */
function FileUpdateBanner() {
  const info = useUpdateCheck();
  const [hidden, setHidden] = useState(false);
  if (!info?.hasUpdate || hidden) return null;
  return (
    <div className="update-banner" role="status">
      <div className="update-banner__inner">
        <Download size={16} />
        <span className="spacer">
          Вышла версия DocAssist {info.latest} (у вас {APP_VERSION}). Ваши данные сохранятся.
        </span>
        <a className="btn btn--sm btn--primary" href={info.url} target="_blank" rel="noreferrer">
          Скачать
        </a>
        <button className="btn btn--sm btn--ghost" onClick={() => setHidden(true)}>
          Позже
        </button>
      </div>
    </div>
  );
}

function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <div className="update-banner__inner">
        <RefreshCw size={16} />
        <span className="spacer">Доступна новая версия DocAssist.</span>
        <button className="btn btn--sm btn--primary" onClick={() => updateServiceWorker(true)}>
          Обновить
        </button>
        <button className="btn btn--sm btn--ghost" onClick={() => setNeedRefresh(false)}>
          Позже
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  usePrefsSync();
  return (
    <div className="app-shell">
      <Header />
      {IS_SINGLE_FILE ? <FileUpdateBanner /> : <UpdateBanner />}
      <main className="main">
        <Outlet />
      </main>
      <VarSuggest />
      <Tooltip />
      <footer className="footer">
        <div className="footer__inner">
          <span>DocAssist v{APP_VERSION} · работает локально, данные не покидают устройство</span>
          <span>
            <Link to="/faq">Частые вопросы</Link> · <Link to="/about">О программе</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
