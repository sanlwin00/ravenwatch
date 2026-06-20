'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { articlesApi, scrapeApi, sourcesApi, entitiesApi, getExportUrl, narrativeApi } from '@/lib/api';
import type { Article, Source, Entity, ArticleFilters, NarrativeTerm, NarrativeDataPoint, ScrapeRun } from '@/lib/api';
import NavBar from '@/components/NavBar';
import ArticleCard from '@/components/ArticleCard';
import { RefreshCw, ChevronDown, Download, X, SlidersHorizontal } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import type { DotProps } from 'recharts';

const LIMIT = 25;

const TIER_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: '1', label: 'Critical' },
  { value: '2', label: 'High' },
  { value: '3', label: 'Medium' },
];

// — Trends helpers —

const TERM_COLORS: Record<string, string> = {
  '和平': '#60a5fa',
  '稳定': '#34d399',
  '停火': '#f87171',
  '选举': '#fbbf24',
  '主权': '#a78bfa',
};

const TERM_LABELS: Record<string, string> = {
  '和平': 'Peace',
  '稳定': 'Stability',
  '停火': 'Ceasefire',
  '选举': 'Elections',
  '主权': 'Sovereignty',
};

const FALLBACK_COLORS = ['#60a5fa', '#34d399', '#f87171', '#fbbf24', '#a78bfa'];

const RANGE_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: 0 },
];

const TRACKED_TERMS = ['和平', '稳定', '停火', '选举', '主权'];

function spikeThreshold(data: NarrativeDataPoint[]): number {
  if (data.length === 0) return Infinity;
  const avg = data.reduce((sum, d) => sum + d.count, 0) / data.length;
  return avg * 2;
}

interface MergedRow {
  date: string;
  [term: string]: number | string;
}

function mergeData(terms: NarrativeTerm[]): MergedRow[] {
  const dateMap = new Map<string, MergedRow>();
  for (const t of terms) {
    for (const point of t.data) {
      if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
      const row = dateMap.get(point.date)!;
      row[t.term] = point.count;
    }
  }
  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function filterByRange(rows: MergedRow[], days: number): MergedRow[] {
  if (days === 0) return rows;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return rows.filter((r) => r.date >= cutoffStr);
}

function generateSeedData(terms: string[]): NarrativeTerm[] {
  const now = new Date();
  return terms.map((term, ti) => {
    const data: NarrativeDataPoint[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const base = Math.floor(((ti + 1) * 3 + i * 7) % 12) + 1;
      const spike = (i === 8 || i === 20 || i === 60 || i === 75) ? base * 3 : 0;
      data.push({ date, count: base + spike });
    }
    return { term, label: TERM_LABELS[term] ?? term, data };
  });
}

interface SpikeDotProps {
  cx?: number;
  cy?: number;
  payload?: MergedRow;
  term: string;
  threshold: number;
  color: string;
}

function SpikeDot({ cx, cy, payload, term, threshold, color }: SpikeDotProps) {
  if (cx == null || cy == null || !payload) return null;
  const value = payload[term] as number | undefined;
  if (value == null) return null;
  const isSpike = value >= threshold && threshold !== Infinity;
  if (!isSpike) return <Dot cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
  return <Dot cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={1.5} />;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; color: string }>;
  thresholds: Record<string, number>;
}

