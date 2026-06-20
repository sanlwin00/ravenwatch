'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { narrativeApi } from '@/lib/api';
import type { NarrativeTerm, NarrativeDataPoint } from '@/lib/api';
import NavBar from '@/components/NavBar';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import type { DotProps } from 'recharts';

// One colour per tracked term
const TERM_COLORS: Record<string, string> = {
  '和平': '#60a5fa',   // blue-400
  '稳定': '#34d399',   // emerald-400
  '停火': '#f87171',   // red-400
  '选举': '#fbbf24',   // amber-400
  '主权': '#a78bfa',   // violet-400
};

const FALLBACK_COLORS = ['#60a5fa', '#34d399', '#f87171', '#fbbf24', '#a78bfa'];

// Compute the 2× average threshold for a series
function spikeThreshold(data: NarrativeDataPoint[]): number {
  if (data.length === 0) return Infinity;
  const avg = data.reduce((sum, d) => sum + d.count, 0) / data.length;
  return avg * 2;
}

interface MergedRow {
  date: string;
  [term: string]: number | string;
}

// Merge per-term data arrays into a single array keyed by date
function mergeData(terms: NarrativeTerm[]): MergedRow[] {
  const dateMap = new Map<string, MergedRow>();
  for (const t of terms) {
    for (const point of t.data) {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, { date: point.date });
      }
      const row = dateMap.get(point.date)!;
      row[t.term] = point.count;
    }
  }
  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
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
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={6}
      fill={color}
      stroke="#fff"
      strokeWidth={1.5}
    />
  );
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
      style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a', minWidth: 130 }}
    >
      <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
      {payload.map((entry) => {
        const isSpike = entry.value >= (thresholds[entry.name] ?? Infinity);
        return (
          <div key={entry.name} className="flex items-center justify-between gap-3 mb-0.5">
            <span style={{ color: entry.color }} className="font-medium">
              {entry.name}
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

// Seed synthetic data for demo when the API returns []
function generateSeedData(terms: string[]): NarrativeTerm[] {
  const now = new Date();
  return terms.map((term, ti) => {
    const data: NarrativeDataPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      // Deterministic pseudo-random, occasional spike
      const base = Math.floor(((ti + 1) * 3 + i * 7) % 12) + 1;
      const spike = (i === 8 || i === 20) ? base * 3 : 0;
      data.push({ date, count: base + spike });
    }
    return { term, label: term, data };
  });
}

const TRACKED_TERMS = ['和平', '稳定', '停火', '选举', '主权'];

export default function TrendsPage() {
  const router = useRouter();
  const [terms, setTerms] = useState<NarrativeTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    narrativeApi
      .trends()
      .then((res) => {
        const raw = res.data;
        // If backend not yet returning data, fall back to seed so the chart is useful
        setTerms(raw && raw.length > 0 ? raw : generateSeedData(TRACKED_TERMS));
      })
      .catch(() => {
        setError('Failed to load narrative trends.');
        setTerms(generateSeedData(TRACKED_TERMS));
      })
      .finally(() => setLoading(false));
  }, [router]);

  const merged = useMemo(() => mergeData(terms), [terms]);

  const thresholds = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of terms) {
      map[t.term] = spikeThreshold(t.data);
    }
    return map;
  }, [terms]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f1117' }}>
      <NavBar />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-slate-100">Narrative Trends</h1>
          <p className="text-xs text-slate-500 mt-1">
            Mention frequency of tracked terms over time. Highlighted dots indicate a spike (&ge;2&times; the term&apos;s average).
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border px-4 py-3 text-sm bg-amber-500/10 border-amber-500/30 text-amber-400">
            {error} Showing seed data.
          </div>
        )}

        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
        >
          <div className="flex flex-wrap gap-2 mb-5">
            {terms.map((t, i) => {
              const color = TERM_COLORS[t.term] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
              return (
                <span
                  key={t.term}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border"
                  style={{ borderColor: color + '44', color, backgroundColor: color + '18' }}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {t.term}
                </span>
              );
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-500 text-sm">
              Loading trends...
            </div>
          ) : merged.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-slate-500 text-sm">
              No data available yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
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
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<CustomTooltip thresholds={thresholds} />}
                  cursor={{ stroke: '#3a3d4a', strokeWidth: 1 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
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

        <p className="mt-3 text-xs text-slate-600 text-right">
          Terms: {TRACKED_TERMS.join(' · ')}
        </p>
      </main>
    </div>
  );
}
