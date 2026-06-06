'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { settingsApi } from '@/lib/api';
import NavBar from '@/components/NavBar';
import { Save } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [retentionDays, setRetentionDays] = useState(30);
  const [scraperFrequency, setScraperFrequency] = useState(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    settingsApi.get()
      .then(res => {
        setRetentionDays(res.data.retention_days);
        if (res.data.scraper_frequency_hours) setScraperFrequency(res.data.scraper_frequency_hours);
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f1117' }}>
      <NavBar />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-100 mb-6">Settings</h1>

        {/* Toast */}
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
          <div
            className="rounded-xl border p-6"
            style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
          >
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
        )}
      </main>
    </div>
  );
}
