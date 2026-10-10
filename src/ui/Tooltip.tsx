import { useEffect, useRef, useState } from 'react';

/*
 * Подсказки при наведении: <button data-tip="Текст">. Одна на всё приложение.
 * Положение считается по месту кнопки и всегда остаётся внутри экрана: у края подсказка
 * сдвигается внутрь, а внизу экрана — показывается над кнопкой.
 */

const MARGIN = 8;
const GAP = 6;

interface Tip {
  text: string;
  el: HTMLElement;
}

export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Только для мыши и клавиатуры — на телефоне долгое нажатие подсказку не показывает.
    if (!window.matchMedia('(hover: hover)').matches) return;
    const show = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el || (e.type === 'focusin' && !el.matches(':focus-visible'))) return;
      const text = el.dataset.tip;
      if (text) setTip({ text, el });
    };
    const hide = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]');
      const to = (e as MouseEvent).relatedTarget as Element | null;
      if (el && to && el.contains(to)) return;
      setTip(null);
    };
    const off = () => setTip(null);
    document.addEventListener('mouseover', show);
    document.addEventListener('mouseout', hide);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', off);
    document.addEventListener('pointerdown', off);
    window.addEventListener('scroll', off, true);
    return () => {
      document.removeEventListener('mouseover', show);
      document.removeEventListener('mouseout', hide);
      document.removeEventListener('focusin', show);
      document.removeEventListener('focusout', off);
      document.removeEventListener('pointerdown', off);
      window.removeEventListener('scroll', off, true);
    };
  }, []);

  useEffect(() => {
    if (!tip || !box.current) {
      setPos(null);
      return;
    }
    const r = tip.el.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - b.width / 2), Math.max(MARGIN, vw - b.width - MARGIN));
    const below = r.bottom + GAP;
    const top = below + b.height + MARGIN <= vh ? below : Math.max(MARGIN, r.top - GAP - b.height);
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={box} className="tooltip" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}>
      {tip.text}
    </div>
  );
}
