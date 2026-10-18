import { Download, ExternalLink, Share } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IS_SINGLE_FILE, PAGES_ORIGIN, GITHUB_REPO } from '@/core/config';
import { Modal } from './Modal';

/*
 * «Установить приложение»: в Chrome, Edge и на Android — системное окно установки, на iPhone — подсказка
 * «Поделиться → На экран Домой», в версии-файле — ссылка на сайт (установить можно только с сайта).
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export const SITE_URL = `${PAGES_ORIGIN}/${GITHUB_REPO}/`;

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function InstallButton() {
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);

  if (IS_SINGLE_FILE) {
    return (
      <a className="btn" href={SITE_URL} target="_blank" rel="noreferrer">
        <ExternalLink size={16} /> Открыть сайт и установить приложение
      </a>
    );
  }
  if (isStandalone()) return <span className="small muted">Приложение установлено на этом устройстве ✓</span>;

  return (
    <>
      <button
        className="btn"
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            await deferred.userChoice.catch(() => undefined);
            deferred = null;
            force((n) => n + 1);
          } else setHelp(true);
        }}
      >
        <Download size={16} /> Установить приложение
      </button>
      {help && (
        <Modal title="Как установить DocAssist" onClose={() => setHelp(false)}>
          {isIos() ? (
            <ol className="stack stack--s" style={{ margin: 0 }}>
              <li>Откройте этот сайт в Safari (в других браузерах на iPhone установить нельзя).</li>
              <li>
                Нажмите «Поделиться» <Share size={14} style={{ verticalAlign: '-2px' }} /> внизу экрана.
              </li>
              <li>Выберите «На экран Домой» → «Добавить».</li>
              <li>Запускайте DocAssist значком на экране «Домой» — так iOS не удаляет данные приложения.</li>
            </ol>
          ) : (
            <ol className="stack stack--s" style={{ margin: 0 }}>
              <li>Chrome, Edge, Яндекс Браузер на компьютере: значок «Установить» в правой части адресной строки или меню ⋮ → «Установить DocAssist».</li>
              <li>Android: меню ⋮ → «Установить приложение» (или «Добавить на главный экран»).</li>
              <li>Firefox на компьютере устанавливать сайты как приложения не умеет — откройте DocAssist в Chrome или Edge.</li>
              <li>Если пункта нет — приложение, возможно, уже установлено: поищите DocAssist в списке программ.</li>
            </ol>
          )}
        </Modal>
      )}
    </>
  );
}
