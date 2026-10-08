import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/** Маленькое меню «⋯» с действиями. */
export function Menu({ actions, label = 'Действия' }: { actions: MenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="icon-btn icon-btn--sm" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="menu__list" role="menu">
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              className="menu__item"
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
