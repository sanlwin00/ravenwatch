const TOPIC_STYLES: Record<string, string> = {
  ceasefire: 'bg-red-600/20 text-red-400 border-red-600/30',
  mediation: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  border_security: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  election: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
  bri: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
};

const DEFAULT_STYLE = 'bg-slate-600/20 text-slate-400 border-slate-600/30';

interface TopicBadgeProps {
  topic: string;
}

export default function TopicBadge({ topic }: TopicBadgeProps) {
  const style = TOPIC_STYLES[topic] || DEFAULT_STYLE;
  const label = topic.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${style}`}>
      {label}
    </span>
  );
}
