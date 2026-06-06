import type { Entity } from '@/lib/api';

interface EntityBadgeProps {
  entity: Entity;
  size?: 'sm' | 'xs';
}

export default function EntityBadge({ entity, size = 'sm' }: EntityBadgeProps) {
  const color = entity.tier === 1
    ? 'bg-blue-600/20 text-blue-400 border-blue-600/30'
    : 'bg-gray-600/20 text-gray-400 border-gray-600/30';

  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center rounded border font-medium ${color} ${padding}`}>
      {entity.name}
      {entity.tier === 1 && (
        <span className="ml-1 text-blue-500/60">T1</span>
      )}
    </span>
  );
}
