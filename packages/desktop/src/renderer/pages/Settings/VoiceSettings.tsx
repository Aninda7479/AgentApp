import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mic, Save, RefreshCw, AlertCircle, Info, Languages, Zap, Cloud, Globe, Server, ExternalLink, BookMarked, Plus, X, ArrowRight, Cpu, HardDrive, Download, Trash2, CircleCheck, CircleAlert, Loader2 } from 'lucide-react';
import { SearchableSelect, SearchableSelectOption } from '../../components/ui/SearchableSelect';
import { ModelPricing } from './types';
import { errorMessage } from '../../lib/errorReporter';
import { getIpc } from '../../lib/electron';

type Engine = 'auto' | 'browser' | 'model' | 'local';
type WhisperSize = 'tiny' | 'base' | 'small' | 'medium' | 'large';
type ComputeDevice = 'cpu' | 'gpu' | 'auto';

interface Correction { from: string; to: string }
interface VoiceDictionary { words: string[]; corrections: Correction[] }
interface LocalWhisper { enabled: boolean; size: WhisperSize; language: string; autoDetect: boolean; device: ComputeDevice; modelDir: string }

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
  pricing?: ModelPricing;
  free?: boolean;
}

const WHISPER_SIZES: { id: WhisperSize; label: string; approx: string }[] = [
  { id: 'tiny',   label: 'Tiny',   approx: '~40 MB · fastest' },
  { id: 'base',   label: 'Base',   approx: '~75 MB' },
  { id: 'small',  label: 'Small',  approx: '~240 MB' },
  { id: 'medium', label: 'Medium', approx: '~770 MB' },
  { id: 'large',  label: 'Large',  approx: '~1.5 GB · best' }
];

const fmtBytes = (bytes: number): string => {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
};

/** Render a compact price line from a catalog pricing object. */
const priceLine = (p?: ModelPricing, free?: boolean): string => {
  if (free) return 'Free';
  if (!p) return 'N/A';
  const parts: string[] = [];
  if (p.inputPer1M) parts.push(`in ${p.inputPer1M}`);
  if (p.outputPer1M) parts.push(`out ${p.outputPer1M}`);
  return parts.length ? parts.join(' / ') : 'N/A';
};

/** Catalog ids are stored as `${providerId}-${rawId}`; strip the prefix to get
 *  the bare API model id the transcription path expects (e.g. `whisper-1`). */
const bareModelId = (id: string, providerId?: string): string => {
  if (providerId && id.startsWith(`${providerId}-`)) return id.slice(providerId.length + 1);
  return id;
};

// Same transcription-family signal the app already uses to detect audio dictation
// capability (capabilities.ts). A model is usable for STT only if it both
// accepts *audio input* (we have that from the catalog modality) AND is a real
// speech-to-text model — NOT a multimodal *chat* model (omni / reasoning)
// that accepts audio inside a chat completion but has no /audio/transcriptions
// endpoint. Those chat models surface a 400 ("model does not exist") if asked
// to transcribe, so we keep them out of the STT picker.
const TRANSCRIPTION_FAMILY = /whisper|transcrib|speech-to-text|\basr\b|\bstt\b|speech-recognition|voxtral|scribe|nova-\d|deepgram|gladia|assembl/;
const NON_TRANSCRIPTION = /omni|reasoning|instruct|-chat\b|\bchat-/;
const isTranscriptionModel = (id: string, name: string): boolean => {
  const blob = `${id} ${name}`.toLowerCase();
  if (NON_TRANSCRIPTION.test(blob)) return false;
  return TRANSCRIPTION_FAMILY.test(blob);
};

const ENGINE_CHOICES: { id: Engine; title: string; desc: string; icon: React.ElementType }[] = [
  { id: 'auto',    title: 'Auto',        desc: 'Use a cloud model when one is selected, else the browser.',   icon: Zap },
  { id: 'model',   title: 'Cloud model', desc: 'Whisper / STT via your provider. Most accurate & reliable.',  icon: Cloud },
  { id: 'local',   title: 'Local Whisper', desc: 'On-device, no cloud. Whisper downloaded to your machine.',  icon: Cpu },
  { id: 'browser', title: 'Browser',     desc: 'Built-in Web Speech API. No model needed, but flaky in-app.', icon: Globe }
];

