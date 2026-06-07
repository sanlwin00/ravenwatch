import type { Entity } from '@/lib/api';

interface EntityBadgeProps {
  entity: Entity;
  size?: 'sm' | 'xs';
}

const TIER_STYLES: Record<number, { badge: string; label: string }> = {
  1: { badge: 'bg-red-500/15 text-red-400 border-red-500/30',    label: 'Critical' },
  2: { badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label: 'High' },
  3: { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',  label: 'Medium' },
};

export default function EntityBadge({ entity, size = 'sm' }: EntityBadgeProps) {
  const tier = TIER_STYLES[entity.tier] ?? { badge: 'bg-slate-700/40 text-slate-400 border-slate-600/30', label: null };
  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1 rounded border font-medium ${tier.badge} ${padding}`}>
      {entity.name}
      {tier.label && (
        <span className="opacity-50 text-[10px]">{tier.label}</span>
      )}
    </span>
  );
}
