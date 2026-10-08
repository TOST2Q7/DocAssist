import { BADGE_LABELS, useVisibleBadges } from '@/core/registry/badges';
import type { BadgeDef } from '@/core/registry/types';

export function Badge({ badge, count }: { badge: BadgeDef; count?: number }) {
  const text = badge.kind === 'count' ? String(count ?? badge.label ?? '') : (badge.label ?? BADGE_LABELS[badge.kind]);
  return <span className={`badge badge--${badge.kind}`}>{text}</span>;
}

export function Badges({ itemId, version = '1', badges, extra }: { itemId: string; version?: string; badges?: BadgeDef[]; extra?: BadgeDef[] }) {
  const visible = useVisibleBadges(itemId, version, badges);
  const all = [...visible, ...(extra ?? [])];
  if (!all.length) return null;
  return (
    <span className="badges">
      {all.map((b, i) => (
        <Badge key={i} badge={b} />
      ))}
    </span>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return <span className="badge badge--count">{count}</span>;
}
