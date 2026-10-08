import { Loader2 } from 'lucide-react';
import { Suspense, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApp } from '@/core/registry/apps';
import { markSeen } from '@/core/registry/badges';
import { WorkspaceGate } from './WorkspaceGate';
import { NotFoundPage } from '@/pages/NotFoundPage';

/** Открывает приложение по адресу /apps/:appId. Код приложения загружается только сейчас. */
export function AppHost() {
  const { appId = '' } = useParams();
  const app = getApp(appId);

  useEffect(() => {
    if (app) markSeen(`app:${app.id}`, app.version);
    if (app) document.title = `${app.title} — DocAssist`;
    return () => {
      document.title = 'DocAssist — документы РСО';
    };
  }, [app]);

  if (!app) return <NotFoundPage />;

  if (app.status === 'soon' || !app.component) {
    return (
      <div className="page page--narrow">
        <div className="card stack">
          <h1>{app.title}</h1>
          <p className="muted">{app.description ?? app.summary}</p>
          <p>Приложение в разработке и появится в одной из следующих версий.</p>
          <Link to="/" className="btn">
            На главную
          </Link>
        </div>
      </div>
    );
  }

  const Component = app.component;
  const content = (
    <Suspense
      fallback={
        <div className="loading">
          <Loader2 className="spin" size={20} /> Загрузка приложения…
        </div>
      }
    >
      <Component />
    </Suspense>
  );

  return app.requiresWorkspace ? (
    <WorkspaceGate asPage>{content}</WorkspaceGate>
  ) : (
    content
  );
}
