import {
  ArrowRight,
  CheckCheck,
  ClipboardList,
  FileSpreadsheet,
  FolderOpen,
  HardDrive,
  ShieldCheck,
  Sprout,
  Variable,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APPS, appPath, getApp } from '@/core/registry/apps';
import { SERVICE_MENU } from '@/core/registry/menu';
import type { AppManifest } from '@/core/registry/types';
import { useOutbox } from '@/core/outbox/outbox';
import { extName, type FsEntry } from '@/core/storage/types';
import { TABLE_EXTENSIONS } from '@/core/tables/formats';
import { formatBytes, formatDateTime } from '@/core/util/format';
import { useWorkspace, useWorkspaceRevision } from '@/core/workspace/WorkspaceContext';
import { Badges, CountBadge } from '@/ui/Badges';
import { statusBadges } from '@/ui/BurgerMenu';

/*
 * Главная — «рабочее место мастера»: с чего начать, порядок работы с анкетами,
 * последние таблицы (продолжить с того же места), приложения и сервис.
 */

const CHECK_APP_ID = 'anketa';

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
        <span className="app-card__go">
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

/** Нашивка «Мастер» и путь звезды — рисунок для синей плашки (не логотип РСО). */
function HeroArt() {
  return (
    <svg className="hero-panel__art" viewBox="0 0 260 200" aria-hidden="true">
      <path d="M8 188 C 70 186, 92 120, 150 108 S 220 70, 226 30" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1 9" strokeLinecap="round" opacity="0.55" />
      <path
        d="M226 12.5l5.2 10.6 11.7 1.7-8.5 8.2 2 11.6-10.4-5.5-10.4 5.5 2-11.6-8.5-8.2 11.7-1.7Z"
        fill="currentColor"
      />
      <g transform="rotate(-4 120 130)">
        <rect x="40" y="86" width="160" height="88" rx="14" fill="rgb(255 255 255 / 10%)" stroke="currentColor" strokeWidth="2" />
        <rect x="50" y="96" width="140" height="68" rx="9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.75" />
        <text x="120" y="141" textAnchor="middle" fill="currentColor" className="hero-panel__patch-text">
          МАСТЕР
        </text>
      </g>
    </svg>
  );
}

const STEPS: { title: string; text: string; to?: string; app?: boolean }[] = [
  {
    title: 'Рабочая папка',
    text: 'Выберите папку, куда складываете выгрузки анкет. Таблицы, правки и база хранятся в ней — у вас на устройстве.',
    to: '/workspace',
  },
  {
    title: 'Таблица анкет',
    text: 'Откройте выгрузку (.xlsx, .csv) или вставьте строки из Excel и Google Таблиц через Ctrl+V.',
    app: true,
  },
  {
    title: 'Проверка бойцов',
    text: 'По каждому человеку — 35 полей: ошибки, подсказки и исправления. Паспорт, СНИЛС, ИНН — галочкой «Проверено».',
    app: true,
  },
  {
    title: 'Таблица для штаба',
    text: 'Кнопка «Новая таблица» соберёт исправленный файл. Исходная выгрузка не меняется.',
    app: true,
  },
];

const FACTS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShieldCheck, title: 'Данные остаются у вас', text: 'Паспорта и СНИЛС бойцов никуда не отправляются.' },
  { icon: WifiOff, title: 'Работает без интернета', text: 'На объекте, в дороге, на сезоне — после первого открытия.' },
  { icon: Variable, title: 'Вводите один раз', text: 'Название отряда, адреса, телефоны — Ctrl+Пробел в любом поле.' },
  { icon: CheckCheck, title: 'База растёт сама', text: 'Подтверждённые значения дальше проходят проверку без вас.' },
];

/** Итог под фактами — на всю ширину. */
const GROWS = {
  icon: Sprout,
  title: 'Растёт вместе с вами',
  text: 'Каждая таблица пополняет базу, подсказки и карточки бойцов — чем больше данных, тем быстрее следующая проверка.',
};

