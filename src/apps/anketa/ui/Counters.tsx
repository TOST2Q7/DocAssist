import { AlertTriangle, Link2Off, XCircle } from 'lucide-react';
import type { Counts } from '../model/types';

export function Counters({ counts, compact }: { counts: Counts; compact?: boolean }) {
  if (!counts.error && !counts.warning && !counts.glued) {
    return <span className="cnt cnt--ok">{compact ? '✓' : 'без замечаний'}</span>;
  }
  return (
    <span className="cnts">
      {counts.error > 0 && (
        <span className="cnt cnt--error" title="Ошибки">
          <XCircle size={13} /> {counts.error}
        </span>
      )}
      {counts.warning > 0 && (
        <span className="cnt cnt--warning" title="Замечания">
          <AlertTriangle size={13} /> {counts.warning}
        </span>
      )}
      {counts.glued > 0 && (
        <span className="cnt cnt--glued" title="Слипшиеся слова">
          <Link2Off size={13} /> {counts.glued}
        </span>
      )}
    </span>
  );
}
