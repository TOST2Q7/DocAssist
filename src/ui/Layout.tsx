import { Download, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP_VERSION, IS_SINGLE_FILE } from '@/core/config';
import { usePrefsSync } from '@/core/settings/prefs';
import { useUpdateCheck } from '@/core/update/checkUpdate';
import { FileDrop } from './FileDrop';
import { usePointerEffects } from './effects';
import { Header } from './Header';
import { sectionKey, useSection } from './section';
import { SyncAuto } from './SyncAuto';
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

/** Подвал — в виде «основной надписи» чертежа, но простыми словами. В графе «Раздел» — где вы сейчас. */
function Footer() {
  const section = useSection();
  const home = useLocation().pathname === '/';
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="stamp">
          <div className="stamp__cell">
            <span className="stamp__label">Программа</span>
            <span className="stamp__value stamp__name">DocAssist</span>
          </div>
          <div className="stamp__cell">
            <span className="stamp__label">Раздел</span>
            <span className="stamp__value">{section?.title ?? (home ? 'Главная' : '—')}</span>
          </div>
          <div className="stamp__cell">
            <span className="stamp__label">Версия</span>
            <span className="stamp__value mono">{APP_VERSION}</span>
          </div>
          <div className="stamp__cell">
            <span className="stamp__label">Ваши данные</span>
            <span className="stamp__value">на этом устройстве</span>
          </div>
          <div className="stamp__cell">
            <span className="stamp__label">Помощь</span>
            <span className="stamp__links">
              <Link to="/help">Справка</Link>
              <Link to="/faq">Частые вопросы</Link>
              <Link to="/about">О программе</Link>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function Layout() {
  usePrefsSync();
  usePointerEffects();
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <Header />
      {IS_SINGLE_FILE ? <FileUpdateBanner /> : <UpdateBanner />}
      <main className="main">
        {/* Новый раздел проявляется; внутри раздела (вкладки, люди) ничего не перерисовывается заново. */}
        <div className="route" key={sectionKey(pathname)}>
          <Outlet />
        </div>
      </main>
      <VarSuggest />
      <Tooltip />
      <FileDrop />
      <SyncAuto />
      <Footer />
      {/* Новая страница открывается сверху, «Назад» возвращает туда, где были. Внутри страницы (?…) не прыгает. */}
      <ScrollRestoration getKey={(location) => location.pathname} />
    </div>
  );
}
