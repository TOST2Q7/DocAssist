import { Loader2, Lock, LockOpen } from 'lucide-react';
import { useGramotki } from '@/core/gramotka/react';
import { useToast } from './Toast';
import { showGramotki } from './GramotkiDialog';

/** Кнопка в шапке: грамотки открыты — закрыть; закрыты — открыть (окно фразы). Пока открываются — крутится. */
export function GramotkiButton() {
  const { store, snap } = useGramotki();
  const toast = useToast();
  if (!store || snap.status === 'starting' || snap.status === 'new') return null;
  if (snap.status === 'opening') {
    const p = snap.progress;
    return (
      <button className="icon-btn" onClick={() => showGramotki.emit()} data-tip={p ? `Открываю грамотки: ${p.done} из ${p.total}` : 'Открываю грамотки…'} aria-label="Грамотки открываются">
        <Loader2 size={20} className="spin" />
      </button>
    );
  }
  if (snap.status === 'open') {
    return (
      <button
        className="icon-btn"
        onClick={() => {
          void store
            .lock()
            .then(() => toast(snap.remembered ? 'Грамотки закрыты. Ключ запомнен на этом устройстве — открыть можно без фразы.' : 'Грамотки закрыты. Чтобы открыть, понадобится фраза.'));
        }}
        data-tip="Закрыть грамотки (уходите от компьютера)"
        aria-label="Закрыть грамотки"
      >
        <LockOpen size={20} />
      </button>
    );
  }
  return (
    <button className="icon-btn" onClick={() => showGramotki.emit()} data-tip="Открыть грамотки" aria-label="Открыть грамотки">
      <Lock size={20} />
    </button>
  );
}