function CustomTooltip({ active, label, payload, thresholds }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-xl"
      style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a', minWidth: 150 }}
    >
      <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
      {payload.map((entry) => {
        const isSpike = entry.value >= (thresholds[entry.name] ?? Infinity);
        const engLabel = TERM_LABELS[entry.name] ?? entry.name;
        return (
          <div key={entry.name} className="flex items-center justify-between gap-3 mb-0.5">
            <span style={{ color: entry.color }} className="font-medium">
              {engLabel}
              <span className="text-slate-500 ml-1 font-normal">{entry.name}</span>
            </span>
            <span className={isSpike ? 'text-amber-400 font-semibold' : 'text-slate-200'}>
              {entry.value}
              {isSpike && ' ↑'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  // — Feed state —
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [filters, setFilters] = useState<ArticleFilters>({ limit: LIMIT, offset: 0, has_entities: true });
  const [search, setSearch] = useState('');
  const [matchedOnly, setMatchedOnly] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // — Trends state —
  const [terms, setTerms] = useState<NarrativeTerm[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [range, setRange] = useState<number>(30);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    Promise.all([sourcesApi.list(), entitiesApi.list()]).then(([s, e]) => {
      setSources(s.data);
      setEntities(e.data);
    }).catch(() => {});

    scrapeApi.runs().then((res) => {
      const runs: ScrapeRun[] = res.data;
      const last = runs.find((r) => r.finished_at);
      if (last?.finished_at) setLastUpdated(last.finished_at);
    }).catch(() => {});

    narrativeApi
      .trends()
      .then((res) => {
        const raw = res.data;
        setTerms(raw && raw.length > 0 ? raw : generateSeedData(TRACKED_TERMS));
      })
      .catch(() => setTerms(generateSeedData(TRACKED_TERMS)))
      .finally(() => setTrendsLoading(false));
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

  const allMerged = useMemo(() => mergeData(terms), [terms]);
  const merged = useMemo(() => filterByRange(allMerged, range), [allMerged, range]);
  const thresholds = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of terms) map[t.term] = spikeThreshold(t.data);
    return map;
  }, [terms]);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (!filtersOpen) setFiltersOpen(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: value.trim() || undefined }));
      setOffset(0);
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

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* — Narrative Trends chart — */}
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-slate-300">Narrative Trends</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mention frequency of tracked terms. Highlighted dots = spike (&ge;2&times; avg).
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: '#2a2d3a', backgroundColor: '#1a1d27' }}>
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setRange(opt.days)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    range === opt.days ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}>
            <div className="flex flex-wrap gap-2 mb-4">
              {terms.map((t, i) => {
                const color = TERM_COLORS[t.term] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                const engLabel = TERM_LABELS[t.term] ?? t.term;
                return (
                  <span
                    key={t.term}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border"
                    style={{ borderColor: color + '44', color, backgroundColor: color + '18' }}
                  >
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    {engLabel}
                    <span className="opacity-60">{t.term}</span>
                  </span>
                );
              })}
            </div>

            {trendsLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm">Loading trends...</div>
            ) : merged.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm">No data for this range.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={merged} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#2a2d3a' }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v);
                      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip thresholds={thresholds} />} cursor={{ stroke: '#3a3d4a', strokeWidth: 1 }} />
                  {terms.map((t, i) => {
                    const color = TERM_COLORS[t.term] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                    const threshold = thresholds[t.term] ?? Infinity;
                    return (
                      <Line
                        key={t.term}
                        type="monotone"
                        dataKey={t.term}
                        stroke={color}
                        strokeWidth={1.5}
                        dot={(props: DotProps & { payload?: MergedRow; index?: number }) => (
                          <SpikeDot
                            key={`dot-${t.term}-${props.index}`}
                            cx={props.cx}
                            cy={props.cy}
                            payload={props.payload}
                            term={t.term}
                            threshold={threshold}
                            color={color}
                          />
                        )}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* — Article feed — */}
        <div className="max-w-4xl">
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

          <div className="mb-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h1 className="text-lg font-semibold text-slate-100">Feed</h1>
                <p className="text-sm text-slate-500">
                  {total} articles
                  {lastUpdated && (
                    <span className="ml-2 text-slate-600">
                      · updated {new Date(lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                      {new Date(lastUpdated).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { fetchArticles(filters, 0, false); setOffset(0); }}
                  disabled={loading}
                  title="Refresh feed"
                  className="p-2 rounded-lg border text-slate-300 hover:text-slate-100 disabled:opacity-50 transition-colors"
                  style={{ borderColor: '#2a2d3a' }}
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={handleExport}
                  title="Export CSV"
                  className="p-2 rounded-lg border text-slate-300 hover:text-slate-100 transition-colors"
                  style={{ borderColor: '#2a2d3a' }}
                >
                  <Download size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={matchedOnly}
                  onClick={() => handleMatchedToggle(!matchedOnly)}
                  className={`relative shrink-0 w-9 h-5 rounded-full transition-colors focus:outline-none ${matchedOnly ? 'bg-blue-600' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${matchedOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm text-slate-400">Matched only</span>
              </label>
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
            </div>
          </div>

          {filtersOpen && (
            <div
              className="rounded-lg border p-4 mb-4 space-y-3"
              style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
            >
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search articles..."
                className="w-full rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
              />
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
        </div>
      </main>
    </div>
  );
}
