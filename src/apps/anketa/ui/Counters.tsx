import { CircleAlert, ShieldCheck, XCircle } from 'lucide-react';
import { plural } from '@/core/util/format';
import type { Counts } from '../model/types';

/** Итог по анкете: «Готово» или счётчики того, что мешает. */
export function Counters({ counts, compact }: { counts: Counts; compact?: boolean }) {
  const ready = counts.error + counts.warn === 0;
  return (
    <span className="cnts">
      {ready && (
        <span className="cnt cnt--ok" title="Анкета проверена">
          <ShieldCheck size={13} /> {compact ? '' : 'готово'}
        </span>
      )}
      {counts.error > 0 && (
        <span className="cnt cnt--error" title="Поля с ошибками">
          <XCircle size={13} /> {counts.error}
          {!compact && ` ${plural(counts.error, ['ошибка', 'ошибки', 'ошибок'])}`}
        </span>
      )}
      {counts.warn > 0 && (
        <span className="cnt cnt--confirm" title="Поля, которые нужно подтвердить">
          <CircleAlert size={13} /> {counts.warn}
          {!compact && ' подтвердить'}
        </span>
      )}
    </span>
  );
}
