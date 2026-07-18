import React, { useEffect, useMemo, useState } from 'react';
import { Mic, Save, RefreshCw, AlertCircle, Info, Globe } from 'lucide-react';

type Engine = 'auto' | 'browser' | 'model';

interface ProviderRef {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
}

interface ModelRef {
  id: string;
  name: string;
  providerId?: string;
  inputModalities?: string[];
}

/**
 * Voice & Mic settings panel — configures how the Workspace composer's mic
 * button turns speech into text.
 *
 * Self-contained like {@link ThreeDSettings}: reads/writes through the shared
 * `settings-read` / `settings-write` IPC. The Web Speech API (browser engine)
 * needs no model, but is unreliable inside Electron; selecting a cloud STT
 * model (e.g. `whisper-1`) makes dictation work reliably.
 */
export const VoiceSettings: React.FC = () => {
  const [engine, setEngine] = useState<Engine>('auto');
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('whisper-1');
  const [language, setLanguage] = useState('');

  const [providers, setProviders] = useState<ProviderRef[]>([]);
  const [models, setModels] = useState<ModelRef[]>([]);

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
      const cfg = settings?.voice || {};
      setEngine(cfg.engine === 'browser' || cfg.engine === 'model' ? cfg.engine : 'auto');
      setModel(typeof cfg.model === 'string' && cfg.model ? cfg.model : 'whisper-1');
      setLanguage(typeof cfg.language === 'string' ? cfg.language : '');

      const provs: ProviderRef[] = Array.isArray(settings?.providers) ? settings.providers : [];
      setProviders(provs);
      setModels(Array.isArray(settings?.models) ? settings.models : []);

      // Default the provider to the saved one, else the first with a key.
      const savedId = typeof cfg.providerId === 'string' ? cfg.providerId : '';
      if (savedId && provs.some((p) => p.id === savedId)) {
        setProviderId(savedId);
      } else {
        setProviderId(provs.find((p) => p.apiKey)?.id || provs[0]?.id || '');
      }
    } catch (e) {
      console.error('Failed to load voice settings:', e);
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
        voice: { engine, providerId, model: model.trim() || 'whisper-1', language: language.trim() }
      });
      setMessage({ text: 'Voice & mic settings saved.', type: 'success' });
    } catch (e: any) {
      setMessage({ text: `Failed to save: ${e?.message ?? e}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const selectedProvider = providers.find((p) => p.id === providerId);

  // Models that can take audio input make good STT suggestions.
  const sttModelSuggestions = useMemo(() => {
    const names = models
      .filter((m) => (m.inputModalities || []).includes('audio'))
      .filter((m) => !providerId || !m.providerId || m.providerId === providerId)
      .map((m) => m.name || m.id);
    return Array.from(new Set(['whisper-1', ...names]));
  }, [models, providerId]);

  // What will actually happen at mic-time, given the current form values.
  const usesModel = engine === 'model' || (engine === 'auto' && Boolean(selectedProvider?.apiKey));
  const modelUnavailable = engine === 'model' && !selectedProvider?.apiKey;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-[var(--brand-accent)] mb-2" />
        <span>Loading voice settings...</span>
      </div>
    );
  }

  const engineDisabled = engine === 'browser';

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
        <div>
          <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Voice &amp; Mic</h1>
          <p className="text-xs text-brand-textMuted mt-1">
            Control how the composer's mic button turns your speech into text.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="ui-btn-primary text-xs">
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
          <Mic size={14} className="text-[var(--brand-accent)]" />
          <span>Dictation engine</span>
        </h2>

        {/* Engine */}
        <div className="space-y-1 pt-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            Speech-to-text engine
          </label>
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as Engine)}
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
          >
            <option value="auto">Auto — use a cloud model if configured, else the browser</option>
            <option value="model">Cloud model (Whisper / STT) — most reliable</option>
            <option value="browser">Browser (Web Speech API) — no model needed</option>
          </select>
          <div className="text-[10px] text-brand-textMuted mt-0.5">
            The browser engine needs no setup but is unreliable inside the desktop app. A cloud model
            gives accurate dictation but requires a connected provider with an API key.
          </div>
        </div>

        {/* Provider */}
        <div className="space-y-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            Transcription provider
          </label>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            disabled={engineDisabled}
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] disabled:opacity-50"
          >
            {providers.length === 0 && <option value="">No providers connected</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}{p.apiKey ? '' : ' (no API key)'}
              </option>
            ))}
          </select>
          {providers.length === 0 && (
            <div className="text-[10px] text-[color:var(--neon-attention)] mt-0.5">
              Connect a provider in Settings → Providers first.
            </div>
          )}
        </div>

        {/* Model */}
        <div className="space-y-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">
            STT model
          </label>
          <input
            type="text"
            list="voice-stt-models"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={engineDisabled}
            placeholder="whisper-1"
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] disabled:opacity-50"
          />
          <datalist id="voice-stt-models">
            {sttModelSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="text-[10px] text-brand-textMuted mt-0.5">
            OpenAI-compatible transcription model. Defaults to <code>whisper-1</code>.
          </div>
        </div>

        {/* Language */}
        <div className="space-y-1">
          <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider flex items-center gap-1">
            <Globe size={11} /> Language hint (optional)
          </label>
          <input
            type="text"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={engineDisabled}
            placeholder="e.g. en, es, fr — leave blank to auto-detect"
            className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] disabled:opacity-50"
          />
        </div>
      </div>

      {/* Effective-behavior hint */}
      <div className={`flex items-start gap-2 rounded-lg p-3 text-[11px] ${
        modelUnavailable
          ? 'bg-[color:var(--neon-destructive)]/10 border border-[color:var(--neon-destructive)]/30 text-[color:var(--neon-destructive)]'
          : 'bg-[var(--brand-accent-tint)]/40 border border-[var(--brand-accent-border)]/40 text-brand-textMuted'
      }`}>
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          {modelUnavailable ? (
            <>Engine is set to <b>Cloud model</b>, but the selected provider has no API key — the mic
            will not work until you add one in Settings → Providers, or switch the engine to
            Browser / Auto.</>
          ) : usesModel ? (
            <>The mic will record your voice and transcribe it with <b>{model.trim() || 'whisper-1'}</b>
            {selectedProvider ? <> via <b>{selectedProvider.name || selectedProvider.id}</b></> : null}.</>
          ) : (
            <>The mic will use the browser's built-in Web Speech API. No model is used. If dictation
            does nothing, switch the engine to <b>Cloud model</b> and select a provider above.</>
          )}
        </span>
      </div>
    </div>
  );
};

export default VoiceSettings;
