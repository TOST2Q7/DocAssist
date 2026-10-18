import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startSecurityWatch } from './core/security/security';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

// Наблюдение за посторонним кодом — до запуска интерфейса, чтобы запомнить «родные» функции браузера.
startSecurityWatch();

/**
 * Внутри чужой страницы (фрейма) приложение не запускается: та страница могла бы подсовывать нажатия
 * (кликджекинг) и подсматривать. Запретить встраивание заголовком на GitHub Pages нельзя — поэтому так.
 */
function framed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

const root = createRoot(document.getElementById('root')!);
if (framed()) {
  root.render(
    <div className="page page--narrow" style={{ padding: 24 }}>
      <h1>DocAssist открыт внутри другой страницы</h1>
      <p>
        Так работать небезопасно: чужая страница может подсматривать и нажимать за вас.{' '}
        <a href={window.location.href} target="_top" rel="noopener">
          Откройте DocAssist напрямую
        </a>
        .
      </p>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
