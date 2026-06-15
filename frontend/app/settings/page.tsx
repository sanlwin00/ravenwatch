'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { settingsApi, sourcesApi, scrapeApi, translateApi } from '@/lib/api';
import type { Source, ScrapeRun } from '@/lib/api';
import NavBar from '@/components/NavBar';
import { Save, Check, X, RefreshCw, Languages } from 'lucide-react';

function Stat({ label, value, warn }: { label: string; value: number; warn?: number }) {
  return (
    <span className="text-xs text-slate-500">
      <span className="text-slate-300 font-medium">{value}</span> {label}
      {warn ? <span className="text-red-400 ml-1">({warn} failed)</span> : null}
    </span>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [retentionDays, setRetentionDays] = useState(30);
  const [scraperFrequency, setScraperFrequency] = useState(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [sources, setSources] = useState<Source[]>([]);
  const [sourceUrls, setSourceUrls] = useState<Record<string, string>>({});
  const [savingSource, setSavingSource] = useState<string | null>(null);
  const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    Promise.all([settingsApi.get(), sourcesApi.list()])
      .then(([settingsRes, sourcesRes]) => {
        setRetentionDays(settingsRes.data.retention_days);
        if (settingsRes.data.scraper_frequency_hours) {
          setScraperFrequency(settingsRes.data.scraper_frequency_hours);
        }
        setSources(sourcesRes.data);
        const urls: Record<string, string> = {};
        sourcesRes.data.forEach((s) => { urls[s.id] = s.url; });
        setSourceUrls(urls);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadRuns();
  }, [router]);

  async function handleTranslate() {
    setTranslating(true);
    showToast('success', 'Translating articles — this may take a few minutes…');
    try {
      await translateApi.run();
      showToast('success', 'Translation complete.');
      loadRuns();
    } catch {
      showToast('error', 'Translation failed — check server logs');
    } finally {
      setTranslating(false);
    }
  }

  function loadRuns() {
    setRunsLoading(true);
    scrapeApi.runs()
      .then(res => setScrapeRuns(res.data))
      .catch(() => {})
      .finally(() => setRunsLoading(false));
  }

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsApi.update({ retention_days: retentionDays, scraper_frequency_hours: scraperFrequency });
      showToast('success', 'Settings saved.');
    } catch {
      showToast('error', 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSourceSave(source: Source) {
    const newUrl = sourceUrls[source.id];
    if (!newUrl?.trim() || newUrl === source.url) return;
    setSavingSource(source.id);
    try {
      const res = await sourcesApi.update(source.id, newUrl.trim());
      setSources((prev) => prev.map((s) => (s.id === source.id ? res.data : s)));
      setSourceUrls((prev) => ({ ...prev, [source.id]: res.data.url }));
      showToast('success', `${source.name} updated.`);
    } catch {
      showToast('error', `Failed to update ${source.name}.`);
    } finally {
      setSavingSource(null);
    }
  }

  async function handleToggleActive(source: Source) {
    try {
      const res = await sourcesApi.update(source.id, sourceUrls[source.id], !source.active);
      setSources((prev) => prev.map((s) => (s.id === source.id ? res.data : s)));
    } catch {
      showToast('error', `Failed to toggle ${source.name}.`);
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f1117' }}>
      <NavBar />

      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-100 mb-6">Settings</h1>

        {toast && (
          <div
            className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {toast.msg}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading settings...</div>
        ) : (
          <div className="space-y-6">
            {/* General */}
            <div className="rounded-xl border p-5" style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}>
              <h2 className="text-sm font-semibold text-slate-300 mb-4">General</h2>
              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1" htmlFor="retention">
                    Article Retention (days)
                  </label>
                  <p className="text-xs text-slate-500 mb-2">Articles older than this many days will be removed. Range: 7–365.</p>
                  <input
                    id="retention"
                    type="number"
                    min={7}
                    max={365}
                    required
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(Number(e.target.value))}
                    className="w-32 rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                    style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1" htmlFor="frequency">
                    Scraper Frequency (hours)
                  </label>
                  <p className="text-xs text-slate-500 mb-2">How often the automatic scrape runs. Range: 1–168.</p>
                  <input
                    id="frequency"
                    type="number"
                    min={1}
                    max={168}
                    required
                    value={scraperFrequency}
                    onChange={(e) => setScraperFrequency(Number(e.target.value))}
                    className="w-32 rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                    style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </form>
            </div>

            {/* Scrape History */}
            <div className="rounded-xl border p-5" style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-slate-300">Scrape History</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleTranslate}
                    disabled={translating}
                    title="Translate pending articles"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs text-slate-300 hover:text-slate-100 disabled:opacity-40 transition-colors"
                    style={{ borderColor: '#2a2d3a' }}
                  >
                    <Languages size={13} className={translating ? 'animate-spin' : ''} />
                    {translating ? 'Translating…' : 'Translate'}
                  </button>
                  <button
                    onClick={loadRuns}
                    disabled={runsLoading}
                    className="p-1.5 rounded text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors"
                    title="Refresh runs"
                  >
                    <RefreshCw size={13} className={runsLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-4">Last 10 scrape runs.</p>

              {runsLoading && scrapeRuns.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">Loading...</p>
              ) : scrapeRuns.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No runs yet.</p>
              ) : (
                <div className="space-y-2">
                  {scrapeRuns.map((run) => {
                    const start = new Date(run.started_at);
                    const end = run.finished_at ? new Date(run.finished_at) : null;
                    const durationSec = end ? Math.round((end.getTime() - start.getTime()) / 1000) : null;
                    const durationFmt = durationSec === null ? null
                      : durationSec < 60 ? `${durationSec}s`
                      : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;
                    const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const timeStr = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                    const elapsedMin = run.status === 'running'
                      ? Math.floor((Date.now() - start.getTime()) / 60000)
                      : null;
                    const isStale = elapsedMin !== null && elapsedMin >= 15;
                    return (
                      <div
                        key={run.id}
                        className="rounded-lg border px-3 py-2.5"
                        style={{ borderColor: isStale ? '#f59e0b44' : '#2a2d3a', backgroundColor: '#0f1117' }}
                      >
                        {/* Row 1: date/time + status + duration */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-xs text-slate-400 font-medium">{dateStr} · {timeStr}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {elapsedMin !== null && (
                              <span className={`text-xs ${isStale ? 'text-amber-400' : 'text-slate-500'}`}>
                                {elapsedMin < 1 ? '< 1m elapsed' : `${elapsedMin}m elapsed`}
                                {isStale && ' ⚠'}
                              </span>
                            )}
                            {durationFmt !== null && (
                              <span className="text-xs text-slate-600">{durationFmt}</span>
                            )}
                            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${
                              run.status === 'success'
                                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                : run.status === 'running'
                                ? isStale
                                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                                  : 'bg-blue-500/10 border-blue-500/25 text-blue-400'
                                : 'bg-red-500/10 border-red-500/25 text-red-400'
                            }`}>
                              {run.status}
                            </span>
                          </div>
                        </div>
                        {/* Row 2: pipeline stats */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <Stat label="added" value={run.articles_added} />
                          {run.articles_translated !== undefined && (
                            <Stat label="translated" value={run.articles_translated} warn={run.articles_translation_failed} />
                          )}
                          {run.articles_tagged !== undefined && (
                            <Stat label="tagged" value={run.articles_tagged} warn={run.articles_tagging_failed} />
                          )}
                        </div>
                        {run.error_message && (
                          <p className="mt-1.5 text-xs text-red-400 truncate" title={run.error_message}>
                            {run.error_message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* News Sources */}
            <div className="rounded-xl border p-5" style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}>
              <h2 className="text-sm font-semibold text-slate-300 mb-1">News Sources</h2>
              <p className="text-xs text-slate-500 mb-4">
                Edit the URL the scraper crawls. Tap the toggle to enable/disable. URL changes save individually.
              </p>

              <div className="space-y-3">
                {sources.map((source) => {
                  const isDirty = sourceUrls[source.id] !== source.url;
                  const isSaving = savingSource === source.id;
                  return (
                    <div
                      key={source.id}
                      className="rounded-lg border p-3 space-y-2"
                      style={{ borderColor: '#2a2d3a', backgroundColor: '#0f1117' }}
                    >
                      {/* Row 1: toggle + name + type */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(source)}
                          title={source.active ? 'Disable' : 'Enable'}
                          className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center border transition-colors ${
                            source.active
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700'
                          }`}
                        >
                          {source.active ? <Check size={11} /> : <X size={11} />}
                        </button>
                        <span className="flex-1 text-sm text-slate-200 truncate font-medium" title={source.name}>
                          {source.name}
                        </span>
                        <span className="shrink-0 text-xs px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">
                          {source.type}
                        </span>
                      </div>

                      {/* Row 2: URL + save button */}
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={sourceUrls[source.id] ?? ''}
                          onChange={(e) =>
                            setSourceUrls((prev) => ({ ...prev, [source.id]: e.target.value }))
                          }
                          className="flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500 font-mono"
                          style={{
                            backgroundColor: '#1a1d27',
                            borderColor: isDirty ? '#3b82f6' : '#2a2d3a',
                          }}
                        />
                        {isDirty && (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSourceSave(source)}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                          >
                            {isSaving ? '…' : 'Save'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
