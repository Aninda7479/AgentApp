import React, { useEffect, useState } from 'react';
import { Box, Save, RefreshCw, AlertCircle, Info, Sparkles, Smile, ShieldCheck } from 'lucide-react';
import { getIpc } from '../../lib/electron';

/** Self-contained 3D model-generation & studio settings panel.
 * Reads/writes through IPC `settings-read` / `settings-write`.
 */
export const ThreeDSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<'hunyuan3d' | 'trellis2' | 'tripo' | 'meshy' | 'text2cad' | 'printmaker_ai'>('hunyuan3d');
  const [apiKey, setApiKey] = useState('');
  const [mode, setMode] = useState<'chat' | 'studio'>('studio');
  const [studioPersona, setStudioPersona] = useState<'kid' | 'pro'>('kid');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const ipc = getIpc();

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
      setProvider(cfg.provider || 'hunyuan3d');
      setApiKey(typeof cfg.apiKey === 'string' ? cfg.apiKey : '');
      setMode(cfg.mode === 'chat' ? 'chat' : 'studio');
      setStudioPersona(cfg.studioPersona === 'pro' ? 'pro' : 'kid');
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
        threeD: { enabled, provider, apiKey, mode, studioPersona }
      });
      setMessage({ text: '3D Studio & model settings saved successfully.', type: 'success' });
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
        <span>Loading 3D Studio settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
        <div>
          <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">3D Studio & Model Connections</h1>
          <p className="text-xs text-brand-textMuted mt-1">
            Configure SOTA 3D AI engines (Hunyuan3D, TRELLIS 2, Tripo3D, Meshy, Text2CAD), Kid/Pro Studio UX modes, and manufacturing exports.
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
        <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
          <Box size={14} className="text-[var(--brand-accent)]" />
          <span>Studio Engine Capability</span>
        </h2>

        {/* Master enable toggle */}
        <div className="flex items-center justify-between py-1 border-b border-brand-border/30 pb-3">
          <div>
            <div className="text-xs font-semibold text-brand-textMain">Enable 3D Model Studio</div>
            <div className="text-[10px] text-brand-textMuted mt-0.5">
              When off, 3D model generation and the 3D Studio page are disabled.
            </div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`px-3 py-1 rounded-lg border text-xs transition-all ${
              enabled
                ? 'border-[var(--brand-accent-border)] bg-[var(--brand-accent-tint)] text-[var(--brand-accent)] font-semibold'
                : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-brand-hover'
            }`}
          >
            <span>{enabled ? 'Enabled' : 'Disabled'}</span>
          </button>
        </div>

        {/* Studio Persona Mode (Kid vs Pro) */}
        <div className="space-y-1 pt-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider flex items-center gap-1">
            <Smile size={12} className="text-amber-400" />
            <span>Default Studio Persona UI</span>
          </label>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => setStudioPersona('kid')}
              disabled={!enabled}
              className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                studioPersona === 'kid'
                  ? 'border-amber-400/60 bg-amber-500/10 text-amber-300 font-medium'
                  : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-brand-hover'
              }`}
            >
              <div className="text-xs font-bold flex items-center gap-1.5">
                <span>🎈 Kid Magic Studio</span>
              </div>
              <div className="text-[10px] text-brand-textMuted">
                1-click prompts, cartoon presets, Super3D Buddy helper, and easy toy print mode.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStudioPersona('pro')}
              disabled={!enabled}
              className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                studioPersona === 'pro'
                  ? 'border-sky-400/60 bg-sky-500/10 text-sky-300 font-medium'
                  : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-brand-hover'
              }`}
            >
              <div className="text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-sky-400" />
                <span>🔬 Professional Studio</span>
              </div>
              <div className="text-[10px] text-brand-textMuted">
                Node graphs, CSG feature tree, quad retopo, PBR maps, and DFM factory STEP export.
              </div>
            </button>
          </div>
        </div>

        {/* Provider */}
        <div className="space-y-1 pt-2">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            Primary SOTA 3D AI Provider Engine
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as any)}
            disabled={!enabled}
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] disabled:opacity-50"
          >
            <option value="hunyuan3d">Hunyuan3D 3.5 (Tencent - SOTA Character & PBR)</option>
            <option value="trellis2">TRELLIS 2 (Microsoft - SOTA Splatting & Architecture)</option>
            <option value="tripo">Tripo3D (Rapid Prototyping)</option>
            <option value="meshy">Meshy 6 (Game Assets)</option>
            <option value="text2cad">Text2CAD / DeepCAD (Industrial B-Rep CAD)</option>
            <option value="printmaker_ai">PrintMakerAI (Functional 3D Printing Solids)</option>
          </select>
        </div>

        {/* API key */}
        <div className="space-y-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            Provider API key / Token
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={!enabled}
            placeholder="Enter API key or leave blank for local open-source fallback engine..."
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] disabled:opacity-50"
          />
          <div className="text-[10px] text-brand-textMuted mt-0.5">
            Keys are securely stored in local settings. If left blank, SuperAgent uses the local procedural kernel.
          </div>
        </div>

        {/* Entry Point Mode */}
        <div className="space-y-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            Studio Page Routing
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'chat' | 'studio')}
            disabled={!enabled}
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] disabled:opacity-50"
          >
            <option value="studio">Dedicated 3D Studio Workspace Page</option>
            <option value="chat">Inline Chat Tool Execution Mode</option>
          </select>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-[var(--brand-accent-tint)]/40 border border-[var(--brand-accent-border)]/40 p-3 text-[11px] text-brand-textMuted">
        <Info size={14} className="mt-0.5 text-[var(--brand-accent)] flex-shrink-0" />
        <span>
          <Sparkles size={12} className="inline text-[var(--brand-accent)]" /> When enabled, SuperAgent's 3DStudio handles game animation assets (`GLTF`/`FBX`/`USD`), 3D printing solids (`3MF`/`STL`), and factory B-Rep CAD manufacturing (`STEP`/`IGES`/`BOM`).
        </span>
      </div>
    </div>
  );
};

export default ThreeDSettings;
