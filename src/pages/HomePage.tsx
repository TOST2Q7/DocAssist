import { ArrowRight, FolderOpen, HardDrive, Layers, ShieldCheck, Variable, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APPS, appPath } from '@/core/registry/apps';
import type { AppManifest } from '@/core/registry/types';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Badges } from '@/ui/Badges';
import { statusBadges } from '@/ui/BurgerMenu';

function AppCard({ app }: { app: AppManifest }) {
  const Icon = app.icon;
  const disabled = app.status === 'soon';
  const body = (
    <>
      <div className="app-card__top">
        <div className="app-card__icon">
          <Icon size={22} />
        </div>
        <Badges itemId={`app:${app.id}`} version={app.version} badges={app.badges} extra={statusBadges(app.status)} />
      </div>
      <h3>{app.title}</h3>
      <p>{app.summary}</p>
      {!disabled && (
        <span className="row small" style={{ color: 'var(--brand)', marginTop: 'auto' }}>
          Открыть <ArrowRight size={16} />
        </span>
      )}
    </>
  );
  return disabled ? (
    <div className="card app-card app-card--disabled" aria-disabled="true">
      {body}
    </div>
  ) : (
    <Link to={appPath(app)} className="card app-card">
      {body}
    </Link>
  );
}

const PRINCIPLES = [
  { icon: ShieldCheck, title: 'Данные остаются у вас', text: 'Всё работает в браузере на вашем устройстве. Анкеты и таблицы никуда не отправляются.' },
  { icon: WifiOff, title: 'Работает без интернета', text: 'После первого открытия приложение можно установить и пользоваться офлайн.' },
  { icon: Layers, title: 'Набор приложений', text: 'Каждое приложение решает одну задачу. Новые появляются в меню и на этой странице автоматически.' },
  { icon: Variable, title: 'Общие переменные', text: 'ФИО, телефоны, адреса сохраняются один раз и подставляются в любом приложении.' },
];

export function HomePage() {
  const { status } = useWorkspace();
  return (
    <div className="page">
      <section className="hero">
        <h1>DocAssist — документы РСО быстрее и без ошибок</h1>
        <p className="hero__lead">
          Набор инструментов для штабов и отрядов: проверка анкет и таблиц, приведение данных к единым шаблонам, подготовка
          документов. Минимум ручной работы — максимум проверок.
        </p>
        <div className="row">
          {status.state === 'ready' ? (
            <Link to="/workspace" className="chip">
              {status.ws.kind === 'browser' ? <HardDrive size={14} /> : <FolderOpen size={14} />}
              Рабочая папка: {status.ws.label}
            </Link>
          ) : (
            <Link to="/workspace" className="btn btn--primary">
              <FolderOpen size={18} /> Выбрать рабочую папку
            </Link>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Приложения</h2>
          <span className="muted small">{APPS.filter((a) => a.status !== 'soon').length} доступно</span>
        </div>
        <div className="grid-apps">
          {APPS.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Как это устроено</h2>
        </div>
        <div className="grid-3">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="card stack stack--s">
              <p.icon size={22} className="brand-icon" />
              <strong>{p.title}</strong>
              <span className="muted small">{p.text}</span>
            </div>
          ))}
        </div>
        <div className="card section stack stack--s">
          <strong>Рабочая папка</strong>
          <span className="muted small">
            Вы выбираете папку — в ней лежат общие файлы (например, выгрузка анкет), а у каждого приложения есть своя
            подпапка с настройками и результатами. Служебные данные ядра хранятся в <code>.docassist</code>. Папку можно
            перенести на другой компьютер — новая версия приложения поймёт данные старой.
          </span>
        </div>
      </section>
    </div>
  );
}
