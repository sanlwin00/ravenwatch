'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { settingsApi, sourcesApi, Source } from '@/lib/api';
import NavBar from '@/components/NavBar';
import { Save, Check, X } from 'lucide-react';

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
  }, [router]);

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
            <div className="rounded-xl border p-6" style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}>
              <h2 className="text-sm font-semibold text-slate-300 mb-4">General</h2>
              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1" htmlFor="retention">
                    Article Retention (days)
                  </label>
                  <p className="text-xs text-slate-500 mb-3">
                    Articles older than this many days will be removed. Range: 7–365.
                  </p>
                  <input
                    id="retention"
                    type="number"
                    min={7}
                    max={365}
                    required
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(Number(e.target.value))}
                    className="w-40 rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                    style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1" htmlFor="frequency">
                    Scraper Frequency (hours)
                  </label>
                  <p className="text-xs text-slate-500 mb-3">
                    How often the automatic scrape runs. Range: 1–168. Takes effect on next scheduled run.
                  </p>
                  <input
                    id="frequency"
                    type="number"
                    min={1}
                    max={168}
                    required
                    value={scraperFrequency}
                    onChange={(e) => setScraperFrequency(Number(e.target.value))}
                    className="w-40 rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                    style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                  />
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                  >
                    <Save size={14} />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </form>
            </div>

            {/* News Sources */}
            <div className="rounded-xl border p-6" style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}>
              <h2 className="text-sm font-semibold text-slate-300 mb-1">News Sources</h2>
              <p className="text-xs text-slate-500 mb-4">
                Edit the listing-page URL the scraper crawls. Toggle the checkmark to enable or disable a source.
              </p>

              <div className="space-y-2">
                {sources.map((source) => {
                  const isDirty = sourceUrls[source.id] !== source.url;
                  const isSaving = savingSource === source.id;
                  return (
                    <div key={source.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(source)}
                        title={source.active ? 'Disable' : 'Enable'}
                        className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center border transition-colors ${
                          source.active
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                            : 'bg-slate-800 border-slate-700 text-slate-600 hover:bg-slate-700'
                        }`}
                      >
                        {source.active ? <Check size={11} /> : <X size={11} />}
                      </button>

                      <span className="w-40 flex-shrink-0 text-xs text-slate-300 truncate" title={source.name}>
                        {source.name}
                      </span>

                      <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded border border-slate-700 text-slate-500">
                        {source.type}
                      </span>

                      <input
                        type="url"
                        value={sourceUrls[source.id] ?? ''}
                        onChange={(e) =>
                          setSourceUrls((prev) => ({ ...prev, [source.id]: e.target.value }))
                        }
                        className="flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500 font-mono"
                        style={{
                          backgroundColor: '#0f1117',
                          borderColor: isDirty ? '#3b82f6' : '#2a2d3a',
                        }}
                      />

                      {isDirty && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSourceSave(source)}
                          className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                        >
                          {isSaving ? '…' : 'Save'}
                        </button>
                      )}
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
