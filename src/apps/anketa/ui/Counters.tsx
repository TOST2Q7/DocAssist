import { CheckCheck, CircleHelp, Link2Off, ShieldCheck, XCircle } from 'lucide-react';
import { plural } from '@/core/util/format';
import type { Counts } from '../model/types';

/** Итог по анкете: «Готово» или счётчики того, что мешает. */
export function Counters({ counts, compact }: { counts: Counts; compact?: boolean }) {
  const ready = counts.error + counts.glued + counts.confirm === 0;
  return (
    <span className="cnts">
      {ready && (
        <span className="cnt cnt--ok" title="Анкета проверена">
          <ShieldCheck size={13} /> {compact ? '' : 'готово'}
        </span>
      )}
      {counts.error > 0 && (
        <span className="cnt cnt--error" title="Ошибки">
          <XCircle size={13} /> {counts.error}
          {!compact && ` ${plural(counts.error, ['ошибка', 'ошибки', 'ошибок'])}`}
        </span>
      )}
      {counts.glued > 0 && (
        <span className="cnt cnt--glued" title="Слипшиеся слова">
          <Link2Off size={13} /> {counts.glued}
          {!compact && ' слиплось'}
        </span>
      )}
      {counts.confirm > 0 && (
        <span className="cnt cnt--confirm" title="Нужно подтвердить">
          <CircleHelp size={13} /> {counts.confirm}
          {!compact && ' подтвердить'}
        </span>
      )}
      {counts.accepted > 0 && !compact && (
        <span className="cnt cnt--accepted" title="Принято «как есть»">
          <CheckCheck size={13} /> {counts.accepted} принято
        </span>
      )}
    </span>
  );
}