/** Последние таблицы рабочей папки — чтобы продолжить проверку с того же места. */
function RecentTables({ checkApp }: { checkApp: AppManifest }) {
  const { workspace } = useWorkspace();
  const rev = useWorkspaceRevision();
  const [files, setFiles] = useState<FsEntry[] | null>(null);

  useEffect(() => {
    if (!workspace) return;
    let alive = true;
    workspace.list('').then((root) => {
      if (!alive) return;
      const tables = root.filter((e) => e.kind === 'file' && TABLE_EXTENSIONS.includes(extName(e.name)));
      setFiles(tables.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0)));
    });
    return () => {
      alive = false;
    };
  }, [workspace, rev]);

  if (files === null) return null;
  if (!files.length) {
    return (
      <div className="recent recent--empty">
        <FileSpreadsheet size={22} className="faint" />
        <span className="spacer muted small">Таблиц пока нет — добавьте выгрузку анкет в «Проверке анкет».</span>
        <Link to={appPath(checkApp)} className="btn btn--sm">
          Добавить таблицу
        </Link>
      </div>
    );
  }
  const shown = files.slice(0, 5);
  return (
    <div className="list recent">
      {shown.map((f) => (
        <Link key={f.path} to={`${appPath(checkApp)}?file=${encodeURIComponent(f.path)}`} className="list__item">
          <FileSpreadsheet size={22} className="brand-icon" />
          <div className="list__main">
            <div className="list__title">{f.name}</div>
            <div className="list__sub">
              {formatDateTime(f.lastModified)} · {formatBytes(f.size)}
            </div>
          </div>
          <span className="recent__go">
            Продолжить <ArrowRight size={16} />
          </span>
        </Link>
      ))}
      {files.length > shown.length && (
        <Link to={appPath(checkApp)} className="list__item recent__more">
          Все таблицы ({files.length}) <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}

export function HomePage() {
  const { status } = useWorkspace();
  const outbox = useOutbox();
  const checkApp = getApp(CHECK_APP_ID);
  const ready = status.state === 'ready';
  const available = APPS.filter((a) => a.status !== 'soon').length;
  const services = SERVICE_MENU.filter((m) => m.id !== 'workspace' && m.id !== 'about');

  return (
    <div className="page home">
      <section className="hero-panel">
        <div className="hero-panel__text">
          <div className="kicker kicker--light">Для мастеров и командного состава отрядов</div>
          <h1>Рабочее место мастера</h1>
          <p className="hero-panel__lead">
            Анкеты бойцов, база данных и документы отряда — в одном месте. DocAssist проверяет каждое поле анкеты,
            подсказывает исправления и собирает чистую таблицу для штаба.
          </p>
          <div className="row hero-panel__actions">
            {checkApp && checkApp.status !== 'soon' && (
              <Link to={appPath(checkApp)} className="btn btn--light btn--lg">
                <ClipboardList size={20} /> Проверить анкеты
              </Link>
            )}
            <Link to="/workspace" className="btn btn--outline-light btn--lg">
              {ready && status.ws.kind === 'browser' ? <HardDrive size={18} /> : <FolderOpen size={18} />}
              {ready ? `Папка: ${status.ws.label}` : 'Выбрать рабочую папку'}
            </Link>
          </div>
        </div>
        <HeroArt />
      </section>

      <section className="section">
        <div className="kicker">Порядок работы</div>
        <ol className="steps">
          {STEPS.map((s, i) => {
            const to = s.to ?? (s.app && checkApp ? appPath(checkApp) : undefined);
            const inner = (
              <>
                <span className="step__num">{i + 1}</span>
                <strong className="step__title">{s.title}</strong>
                <span className="step__text">{s.text}</span>
              </>
            );
            return (
              <li key={s.title} className="step">
                {to ? (
                  <Link to={to} className="step__link">
                    {inner}
                  </Link>
                ) : (
                  <div className="step__link">{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {ready && checkApp && (
        <section className="section">
          <div className="section-title">
            <h2>Продолжить работу</h2>
            <span className="muted small">последние таблицы в рабочей папке</span>
          </div>
          <RecentTables checkApp={checkApp} />
        </section>
      )}

      <section className="section">
        <div className="section-title">
          <h2>Приложения</h2>
          <span className="muted small">
            доступно: {available} · новые появляются здесь сами
          </span>
        </div>
        <div className="grid-apps">
          {APPS.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Сервис</h2>
        </div>
        <div className="tiles">
          {services.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.id} to={item.to} className="tile">
                <Icon size={20} className="brand-icon" />
                <span className="spacer">{item.title}</span>
                <Badges itemId={`menu:${item.id}`} badges={item.badges} />
                {item.counter === 'outbox' && <CountBadge count={outbox.newCount} />}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section facts" aria-label="Как это устроено">
        {FACTS.map((f) => (
          <div key={f.title} className="fact">
            <f.icon size={20} className="brand-icon" />
            <div>
              <strong>{f.title}</strong>
              <div className="muted small">{f.text}</div>
            </div>
          </div>
        ))}
        <div className="fact fact--wide">
          <GROWS.icon size={20} className="brand-icon" />
          <div>
            <strong>{GROWS.title}</strong>
            <div className="muted small">{GROWS.text}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
