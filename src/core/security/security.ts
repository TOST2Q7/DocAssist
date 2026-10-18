import { IS_SINGLE_FILE, PAGES_ORIGIN } from '../config';

/*
 * Проверка устройства «не слушает ли кто-то» — насколько это вообще видно изнутри страницы.
 * Отдельный блок: остальные части только запускают проверку и показывают результат.
 *
 * Что видно: защищённое ли соединение, тот ли это адрес, не встроена ли страница в чужую, не вставлены ли
 * посторонние скрипты (их ещё и блокирует политика безопасности страницы, CSP), не подменены ли функции
 * отправки данных и шифрования, не управляет ли браузером программа, свой ли служебный обработчик.
 * Чего не видно (и как проверить руками) — CANNOT_CHECK.
 */

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';

export interface SecurityCheck {
  id: string;
  title: string;
  status: CheckStatus;
  text: string;
}

/** Откуда приложению можно загружать скрипты и окна: свой адрес и Google (вход, окно выбора). */
const TRUSTED = new Set([
  'https://accounts.google.com',
  'https://apis.google.com',
  'https://docs.google.com',
  'https://drive.google.com',
  'https://www.gstatic.com',
  'https://ssl.gstatic.com',
  'https://fonts.gstatic.com',
  'https://www.googleapis.com',
  'https://sheets.googleapis.com',
]);

const violations: { what: string; where: string }[] = [];
const foreign = new Set<string>();
const originals: Record<string, unknown> = {};
let watching = false;

function originOf(url: string): string {
  try {
    return new URL(url, location.href).origin;
  } catch {
    return url;
  }
}

function trusted(url: string): boolean {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return true;
  const o = originOf(url);
  return o === location.origin || TRUSTED.has(o);
}

function scanElement(el: Element) {
  const tag = el.tagName;
  const src = tag === 'SCRIPT' || tag === 'IFRAME' ? el.getAttribute('src') : tag === 'LINK' && /stylesheet|preload|modulepreload/.test(el.getAttribute('rel') ?? '') ? el.getAttribute('href') : null;
  if (src && !trusted(src)) foreign.add(src.startsWith('chrome-extension:') || src.startsWith('moz-extension:') || src.startsWith('safari-web-extension:') ? `расширение браузера (${originOf(src)})` : originOf(src));
}

/** Ссылки на «родные» функции браузера в момент запуска — потом сверяем, не подменили ли их. */
function captureNatives() {
  originals.fetch = window.fetch;
  originals.xhrOpen = XMLHttpRequest.prototype.open;
  originals.xhrSend = XMLHttpRequest.prototype.send;
  originals.sendBeacon = navigator.sendBeacon;
  originals.WebSocket = window.WebSocket;
  originals.encrypt = crypto.subtle?.encrypt;
  originals.decrypt = crypto.subtle?.decrypt;
  originals.importKey = crypto.subtle?.importKey;
}

function currentNatives(): Record<string, unknown> {
  return {
    fetch: window.fetch,
    xhrOpen: XMLHttpRequest.prototype.open,
    xhrSend: XMLHttpRequest.prototype.send,
    sendBeacon: navigator.sendBeacon,
    WebSocket: window.WebSocket,
    encrypt: crypto.subtle?.encrypt,
    decrypt: crypto.subtle?.decrypt,
    importKey: crypto.subtle?.importKey,
  };
}

const NATIVE_NAMES: Record<string, string> = {
  fetch: 'отправка запросов (fetch)',
  xhrOpen: 'отправка запросов (XMLHttpRequest)',
  xhrSend: 'отправка запросов (XMLHttpRequest)',
  sendBeacon: 'фоновая отправка (sendBeacon)',
  WebSocket: 'постоянное соединение (WebSocket)',
  encrypt: 'шифрование',
  decrypt: 'расшифровка',
  importKey: 'работа с ключами',
};

