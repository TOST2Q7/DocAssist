import {
  ArrowDown,
  ArrowRight,
  CheckCheck,
  FileSpreadsheet,
  FolderOpen,
  HardDrive,
  ShieldCheck,
  Sprout,
  Upload,
  Variable,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '@/core/config';
import { useOutbox } from '@/core/outbox/outbox';
import { APPS, appPath, getApp } from '@/core/registry/apps';
import { SERVICE_MENU } from '@/core/registry/menu';
import type { AppManifest } from '@/core/registry/types';
import { PERSON_FIELDS } from '@/core/schema/fields';
import { extName, type FsEntry } from '@/core/storage/types';
import { TABLE_EXTENSIONS } from '@/core/tables/formats';
import { formatBytes, formatDateTime } from '@/core/util/format';
import { useWorkspace, useWorkspaceRevision } from '@/core/workspace/WorkspaceContext';
import { Badges, CountBadge } from '@/ui/Badges';
import { Dimension, SectionHead, Sky, SplitWords, Stamp, useReveal } from '@/ui/Blueprint';
import { statusBadges } from '@/ui/BurgerMenu';
import { useCountUp, useHoverTrack } from '@/ui/effects';

/*
 * Главная — обложка. Первый экран отвечает на три вопроса простыми словами:
 * что это, что можно сделать (плитки приложений) и где мои файлы. Здесь — всё движение и «вау».
 * Ниже — коротко: продолжить работу, как это работает, ещё полезное, важно знать.
 * Разделы-инструменты (приложения, сервис) — спокойные и быстрые.
 */

/** Номер по порядку с ведущим нулём: 1 → «01». */
const no = (n: number) => String(n).padStart(2, '0');
/** Порядковый номер для задержки появления (CSS: --i). */
const order = (i: number) => ({ '--i': i }) as CSSProperties;

const CHECK_APP_ID = 'anketa';

/** Таблицы рабочей папки, новые сверху. */
function useRecentTables(): FsEntry[] | null {
  const { workspace } = useWorkspace();
  const rev = useWorkspaceRevision();
  const [files, setFiles] = useState<FsEntry[] | null>(null);
  useEffect(() => {
    if (!workspace) {
      setFiles(null);
      return;
    }
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
  return files;
}

const openTable = (app: AppManifest, f: FsEntry) => `${appPath(app)}?file=${encodeURIComponent(f.path)}`;

/** Плитка на обложке: что можно сделать. Большая цель для нажатия, одна фраза, стрелка. */
function CoverApp({ app, index }: { app: AppManifest; index: number }) {
  const Icon = app.icon;
  const soon = app.status === 'soon';
  const body = (
    <>
      <span className="glow" aria-hidden="true" />
      <span className="cover-app__icon">
        <Icon size={22} />
      </span>
      <span className="cover-app__text">
        <span className="cover-app__title">
          {app.title}
          {/* На обложке — только то, что важно обычному человеку: «Новое!» и «Скоро». */}
          <Badges
            itemId={`app:${app.id}`}
            version={app.version}
            badges={app.badges?.filter((b) => b.kind === 'new')}
            extra={statusBadges(app.status).filter((b) => b.kind === 'soon')}
          />
        </span>
        <span className="cover-app__line">{app.tagline ?? app.summary}</span>
      </span>
      {!soon && <ArrowRight size={20} className="cover-app__go" />}
    </>
  );
  const style = { '--i': index } as CSSProperties;
  // Первое приложение — главное действие: белая плитка, как главная кнопка.
  const primary = index === 0;
  return soon ? (
    <div className="cover-app cover-app--soon" style={style} aria-disabled="true">
      {body}
    </div>
  ) : (
    <Link to={appPath(app)} className={`cover-app spotlight ${primary ? 'cover-app--primary' : ''}`} style={style}>
      {body}
    </Link>
  );
}

const STEPS: { title: string; text: string; to?: string; app?: boolean }[] = [
  {
    title: 'Выберите папку',
    text: 'Один раз укажите папку, куда складываете выгрузки анкет. Всё хранится в ней — у вас на устройстве.',
    to: '/workspace',
  },
  {
    title: 'Откройте таблицу',
    text: 'Добавьте файл Excel или CSV — или скопируйте строки из таблицы и нажмите Ctrl+V.',
    app: true,
  },
  {
    title: 'Проверьте бойцов',
    text: 'У каждого человека видно, что не так и как исправить. Паспорт, СНИЛС, ИНН — отметьте галочкой «Проверено».',
    app: true,
  },
  {
    title: 'Отправьте в штаб',
    text: 'Кнопка «Новая таблица» соберёт исправленный файл. Исходный файл не меняется.',
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

export function HomePage() {
  const { status } = useWorkspace();
  const outbox = useOutbox();
  const checkApp = getApp(CHECK_APP_ID);
  const ready = status.state === 'ready';
  const tables = useRecentTables();
  const latest = tables?.[0];
  const available = APPS.filter((a) => a.status !== 'soon').length;
  const services = SERVICE_MENU.filter((m) => m.id !== 'workspace' && m.id !== 'about');
  const page = useReveal<HTMLDivElement>();
  const toc = useHoverTrack<HTMLElement>('.toc__item');
  const below = useRef<HTMLDivElement>(null);
  // Числа на листе «набегают», пока прочерчивается рамка.
  const fields = useCountUp(PERSON_FIELDS.length, { delay: 500 });
  const apps = useCountUp(available, { delay: 600, duration: 600 });
  // Номера разделов идут подряд, даже когда «Продолжить работу» скрыт.
  let section = 0;
  const next = () => no(++section);

  return (
    <div className="page home" ref={page}>
      <section className="sheet cover spotlight" aria-labelledby="home-title">
        <Sky />
        <div className="cover__main">
          <div className="kicker kicker--light">Для мастеров и командного состава отрядов</div>
          <div className="measured">
            <h1 id="home-title" aria-label="Рабочее место мастера">
              <SplitWords text="Рабочее место мастера" delay={100} />
            </h1>
            <Dimension>
              <span className="num">{fields}</span> полей анкеты · 0 ошибок
            </Dimension>
          </div>
          <p className="sheet__lead">
            Проверяйте анкеты бойцов и ведите личные дела — быстро, без ошибок и без интернета. Всё хранится только у вас.
          </p>

          <div className="cover__ask">Что нужно сделать?</div>
          <div className="cover-apps">
            {APPS.map((app, i) => (
              <CoverApp key={app.id} app={app} index={i} />
            ))}
          </div>

          <div className="cover__foot">
            {ready && latest && checkApp && (
              <Link to={openTable(checkApp, latest)} className="cover-chip cover-chip--accent">
                <FileSpreadsheet size={16} />
                <span className="cover-chip__label">Продолжить:</span>
                <span className="cover-chip__value">{latest.name}</span>
                <ArrowRight size={16} />
              </Link>
            )}
            <Link to="/workspace" className="cover-chip">
              {ready && status.ws.kind === 'browser' ? <HardDrive size={16} /> : <FolderOpen size={16} />}
              {ready ? (
                <>
                  <span className="cover-chip__label">Рабочая папка:</span>
                  <span className="cover-chip__value">{status.ws.label}</span>
                </>
              ) : (
                <span className="cover-chip__value">Выбрать рабочую папку — это нужно один раз</span>
              )}
            </Link>
          </div>
          <p className="sheet__hint">
            <Upload size={16} /> Сканы, фото и таблицы можно просто перетащить в окно — DocAssist спросит, что это за файл и на чьё имя его закрепить.
          </p>
        </div>

        <div className="sheet__side" aria-hidden="true">
          <Stamp className="sheet__stamp" />
        </div>
        {/* Основная надпись листа — как в правом нижнем углу чертежа. */}
        <dl className="sheet__titleblock" aria-label="О программе">
          <div className="sheet__tb-name">
            <dt>Программа</dt>
            <dd>DocAssist</dd>
          </div>
          <div>
            <dt>Приложений</dt>
            <dd className="num">{apps}</dd>
          </div>
          <div>
            <dt>Полей анкеты</dt>
            <dd className="num">{fields}</dd>
          </div>
          <div>
            <dt>Версия</dt>
            <dd>{APP_VERSION}</dd>
          </div>
        </dl>
        <button type="button" className="cover__more" onClick={() => below.current?.scrollIntoView({ behavior: 'smooth' })}>
          Как это работает <ArrowDown size={16} />
        </button>
      </section>

      <div ref={below} className="home__below">
        {ready && checkApp && !!tables?.length && (
          <section className="section reveal">
            <SectionHead no={next()} title="Продолжить работу" aside="последние таблицы в рабочей папке" />
            <div className="list recent">
              {tables.slice(0, 5).map((f) => (
                <Link key={f.path} to={openTable(checkApp, f)} className="list__item">
                  <FileSpreadsheet size={22} className="brand-icon" />
                  <div className="list__main">
                    <div className="list__title">{f.name}</div>
                    <div className="list__sub">
                      <span className="mono">{formatDateTime(f.lastModified)}</span> · {formatBytes(f.size)}
                    </div>
                  </div>
                  <span className="recent__go">
                    Продолжить <ArrowRight size={16} />
                  </span>
                </Link>
              ))}
              {tables.length > 5 && (
                <Link to={appPath(checkApp)} className="list__item recent__more">
                  Все таблицы ({tables.length}) <ArrowRight size={16} />
                </Link>
              )}
            </div>
          </section>
        )}

        <section className="section reveal">
          <SectionHead no={next()} title="Как это работает" aside="проверка анкет за четыре шага" />
          <ol className="techcard">
            {STEPS.map((s, i) => {
              const to = s.to ?? (s.app && checkApp ? appPath(checkApp) : undefined);
              const inner = (
                <>
                  <span className="glow" aria-hidden="true" />
                  <span className="techcard__no">{no(i + 1)}</span>
                  <strong className="techcard__title">{s.title}</strong>
                  <span className="techcard__text">{s.text}</span>
                  {to && (
                    <span className="techcard__go">
                      Перейти <ArrowRight size={14} />
                    </span>
                  )}
                </>
              );
              return (
                <li key={s.title} className="techcard__step" style={order(i)}>
                  {to ? (
                    <Link to={to} className="techcard__link spotlight">
                      {inner}
                    </Link>
                  ) : (
                    <div className="techcard__link">{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="section reveal">
          <SectionHead no={next()} title="Ещё полезное" aside="справка, база, настройки" />
          <nav className="toc" aria-label="Ещё полезное" ref={toc}>
            {services.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.id} to={item.to} className="toc__item">
                  <Icon size={18} className="toc__icon" />
                  <span className="toc__title">{item.title}</span>
                  <span className="toc__leader" aria-hidden="true" />
                  <Badges itemId={`menu:${item.id}`} badges={item.badges} />
                  {item.counter === 'outbox' && <CountBadge count={outbox.newCount} />}
                  <ArrowRight size={16} className="toc__arrow" />
                </Link>
              );
            })}
          </nav>
        </section>

        <section className="section reveal">
          <SectionHead no={next()} title="Важно знать" />
          <ol className="notes">
            {FACTS.map((f, i) => (
              <li key={f.title} className="note" style={order(i)}>
                <f.icon size={18} className="note__icon" />
                <div>
                  <strong>{f.title}</strong>
                  <div className="muted small">{f.text}</div>
                </div>
              </li>
            ))}
            <li className="note note--wide" style={order(FACTS.length)}>
              <GROWS.icon size={18} className="note__icon" />
              <div>
                <strong>{GROWS.title}</strong>
                <div className="muted small">{GROWS.text}</div>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
