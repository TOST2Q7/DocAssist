import { Link } from 'react-router-dom';

export function LogoMark({ className = 'logo__mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 66 46" aria-hidden="true">
      <ellipse cx="33" cy="23" rx="32" ry="22" fill="#1d4fa0" />
      <text x="33" y="31" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="21" fill="#fff">
        РСО
      </text>
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="DocAssist — на главную">
      <LogoMark />
      <span>
        DocAssist <span className="logo__sub">документы РСО</span>
      </span>
    </Link>
  );
}
