import { useEffect, useRef, useState, type RefObject } from 'react';

/*
 * Эффекты для мыши — подключаются классами, без своего кода на каждой странице:
 *  .spotlight — элемент знает, где курсор: --mx, --my (px от левого верхнего угла)
 *               и --nx, --ny (от -1 до 1 от центра) — для подсветки и глубины;
 *  .tilt      — лёгкий наклон к курсору: --rx, --ry (градусы);
 *  .magnetic  — кнопка чуть тянется к курсору: --tx, --ty (px).
 * Только для мыши (на телефоне нечего подсвечивать) и не при «уменьшить движение» (наклон).
 */

const TILT_DEG = 4;
const MAGNET_PX = 6;

function canHover() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Один слушатель на весь документ: подсветка и наклон для всех .spotlight и .tilt. */
export function usePointerEffects() {
  useEffect(() => {
    if (!canHover()) return;
    const tiltOn = !reduceMotion();
    let frame = 0;
    let last: { x: number; y: number; target: Element | null } | null = null;
    let tilted: HTMLElement | null = null;
    let pulled: HTMLElement | null = null;

    const apply = () => {
      frame = 0;
      if (!last) return;
      const { x, y, target } = last;
      const spot = target instanceof Element ? target.closest<HTMLElement>('.spotlight') : null;
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty('--mx', `${x - r.left}px`);
        spot.style.setProperty('--my', `${y - r.top}px`);
        spot.style.setProperty('--nx', (((x - r.left) / r.width) * 2 - 1).toFixed(3));
        spot.style.setProperty('--ny', (((y - r.top) / r.height) * 2 - 1).toFixed(3));
      }
      const tilt = tiltOn && target instanceof Element ? target.closest<HTMLElement>('.tilt') : null;
      if (tilted && tilted !== tilt) {
        tilted.style.setProperty('--rx', '0deg');
        tilted.style.setProperty('--ry', '0deg');
      }
      tilted = tilt;
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const nx = (x - r.left) / r.width - 0.5;
        const ny = (y - r.top) / r.height - 0.5;
        tilt.style.setProperty('--rx', `${(-ny * TILT_DEG).toFixed(2)}deg`);
        tilt.style.setProperty('--ry', `${(nx * TILT_DEG).toFixed(2)}deg`);
      }
      const magnet = tiltOn && target instanceof Element ? target.closest<HTMLElement>('.magnetic') : null;
      if (pulled && pulled !== magnet) {
        pulled.style.setProperty('--tx', '0px');
        pulled.style.setProperty('--ty', '0px');
      }
      pulled = magnet;
      if (magnet) {
        const r = magnet.getBoundingClientRect();
        const nx = (x - r.left) / r.width - 0.5;
        const ny = (y - r.top) / r.height - 0.5;
        magnet.style.setProperty('--tx', `${(nx * 2 * MAGNET_PX).toFixed(1)}px`);
        magnet.style.setProperty('--ty', `${(ny * 2 * MAGNET_PX * 0.6).toFixed(1)}px`);
      }
    };

    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY, target: e.target as Element | null };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      last = { x: -1, y: -1, target: null };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}

/**
 * Подсветка, которая «переезжает» между пунктами списка вслед за курсором (как в меню премиальных сайтов).
 * Контейнеру ставятся --ht-x, --ht-y, --ht-w, --ht-h и класс .is-tracking.
 */
export function useHoverTrack<T extends HTMLElement>(selector: string): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const box = ref.current;
    if (!box || !canHover()) return;
    const onOver = (e: PointerEvent) => {
      const item = (e.target as Element | null)?.closest<HTMLElement>(selector);
      if (!item || !box.contains(item)) return;
      box.style.setProperty('--ht-x', `${item.offsetLeft}px`);
      box.style.setProperty('--ht-y', `${item.offsetTop}px`);
      box.style.setProperty('--ht-w', `${item.offsetWidth}px`);
      box.style.setProperty('--ht-h', `${item.offsetHeight}px`);
      box.classList.add('is-tracking');
    };
    const onLeave = () => box.classList.remove('is-tracking');
    box.addEventListener('pointerover', onOver);
    box.addEventListener('pointerleave', onLeave);
    return () => {
      box.removeEventListener('pointerover', onOver);
      box.removeEventListener('pointerleave', onLeave);
    };
  }, [selector]);
  return ref;
}

/** Число «набегает» от нуля до значения (при «уменьшить движение» — сразу значение). */
export function useCountUp(target: number, { duration = 900, delay = 0 } = {}): number {
  const [value, setValue] = useState(() => (typeof window !== 'undefined' && reduceMotion() ? target : 0));
  useEffect(() => {
    if (reduceMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      // Замедление к концу — как у механического счётчика.
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, delay]);
  return value;
}
