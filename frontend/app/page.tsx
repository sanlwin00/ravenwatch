'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { articlesApi, scrapeApi, translateApi, sourcesApi, entitiesApi, getExportUrl } from '@/lib/api';
import type { Article, Source, Entity, ArticleFilters } from '@/lib/api';
import NavBar from '@/components/NavBar';
import ArticleCard from '@/components/ArticleCard';
import { RefreshCw, ChevronDown, Download, X, SlidersHorizontal, Languages } from 'lucide-react';

const LIMIT = 25;

const TIER_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: '1', label: 'Critical' },
  { value: '2', label: 'High' },
  { value: '3', label: 'Medium' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [filters, setFilters] = useState<ArticleFilters>({ limit: LIMIT, offset: 0, has_entities: true });
  const [search, setSearch] = useState('');
  const [matchedOnly, setMatchedOnly] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    Promise.all([sourcesApi.list(), entitiesApi.list()]).then(([s, e]) => {
      setSources(s.data);
      setEntities(e.data);
    }).catch(() => {});
  }, [router]);

  const fetchArticles = useCallback(async (currentFilters: ArticleFilters, currentOffset: number, append = false) => {
    setLoading(true);
    try {
      const res = await articlesApi.list({ ...currentFilters, offset: currentOffset });
      const data = res.data;
      const items: Article[] = Array.isArray(data)
        ? data
        : ((data as { articles?: Article[]; items?: Article[] }).articles
            ?? (data as { items?: Article[] }).items
            ?? []);
      const tot: number = Array.isArray(data) ? items.length : ((data as { total?: number }).total ?? items.length);
      setTotal(tot);
      setArticles(prev => append ? [...prev, ...items] : items);
    } catch {
      // backend may not be running during development
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated()) {
      fetchArticles(filters, 0, false);
      setOffset(0);
    }
  }, [filters, fetchArticles]);

  // Debounced search: fire 400ms after user stops typing
  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: value.trim() || undefined, offset: 0 }));
    }, 400);
  }

  function handleLoadMore() {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    fetchArticles(filters, newOffset, true);
  }

  function showBanner(type: 'success' | 'error', message: string) {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner({ type, message });
    bannerTimerRef.current = setTimeout(() => setBanner(null), 8000);
  }

  function dismissBanner() {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner(null);
  }

  function handleMatchedToggle(checked: boolean) {
    setMatchedOnly(checked);
    setFilters(prev => ({ ...prev, has_entities: checked }));
  }

  async function handleScrape() {
    setScraping(true);
    showBanner('success', 'Scraping sources — results will appear below…');
    try {
      await scrapeApi.run();
      const startCount = articles.length;
      let waited = 0;
      const poll = setInterval(async () => {
        waited += 5;
        await fetchArticles(filters, 0, false);
        setOffset(0);
        if (waited >= 90) {
          clearInterval(poll);
          setScraping(false);
          showBanner('success', 'Scrape finished — check the feed above');
        }
      }, 5000);
      setTimeout(() => {
        if (articles.length > startCount) {
          clearInterval(poll);
          setScraping(false);
        }
      }, 6000);
    } catch {
      showBanner('error', 'Scrape failed — check server logs');
      setScraping(false);
    }
  }

  async function handleTranslate() {
    setTranslating(true);
    showBanner('success', 'Translating articles — this may take a few minutes…');
    try {
      await translateApi.run();
      await fetchArticles(filters, 0, false);
      showBanner('success', 'Translation complete.');
    } catch {
      showBanner('error', 'Translation failed — check server logs');
    } finally {
      setTranslating(false);
    }
  }

  function handleExport() {
    const url = getExportUrl(filters);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const hasMore = articles.length < total;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f1117' }}>
      <NavBar />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Result banner */}
        {banner && (
          <div
            className={`flex items-center justify-between gap-3 rounded-lg px-4 py-2.5 mb-4 text-sm ${
              banner.type === 'success'
                ? 'bg-emerald-900/60 border border-emerald-700 text-emerald-200'
                : 'bg-red-900/60 border border-red-700 text-red-200'
            }`}
          >
            <span>{banner.message}</span>
            <button onClick={dismissBanner} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Article Feed</h1>
              <p className="text-sm text-slate-500">{total} articles</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm text-slate-300 hover:text-slate-100 transition-colors"
                style={{ borderColor: '#2a2d3a' }}
              >
                <Download size={14} />
                <span>CSV</span>
              </button>
              <button
                onClick={handleTranslate}
                disabled={translating}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm text-slate-300 hover:text-slate-100 disabled:opacity-50 transition-colors"
                style={{ borderColor: '#2a2d3a' }}
              >
                <Languages size={14} className={translating ? 'animate-spin' : ''} />
                <span>{translating ? 'Translating...' : 'Translate'}</span>
              </button>
              <button
                onClick={handleScrape}
                disabled={scraping}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={14} className={scraping ? 'animate-spin' : ''} />
                <span>{scraping ? 'Scraping...' : 'Scrape'}</span>
              </button>
            </div>
          </div>

          {/* Always-visible search + controls row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search articles..."
              className="flex-1 rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
            />
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors shrink-0 ${
                filtersOpen ? 'border-blue-500 text-blue-400' : 'text-slate-300 hover:text-slate-100'
              }`}
              style={{ borderColor: filtersOpen ? undefined : '#2a2d3a' }}
            >
              <SlidersHorizontal size={14} />
              <span>Filters</span>
            </button>
            {/* Matched toggle — always visible */}
            <button
              type="button"
              role="switch"
              aria-checked={matchedOnly}
              onClick={() => handleMatchedToggle(!matchedOnly)}
              title={matchedOnly ? 'Showing matched articles only' : 'Showing all articles'}
              className={`relative shrink-0 w-9 h-5 rounded-full transition-colors focus:outline-none ${matchedOnly ? 'bg-blue-600' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${matchedOnly ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
            <span className="text-xs text-slate-500 shrink-0">Matched only</span>
          </div>
        </div>

        {/* Collapsible filter panel */}
        {filtersOpen && (
          <div
            className="rounded-lg border p-4 mb-4 space-y-3"
            style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
          >
            <div className="grid grid-cols-2 gap-2">
              <select
                className="rounded-lg border px-3 py-1.5 text-sm text-slate-300 outline-none col-span-2 sm:col-span-1"
                style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a', colorScheme: 'dark' }}
                onChange={(e) => setFilters(prev => ({ ...prev, source_id: e.target.value ? Number(e.target.value) : undefined }))}
              >
                <option value="">All Sources</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <select
                className="rounded-lg border px-3 py-1.5 text-sm text-slate-300 outline-none"
                style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a', colorScheme: 'dark' }}
                onChange={(e) => setFilters(prev => ({ ...prev, entity_id: e.target.value ? Number(e.target.value) : undefined }))}
              >
                <option value="">All Entities</option>
                {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
              </select>

              <select
                className="rounded-lg border px-3 py-1.5 text-sm text-slate-300 outline-none"
                style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a', colorScheme: 'dark' }}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  setFilters(prev => ({ ...prev, tier: val, has_entities: val !== undefined ? true : matchedOnly }));
                }}
              >
                {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              <select
                className="rounded-lg border px-3 py-1.5 text-sm text-slate-300 outline-none"
                style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a', colorScheme: 'dark' }}
                onChange={(e) => setFilters(prev => ({ ...prev, topic: e.target.value || undefined }))}
              >
                <option value="">All Topics</option>
                {['ceasefire', 'mediation', 'border_security', 'election', 'bri'].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-slate-500 mb-1 px-1">From</p>
                <input
                  type="date"
                  className="w-full rounded-lg border px-3 py-1.5 text-sm text-slate-300 outline-none"
                  style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a', colorScheme: 'dark' }}
                  onChange={(e) => setFilters(prev => ({ ...prev, from_date: e.target.value || undefined }))}
                />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1 px-1">To</p>
                <input
                  type="date"
                  className="w-full rounded-lg border px-3 py-1.5 text-sm text-slate-300 outline-none"
                  style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a', colorScheme: 'dark' }}
                  onChange={(e) => setFilters(prev => ({ ...prev, to_date: e.target.value || undefined }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Article list */}
        {loading && articles.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading articles...</div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            {matchedOnly
              ? <>No matched articles yet. Run <strong>Translate</strong> to tag entities, or turn off the matched toggle.</>
              : 'No articles found.'}
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map(article => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <div className="mt-5 flex justify-center">
            <button
              onClick={handleLoadMore}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm text-slate-400 hover:text-slate-200 transition-colors"
              style={{ borderColor: '#2a2d3a' }}
            >
              <ChevronDown size={14} />
              Load More
            </button>
          </div>
        )}

        {loading && articles.length > 0 && (
          <div className="mt-5 text-center text-sm text-slate-500">Loading more...</div>
        )}
      </main>
    </div>
  );
}