/**
 * Voice & Mic settings panel — configures how the Workspace composer's mic
 * button turns speech into text.
 *
 * Self-contained like {@link ThreeDSettings}: reads/writes through the shared
 * `settings-read` / `settings-write` IPC. STT models are sourced ENTIRELY from
 * the shared Models list (audio-input models across every connected provider) —
 * no provider picker and no hardcoded presets. The transcription provider is
 * derived from the chosen model's own `providerId`.
 */
export const VoiceSettings: React.FC = () => {
  const [engine, setEngine] = useState<Engine>('auto');
  // The selected STT model is tracked by its unique catalog id (`${providerId}-${rawId}`),
  // from which the persisted bare model id + providerId are derived on save.
  const [modelKey, setModelKey] = useState('');
  const [language, setLanguage] = useState('');
  const [dictionary, setDictionary] = useState<VoiceDictionary>({ words: [], corrections: [] });

  // On-device Whisper (transformers.js) config.
  const [localWhisper, setLocalWhisper] = useState<LocalWhisper>({
    enabled: false, size: 'tiny', language: 'en', autoDetect: true, device: 'auto', modelDir: ''
  });
  const [localStatus, setLocalStatus] = useState<{ state: string; progress: number; statusText: string } | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  // Background Voice Typing states
  const [typingEnabled, setTypingEnabled] = useState<boolean>(false);
  const [typingShortcut, setTypingShortcut] = useState<string>('CommandOrControl+Super');
  const [typingTarget, setTypingTarget] = useState<'both' | 'composer' | 'system'>('both');

  // Draft inputs for adding dictionary entries.
  const [wordDraft, setWordDraft] = useState('');
  const [corrFrom, setCorrFrom] = useState('');
  const [corrTo, setCorrTo] = useState('');

  const [providers, setProviders] = useState<ProviderRef[]>([]);
  const [models, setModels] = useState<ModelRef[]>([]);

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
      const cfg = settings?.voice || {};
      setEngine(
        cfg.engine === 'browser' || cfg.engine === 'model' || cfg.engine === 'local' ? cfg.engine : 'auto'
      );
      setLanguage(typeof cfg.language === 'string' ? cfg.language : '');

      setTypingEnabled(cfg.typingEnabled === true);
      setTypingShortcut(typeof cfg.typingShortcut === 'string' ? cfg.typingShortcut : 'CommandOrControl+Super');
      setTypingTarget(cfg.typingTarget === 'composer' || cfg.typingTarget === 'system' ? cfg.typingTarget : 'both');

      const dict = cfg.dictionary || {};
      setDictionary({
        words: Array.isArray(dict.words) ? dict.words.map((w: unknown) => String(w)).filter(Boolean) : [],
        corrections: Array.isArray(dict.corrections)
          ? dict.corrections
              .map((c: any) => ({ from: String(c?.from ?? ''), to: String(c?.to ?? '') }))
              .filter((c: Correction) => c.from && c.to)
          : []
      });

      const lw = cfg.localWhisper || {};
      const lwEnabled = lw.enabled === true || cfg.engine === 'local';
      setLocalWhisper({
        enabled: lwEnabled,
        size: ['tiny', 'base', 'small', 'medium', 'large'].includes(lw.size) ? (lw.size as WhisperSize) : 'tiny',
        language: typeof lw.language === 'string' ? lw.language : 'en',
        autoDetect: lw.autoDetect !== false,
        device: ['cpu', 'gpu', 'auto'].includes(lw.device) ? (lw.device as ComputeDevice) : 'auto',
        modelDir: typeof lw.modelDir === 'string' && lw.modelDir ? lw.modelDir : ''
      });

      const provs: ProviderRef[] = Array.isArray(settings?.providers) ? settings.providers : [];
      const mdls: ModelRef[] = Array.isArray(settings?.models) ? settings.models : [];
      setProviders(provs);
      setModels(mdls);

      // Reconstruct the selected catalog id from the persisted bare model +
      // providerId, so the dropdown reflects the saved choice.
      const savedModel = typeof cfg.model === 'string' ? cfg.model : '';
      const savedProvider = typeof cfg.providerId === 'string' ? cfg.providerId : '';
      const match = mdls.find(
        (m) => (m.inputModalities || []).includes('audio') &&
          bareModelId(m.id, m.providerId) === savedModel &&
          (!savedProvider || m.providerId === savedProvider)
      ) || mdls.find(
        (m) => (m.inputModalities || []).includes('audio') && bareModelId(m.id, m.providerId) === savedModel
      );
      setModelKey(match?.id ?? '');
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
      const sel = models.find((m) => m.id === modelKey);
      const current = (await ipc.invoke('settings-read')) as any;
      await ipc.invoke('settings-write', {
        ...current,
        voice: {
          engine,
          providerId: sel?.providerId ?? '',
          model: sel ? bareModelId(sel.id, sel.providerId) : '',
          language: language.trim(),
          dictionary: {
            words: dictionary.words,
            corrections: dictionary.corrections
          },
          localWhisper: engine === 'local' ? {
            enabled: true,
            size: localWhisper.size,
            language: localWhisper.language,
            autoDetect: localWhisper.autoDetect,
            device: localWhisper.device,
            modelDir: localWhisper.modelDir || undefined
          } : undefined,
          typingEnabled,
          typingShortcut,
          typingTarget
        }
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

  // ── Dictionary mutators ────────────────────────────────────────────────
  const addWord = () => {
    const w = wordDraft.trim();
    if (!w) return;
    setDictionary((d) =>
      d.words.some((x) => x.toLowerCase() === w.toLowerCase()) ? d : { ...d, words: [...d.words, w] }
    );
    setWordDraft('');
  };
  const removeWord = (w: string) =>
    setDictionary((d) => ({ ...d, words: d.words.filter((x) => x !== w) }));

  const addCorrection = () => {
    const from = corrFrom.trim();
    const to = corrTo.trim();
    if (!from || !to) return;
    setDictionary((d) =>
      d.corrections.some((c) => c.from.toLowerCase() === from.toLowerCase())
        ? { ...d, corrections: d.corrections.map((c) => (c.from.toLowerCase() === from.toLowerCase() ? { from, to } : c)) }
        : { ...d, corrections: [...d.corrections, { from, to }] }
    );
    setCorrFrom('');
    setCorrTo('');
  };
  const removeCorrection = (from: string) =>
    setDictionary((d) => ({ ...d, corrections: d.corrections.filter((c) => c.from !== from) }));

  // ── Local Whisper (transformers.js) IPC helpers ──────────────────────
  const localInvoke = async (channel: string, args?: any): Promise<any> => {
    if (!ipc) return { ok: false, error: 'IPC unavailable.' };
    const res = await ipc.invoke(channel, args);
    if (res && res.__ipcError) throw new Error(res.error || `IPC ${channel} failed`);
    // Handlers return `{ ok: false, error }` on failure — surface it as a throw
    // so callers don't silently treat a failed operation as success.
    if (res && res.ok === false) throw new Error(res.error || `${channel} failed`);
    return res;
  };

  const refreshLocalStatus = useCallback(async () => {
    try {
      const dir = localWhisper.modelDir || undefined;
      const res = await localInvoke('whisper-local-status', { size: localWhisper.size, modelDir: dir });
      if (res?.ok) setLocalStatus(res.status);
    } catch {
      /* status best-effort */
    }
  }, [localWhisper.size, localWhisper.modelDir]);

  // Stream download progress from the main process.
  useEffect(() => {
    if (!ipc) return;
    const onProgress = (_e: any, p: any) => {
      if (p?.size === localWhisper.size) {
        setLocalStatus({ state: 'downloading', progress: p.progress || 0, statusText: p.statusText || 'Downloading…' });
      }
    };
    ipc.on('whisper-local-progress', onProgress);
    return () => { ipc.removeListener('whisper-local-progress', onProgress); };
  }, [localWhisper.size]);

  useEffect(() => {
    if (engine === 'local') refreshLocalStatus();
  }, [engine, refreshLocalStatus]);

  const handleLocalDownload = async () => {
    setLocalBusy(true);
    setLocalStatus({ state: 'downloading', progress: 0, statusText: 'Starting download…' });
    try {
      await localInvoke('whisper-local-download', { size: localWhisper.size, modelDir: localWhisper.modelDir || undefined });
      await refreshLocalStatus();
    } catch (err: any) {
      setLocalStatus({ state: 'error', progress: 0, statusText: errorMessage(err) || 'Download failed' });
    } finally {
      setLocalBusy(false);
    }
  };

  const handleLocalDelete = async () => {
    setLocalBusy(true);
    try {
      await localInvoke('whisper-local-delete', { size: localWhisper.size, modelDir: localWhisper.modelDir || undefined });
      await refreshLocalStatus();
    } catch (err: any) {
      setLocalStatus({ state: 'error', progress: 0, statusText: errorMessage(err) || 'Delete failed' });
    } finally {
      setLocalBusy(false);
    }
  };

  const handleLocalSetDir = async () => {
    const next = window.prompt('Model download location (folder):', localWhisper.modelDir || '');
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    try {
      const res = await localInvoke('whisper-local-setdir', { dir: trimmed });
      if (res?.ok) {
        setLocalWhisper((l) => ({ ...l, modelDir: res.modelDir || trimmed }));
        await refreshLocalStatus();
      } else {
        setLocalStatus({ state: 'error', progress: 0, statusText: res?.error || 'Invalid location' });
      }
    } catch (err: any) {
      setLocalStatus({ state: 'error', progress: 0, statusText: errorMessage(err) || 'Invalid location' });
    }
  };

  const providerName = (id?: string) => providers.find((p) => p.id === id)?.name || id || 'Unknown';

  const selectedModel = models.find((m) => m.id === modelKey);
  const selectedProvider = providers.find((p) => p.id === selectedModel?.providerId);
  const bareModel = selectedModel ? bareModelId(selectedModel.id, selectedModel.providerId) : '';

  // STT-model options sourced from the shared Models list: audio-input models
  // across all connected providers that are actually speech-to-text models.
  // Multimodal *chat* models (omni / reasoning) also accept audio input but have
  // no /audio/transcriptions endpoint, so transcribing with them 400s — they're
  // excluded here. Each row shows the model name, its provider, and its price.
  const sttOptions = useMemo<SearchableSelectOption[]>(() => {
    return models
      .filter((m) => (m.inputModalities || []).includes('audio'))
      .filter((m) => isTranscriptionModel(m.id, m.name || ''))
      .map((m) => ({
        value: m.id,
        label: m.name || m.id,
        description: `${providerName(m.providerId)} · ${bareModelId(m.id, m.providerId)}`,
        keywords: `${m.id} ${m.name ?? ''} ${providerName(m.providerId)}`,
        metadata: (
          <span className={m.free ? 'text-[color:var(--neon-constructive)]' : ''}>
            {priceLine(m.pricing, m.free)}
          </span>
        ),
        raw: m
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, providers]);

  // What will actually happen at mic-time, given the current form values.
  const usesModel = engine === 'model' || (engine === 'auto' && Boolean(selectedModel && selectedProvider?.apiKey));
  const modelMissing = engine === 'model' && !modelKey;
  const providerUnavailable = engine === 'model' && Boolean(modelKey) && !selectedProvider?.apiKey;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-[var(--brand-accent)] mb-2" />
        <span>Loading voice settings...</span>
      </div>
    );
  }

  const browserEngine = engine === 'browser';
  const cloudModelDisabled = browserEngine || engine === 'local';

  // Bottom status banner tone + copy.
  const status: { tone: 'destructive' | 'attention' | 'accent'; node: React.ReactNode } = providerUnavailable
    ? {
        tone: 'destructive',
        node: <><b>{providerName(selectedModel?.providerId)}</b> (the provider for <b>{bareModel}</b>) has no API key. Add one in Settings → Providers, or switch to Browser / Auto.</>
      }
    : modelMissing
    ? {
        tone: 'attention',
        node: <>Pick an <b>STT model</b> below. Models come from your Models list — enable an audio-input model there if the list is empty.</>
      }
    : usesModel
    ? {
        tone: 'accent',
        node: <>The mic records your voice and transcribes it with <b>{bareModel}</b> via <b>{providerName(selectedModel?.providerId)}</b>.</>
      }
    : engine === 'local'
    ? {
        tone: 'accent',
        node: <>The mic transcribes <b>on-device</b> with Whisper (<b>{localWhisper.size}</b>) — nothing leaves your machine. Download the model once, then dictation works fully offline.</>
      }
    : {
        tone: 'accent',
        node: <>The mic uses the browser's built-in Web Speech API — no model is used. If dictation does nothing, switch the engine to <b>Cloud model</b> and pick an STT model.</>
      };

  // Local Whisper (transformers.js) derived display state.
  const lwState = localStatus?.state ?? 'idle';
  const lwProgress = Math.max(0, Math.min(100, localStatus?.progress ?? 0));
  const lwStatusText = localStatus?.statusText || 'Not downloaded';
  const lwModelDir = localWhisper.modelDir || '~/.superagent/models/whisper (default)';
  const lwIsReady = lwState === 'ready';
  const lwIsDownloading = lwState === 'downloading';
  const LwStatusIcon = lwState === 'ready' ? CircleCheck : lwState === 'error' ? CircleAlert : lwState === 'downloading' ? Loader2 : Cpu;
  const DEVICE_LABELS: Record<ComputeDevice, string> = { auto: 'Auto (GPU if available)', cpu: 'CPU (WASM)', gpu: 'GPU (WebGPU)' };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-brand-border/60 pb-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand-accent-tint)] text-[var(--brand-accent)] ring-1 ring-[var(--brand-accent-border)]">
            <Mic size={17} />
          </span>
          <div>
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Voice &amp; Mic</h1>
            <p className="mt-1 text-xs text-brand-textMuted">
              Control how the composer's mic button turns your speech into text.
            </p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className="ui-btn-primary shrink-0 text-xs">
          <Save className="h-3.5 w-3.5" />
          <span>{saving ? 'Saving...' : 'Save'}</span>
        </button>
      </div>

      {message && (
        <div className={`ui-state-banner flex items-start gap-2.5 rounded-lg p-3 text-xs ${
          message.type === 'success' ? 'constructive' : 'destructive'
        }`}>
          <AlertCircle size={15} className="mt-0.5" />
          <span>{message.text}</span>
        </div>
      )}

      {/* ── Engine ──────────────────────────────────────────────────────── */}
      <section className="settings-section">
        <div className="settings-section-title flex items-center gap-2">
          <Zap size={15} className="text-[var(--brand-accent)]" />
          <span>Dictation engine</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ENGINE_CHOICES.map((c) => {
            const Icon = c.icon;
            const selected = engine === c.id;
            return (
              <button
                key={c.id}
                type="button"
                data-testid={`voice-engine-${c.id}`}
                onClick={() => setEngine(c.id)}
                className={`settings-choice ${selected ? 'selected' : ''}`}
              >
                <Icon size={18} className="settings-choice-icon" />
                <span className="settings-choice-title">{c.title}</span>
                <span className="settings-choice-desc">{c.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Voice Typing Daemon ────────────────────────────────────────── */}
      <section className="settings-section">
        <div className="settings-section-title flex items-center gap-2">
          <Mic size={15} className="text-[var(--brand-accent)]" />
          <span>Voice Typing (Global PTT Daemon)</span>
          <span className="settings-pill ml-1">Runs in background</span>
        </div>
        
        <div className="rounded-lg border border-brand-border bg-brand-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-brand-textMain">Enable Voice Typing</div>
              <div className="text-xs text-brand-textMuted">
                Transcribe voice directly into whichever textbox or app is active on your system.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={typingEnabled}
              onClick={() => setTypingEnabled(!typingEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                typingEnabled ? 'bg-[color:var(--neon-constructive)]' : 'bg-brand-bg border border-brand-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  typingEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {typingEnabled && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-3 border-t border-brand-border/40 animate-fade-in">
              <div className="space-y-1.5">
                <label className="ui-label">Push-to-Talk Shortcut</label>
                <input
                  type="text"
                  value={typingShortcut}
                  onChange={(e) => setTypingShortcut(e.target.value)}
                  placeholder="CommandOrControl+Super"
                  className="ui-input w-full text-sm"
                />
                <span className="text-[10px] text-brand-textMuted block">
                  Hold key to record, release to type. Default: <code className="text-zinc-300">CommandOrControl+Super</code> (Ctrl+Win / Ctrl+Cmd).
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="ui-label">Text Injection Target</label>
                <select
                  value={typingTarget}
                  onChange={(e) => setTypingTarget(e.target.value as any)}
                  className="ui-input w-full text-sm"
                >
                  <option value="both">Both (SuperAgent Composer &amp; System Clipboard)</option>
                  <option value="composer">SuperAgent Composer Only</option>
                  <option value="system">System Clipboard / Active Textbox Only</option>
                </select>
                <span className="text-[10px] text-brand-textMuted block">
                  Choose which application textbox receives the typed text on transcription.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── STT model ───────────────────────────────────────────────────── */}
      <section className={`settings-section transition-opacity ${cloudModelDisabled ? 'opacity-50' : ''}`}>
        <div className="settings-section-title flex items-center gap-2">
          <Server size={15} className="text-[var(--brand-accent)]" />
          <span>Speech-to-text model</span>
          {cloudModelDisabled && <span className="settings-pill ml-1">Not used for this engine</span>}
        </div>

        <div className="space-y-5">
          {/* STT model */}
          <div className="space-y-1.5">
            <label className="ui-label flex items-center gap-1.5">
              <Mic size={12} /> Model
            </label>
            <SearchableSelect
              options={sttOptions}
              value={modelKey}
              onChange={setModelKey}
              disabled={browserEngine}
              placeholder={sttOptions.length ? 'Select a transcription model' : 'No transcription models in your list'}
            />
            {sttOptions.length === 0 ? (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-[color:var(--neon-attention)]">
                <ExternalLink size={10} />
                <span>No speech-to-text models found (e.g. Whisper). Enable one in Settings → Models. Multimodal chat models that merely accept audio can't transcribe.</span>
              </div>
            ) : (
              <div className="mt-0.5 text-[10px] text-brand-textMuted">
                Speech-to-text models from your Models list. The provider is chosen automatically from the model.
                Prices are per 1M tokens; some audio models price per minute.
              </div>
            )}
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <label className="ui-label flex items-center gap-1.5">
              <Languages size={12} /> Language hint <span className="font-normal normal-case tracking-normal text-brand-textMuted/70">(optional)</span>
            </label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={cloudModelDisabled}
              placeholder="e.g. en, es, fr — leave blank to auto-detect"
              className="ui-input w-full text-sm disabled:opacity-50"
            />
          </div>
        </div>
      </section>

      {/* ── Local Whisper ───────────────────────────────────────────────── */}
      {engine === 'local' && (
        <section className="settings-section">
          <div className="settings-section-title flex items-center gap-2">
            <Cpu size={15} className="text-[var(--brand-accent)]" />
            <span>Local Whisper (on-device)</span>
            <span className="settings-pill ml-1">No cloud · downloaded once</span>
          </div>
          <p className="settings-section-sub -mt-2">
            Speech is transcribed in-process with transformers.js (WASM/WebGPU). Nothing leaves your
            machine. The model is fetched once from the Hugging Face Hub and cached to your disk — after
            that, dictation works fully offline.
          </p>

          <div className="space-y-5">
            {/* Model size */}
            <div className="space-y-1.5">
              <label className="ui-label flex items-center gap-1.5">
                <Server size={12} /> Model size <span className="font-normal normal-case tracking-normal text-brand-textMuted/70">(accuracy vs RAM)</span>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {WHISPER_SIZES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`voice-local-size-${s.id}`}
                    onClick={() => setLocalWhisper((l) => ({ ...l, size: s.id }))}
                    className={`settings-choice ${localWhisper.size === s.id ? 'selected' : ''}`}
                  >
                    <span className="settings-choice-title">{s.label}</span>
                    <span className="settings-choice-desc">{s.approx}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Compute device */}
            <div className="space-y-1.5">
              <label className="ui-label flex items-center gap-1.5">
                <Cpu size={12} /> Compute device
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(['auto', 'cpu', 'gpu'] as ComputeDevice[]).map((dv) => (
                  <button
                    key={dv}
                    type="button"
                    data-testid={`voice-local-device-${dv}`}
                    onClick={() => setLocalWhisper((l) => ({ ...l, device: dv }))}
                    className={`settings-choice ${localWhisper.device === dv ? 'selected' : ''}`}
                  >
                    <span className="settings-choice-title">{DEVICE_LABELS[dv]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <label className="ui-label flex items-center gap-1.5">
                <Languages size={12} /> Language
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-brand-textMuted">
                  <input
                    type="checkbox"
                    checked={localWhisper.autoDetect}
                    onChange={(e) => setLocalWhisper((l) => ({ ...l, autoDetect: e.target.checked }))}
                  />
                  Auto-detect
                </label>
                {!localWhisper.autoDetect && (
                  <input
                    type="text"
                    value={localWhisper.language}
                    onChange={(e) => setLocalWhisper((l) => ({ ...l, language: e.target.value }))}
                    placeholder="en"
                    className="ui-input w-24 text-sm"
                    data-testid="voice-local-language"
                  />
                )}
              </div>
            </div>

            {/* Model location */}
            <div className="space-y-1.5">
              <label className="ui-label flex items-center gap-1.5">
                <HardDrive size={12} /> Model location
              </label>
              <div className="flex items-center gap-2">
                <code className="ui-input flex-1 truncate text-xs" title={lwModelDir}>{lwModelDir}</code>
                <button
                  type="button"
                  onClick={handleLocalSetDir}
                  className="ui-btn-ghost shrink-0 text-xs"
                  data-testid="voice-local-setdir"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Status + download / delete */}
            <div className="rounded-xl border border-brand-border/60 bg-brand-popover/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-xs">
                  <LwStatusIcon size={14} className={lwIsDownloading ? 'animate-spin text-[var(--brand-accent)]' : lwState === 'error' ? 'text-[color:var(--neon-destructive)]' : lwIsReady ? 'text-[color:var(--neon-constructive)]' : 'text-brand-textMuted'} />
                  <span className="truncate text-brand-textMuted">
                    {lwState === 'ready'
                      ? `Ready · Whisper ${localWhisper.size}`
                      : lwStatusText}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {lwIsReady ? (
                    <button
                      type="button"
                      onClick={handleLocalDelete}
                      disabled={localBusy}
                      className="ui-btn-ghost text-xs disabled:opacity-40"
                      data-testid="voice-local-delete"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLocalDownload}
                      disabled={localBusy}
                      className="ui-btn-primary text-xs disabled:opacity-40"
                      data-testid="voice-local-download"
                    >
                      <Download size={13} /> {lwIsDownloading ? 'Downloading…' : 'Download model'}
                    </button>
                  )}
                </div>
              </div>
              {lwIsDownloading && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-border/40">
                  <div
                    className="h-full rounded-full bg-[var(--brand-accent)] transition-all duration-300"
                    style={{ width: `${lwProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Custom dictionary ───────────────────────────────────────────── */}
      <section className={`settings-section transition-opacity ${browserEngine ? 'opacity-50' : ''}`}>
        <div className="settings-section-title flex items-center gap-2">
          <BookMarked size={15} className="text-[var(--brand-accent)]" />
          <span>Custom dictionary</span>
          {browserEngine && <span className="settings-pill ml-1">Browser engine — not used</span>}
        </div>
        <p className="settings-section-sub -mt-2">
          Bias the cloud model toward your own words, names, and jargon so dictation stops turning
          them into gibberish. Applied to the transcription <code>prompt</code> for cloud models, and
          as deterministic corrections for the Local Whisper engine. The browser engine has no vocabulary hook.
        </p>

        <div className="space-y-6">
          {/* Preferred words */}
          <div className="space-y-2">
            <label className="ui-label">Preferred words &amp; names</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={wordDraft}
                onChange={(e) => setWordDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWord(); } }}
                disabled={browserEngine}
                placeholder="e.g. Claude Code, Anthropic, Kubernetes"
                className="ui-input w-full text-sm disabled:opacity-50"
                data-testid="voice-dict-word-input"
              />
              <button
                type="button"
                onClick={addWord}
                disabled={browserEngine || !wordDraft.trim()}
                className="ui-btn-ghost shrink-0 text-xs disabled:opacity-40"
                data-testid="voice-dict-word-add"
              >
                <Plus size={13} /> Add
              </button>
            </div>
            {dictionary.words.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {dictionary.words.map((w) => (
                  <span key={w} className="ui-chip bg-brand-popover text-brand-textMuted">
                    {w}
                    <button
                      type="button"
                      onClick={() => removeWord(w)}
                      disabled={browserEngine}
                      className="ml-0.5 -mr-1 rounded p-0.5 hover:text-brand-textMain"
                      aria-label={`Remove ${w}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-brand-textMuted">No words added yet.</p>
            )}
          </div>

          {/* Corrections */}
          <div className="space-y-2">
            <label className="ui-label">Corrections <span className="font-normal normal-case tracking-normal text-brand-textMuted/70">(heard → written)</span></label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={corrFrom}
                onChange={(e) => setCorrFrom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCorrection(); } }}
                disabled={browserEngine}
                placeholder="clod"
                className="ui-input w-full text-sm disabled:opacity-50"
                data-testid="voice-dict-corr-from"
              />
              <ArrowRight size={14} className="shrink-0 text-brand-textMuted" />
              <input
                type="text"
                value={corrTo}
                onChange={(e) => setCorrTo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCorrection(); } }}
                disabled={browserEngine}
                placeholder="Claude"
                className="ui-input w-full text-sm disabled:opacity-50"
                data-testid="voice-dict-corr-to"
              />
              <button
                type="button"
                onClick={addCorrection}
                disabled={browserEngine || !corrFrom.trim() || !corrTo.trim()}
                className="ui-btn-ghost shrink-0 text-xs disabled:opacity-40"
                data-testid="voice-dict-corr-add"
              >
                <Plus size={13} /> Add
              </button>
            </div>
            {dictionary.corrections.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {dictionary.corrections.map((c) => (
                  <span key={c.from} className="ui-chip bg-brand-popover text-brand-textMuted">
                    <span className="text-brand-textMain">{c.from}</span>
                    <ArrowRight size={10} className="opacity-60" />
                    <span className="text-brand-textMain">{c.to}</span>
                    <button
                      type="button"
                      onClick={() => removeCorrection(c.from)}
                      disabled={browserEngine}
                      className="ml-0.5 -mr-1 rounded p-0.5 hover:text-brand-textMain"
                      aria-label={`Remove correction ${c.from}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-brand-textMuted">No corrections added yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* Effective-behavior status */}
      <div className={`flex items-start gap-2 rounded-xl p-3.5 text-[11px] ${
        status.tone === 'destructive'
          ? 'bg-[color:var(--neon-destructive)]/10 border border-[color:var(--neon-destructive)]/30 text-[color:var(--neon-destructive)]'
          : status.tone === 'attention'
          ? 'bg-[color:var(--neon-attention)]/10 border border-[color:var(--neon-attention)]/30 text-[color:var(--neon-attention)]'
          : 'bg-[var(--brand-accent-tint)]/40 border border-[var(--brand-accent-border)]/40 text-brand-textMuted'
      }`}>
        <Info size={14} className="mt-0.5 flex-shrink-0" />
        <span>{status.node}</span>
      </div>
    </div>
  );
};

export default VoiceSettings;
