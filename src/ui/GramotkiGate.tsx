import { KeyRound, Loader2, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGramotki } from '@/core/gramotka/react';
import { showGramotki } from './GramotkiDialog';

/*
 * Данные людей — только в открытых грамотках. Пока закрыты — карточка «Откройте грамотки»;
 * пока открываются — сколько уже открыто. Открыты — показывается содержимое.
 */
export function GramotkiGate({ children, what = 'данные бойцов' }: { children: ReactNode; what?: string }) {
  const { snap } = useGramotki();
  if (snap.status === 'open') return <>{children}</>;
  if (snap.status === 'new') return <>{children}</>;
  if (snap.status === 'starting' || snap.status === 'opening') {
    return (
      <div className="card empty stack">
        <Loader2 size={28} className="spin brand-icon" style={{ margin: '0 auto' }} />
        <div>Открываю грамотки…</div>
        {snap.progress && (
          <div className="small muted">
            {snap.progress.done} из {snap.progress.total}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="card empty stack">
      <Lock size={28} className="faint" style={{ margin: '0 auto' }} />
      <div>Грамотки закрыты</div>
      <div className="small">Чтобы увидеть {what}, введите фразу грамоток или перетащите в окно файл ключа.</div>
      <div>
        <button className="btn btn--primary" onClick={() => showGramotki.emit()}>
          <KeyRound size={16} /> Открыть грамотки
        </button>
      </div>
    </div>
  );
}

/** Строка «Грамотки закрыты — открыть» для приложений, которые работают и без них. */
export function GramotkiNotice({ text }: { text: string }) {
  const { snap } = useGramotki();
  if (snap.status !== 'locked') return null;
  return (
    <div className="alert alert--info">
      <Lock size={18} />
      <div className="alert__body row">
        <span className="spacer">{text}</span>
        <button className="btn btn--sm" onClick={() => showGramotki.emit()}>
          <KeyRound size={14} /> Открыть грамотки
        </button>
      </div>
    </div>
  );
}
