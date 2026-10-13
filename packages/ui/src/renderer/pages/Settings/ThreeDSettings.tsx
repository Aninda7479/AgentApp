import React, { useEffect, useState } from 'react';
import {
  Box,
  Save,
  RefreshCw,
  AlertCircle,
  Info,
  Sparkles,
  Cpu,
  FolderOpen,
  Key,
  ShieldCheck,
  CheckCircle,
  Download,
  Trash2,
} from 'lucide-react';
import { getIpc } from '../../lib/ipc';
import {
  ThreeDHardwareProfile,
  ThreeDEngineStatus,
  ThreeDModelInfo,
  getThreeDHardwareProfile,
  getThreeDEngineStatus,
  listThreeDModels,
  openThreeDModelsDir,
  deleteThreeDModel,
} from '../../services/threeDService';

export const ThreeDSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [defaultProvider, setDefaultProvider] = useState('procedural-world-v1');
  const [tripoKey, setTripoKey] = useState('');
  const [meshyKey, setMeshyKey] = useState('');
  const [replicateKey, setReplicateKey] = useState('');
  const [defaultFormat, setDefaultFormat] = useState<'glb' | 'obj' | 'ply' | 'stl'>('glb');

  // System & Models
  const [hardware, setHardware] = useState<ThreeDHardwareProfile | null>(null);
  const [engineStatus, setEngineStatus] = useState<ThreeDEngineStatus | null>(null);
  const [models, setModels] = useState<ThreeDModelInfo[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const ipc = getIpc();

  const loadData = async () => {
    setLoading(true);
    try {
      const [hw, status, modelsList] = await Promise.all([
        getThreeDHardwareProfile(),
        getThreeDEngineStatus(),
        listThreeDModels(),
      ]);
      setHardware(hw);
      setEngineStatus(status);
      setModels(modelsList);

      if (ipc) {
        const settings = (await ipc.invoke('settings-read')) as Record<string, unknown>;
        const threeD = (settings?.threeD as Record<string, unknown>) || {};
        const apiKeys = (settings?.apiKeys as Record<string, string>) || {};

        if (typeof threeD.enabled === 'boolean') setEnabled(threeD.enabled);
        if (typeof threeD.provider === 'string') setDefaultProvider(threeD.provider);
        if (typeof threeD.defaultFormat === 'string') setDefaultFormat(threeD.defaultFormat as any);

        if (typeof apiKeys.tripo3d === 'string') setTripoKey(apiKeys.tripo3d);
        if (typeof apiKeys.meshy === 'string') setMeshyKey(apiKeys.meshy);
        if (typeof apiKeys.replicate === 'string') setReplicateKey(apiKeys.replicate);
      }
    } catch (e) {
      console.error('Failed to load 3D settings data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async () => {
    if (!ipc) return;
    setSaving(true);
    setMessage(null);
    try {
      const current = (await ipc.invoke('settings-read')) as Record<string, unknown>;
      const existingKeys = (current?.apiKeys as Record<string, string>) || {};

      await ipc.invoke('settings-write', {
        ...current,
        threeD: {
          enabled,
          provider: defaultProvider,
          defaultFormat,
          mode: 'studio',
        },
        apiKeys: {
          ...existingKeys,
          tripo3d: tripoKey.trim(),
          meshy: meshyKey.trim(),
          replicate: replicateKey.trim(),
        },
      });

      setMessage({ text: '3D Workspace & Model settings saved successfully.', type: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage({ text: `Failed to save: ${msg}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await openThreeDModelsDir();
    } catch {
      setMessage({ text: 'Failed to open models directory.', type: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Delete model '${id}'?`)) return;
    try {
      await deleteThreeDModel(id);
      loadData();
      setMessage({ text: `Model '${id}' deleted.`, type: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage({ text: `Could not delete model: ${msg}`, type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-sky-400 mb-2" />
        <span>Loading 3D Workspace hardware & model settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
        <div>
          <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">
            3D Workspace & Model Connections
          </h1>
          <p className="text-xs text-brand-textMuted mt-1">
            Configure SOTA 3D engines (TRELLIS, Hunyuan3D, Procedural Spatial World Kernel), hardware accelerators, and cloud API keys.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="ui-btn-primary text-xs">
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {message && (
        <div
          className={`ui-state-banner p-3 rounded-lg flex items-start gap-2.5 text-xs ${
            message.type === 'success' ? 'constructive' : 'destructive'
          }`}
        >
          <AlertCircle size={15} className="mt-0.5" />
          <span>{message.text}</span>
        </div>
      )}

      {/* ── Hardware Acceleration Profile Card ── */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-3">
        <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
          <Cpu size={14} className="text-sky-400" />
          <span>Hardware Acceleration & VRAM Detection</span>
        </h2>

        {hardware && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-brand-bg/50 border border-brand-border/40 space-y-1">
              <span className="text-[10px] text-brand-textMuted uppercase font-semibold">Active Graphics</span>
              <div className="text-xs font-bold text-brand-textMain truncate">
                {hardware.gpu_name || 'Standard GPU'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-brand-bg/50 border border-brand-border/40 space-y-1">
              <span className="text-[10px] text-brand-textMuted uppercase font-semibold">System Memory</span>
              <div className="text-xs font-bold text-brand-textMain">
                {Math.round(hardware.total_ram_mb / 1024)} GB Total
              </div>
            </div>

            <div className="p-3 rounded-xl bg-brand-bg/50 border border-brand-border/40 space-y-1">
              <span className="text-[10px] text-brand-textMuted uppercase font-semibold">Compute Backend</span>
              <div className="text-xs font-bold text-sky-400 uppercase font-mono">
                {hardware.recommended_backend}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-brand-bg/50 border border-brand-border/40 space-y-1">
              <span className="text-[10px] text-brand-textMuted uppercase font-semibold">Gaussian Splatting</span>
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle size={12} />
                <span>Supported</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 3D Engine & Model Catalog ── */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-brand-border/30 pb-3">
          <div>
            <div className="text-xs font-semibold text-brand-textMain">Enable 3D Model Workspace</div>
            <div className="text-[10px] text-brand-textMuted mt-0.5">
              Activates the 3D Studio page and autonomous agent spatial tools.
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

        {/* Model Catalog Table */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">
              Pluggable 3D Engines & Connectors
            </span>
            <button
              onClick={handleOpenFolder}
              className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition-colors"
            >
              <FolderOpen size={12} />
              <span>Open Models Folder</span>
            </button>
          </div>

          <div className="space-y-2">
            {models.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded-xl border border-brand-border/50 bg-brand-bg/40 flex items-center justify-between"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-brand-textMain">{m.name}</span>
                    {m.is_downloaded && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-400/30">
                        READY
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-brand-textMuted">
                    {m.family === 'procedural'
                      ? 'Pure Rust procedural spatial kernel • 0 VRAM requirement'
                      : m.size_bytes > 0
                      ? `${(m.size_bytes / 1e9).toFixed(1)} GB • Required VRAM: ${Math.round(m.vram_required_mb / 1024)} GB`
                      : 'Cloud API Connector'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {m.family !== 'procedural' && !m.is_downloaded && m.download_url && (
                    <a
                      href={m.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-300 text-[10px] font-semibold flex items-center gap-1"
                    >
                      <Download size={11} />
                      <span>HuggingFace</span>
                    </a>
                  )}
                  {m.is_downloaded && m.family !== 'procedural' && (
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                      title="Delete local weights"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Primary Default Engine Selection */}
        <div className="space-y-1.5 pt-2">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            Primary Default 3D Engine
          </label>
          <select
            value={defaultProvider}
            onChange={(e) => setDefaultProvider(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Default Format Selection */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            Default Mesh Format
          </label>
          <select
            value={defaultFormat}
            onChange={(e) => setDefaultFormat(e.target.value as any)}
            disabled={!enabled}
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
          >
            <option value="glb">GLB (Binary glTF 2.0 - Universal PBR)</option>
            <option value="obj">OBJ (Wavefront Geometry)</option>
            <option value="ply">PLY (3D Gaussian Splatting & Point Clouds)</option>
            <option value="stl">STL (Functional 3D Printing Solid)</option>
          </select>
        </div>
      </div>

      {/* ── Cloud 3D Provider API Keys ── */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
        <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
          <Key size={14} className="text-[var(--brand-accent)]" />
          <span>Cloud 3D Provider Credentials</span>
        </h2>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
              Tripo3D API Key
            </label>
            <input
              type="password"
              value={tripoKey}
              onChange={(e) => setTripoKey(e.target.value)}
              disabled={!enabled}
              placeholder="tripo_..."
              className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
              Meshy 4 API Key
            </label>
            <input
              type="password"
              value={meshyKey}
              onChange={(e) => setMeshyKey(e.target.value)}
              disabled={!enabled}
              placeholder="msy_..."
              className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
              Replicate API Token (Trellis & Hunyuan3D Cloud)
            </label>
            <input
              type="password"
              value={replicateKey}
              onChange={(e) => setReplicateKey(e.target.value)}
              disabled={!enabled}
              placeholder="r8_..."
              className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] font-mono"
            />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-[var(--brand-accent-tint)]/40 border border-[var(--brand-accent-border)]/40 p-3 text-[11px] text-brand-textMuted">
        <Info size={14} className="mt-0.5 text-[var(--brand-accent)] shrink-0" />
        <span>
          <Sparkles size={12} className="inline text-[var(--brand-accent)]" /> When connected, SuperAgent autonomously constructs spatial worlds, rooms, and high-fidelity 3D assets with real-time viewport visualization at{' '}
          <a href="/studio" className="text-sky-400 hover:underline">
            /studio
          </a>.
        </span>
      </div>
    </div>
  );
};

export default ThreeDSettings;