function isNative(fn: unknown): boolean {
  if (typeof fn !== 'function') return true;
  try {
    return /\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn));
  } catch {
    return false;
  }
}

/** Начать наблюдение — один раз, как можно раньше (при запуске приложения). */
export function startSecurityWatch(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  captureNatives();
  document.addEventListener('securitypolicyviolation', (e) => {
    violations.push({ what: e.effectiveDirective || e.violatedDirective, where: e.blockedURI || 'встроенный код' });
  });
  document.querySelectorAll('script, iframe, link').forEach(scanElement);
  new MutationObserver((list) => {
    for (const m of list) {
      m.addedNodes.forEach((n) => {
        if (n instanceof Element) {
          scanElement(n);
          n.querySelectorAll?.('script, iframe, link').forEach(scanElement);
        }
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

function hasCsp(): boolean {
  return !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
}

/** Запустить все проверки. */
export async function runSecurityCheck(): Promise<SecurityCheck[]> {
  startSecurityWatch();
  const out: SecurityCheck[] = [];
  const add = (id: string, title: string, status: CheckStatus, text: string) => out.push({ id, title, status, text });

  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (IS_SINGLE_FILE) add('https', 'Соединение', 'info', 'Версия-файл открыта с диска: в интернет она ходит только за номером версии.');
  else if (local) add('https', 'Соединение', 'info', 'Локальный адрес этого компьютера (режим разработки): до Google данные идут по защищённому соединению.');
  else if (window.isSecureContext && location.protocol === 'https:') add('https', 'Соединение', 'ok', 'Защищённое (https): по пути данные не прочитать и не подменить.');
  else add('https', 'Соединение', 'fail', 'Страница открыта без защиты (http). Любой в той же сети может видеть и подменять данные. Откройте адрес с https.');

  if (IS_SINGLE_FILE) add('origin', 'Адрес приложения', 'info', 'Версия-файл. Скачивайте её только со страницы релизов DocAssist на GitHub.');
  else if (local) add('origin', 'Адрес приложения', 'info', `Копия на этом компьютере (${location.origin}) — для разработки.`);
  else if (location.origin === PAGES_ORIGIN) add('origin', 'Адрес приложения', 'ok', `Настоящий адрес DocAssist (${location.origin}).`);
  else add('origin', 'Адрес приложения', 'warn', `Приложение открыто с адреса ${location.origin}, а не ${PAGES_ORIGIN}. Если вы не размещали его сами — это может быть подделка.`);

  if (window.top === window.self) add('frame', 'Чужая страница вокруг', 'ok', 'Приложение открыто само по себе, не внутри другой страницы.');
  else add('frame', 'Чужая страница вокруг', 'fail', 'Приложение встроено в другую страницу — она может подсматривать, что вы нажимаете. Откройте DocAssist напрямую.');

  if (window.opener) add('opener', 'Кто открыл окно', 'warn', 'Окно открыто из другой страницы. Безопаснее открыть DocAssist заново из закладки или ярлыка.');
  else add('opener', 'Кто открыл окно', 'ok', 'Окно открыто напрямую.');

  if (IS_SINGLE_FILE) add('csp', 'Защита от посторонних скриптов', 'info', 'В версии-файле нет: она не ходит в интернет и не работает с Google.');
  else if (!hasCsp() && local) add('csp', 'Защита от посторонних скриптов', 'info', 'В режиме разработки защита выключена (включается в собранной версии).');
  else if (!hasCsp()) add('csp', 'Защита от посторонних скриптов', 'warn', 'Политика безопасности страницы не найдена — это не та сборка DocAssist.');
  else if (violations.length) {
    const list = [...new Set(violations.map((v) => v.where))].slice(0, 5).join(', ');
    add('csp', 'Защита от посторонних скриптов', 'warn', `Защита работает и уже ${violations.length === 1 ? 'остановила попытку' : `остановила ${violations.length} попыток`} загрузить чужое: ${list}. Чаще всего это расширение браузера.`);
  } else add('csp', 'Защита от посторонних скриптов', 'ok', 'Включена; попыток загрузить чужой код не было.');

  if (foreign.size) add('foreign', 'Посторонний код на странице', 'warn', `На странице появился код не от DocAssist и не от Google: ${[...foreign].slice(0, 5).join(', ')}. Проверьте расширения браузера.`);
  else add('foreign', 'Посторонний код на странице', 'ok', 'Только код DocAssist и Google.');

  const now = currentNatives();
  const replaced = new Set<string>();
  for (const [k, fn] of Object.entries(now)) if (!isNative(fn) || (originals[k] !== undefined && originals[k] !== fn)) replaced.add(NATIVE_NAMES[k]);
  if (!isNative(Function.prototype.toString)) replaced.add('проверка функций');
  if (replaced.size) add('natives', 'Подмена функций браузера', 'fail', `Подменено: ${[...replaced].join(', ')}. Так программы и расширения перехватывают данные. Не вводите контрольную фразу на этом устройстве, пока не разберётесь.`);
  else add('natives', 'Подмена функций браузера', 'ok', 'Отправка данных и шифрование — родные, браузерные.');

  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) add('automation', 'Управление браузером', 'warn', 'Браузером управляет программа (режим автоматизации). Если вы её не запускали — закройте браузер.');
  else add('automation', 'Управление браузером', 'ok', 'Браузером управляете вы, а не программа.');

  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    const alien = regs.filter((r) => {
      const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? '';
      return url && (originOf(url) !== location.origin || !/\/sw\.js$/.test(new URL(url).pathname));
    });
    if (alien.length) add('sw', 'Фоновый обработчик', 'warn', 'Зарегистрирован чужой фоновый обработчик страницы. Очистите данные сайта в настройках браузера и откройте DocAssist заново.');
    else add('sw', 'Фоновый обработчик', 'ok', regs.length ? 'Только свой (для работы без интернета).' : 'Нет.');
  } catch {
    add('sw', 'Фоновый обработчик', 'info', 'Браузер не дал проверить.');
  }

  if (globalThis.crypto?.subtle) add('crypto', 'Шифрование в браузере', 'ok', 'Доступно: контрольная фраза и ключ не покидают устройство.');
  else add('crypto', 'Шифрование в браузере', 'fail', 'Недоступно — шифровать личные настройки здесь нельзя.');

  return out;
}

/** Чего изнутри страницы не видно — и как проверить самому. */
export const CANNOT_CHECK: { title: string; text: string }[] = [
  {
    title: 'Перехват защищённого соединения на самом устройстве',
    text: 'Антивирус с «проверкой HTTPS», рабочий прокси или подставной сертификат читают всё, что идёт по сети, а страница этого не видит. Проверьте сами: значок замка в адресной строке → «Подключение защищено» → «Сертификат действителен» → «Кем выдан». Для адресов Google там должна быть Google Trust Services, для github.io — известный центр сертификации, а не название антивируса, компании или программы.',
  },
  {
    title: 'Запись экрана, удалённый доступ, перехват клавиатуры',
    text: 'Программы вроде удалённого рабочего стола или клавиатурных шпионов браузеру не видны. Не вводите контрольную фразу при включённом удалённом доступе, демонстрации экрана и на чужих компьютерах.',
  },
  {
    title: 'Расширения браузера',
    text: 'Расширения с правом «читать и изменять данные на всех сайтах» видят страницу целиком. Список — в настройках браузера (Расширения). Оставьте только нужные или работайте в отдельном профиле браузера.',
  },
  {
    title: 'Заражённое устройство',
    text: 'Если на устройстве вредоносная программа, никакая проверка в браузере её не обнаружит. Обновляйте систему и браузер, проверяйте устройство антивирусом.',
  },
];
