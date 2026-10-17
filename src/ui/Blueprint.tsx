import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';

/*
 * Элементы «чертежа» — общий язык оформления DocAssist (синий РСО и белый = синька):
 * заголовок раздела с номером, размерная линия с засечками, штамп «Проверено».
 */

/** Текст, который проявляется по словам: из размытия и снизу вверх, слово за словом. */
export function SplitWords({ text, delay = 0 }: { text: string; delay?: number }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span className="word" style={{ '--w': i, '--w-delay': `${delay}ms` } as CSSProperties}>
            {w}
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

/**
 * «Ночное небо» синьки для синих плашек: медленно плывущее свечение (синий РСО и светлее),
 * миллиметровка, гаснущая к краям, яркая сетка под курсором и лёгкое зерно — как у печати.
 * Курсор передаёт родитель с классом .spotlight (ui/effects.ts).
 */
export function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <span className="sky__blob sky__blob--1" />
      <span className="sky__blob sky__blob--2" />
      <span className="sky__blob sky__blob--3" />
      <span className="sky__grid" />
      <span className="sky__spot" />
      <span className="sky__scan" />
      <span className="sky__grain" />
    </div>
  );
}

/** Заголовок раздела: номер, название, линия до края и пояснение справа. */
export function SectionHead({ no, title, aside }: { no: string; title: string; aside?: ReactNode }) {
  return (
    <div className="sheet-head">
      <span className="sheet-head__no">{no}</span>
      <h2>{title}</h2>
      <span className="sheet-head__rule" aria-hidden="true" />
      {aside && <span className="sheet-head__aside">{aside}</span>}
    </div>
  );
}

/**
 * Размерная линия, как на строительном чертеже: выносные линии, засечки под 45° и размер посередине.
 * Ставится под элементом и «прочерчивается» от середины к краям.
 */
export function Dimension({ children }: { children: ReactNode }) {
  return (
    <div className="dim" aria-hidden="true">
      <span className="dim__end" />
      <span className="dim__line dim__line--left" />
      <span className="dim__label">{children}</span>
      <span className="dim__line dim__line--right" />
      <span className="dim__end" />
    </div>
  );
}

const today = () => new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Штамп «Проверено» с сегодняшней датой — с неровной «чернильной» кромкой, как у настоящего. */
export function Stamp({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`stamp-mark ${className}`} viewBox="0 0 260 132" aria-hidden="true">
      <defs>
        {/* Неровная кромка и непрокрас — шум, который «съедает» часть краски. */}
        <filter id={`ink-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.3" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="blotch" />
          <feColorMatrix in="blotch" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4 3.3" result="mask" />
          <feComposite in="rough" in2="mask" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#ink-${id})`} fill="none" stroke="currentColor">
        <rect x="4" y="4" width="252" height="124" rx="12" strokeWidth="4" />
        <rect x="13" y="13" width="234" height="106" rx="7" strokeWidth="1.5" />
        <text x="130" y="36" textAnchor="middle" className="stamp-mark__small" fill="currentColor" stroke="none">
          DOCASSIST · МАСТЕР ОТРЯДА
        </text>
        <text x="130" y="81" textAnchor="middle" className="stamp-mark__big" fill="currentColor" stroke="none">
          ПРОВЕРЕНО
        </text>
        <line x1="40" y1="96" x2="220" y2="96" strokeWidth="1.2" />
        <text x="130" y="113" textAnchor="middle" className="stamp-mark__small" fill="currentColor" stroke="none">
          {today()}
        </text>
      </g>
    </svg>
  );
}

/**
 * Плавное появление блоков при прокрутке: элементы с классом .reveal внутри контейнера проявляются,
 * когда попадают в окно. Прячутся (.reveal-wait) только те, за которыми уже следим, — блоки,
 * появившиеся позже, и браузеры без IntersectionObserver показывают всё сразу.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!('IntersectionObserver' in window)) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    items.forEach((el) => {
      el.classList.add('reveal-wait');
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return ref;
}
