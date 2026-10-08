import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(text: string, action?: ToastItem['action']) => void>(() => {});
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (text: string, action?: ToastItem['action']) => {
      const id = nextId++;
      setItems((xs) => [...xs.slice(-2), { id, text, action }]);
      setTimeout(() => dismiss(id), action ? 7000 : 3500);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-area" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <span className="spacer">{t.text}</span>
            {t.action && (
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="icon-btn icon-btn--sm" onClick={() => dismiss(t.id)} aria-label="Закрыть">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
