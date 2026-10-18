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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
