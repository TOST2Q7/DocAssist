import { CircleHelp, Menu, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOutbox } from '@/core/outbox/outbox';
import { useTheme } from '@/core/theme';
import { useUpdateCheck } from '@/core/update/checkUpdate';
import { BurgerMenu } from './BurgerMenu';
import { Logo } from './Logo';

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const outbox = useOutbox();
  const update = useUpdateCheck();
  const attention = outbox.newCount > 0 || !!update?.hasUpdate;

  return (
    <header className="header">
      <div className="header__inner">
        <Logo />
        <div className="header__spacer" />
        <Link to="/faq" className="icon-btn" data-tip="Частые вопросы" aria-label="Частые вопросы">
          <CircleHelp size={20} />
        </Link>
        <button
          className="icon-btn"
          onClick={toggle}
          data-tip={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button className="icon-btn" onClick={() => setMenuOpen(true)} data-tip="Меню" aria-label="Открыть меню" aria-expanded={menuOpen}>
          <Menu size={22} />
          {attention && <span className="dot" />}
        </button>
      </div>
      {menuOpen && <BurgerMenu onClose={() => setMenuOpen(false)} hasUpdate={!!update?.hasUpdate} />}
    </header>
  );
}
