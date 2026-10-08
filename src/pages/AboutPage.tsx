import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { APP_VERSION, BUILD_DATE, GITHUB_URL } from '@/core/config';
import { cachedUpdateInfo, checkForUpdate, type UpdateInfo } from '@/core/update/checkUpdate';
import { formatDateTime } from '@/core/util/format';
import { isFsAccessSupported } from '@/core/storage/fsAccess';
import { Alert } from '@/ui/Alert';

const SUPPORT: [string, string, string][] = [
  ['Chrome, Edge, Яндекс, Opera (ПК)', 'Да — папка на диске', 'Полная поддержка'],
  ['Firefox (ПК)', 'Нет — хранилище браузера', 'Всё работает, но файлы загружаются и скачиваются вручную'],
  ['Safari (Mac)', 'Нет — хранилище браузера', 'То же, что Firefox'],
  ['Android (Chrome, Яндекс)', 'Нет — хранилище браузера', 'Работает; можно установить на главный экран'],
  ['iPhone / iPad (любой браузер)', 'Нет — хранилище браузера', 'Работает; установите на экран «Домой», чтобы iOS не удаляла данные'],
];

export function AboutPage() {
  const [info, setInfo] = useState<UpdateInfo | null>(cachedUpdateInfo);
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle');
  const [error, setError] = useState('');

  const check = async () => {
    setState('checking');
    try {
      setInfo(await checkForUpdate());
      setState('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  };

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <h1>О программе</h1>
        <p>DocAssist — набор инструментов для ускорения и автоматизации работы с документами РСО.</p>
      </div>
      <div className="stack stack--l">
        <section className="card stack">
          <div className="row">
            <div className="spacer">
              <strong>Версия {APP_VERSION}</strong>
              <div className="small muted">Сборка от {formatDateTime(BUILD_DATE)}</div>
            </div>
            <button className="btn" onClick={check} disabled={state === 'checking'}>
              <RefreshCw size={16} className={state === 'checking' ? 'spin' : ''} /> Проверить обновления
            </button>
          </div>
          {info && (
            <Alert kind={info.hasUpdate ? 'warning' : 'success'}>
              {info.hasUpdate ? (
                <>
                  Доступна версия <strong>{info.latest}</strong>. Обновите страницу (или нажмите «Обновить» в появившейся полосе сверху).
                </>
              ) : (
                <>У вас последняя версия ({info.latest}). Проверено {formatDateTime(info.checkedAt)}.</>
              )}
            </Alert>
          )}
          {state === 'error' && <Alert kind="error">Не удалось проверить: {error}. Возможно, нет интернета — это не мешает работе.</Alert>}
          <p className="small muted" style={{ margin: 0 }}>
            Проверка обновлений — единственный запрос в интернет: приложение узнаёт номер последней версии на{' '}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            . Ваши данные никуда не отправляются.
          </p>
        </section>

        <section className="stack">
          <h2>Где работает</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Браузер / устройство</th>
                  <th>Работа с папкой на диске</th>
                  <th>Итог</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORT.map(([a, b, c]) => (
                  <tr key={a}>
                    <td>{a}</td>
                    <td>{b}</td>
                    <td>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Этот браузер: {isFsAccessSupported() ? 'умеет работать с папками на диске ✓' : 'работает через хранилище браузера'}. Прямой доступ к
            папкам (File System Access API) есть только в браузерах на движке Chromium на компьютере. На iPhone все браузеры
            работают на движке Safari, поэтому там — только хранилище браузера.
          </p>
        </section>

        <section className="stack">
          <h2>Офлайн и установка</h2>
          <p className="muted" style={{ margin: 0 }}>
            После первого открытия приложение сохраняется в браузере и работает без интернета. Его можно установить как
            программу: в Chrome/Edge — значок «Установить» в адресной строке; на Android — «Добавить на главный экран»; на
            iPhone — «Поделиться» → «На экран Домой».
          </p>
        </section>

        <section className="stack">
          <h2>Как новые слова попадают в общую базу</h2>
          <p className="muted" style={{ margin: 0 }}>
            Всё, что вы добавляете в справочники, собирается в «Предложениях в базу». Сейчас работают способы без сервера:
            файл, текст для мессенджера и GitHub Issue. Варианты автоматической отправки на будущее:
          </p>
          <ul className="muted small" style={{ margin: 0 }}>
            <li>Google/Яндекс Форма — приложение отправляет слова в форму, вы видите их в таблице. Бесплатно, без своего сервера.</li>
            <li>Маленький сервер-посредник (например, Cloudflare Worker) — принимает слова и создаёт Issue на GitHub или пишет в Telegram.</li>
            <li>Telegram-бот через посредника — токен бота нельзя хранить в самом приложении, поэтому нужен посредник.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
