import { RefreshCw } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP_VERSION } from '@/core/config';
import { Header } from './Header';

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
  return (
    <div className="app-shell">
      <Header />
      <UpdateBanner />
      <main className="main">
        <Outlet />
      </main>
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
