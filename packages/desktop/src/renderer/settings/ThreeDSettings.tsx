import React, { useEffect, useState } from 'react';
import { Box, Save, RefreshCw, AlertCircle, Info, Sparkles } from 'lucide-react';

/** Self-contained 3D model-generation settings panel.
 *
 * Reads/writes through the same `settings-read` / `settings-write` IPC
 * the other panels use, so no prop threading is needed. The capability is
 * DISABLED BY DEFAULT (per product decision) — the user must opt in here. */
export const ThreeDSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<'tripo' | 'meshy'>('tripo');
  const [apiKey, setApiKey] = useState('');
  const [mode, setMode] = useState<'chat' | 'studio'>('chat');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const ipc = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require('electron').ipcRenderer
    : null;

  const loadSettings = async () => {
    if (!ipc) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const settings = (await ipc.invoke('settings-read')) as any;
      const cfg = settings?.threeD || {};
      setEnabled(cfg.enabled === true);
      setProvider(cfg.provider === 'meshy' ? 'meshy' : 'tripo');
      setApiKey(typeof cfg.apiKey === 'string' ? cfg.apiKey : '');
      setMode(cfg.mode === 'studio' ? 'studio' : 'chat');
    } catch (e) {
      console.error('Failed to load 3D settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!ipc) return;
    setSaving(true);
    setMessage(null);
    try {
      const current = (await ipc.invoke('settings-read')) as any;
      await ipc.invoke('settings-write', {
        ...current,
        threeD: { enabled, provider, apiKey, mode }
      });
      setMessage({ text: '3D generation settings saved.', type: 'success' });
    } catch (e: any) {
      setMessage({ text: `Failed to save: ${e?.message ?? e}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-[var(--brand-accent)] mb-2" />
        <span>Loading 3D settings...</span>
      </div>
    );
  }

  const needsKey = enabled && !apiKey.trim();

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
        <div>
          <h2 className="text-base font-bold text-brand-textMain">3D Model Generation</h2>
          <p className="text-xs text-brand-textMuted mt-1">
            Let the agent make, export, and animate 3D characters — Tripo3D / Meshy style.
            Off by default; turn it on to enable.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="ui-btn-primary text-xs"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {message && (
        <div className={`ui-state-banner p-3 rounded-lg flex items-start gap-2.5 text-xs ${
          message.type === 'success' ? 'constructive' : 'destructive'
        }`}>
          <AlertCircle size={15} className="mt-0.5" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
        <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
          <Box size={14} className="text-[var(--brand-accent)]" />
          <span>Capability</span>
        </h3>

        {/* Master enable toggle (default OFF) */}
        <div className="flex items-center justify-between py-1 border-b border-brand-border/30 pb-3">
          <div>
            <div className="text-xs font-semibold text-brand-textMain">Enable 3D model generation</div>
            <div className="text-[10px] text-brand-textMuted mt-0.5">
              When off, the agent cannot generate 3D models and the Studio page is hidden.
            </div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`px-3 py-1 rounded-lg border text-xs transition-all ${
              enabled
                ? 'border-[var(--brand-accent-border)] bg-[var(--brand-accent-tint)] text-[var(--brand-accent)]'
                : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-brand-hover'
            }`}
          >
            <span>{enabled ? 'Enabled' : 'Disabled'}</span>
          </button>
        </div>

        {/* Provider */}
        <div className="space-y-1 pt-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            Generation provider
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as 'tripo' | 'meshy')}
            disabled={!enabled}
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] disabled:opacity-50"
          >
            <option value="tripo">Tripo3D</option>
            <option value="meshy">Meshy</option>
          </select>
        </div>

        {/* API key */}
        <div className="space-y-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            {provider === 'tripo' ? 'Tripo3D' : 'Meshy'} API key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={!enabled}
            placeholder={provider === 'tripo' ? 'tp-...' : 'msk-...'}
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] disabled:opacity-50"
          />
          <div className="text-[10px] text-brand-textMuted mt-0.5">
            Stored only in local settings. Without a key the agent can still build a local
            procedural character (no cloud 3D API).
          </div>
        </div>

        {/* Mode: main chat vs dedicated page */}
        <div className="space-y-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            Where the entry point lives
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'chat' | 'studio')}
            disabled={!enabled}
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] disabled:opacity-50"
          >
            <option value="chat">Main chat — agent tool `make_3d_character`</option>
            <option value="studio">Dedicated 3D Studio page</option>
          </select>
          <div className="text-[10px] text-brand-textMuted mt-0.5">
            Chat mode exposes a tool the agent calls inline. Studio mode routes to a
            separate page for direct creation and preview.
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-[var(--brand-accent-tint)]/40 border border-[var(--brand-accent-border)]/40 p-3 text-[11px] text-brand-textMuted">
        <Info size={14} className="mt-0.5 text-[var(--brand-accent)] flex-shrink-0" />
        <span>
          <Sparkles size={12} className="inline text-[var(--brand-accent)]" /> When enabled, the agent can
          generate a 3D character (via {provider === 'tripo' ? 'Tripo3D' : 'Meshy'} if a key is set, or a
          local procedural model otherwise), export it as a <code>.glb</code>/<code>.gltf</code>,
          and show it as an animating 3D pet. This is opt-in and off by default.
        </span>
      </div>
    </div>
  );
};

export default ThreeDSettings;
