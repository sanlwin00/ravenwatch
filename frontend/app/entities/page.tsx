'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { entitiesApi } from '@/lib/api';
import type { Entity } from '@/lib/api';
import NavBar from '@/components/NavBar';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

const ENTITY_TYPES = ['person', 'organization', 'location', 'military_group', 'political_party', 'other'];
const ENTITY_TIERS = [1, 2, 3];

interface EntityFormData {
  name: string;
  name_zh: string;
  aliases: string;
  type: string;
  tier: number;
}

const EMPTY_FORM: EntityFormData = {
  name: '',
  name_zh: '',
  aliases: '',
  type: 'person',
  tier: 1,
};

export default function EntitiesPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<EntityFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    loadEntities();
  }, [router]);

  function loadEntities() {
    entitiesApi.list()
      .then(res => setEntities(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  }

  function openEdit(entity: Entity) {
    setEditId(entity.id);
    setForm({
      name: entity.name,
      name_zh: entity.name_zh || '',
      aliases: (entity.aliases || []).join('\n'),
      type: entity.type,
      tier: entity.tier,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      name: form.name,
      name_zh: form.name_zh || undefined,
      aliases: form.aliases ? form.aliases.split('\n').map(s => s.trim()).filter(Boolean) : [],
      type: form.type,
      tier: form.tier,
    };
    try {
      if (editId !== null) {
        await entitiesApi.update(editId, payload);
      } else {
        await entitiesApi.create(payload);
      }
      setShowModal(false);
      loadEntities();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Save failed.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete entity "${name}"?`)) return;
    try {
      await entitiesApi.delete(id);
      setEntities(prev => prev.filter(e => e.id !== id));
    } catch {
      alert('Delete failed.');
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f1117' }}>
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Watchlist</h1>
            <p className="text-sm text-slate-500">{entities.length} entities tracked</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-500 transition-colors"
          >
            <Plus size={14} />
            Add Entity
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading entities...</div>
        ) : entities.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">No entities yet.</div>
        ) : (
          <div className="space-y-2">
            {entities.map((entity) => (
              <div
                key={entity.id}
                className="rounded-xl border px-4 py-3"
                style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
              >
                {/* Row 1: name + actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-100">{entity.name}</span>
                    {entity.name_zh && (
                      <span className="ml-2 text-xs text-slate-500">{entity.name_zh}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(entity)}
                      className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(entity.id, entity.name)}
                      className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {/* Row 2: type + tier badges */}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs px-1.5 py-0.5 rounded border border-slate-700 text-slate-500 capitalize">
                    {entity.type?.replace(/_/g, ' ')}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${
                    entity.tier === 1
                      ? 'bg-red-500/15 text-red-400 border-red-500/30'
                      : entity.tier === 2
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  }`}>
                    {entity.tier === 1 ? 'Critical' : entity.tier === 2 ? 'High' : 'Medium'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-md rounded-xl border p-6"
            style={{ backgroundColor: '#1a1d27', borderColor: '#2a2d3a' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-slate-100">
                {editId !== null ? 'Edit Entity' : 'Add Entity'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                  style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Chinese Name</label>
                <input
                  value={form.name_zh}
                  onChange={e => setForm(p => ({ ...p, name_zh: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                  style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Aliases (one per line)</label>
                <textarea
                  value={form.aliases}
                  onChange={e => setForm(p => ({ ...p, aliases: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 resize-none"
                  style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm text-slate-300 outline-none"
                    style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a', colorScheme: 'dark' }}
                  >
                    {ENTITY_TYPES.map(t => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tier</label>
                  <select
                    value={form.tier}
                    onChange={e => setForm(p => ({ ...p, tier: Number(e.target.value) }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm text-slate-300 outline-none"
                    style={{ backgroundColor: '#0f1117', borderColor: '#2a2d3a', colorScheme: 'dark' }}
                  >
                    <option value={1}>1 — Critical</option>
                    <option value={2}>2 — High</option>
                    <option value={3}>3 — Medium</option>
                  </select>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 border border-red-500/20 bg-red-500/10 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border text-sm text-slate-400 hover:text-slate-200 transition-colors"
                  style={{ borderColor: '#2a2d3a' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
