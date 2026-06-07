import Link from 'next/link';
import { format } from 'date-fns';
import type { Article } from '@/lib/api';
import EntityBadge from './EntityBadge';
import TopicBadge from './TopicBadge';

interface ArticleCardProps {
  article: Article;
}

export default function ArticleCard({ article }: ArticleCardProps) {
  const dateStr = article.published_at || article.scraped_at;
  const pubDate = dateStr
    ? format(new Date(dateStr), 'MMM d, yyyy')
    : null;

  return (
    <Link href={`/articles/${article.id}`} className="block">
      <div
        className="rounded-lg border p-4 transition-colors hover:border-blue-500/40"
        style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {article.early_signal && (
                <span className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400">
                  <span className="text-red-500">●</span> Early Signal
                </span>
              )}
              {article.policy_signal && (
                <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
                  <span className="text-amber-500">●</span> Policy Signal
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="text-sm font-medium text-slate-100 leading-snug line-clamp-2">
              {article.title || <span className="text-slate-500 italic">Untitled — {article.source?.name}</span>}
            </h3>

            {/* Meta */}
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-400">{article.source?.name}</span>
              {pubDate && <><span>·</span><span>{pubDate}</span></>}
            </div>

            {/* Tags */}
            {((article.entities?.length > 0) || (article.topics?.length > 0)) && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {article.entities?.slice(0, 4).map((entity) => (
                  <EntityBadge key={entity.id} entity={entity} size="xs" />
                ))}
                {article.topics?.slice(0, 3).map((topic) => (
                  <TopicBadge key={topic} topic={topic} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
