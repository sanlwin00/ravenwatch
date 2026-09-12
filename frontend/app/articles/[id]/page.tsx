'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { articlesApi, entitiesApi } from '@/lib/api';
import type { Article, Entity } from '@/lib/api';
import NavBar from '@/components/NavBar';
import EntityBadge from '@/components/EntityBadge';
import TopicBadge from '@/components/TopicBadge';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function ArticleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [article, setArticle] = useState<Article | null>(null);
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [addingEntity, setAddingEntity] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);

  const KNOWN_TOPICS = ['ceasefire', 'mediation', 'border_security', 'election', 'bri'];

  const refreshArticle = async () => {
    const res = await articlesApi.get(id);
    setArticle(res.data);
  };

  const handleAddEntity = async (entityId: string) => {
    setAddingEntity(false);
    if (!entityId) return;
    await articlesApi.addEntity(id, entityId);
    await refreshArticle();
  };

  const handleRemoveEntity = async (entityId: string) => {
    await articlesApi.removeEntity(id, entityId);
    await refreshArticle();
  };

  const handleAddTopic = async (topic: string) => {
    setAddingTopic(false);
    if (!topic) return;
    await articlesApi.addTopic(id, topic);
    await refreshArticle();
  };

  const handleRemoveTopic = async (topic: string) => {
    await articlesApi.removeTopic(id, topic);
    await refreshArticle();
  };

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    Promise.all([
      articlesApi.get(id),
      entitiesApi.list(),
    ])
      .then(([articleRes, entitiesRes]) => {
        setArticle(articleRes.data);
        setAllEntities(entitiesRes.data as Entity[]);
      })
      .catch(() => setError('Article not found.'))
      .finally(() => setLoading(false));
  }, [id, router]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f1117' }}>
      <NavBar />

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
          {article && (
            <button
              onClick={async () => {
                if (!confirm('Delete this article?')) return;
                setDeleting(true);
                try {
                  await articlesApi.delete(article.id);
                  router.replace('/');
                } catch {
                  alert('Delete failed.');
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm text-red-400 hover:text-red-300 hover:border-red-500/40 disabled:opacity-50 transition-colors"
              style={{ borderColor: '#2a2d3a' }}
            >
              <Trash2 size={13} />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>

        {loading && (
          <div className="text-center py-16 text-slate-500 text-sm">Loading article...</div>
        )}

        {error && (
          <div className="text-center py-16 text-red-400 text-sm">{error}</div>
        )}

        {article && (
          <div
            className="rounded-xl border p-6"
            style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
          >
            {/* Signal badges */}
            {(article.early_signal || article.policy_signal) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {article.early_signal && (
                  <span className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/20 px-2.5 py-1 text-sm font-semibold text-red-400">
                    <span className="text-red-500">●</span> Early Signal
                  </span>
                )}
                {article.policy_signal && (
                  <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-sm font-semibold text-amber-400">
                    <span className="text-amber-500">●</span> Policy Signal
                  </span>
                )}
              </div>
            )}

            {/* Title */}
            <h1 className="text-xl font-semibold text-slate-100 leading-snug mb-3">
              {article.title_en || article.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 mb-5 text-sm text-slate-400">
              <span className="font-medium text-slate-300">{article.source?.name}</span>
              {article.published_at && (
                <span>{format(new Date(article.published_at), 'MMM d, yyyy HH:mm')}</span>
              )}
              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink size={13} />
                  Source
                </a>
              )}
            </div>

            {/* Entities */}
            <div className="mb-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Entities</h2>
              <div className="flex flex-wrap gap-1.5 items-center">
                {article.entities?.map(entity => (
                  <div key={entity.id} className="inline-flex items-center gap-0.5">
                    <EntityBadge entity={entity} />
                    <button
                      onClick={() => handleRemoveEntity(String(entity.id))}
                      className="ml-0.5 text-slate-500 hover:text-red-400 text-sm leading-none"
                      title="Remove"
                    >×</button>
                  </div>
                ))}
                {addingEntity ? (
                  <select
                    autoFocus
                    className="text-xs rounded border bg-slate-800 text-slate-300 px-2 py-0.5"
                    style={{ borderColor: '#2a2d3a' }}
                    defaultValue=""
                    onChange={e => handleAddEntity(e.target.value)}
                    onBlur={() => setAddingEntity(false)}
                  >
                    <option value="" disabled>Select entity…</option>
                    {allEntities
                      .filter(e => !article.entities?.find((ae: Entity) => String(ae.id) === String(e.id)))
                      .map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
                  </select>
                ) : (
                  <button
                    onClick={() => setAddingEntity(true)}
                    className="text-xs text-slate-500 hover:text-slate-300 border rounded px-2 py-0.5"
                    style={{ borderColor: '#2a2d3a' }}
                  >+ Add</button>
                )}
              </div>
            </div>

            {/* Topics */}
            <div className="mb-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Topics</h2>
              <div className="flex flex-wrap gap-1.5 items-center">
                {article.topics?.map(topic => (
                  <div key={topic} className="inline-flex items-center gap-0.5">
                    <TopicBadge topic={topic} />
                    <button
                      onClick={() => handleRemoveTopic(topic)}
                      className="ml-0.5 text-slate-500 hover:text-red-400 text-sm leading-none"
                      title="Remove"
                    >×</button>
                  </div>
                ))}
                {addingTopic ? (
                  <select
                    autoFocus
                    className="text-xs rounded border bg-slate-800 text-slate-300 px-2 py-0.5"
                    style={{ borderColor: '#2a2d3a' }}
                    defaultValue=""
                    onChange={e => handleAddTopic(e.target.value)}
                    onBlur={() => setAddingTopic(false)}
                  >
                    <option value="" disabled>Select topic…</option>
                    {KNOWN_TOPICS
                      .filter(t => !article.topics?.includes(t))
                      .map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                ) : (
                  <button
                    onClick={() => setAddingTopic(true)}
                    className="text-xs text-slate-500 hover:text-slate-300 border rounded px-2 py-0.5"
                    style={{ borderColor: '#2a2d3a' }}
                  >+ Add</button>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t my-5" style={{ borderColor: '#2a2d3a' }} />

            {/* Content */}
            {(article.raw_text_en || article.raw_text_original) ? (
              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Content
                  {!article.raw_text_en && article.raw_text_original && (
                    <span className="ml-2 normal-case font-normal text-slate-600">(original)</span>
                  )}
                </h2>
                <div className="prose prose-sm prose-invert max-w-none break-words overflow-hidden
                  [&_a]:text-blue-400 [&_a]:underline [&_a]:break-all
                  [&_p]:text-slate-300 [&_p]:leading-relaxed [&_p]:mb-3
                  [&_h1]:text-slate-100 [&_h2]:text-slate-200 [&_h3]:text-slate-200
                  [&_ul]:text-slate-300 [&_li]:mb-1
                  [&_img]:hidden">
                  <ReactMarkdown>
                    {article.raw_text_en || article.raw_text_original || ''}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">Content not yet available.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
