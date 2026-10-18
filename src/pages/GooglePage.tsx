import { MonitorSmartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { setDeviceName, useDevice } from '@/core/device/device';
import { googleAvailability } from '@/core/google';
import { GoogleBar } from '@/ui/GoogleBar';
import { InstallButton } from '@/ui/InstallButton';
import { SecurityPanel } from './google/SecurityPanel';
import { SyncPanel } from './google/SyncPanel';

/** «Google»: вход, это устройство, личные настройки на Диске и проверка безопасности. */
export function GooglePage() {
  const device = useDevice();
  const [name, setName] = useState(device.name);
  const { hash } = useLocation();
  const av = googleAvailability();
  useEffect(() => setName(device.name), [device.name]);
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [hash]);

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <div className="kicker">Служебное</div>
        <h1>Google</h1>
        <p>
          Вход в Google нужен, чтобы «Личные дела» работали с Google Диском, а «Проверка анкет» — с Google Таблицами. Приложение видит
          только те файлы, которые создало само или которые вы выбрали в окне Google, — остальной ваш Диск ему не виден.
        </p>
      </div>
      <div className="stack stack--l">
        <GoogleBar />
        {!av.ok && av.reason === 'single-file' && (
          <div className="row">
            <InstallButton />
          </div>
        )}
        <section className="card stack">
          <div className="section-title">
            <MonitorSmartphone size={18} className="brand-icon" />
            <h2 className="spacer" style={{ margin: 0 }}>
              Это устройство
            </h2>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Так оно будет подписано в метках изменений («18.10.2026, 17:40 · {device.name}»), когда версии на разных устройствах разойдутся.
          </p>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setDeviceName(name);
            }}
          >
            <input className="input" style={{ flex: 1, minWidth: 200 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Имя устройства" maxLength={60} />
            <button className="btn" type="submit" disabled={name.trim() === device.name}>
              Сохранить имя
            </button>
          </form>
        </section>
        {av.ok && <SyncPanel />}
        <SecurityPanel />
        <section className="stack">
          <h2>Что видит приложение</h2>
          <ul className="small muted" style={{ margin: 0 }}>
            <li>Только файлы, которые оно создало, и те, что вы показали ему в окне выбора Google. Остальной Диск ему не виден.</li>
            <li>Доступ у каждого человека свой: файл, загруженный коллегой, нужно один раз показать приложению и вам.</li>
            <li>Данные идут из браузера прямо в Google — не разработчику и не на сторонние серверы.</li>
            <li>Пропуск входа живёт около часа и хранится только в памяти этой вкладки. Выйти можно кнопкой «Выйти».</li>
            <li>Отозвать доступ совсем: Google-аккаунт → «Безопасность» → «Сторонние приложения и сервисы» → DocAssist.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
