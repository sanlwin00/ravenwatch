'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { settingsApi, sourcesApi, scrapeApi, translateApi, tagApi, pipelineApi, authApi } from '@/lib/api';
import type { Source, ScrapeRun, PipelineStatus } from '@/lib/api';
import NavBar from '@/components/NavBar';
import { Save, Check, X, RefreshCw, Languages, Tag, RotateCcw, Play } from 'lucide-react';

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
  const [scraping, setScraping] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

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
    loadPipeline();
  }, [router]);

  function loadPipeline() {
    setPipelineLoading(true);
    pipelineApi.status()
      .then(res => setPipeline(res.data))
      .catch(() => {})
      .finally(() => setPipelineLoading(false));
  }

  async function handleTranslate() {
    setTranslating(true);
    showToast('success', 'Translating articles — this may take a few minutes…');
    try {
      await translateApi.run();
      showToast('success', 'Translation complete.');
      loadRuns();
      loadPipeline();
    } catch {
      showToast('error', 'Translation failed — check server logs');
    } finally {
      setTranslating(false);
    }
  }

  async function handleTag() {
    setTagging(true);
    showToast('success', 'Tagging articles — this may take a few minutes…');
    try {
      await tagApi.run();
      showToast('success', 'Tagging complete.');
      loadRuns();
      loadPipeline();
    } catch {
      showToast('error', 'Tagging failed — check server logs');
    } finally {
      setTagging(false);
    }
  }

  async function handleRetryFailed() {
    setRetrying(true);
    try {
      const res = await pipelineApi.retryFailed();
      const { translation_reset, tagging_reset } = res.data as { translation_reset: number; tagging_reset: number };
      showToast('success', `Reset ${translation_reset} translation + ${tagging_reset} tagging failures to pending.`);
      loadPipeline();
    } catch {
      showToast('error', 'Retry reset failed.');
    } finally {
      setRetrying(false);
    }
  }

  async function handleScrape() {
    setScraping(true);
    showToast('success', 'Scrape started — this may take a few minutes…');
    try {
      await scrapeApi.run();
      showToast('success', 'Scrape complete.');
      loadRuns();
    } catch {
      showToast('error', 'Scrape failed — check server logs.');
    } finally {
      setScraping(false);
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

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('error', 'New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      showToast('success', 'Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', msg || 'Failed to update password.');
    } finally {
      setChangingPassword(false);
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

            {/* Change Password */}
            <div className="rounded-xl border p-5" style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}>
              <h2 className="text-sm font-semibold text-slate-300 mb-4">Change Password</h2>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <input
                  type="password"
                  placeholder="Current password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                  style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                />
                <input
                  type="password"
                  placeholder="New password (min 8 chars)"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                  style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                  style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                />
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} />
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>

            {/* Pipeline Status */}
            <div className="rounded-xl border p-5" style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-300">Pipeline</h2>
                <button
                  onClick={loadPipeline}
                  disabled={pipelineLoading}
                  className="p-1.5 rounded text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors"
                  title="Refresh pipeline status"
                >
                  <RefreshCw size={13} className={pipelineLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {pipeline && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs">
                  <span className="text-slate-500">
                    <span className={pipeline.translation.pending > 0 ? 'text-amber-400 font-medium' : 'text-slate-300 font-medium'}>
                      {pipeline.translation.pending}
                    </span>{' '}pending translation
                  </span>
                  <span className="text-slate-500">
                    <span className={pipeline.tagging.pending > 0 ? 'text-amber-400 font-medium' : 'text-slate-300 font-medium'}>
                      {pipeline.tagging.pending}
                    </span>{' '}pending tagging
                  </span>
                  {pipeline.translation.failed > 0 && (
                    <span className="text-red-400">
                      <span className="font-medium">{pipeline.translation.failed}</span> translation failed
                    </span>
                  )}
                  {pipeline.tagging.failed > 0 && (
                    <span className="text-red-400">
                      <span className="font-medium">{pipeline.tagging.failed}</span> tagging failed
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleTranslate}
                  disabled={translating || tagging}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs text-slate-300 hover:text-slate-100 disabled:opacity-40 transition-colors"
                  style={{ borderColor: '#2a2d3a' }}
                >
                  <Languages size={13} className={translating ? 'animate-spin' : ''} />
                  {translating ? 'Translating…' : 'Translate'}
                </button>
                <button
                  onClick={handleTag}
                  disabled={tagging || translating}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs text-slate-300 hover:text-slate-100 disabled:opacity-40 transition-colors"
                  style={{ borderColor: '#2a2d3a' }}
                >
                  <Tag size={13} className={tagging ? 'animate-spin' : ''} />
                  {tagging ? 'Tagging…' : 'Tag'}
                </button>
                {pipeline && (pipeline.translation.failed > 0 || pipeline.tagging.failed > 0) && (
                  <button
                    onClick={handleRetryFailed}
                    disabled={retrying}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
                    style={{ borderColor: '#2a2d3a' }}
                  >
                    <RotateCcw size={13} className={retrying ? 'animate-spin' : ''} />
                    {retrying ? 'Resetting…' : 'Retry Failed'}
                  </button>
                )}
              </div>
            </div>

            {/* Scrape History */}
            <div className="rounded-xl border p-5" style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-slate-300">Scrape History</h2>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleScrape}
                    disabled={scraping}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                  >
                    <Play size={11} className={scraping ? 'animate-pulse' : ''} />
                    {scraping ? 'Scraping…' : 'Scrape Now'}
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
                                : run.status === 'interrupted'
                                ? 'bg-slate-500/10 border-slate-500/25 text-slate-400'
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
                        <a
                          href={sourceUrls[source.id] ?? source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-sm text-slate-200 hover:text-blue-400 truncate font-medium transition-colors"
                          title={source.url}
                        >
                          {source.name}
                        </a>
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
