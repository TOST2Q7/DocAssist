import { FolderOpen, HardDrive, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { APPS, appPath } from '@/core/registry/apps';
import { SERVICE_MENU } from '@/core/registry/menu';
import type { BadgeDef } from '@/core/registry/types';
import { useOutbox } from '@/core/outbox/outbox';
import { useTheme, type ThemePref } from '@/core/theme';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { Badges, CountBadge } from './Badges';

const THEMES: { id: ThemePref; label: string }[] = [
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
  { id: 'system', label: 'Как в системе' },
];

export function statusBadges(status: string): BadgeDef[] {
  if (status === 'beta') return [{ kind: 'beta' }];
  if (status === 'soon') return [{ kind: 'soon' }];
  return [];
}

export function BurgerMenu({ onClose, hasUpdate }: { onClose: () => void; hasUpdate: boolean }) {
  const { pref, setPref } = useTheme();
  const outbox = useOutbox();
  const { status } = useWorkspace();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <nav className="drawer" aria-label="Главное меню">
        <div className="drawer__head">
          <strong>Меню</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть меню" autoFocus>
            <X size={20} />
          </button>
        </div>
        <div className="drawer__body">
          <div className="menu-section">
            <div className="menu-section__title">Приложения</div>
            {APPS.map((app) => {
              const Icon = app.icon;
              const disabled = app.status === 'soon';
              return (
                <NavLink
                  key={app.id}
                  to={appPath(app)}
                  className={({ isActive }) => `menu-item ${isActive ? 'active' : ''} ${disabled ? 'menu-item--disabled' : ''}`}
                  aria-disabled={disabled}
                  tabIndex={disabled ? -1 : undefined}
                  onClick={onClose}
                >
                  <Icon size={18} />
                  <span className="menu-item__title">{app.title}</span>
                  <Badges itemId={`app:${app.id}`} version={app.version} badges={app.badges} extra={statusBadges(app.status)} />
                </NavLink>
              );
            })}
          </div>
          <div className="menu-section">
            <div className="menu-section__title">Сервис</div>
            {SERVICE_MENU.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.id} to={item.to} className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <Icon size={18} />
                  <span className="menu-item__title">{item.title}</span>
                  <Badges itemId={`menu:${item.id}`} badges={item.badges} />
                  {item.counter === 'outbox' && <CountBadge count={outbox.newCount} />}
                  {item.id === 'about' && hasUpdate && <span className="badge badge--new">Обновление</span>}
                </NavLink>
              );
            })}
          </div>
          <div className="menu-section">
            <div className="menu-section__title">Тема оформления</div>
            <div style={{ padding: '4px 8px' }}>
              <div className="segmented" role="group" aria-label="Тема оформления">
                {THEMES.map((t) => (
                  <button key={t.id} aria-pressed={pref === t.id} onClick={() => setPref(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="menu-section">
            <NavLink to="/workspace" className="menu-item small" onClick={onClose}>
              {status.state === 'ready' && status.ws.kind === 'browser' ? <HardDrive size={16} /> : <FolderOpen size={16} />}
              <span className="menu-item__title muted">
                {status.state === 'ready' ? `Рабочая папка: ${status.ws.label}` : 'Рабочая папка не выбрана'}
              </span>
            </NavLink>
          </div>
        </div>
      </nav>
    </>,
    document.body,
  );
}
