import { CircleHelp, Menu, Moon, Sun } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useOutbox } from '@/core/outbox/outbox';
import { useTheme } from '@/core/theme';
import { useUpdateCheck } from '@/core/update/checkUpdate';
import { BurgerMenu } from './BurgerMenu';
import { GramotkiButton } from './GramotkiButton';
import { Logo } from './Logo';
import { useSection } from './section';

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };

/** Смена темы «кругом» от кнопки — если браузер умеет View Transitions и движение не выключено. */
function switchThemeFrom(button: HTMLElement, toggle: () => void) {
  const doc = document as ViewTransitionDoc;
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    toggle();
    return;
  }
  const r = button.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(toggle);
  transition.ready
    .then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => {
      /* переход прерван — тема уже сменилась */
    });
}

/** Шапка получает тень, когда страницу прокрутили. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return scrolled;
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const outbox = useOutbox();
  const update = useUpdateCheck();
  const attention = outbox.newCount > 0 || !!update?.hasUpdate;
  const section = useSection();
  const scrolled = useScrolled();

  return (
    <header className={`header ${scrolled ? 'is-scrolled' : ''} ${section ? 'header--crumb' : ''}`}>
      <div className="header__inner">
        <Logo withSub={!section} />
        {section && (
          <span className="crumb">
            <span className="crumb__sep" aria-hidden="true" />
            <Link key={section.key} to={section.to} className="crumb__title" aria-current="page">
              {section.title}
            </Link>
          </span>
        )}
        <div className="header__spacer" />
        <GramotkiButton />
        <Link to="/faq" className="icon-btn" data-tip="Частые вопросы" aria-label="Частые вопросы">
          <CircleHelp size={20} />
        </Link>
        <button
          className="icon-btn"
          onClick={(e: MouseEvent<HTMLButtonElement>) => switchThemeFrom(e.currentTarget, toggle)}
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
      {/* Сколько страницы прочитано — тонкая линия по нижнему краю шапки. */}
      <span className="header__progress" aria-hidden="true" />
      {menuOpen && <BurgerMenu onClose={() => setMenuOpen(false)} hasUpdate={!!update?.hasUpdate} />}
    </header>
  );
}
