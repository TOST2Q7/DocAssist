import { Link } from 'react-router-dom';

/*
 * Знак DocAssist — «нашивка» с документом и галочкой: прямоугольник со строчкой по краю,
 * как нашивка должности на бойцовке. Это не логотип РСО: его по руководству нельзя перерисовывать.
 * Цвета берутся из CSS (--mark-bg, --mark-fg): в синей шапке — белая нашивка, в иконке — синяя.
 */
export function LogoMark({ className = 'logo__mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="1.5" y="2.5" width="37" height="35" rx="8" fill="var(--mark-bg, #0054a6)" />
      <rect x="4.75" y="5.75" width="30.5" height="28.5" rx="5.5" fill="none" stroke="var(--mark-fg, #fff)" strokeWidth="1.3" strokeDasharray="2.4 2" opacity="0.7" />
      <path d="M13.5 10.5h8.6l5.4 5.4v12.6a1.5 1.5 0 0 1-1.5 1.5H13.5a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Z" fill="var(--mark-fg, #fff)" />
      <path d="M22 10.6v4.4a1 1 0 0 0 1 1h4.4" fill="none" stroke="var(--mark-bg, #0054a6)" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="m15.6 22.4 2.8 2.8 5.2-5.6" fill="none" stroke="var(--mark-bg, #0054a6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="DocAssist — на главную">
      <LogoMark />
      <span className="logo__text">
        <span className="logo__name">DocAssist</span>
        <span className="logo__sub">для мастеров РСО</span>
      </span>
    </Link>
  );
}
