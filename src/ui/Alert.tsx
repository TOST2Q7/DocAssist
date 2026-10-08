import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

const ICONS = { info: Info, warning: AlertTriangle, error: XCircle, success: CheckCircle2 };

export function Alert({ kind = 'info', children }: { kind?: keyof typeof ICONS; children: ReactNode }) {
  const Icon = ICONS[kind];
  return (
    <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon size={18} />
      <div className="alert__body">{children}</div>
    </div>
  );
}
