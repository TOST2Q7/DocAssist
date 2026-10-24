import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CANNOT_CHECK, runSecurityCheck, type CheckStatus, type SecurityCheck } from '@/core/security/security';

const ICON: Record<CheckStatus, typeof Info> = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle, info: Info };
const CLASS: Record<CheckStatus, string> = { ok: 'sec--ok', warn: 'sec--warn', fail: 'sec--fail', info: 'sec--info' };

/** «Проверка безопасности»: не слушает ли кто-то — насколько это видно изнутри страницы. */
export function SecurityPanel() {
  const [checks, setChecks] = useState<SecurityCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      setChecks(await runSecurityCheck());
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run();
  }, []);
  const bad = checks?.filter((c) => c.status === 'fail').length ?? 0;
  const warn = checks?.filter((c) => c.status === 'warn').length ?? 0;

  return (
    <section className="card stack" id="security">
      <div className="section-title">
        <ShieldCheck size={18} className="brand-icon" />
        <h2 className="spacer" style={{ margin: 0 }}>
          Проверка безопасности устройства
        </h2>
        <button className="btn btn--sm" onClick={() => void run()} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />} Проверить снова
        </button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Не подсматривает ли кто-то за работой приложения на этом устройстве — в той мере, в какой это видно изнутри браузера. Проверка
        запускается и перед вводом фразы грамоток и пароля личных настроек.
      </p>
      {checks && (
        <div className={`small ${bad ? 'sec--fail' : warn ? 'sec--warn' : 'sec--ok'}`}>
          <strong>{bad ? `Найдено опасное: ${bad}` : warn ? `Стоит обратить внимание: ${warn}` : 'Ничего подозрительного не найдено.'}</strong>
        </div>
      )}
      <div className="list">
        {(checks ?? []).map((c) => {
          const Icon = ICON[c.status];
          return (
            <div key={c.id} className="list__item">
              <Icon size={18} className={CLASS[c.status]} />
              <div className="list__main">
                <div className="list__title">{c.title}</div>
                <div className="list__sub">{c.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      <details>
        <summary className="small">Чего браузер увидеть не может — и как проверить самому</summary>
        <div className="stack stack--s" style={{ marginTop: 8 }}>
          {CANNOT_CHECK.map((c) => (
            <div key={c.title}>
              <strong className="small">{c.title}</strong>
              <div className="small muted">{c.text}</div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
