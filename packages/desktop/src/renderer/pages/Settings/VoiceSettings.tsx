import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Mic,
  Zap,
  Cloud,
  Cpu,
  RefreshCw,
  AlertCircle,
  Check,
  Languages,
  HardDrive,
  Download,
  Trash2,
  Plus,
  X,
  Keyboard,
  Sparkles,
  Folder
} from 'lucide-react';
import { SearchableSelect, SearchableSelectOption } from '../../components/ui/SearchableSelect';
import { ModelPricing, ProviderConnection, ModelConfig } from './types';
import { errorMessage } from '../../lib/errorReporter';
import { getIpc } from '../../lib/electron';

type Engine = 'auto' | 'model' | 'local';
type WhisperSize = 'tiny' | 'base' | 'small' | 'medium' | 'large';
type ComputeDevice = 'cpu' | 'gpu' | 'auto';

interface Correction {
  from: string;
  to: string;
}

interface VoiceDictionary {
  words: string[];
  corrections: Correction[];
}

interface LocalWhisper {
  enabled: boolean;
  size: WhisperSize;
  language: string;
  autoDetect: boolean;
  device: ComputeDevice;
  modelDir: string;
}

const WHISPER_SIZES: { id: WhisperSize; label: string; approx: string }[] = [
  { id: 'tiny', label: 'Tiny', approx: '~40 MB · fastest' },
  { id: 'base', label: 'Base', approx: '~75 MB' },
  { id: 'small', label: 'Small', approx: '~240 MB' },
  { id: 'medium', label: 'Medium', approx: '~770 MB' },
  { id: 'large', label: 'Large', approx: '~1.5 GB · best' }
];

const PRESET_SHORTCUTS = [
  { id: 'CommandOrControl+Super', label: 'Ctrl + Win / Cmd + Super' },
  { id: 'CommandOrControl+Alt+V', label: 'Ctrl + Alt + V / Cmd + Option + V' },
  { id: 'CommandOrControl+Shift+V', label: 'Ctrl + Shift + V / Cmd + Shift + V' },
  { id: 'Alt+Space', label: 'Alt + Space' },
  { id: 'Control+Space', label: 'Ctrl + Space' }
];

const LANGUAGE_OPTIONS = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Spanish' },
  { id: 'fr', name: 'French' },
  { id: 'de', name: 'German' },
  { id: 'zh', name: 'Chinese' },
  { id: 'ja', name: 'Japanese' },
  { id: 'ko', name: 'Korean' },
  { id: 'hi', name: 'Hindi' },
  { id: 'pt', name: 'Portuguese' },
  { id: 'it', name: 'Italian' },
  { id: 'ru', name: 'Russian' }
];

const bareModelId = (id: string, providerId?: string): string => {
  if (providerId && id.startsWith(`${providerId}-`)) return id.slice(providerId.length + 1);
  return id;
};

const TRANSCRIPTION_FAMILY = /whisper|transcrib|speech-to-text|\basr\b|\bstt\b|speech-recognition|voxtral|scribe|nova-\d|deepgram|gladia|assembl/;
const NON_TRANSCRIPTION = /omni|reasoning|instruct|-chat\b|\bchat-/;
const isTranscriptionModel = (id: string, name: string): boolean => {
  const blob = `${id} ${name}`.toLowerCase();
  if (NON_TRANSCRIPTION.test(blob)) return false;
  return TRANSCRIPTION_FAMILY.test(blob);
};

const ENGINE_CHOICES: { id: Engine; title: string; desc: string; icon: React.ElementType }[] = [
  {
    id: 'auto',
    title: 'Auto',
    desc: 'Uses Cloud Model when connected, else falls back to Local Whisper.',
    icon: Zap
  },
  {
    id: 'model',
    title: 'Cloud Model',
    desc: 'Speech-to-Text via connected provider API (Whisper-1, Groq, etc.).',
    icon: Cloud
  },
  {
    id: 'local',
    title: 'Local Whisper',
    desc: 'Runs 100% on-device (WASM/WebGPU). Zero cloud calls or API fees.',
    icon: Cpu
  }
];

export const VoiceSettings: React.FC = () => {
  // Section 1 & 2: Workspace Voice Typing & Global Voice Typing
  const [workspaceVoiceEnabled, setWorkspaceVoiceEnabled] = useState<boolean>(true);
  const [globalVoiceEnabled, setGlobalVoiceEnabled] = useState<boolean>(false);
  const [typingShortcut, setTypingShortcut] = useState<string>('CommandOrControl+Super');
  const [customShortcutDraft, setCustomShortcutDraft] = useState<string>('');

  // Section 3: Engine (no browser)
  const [engine, setEngine] = useState<Engine>('auto');

  // Section 4: Engine Settings (Cloud Model & Local Whisper)
  const [modelKey, setModelKey] = useState<string>('');
  const [savedProviderId, setSavedProviderId] = useState<string>('');
  const [savedModel, setSavedModel] = useState<string>('');

  const [localWhisper, setLocalWhisper] = useState<LocalWhisper>({
    enabled: false,
    size: 'tiny',
    language: 'en',
    autoDetect: true,
    device: 'auto',
    modelDir: ''
  });
  const [localStatus, setLocalStatus] = useState<{ state: string; progress: number; statusText: string } | null>(null);
  const [localBusy, setLocalBusy] = useState<boolean>(false);

  // Section 5: Custom Dictionary
  const [dictionary, setDictionary] = useState<VoiceDictionary>({ words: [], corrections: [] });
  const [wordDraft, setWordDraft] = useState<string>('');
  const [corrFrom, setCorrFrom] = useState<string>('');
  const [corrTo, setCorrTo] = useState<string>('');

  // Data states from app settings & catalog
  const [providers, setProviders] = useState<ProviderConnection[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [saveIndicator, setSaveIndicator] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const ipc = getIpc();

  // Helper to persist patch to disk automatically
  const persistVoiceSettingsPatch = useCallback(async (patch: Record<string, any>) => {
    if (!ipc) return;
    try {
      setSaveIndicator(true);
      setErrorBanner(null);
      const current = ((await ipc.invoke('settings-read')) as any) || {};
      const existingVoice = current.voice || {};

      const updatedVoice = {
        ...existingVoice,
        ...patch
      };

      await ipc.invoke('settings-write', {
        ...current,
        voice: updatedVoice
      });

      setTimeout(() => setSaveIndicator(false), 1200);
    } catch (err: any) {
      console.error('Failed to auto-save voice settings:', err);
      setErrorBanner(errorMessage(err) || 'Failed to auto-save settings');
      setSaveIndicator(false);
    }
  }, [ipc]);

  const loadSettings = async () => {
    if (!ipc) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const settings = ((await ipc.invoke('settings-read')) as any) || {};
      const cfg = settings?.voice || {};

      // Map engine choice (no browser)
      let eng: Engine = 'auto';
      if (cfg.engine === 'model' || cfg.engine === 'local' || cfg.engine === 'auto') {
        eng = cfg.engine;
      } else if (cfg.engine === 'browser') {
        eng = 'auto'; // Fallback away from deprecated browser engine
      }
      setEngine(eng);

      // Map typing targets
      const tEnabled = cfg.typingEnabled === true;
      const tTarget = cfg.typingTarget;
      setGlobalVoiceEnabled(tEnabled);
      if (tTarget !== undefined) {
        setWorkspaceVoiceEnabled(tTarget === 'both' || tTarget === 'composer');
      } else if (cfg.typingEnabled !== undefined) {
        setWorkspaceVoiceEnabled(tEnabled);
      } else {
        setWorkspaceVoiceEnabled(true);
      }

      if (typeof cfg.typingShortcut === 'string' && cfg.typingShortcut) {
        setTypingShortcut(cfg.typingShortcut);
        setCustomShortcutDraft(cfg.typingShortcut);
      }

      // Map Cloud model
      const pId = typeof cfg.providerId === 'string' ? cfg.providerId : '';
      const mId = typeof cfg.model === 'string' ? cfg.model : '';
      setSavedProviderId(pId);
      setSavedModel(mId);

      // Map Dictionary
      const dict = cfg.dictionary || {};
      setDictionary({
        words: Array.isArray(dict.words) ? dict.words.map(String).filter(Boolean) : [],
        corrections: Array.isArray(dict.corrections)
          ? dict.corrections
              .map((c: any) => ({ from: String(c?.from ?? ''), to: String(c?.to ?? '') }))
              .filter((c: Correction) => c.from && c.to)
          : []
      });

      // Map Local Whisper
      const lw = cfg.localWhisper || {};
      setLocalWhisper({
        enabled: lw.enabled === true || eng === 'local',
        size: ['tiny', 'base', 'small', 'medium', 'large'].includes(lw.size) ? (lw.size as WhisperSize) : 'tiny',
        language: typeof lw.language === 'string' ? lw.language : 'en',
        autoDetect: lw.autoDetect !== false,
        device: ['cpu', 'gpu', 'auto'].includes(lw.device) ? (lw.device as ComputeDevice) : 'auto',
        modelDir: typeof lw.modelDir === 'string' ? lw.modelDir : ''
      });

      const provs: ProviderConnection[] = Array.isArray(settings?.providers) ? settings.providers : [];
      const mdls: ModelConfig[] = Array.isArray(settings?.models) ? settings.models : [];
      setProviders(provs);
      setModels(mdls);

      // Match saved model ID in models list
      const match = mdls.find(
        (m) =>
          (m.inputModalities || []).includes('audio') &&
          bareModelId(m.id, m.providerId) === mId &&
          (!pId || m.providerId === pId)
      ) || mdls.find((m) => bareModelId(m.id, m.providerId) === mId);

      if (match) {
        setModelKey(match.id);
      } else if (pId && mId) {
        setModelKey(`${pId}::${mId}`);
      }
    } catch (e) {
      console.error('Failed to load voice settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // ── Auto-saving handlers ──────────────────────────────────────────────
  const handleToggleWorkspaceVoice = (enabled: boolean) => {
    setWorkspaceVoiceEnabled(enabled);
    const newTarget = enabled
      ? globalVoiceEnabled ? 'both' : 'composer'
      : globalVoiceEnabled ? 'system' : 'none';
    persistVoiceSettingsPatch({ typingTarget: newTarget });
  };

  const handleToggleGlobalVoice = (enabled: boolean) => {
    setGlobalVoiceEnabled(enabled);
    const newTarget = workspaceVoiceEnabled
      ? enabled ? 'both' : 'composer'
      : enabled ? 'system' : 'none';
    persistVoiceSettingsPatch({
      typingEnabled: enabled,
      typingTarget: newTarget
    });
  };

  const handleSelectShortcut = (shortcut: string) => {
    setTypingShortcut(shortcut);
    setCustomShortcutDraft(shortcut);
    persistVoiceSettingsPatch({ typingShortcut: shortcut });
  };

  const handleEngineChange = (newEngine: Engine) => {
    setEngine(newEngine);
    const lwEnabled = newEngine === 'local' || (newEngine === 'auto' && localWhisper.enabled);
    const patch: Record<string, any> = {
      engine: newEngine,
      localWhisper: {
        ...localWhisper,
        enabled: lwEnabled
      }
    };
    setLocalWhisper((prev) => ({ ...prev, enabled: lwEnabled }));
    persistVoiceSettingsPatch(patch);
  };

  const handleModelSelect = (selectedKey: string) => {
    setModelKey(selectedKey);
    let pId = '';
    let mId = '';

    const matched = models.find((m) => m.id === selectedKey);
    if (matched) {
      pId = matched.providerId;
      mId = bareModelId(matched.id, matched.providerId);
    } else if (selectedKey.includes('::')) {
      const parts = selectedKey.split('::');
      pId = parts[0];
      mId = parts[1];
    } else {
      pId = savedProviderId || 'openai';
      mId = selectedKey;
    }

    setSavedProviderId(pId);
    setSavedModel(mId);
    persistVoiceSettingsPatch({
      providerId: pId,
      model: mId
    });
  };

  const handleLocalWhisperPatch = (patch: Partial<LocalWhisper>) => {
    const updated = { ...localWhisper, ...patch };
    setLocalWhisper(updated);
    persistVoiceSettingsPatch({
      localWhisper: updated
    });
  };

  // ── Dictionary Handlers ─────────────────────────────────────────────
  const addWord = () => {
    const w = wordDraft.trim();
    if (!w) return;
    if (dictionary.words.some((x) => x.toLowerCase() === w.toLowerCase())) {
      setWordDraft('');
      return;
    }
    const nextWords = [...dictionary.words, w];
    const nextDict = { ...dictionary, words: nextWords };
    setDictionary(nextDict);
    setWordDraft('');
    persistVoiceSettingsPatch({ dictionary: nextDict });
  };

  const removeWord = (wordToRemove: string) => {
    const nextWords = dictionary.words.filter((x) => x !== wordToRemove);
    const nextDict = { ...dictionary, words: nextWords };
    setDictionary(nextDict);
    persistVoiceSettingsPatch({ dictionary: nextDict });
  };

  const addCorrection = () => {
    const from = corrFrom.trim();
    const to = corrTo.trim();
    if (!from || !to) return;
    const exists = dictionary.corrections.some((c) => c.from.toLowerCase() === from.toLowerCase());
    const nextCorrections = exists
      ? dictionary.corrections.map((c) => (c.from.toLowerCase() === from.toLowerCase() ? { from, to } : c))
      : [...dictionary.corrections, { from, to }];
    const nextDict = { ...dictionary, corrections: nextCorrections };
    setDictionary(nextDict);
    setCorrFrom('');
    setCorrTo('');
    persistVoiceSettingsPatch({ dictionary: nextDict });
  };

  const removeCorrection = (fromToRemove: string) => {
    const nextCorrections = dictionary.corrections.filter((c) => c.from !== fromToRemove);
    const nextDict = { ...dictionary, corrections: nextCorrections };
    setDictionary(nextDict);
    persistVoiceSettingsPatch({ dictionary: nextDict });
  };

  // ── Local Whisper IPC Controls ─────────────────────────────────────
  const localInvoke = async (channel: string, args?: any): Promise<any> => {
    if (!ipc) return { ok: false, error: 'IPC unavailable.' };
    const res = await ipc.invoke(channel, args);
    if (res && res.__ipcError) throw new Error(res.error || `IPC ${channel} failed`);
    if (res && res.ok === false) throw new Error(res.error || `${channel} failed`);
    return res;
  };

  const refreshLocalStatus = useCallback(async () => {
    try {
      const dir = localWhisper.modelDir || undefined;
      const res = await localInvoke('whisper-local-status', { size: localWhisper.size, modelDir: dir });
      if (res?.ok) setLocalStatus(res.status);
    } catch {
      /* best effort */
    }
  }, [localWhisper.size, localWhisper.modelDir]);

  useEffect(() => {
    if (!ipc) return;
    const onProgress = (_e: any, p: any) => {
      if (p?.size === localWhisper.size) {
        setLocalStatus({ state: 'downloading', progress: p.progress || 0, statusText: p.statusText || 'Downloading…' });
      }
    };
    ipc.on('whisper-local-progress', onProgress);
    return () => {
      ipc.removeListener('whisper-local-progress', onProgress);
    };
  }, [localWhisper.size, ipc]);

  useEffect(() => {
    if (engine === 'local' || engine === 'auto') {
      refreshLocalStatus();
    }
  }, [engine, refreshLocalStatus]);

  const handleLocalDownload = async () => {
    setLocalBusy(true);
    setLocalStatus({ state: 'downloading', progress: 0, statusText: 'Starting download…' });
    try {
      await localInvoke('whisper-local-download', {
        size: localWhisper.size,
        modelDir: localWhisper.modelDir || undefined
      });
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
      await localInvoke('whisper-local-delete', {
        size: localWhisper.size,
        modelDir: localWhisper.modelDir || undefined
      });
      await refreshLocalStatus();
    } catch (err: any) {
      setLocalStatus({ state: 'error', progress: 0, statusText: errorMessage(err) || 'Delete failed' });
    } finally {
      setLocalBusy(false);
    }
  };

  const handleLocalSetDir = async () => {
    const next = window.prompt('Model download location (folder path):', localWhisper.modelDir || '');
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    try {
      const res = await localInvoke('whisper-local-setdir', { dir: trimmed });
      if (res?.ok) {
        handleLocalWhisperPatch({ modelDir: res.modelDir || trimmed });
        await refreshLocalStatus();
      }
    } catch (err: any) {
      setErrorBanner(errorMessage(err) || 'Invalid folder path');
    }
  };

  // STT Options for Cloud Model Picker
  const providerName = (id?: string) => providers.find((p) => p.id === id)?.name || id || 'Unknown';

  const sttOptions = useMemo<SearchableSelectOption[]>(() => {
    const options: SearchableSelectOption[] = [];
    const seen = new Set<string>();

    for (const m of models) {
      const isAudioInput = (m.inputModalities || []).includes('audio');
      if (isAudioInput && isTranscriptionModel(m.id, m.name || '')) {
        const key = m.id;
        if (!seen.has(key)) {
          seen.add(key);
          options.push({
            value: key,
            label: m.name || bareModelId(m.id, m.providerId),
            description: `Provider: ${providerName(m.providerId)}`,
            metadata: m.free ? 'Free' : (m.pricing?.inputPer1M ? `in ${m.pricing.inputPer1M}` : ''),
            keywords: `${m.id} ${m.name ?? ''} ${providerName(m.providerId)}`,
            raw: m
          });
        }
      }
    }

    // Default fast STT options fallback
    const defaultSTTModels = [
      { id: 'openai::whisper-1', name: 'OpenAI Whisper v1', providerId: 'openai', bare: 'whisper-1' },
      { id: 'groq::whisper-large-v3', name: 'Groq Whisper Large v3', providerId: 'groq', bare: 'whisper-large-v3' },
      { id: 'groq::whisper-large-v3-turbo', name: 'Groq Whisper Large v3 Turbo', providerId: 'groq', bare: 'whisper-large-v3-turbo' },
      { id: 'openrouter::openai/whisper-large-v3', name: 'OpenRouter Whisper Large v3', providerId: 'openrouter', bare: 'openai/whisper-large-v3' }
    ];

    for (const def of defaultSTTModels) {
      if (!seen.has(def.id) && !seen.has(def.bare)) {
        seen.add(def.id);
        options.push({
          value: def.id,
          label: def.name,
          description: `Provider: ${providerName(def.providerId)}`,
          keywords: `${def.id} ${def.name} ${def.providerId}`,
          raw: { providerId: def.providerId, id: def.bare }
        });
      }
    }

    return options;
  }, [models, providers]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-(--brand-accent) mb-2" />
        <span>Loading voice settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-170 text-left">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
          Voice &amp; Dictation
        </h1>
        {saveIndicator && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 animate-fade-in">
            <Check size={13} /> Saved
          </div>
        )}
      </div>

      <p className="mb-7 text-sm leading-relaxed text-brand-textMuted sm:text-base">
        Configure workspace voice typing, system-wide global dictation hotkeys, transcription engine options, and custom vocabulary.
      </p>

      {errorBanner && (
        <div className="mb-6 flex items-center gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-xs">
          <AlertCircle size={15} className="shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* ── SECTION 1: WORKSPACE VOICE TYPING ───────────────────────────── */}
      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Workspace Voice Typing</h3>
        <div className="settings-section px-5 py-1">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className="text-sm font-medium text-brand-textMain">Workspace Voice Typing</div>
              <div className="text-xs leading-5 text-brand-textMuted">
                Enable microphone dictation button directly inside the SuperAgent Workspace composer.
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleWorkspaceVoice(!workspaceVoiceEnabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                workspaceVoiceEnabled ? 'bg-(--brand-accent)' : 'bg-brand-border'
              }`}
              aria-pressed={workspaceVoiceEnabled}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-brand-card shadow-sm transition-transform ${
                  workspaceVoiceEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: GLOBAL VOICE TYPING & SHORTCUT ───────────────────── */}
      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Global Voice Typing (System-Wide)</h3>
        <div className="settings-section px-5 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-brand-textMain">Voice Typing Global</div>
              <div className="text-xs leading-5 text-brand-textMuted">
                Dictate with your voice into any application on your computer using a global system hotkey.
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleGlobalVoice(!globalVoiceEnabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                globalVoiceEnabled ? 'bg-(--brand-accent)' : 'bg-brand-border'
              }`}
              aria-pressed={globalVoiceEnabled}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-brand-card shadow-sm transition-transform ${
                  globalVoiceEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {globalVoiceEnabled && (
            <div className="pt-3 border-t border-brand-border/60 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-brand-textMain flex items-center gap-1.5">
                  <Keyboard size={14} className="text-brand-textMuted" /> Select Shortcut Key
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-brand-bg border border-brand-border text-(--brand-accent)">
                  {typingShortcut}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_SHORTCUTS.map((sc) => {
                  const selected = typingShortcut === sc.id;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => handleSelectShortcut(sc.id)}
                      className={`px-3 py-2 rounded-md text-xs text-left font-medium border transition-colors flex items-center justify-between ${
                        selected
                          ? 'border-(--brand-accent) bg-(--brand-accent)/10 text-brand-textMain'
                          : 'border-brand-border bg-brand-bg/50 text-brand-textMuted hover:border-brand-border/80'
                      }`}
                    >
                      <span>{sc.label}</span>
                      {selected && <Check size={13} className="text-(--brand-accent)" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={customShortcutDraft}
                  onChange={(e) => setCustomShortcutDraft(e.target.value)}
                  placeholder="Or enter custom shortcut (e.g. Ctrl+Alt+V)"
                  className="flex-1 rounded-md border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain focus:outline-none focus:ring-1 focus:ring-brand-accent"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customShortcutDraft.trim()) {
                      handleSelectShortcut(customShortcutDraft.trim());
                    }
                  }}
                  className="px-3 py-1.5 rounded-md bg-brand-border/50 text-xs font-medium text-brand-textMain hover:bg-brand-border transition-colors"
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION 3: TRANSCRIPTION ENGINE (NO BROWSER) ─────────────────── */}
      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Transcription Engine</h3>
        <p className="settings-section-sub mb-3">
          Select your preferred transcription engine for converting speech to text.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ENGINE_CHOICES.map(({ id, title, desc, icon: Icon }) => {
            const selected = engine === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleEngineChange(id)}
                className={`settings-choice ${selected ? 'selected' : ''}`}
              >
                <Icon size={18} className="settings-choice-icon" />
                <div className="flex items-center gap-1.5 settings-choice-title font-medium">
                  {title}
                  {selected && <Check size={14} className="text-(--brand-accent)" />}
                </div>
                <div className="settings-choice-desc text-xs mt-1 text-brand-textMuted">{desc}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── SECTION 4: ENGINE SETTINGS (CLOUD MODEL & LOCAL WHISPER) ─────── */}
      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Engine Settings</h3>

        {/* Cloud Model Selection */}
        {(engine === 'model' || engine === 'auto') && (
          <div className="settings-section px-5 py-4 mb-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-brand-textMain flex items-center gap-1.5">
                <Cloud size={16} className="text-sky-400" /> Cloud Model Selection
              </div>
              {savedModel && (
                <span className="text-xs font-mono text-brand-textMuted">
                  {providerName(savedProviderId)} · {savedModel}
                </span>
              )}
            </div>
            <p className="text-xs text-brand-textMuted">
              Select a speech-to-text model from your Models list for cloud transcription.
            </p>
            <SearchableSelect
              options={sttOptions}
              value={modelKey}
              onChange={handleModelSelect}
              placeholder="Select speech-to-text model from models list..."
              allowCustom={true}
            />
          </div>
        )}

        {/* Local Whisper Download & Control */}
        {(engine === 'local' || engine === 'auto') && (
          <div className="settings-section px-5 py-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-brand-border/60 pb-3">
              <div>
                <div className="text-sm font-medium text-brand-textMain flex items-center gap-1.5">
                  <Cpu size={16} className="text-violet-400" /> Local Whisper Controls
                </div>
                <div className="text-xs text-brand-textMuted mt-0.5">
                  On-device Whisper transcription (transformers.js / WASM ONNX).
                </div>
              </div>

              {localStatus && (
                <div className="flex items-center gap-2 text-xs">
                  {localStatus.state === 'downloaded' ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Check size={13} /> Ready
                    </span>
                  ) : localStatus.state === 'downloading' ? (
                    <span className="text-amber-400 flex items-center gap-1">
                      <RefreshCw size={13} className="animate-spin" /> {localStatus.progress}%
                    </span>
                  ) : (
                    <span className="text-brand-textMuted">Not downloaded</span>
                  )}
                </div>
              )}
            </div>

            {/* Model Size Tier */}
            <div>
              <label className="block text-xs font-medium text-brand-textMain mb-2">Model Size Tier</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {WHISPER_SIZES.map((tier) => {
                  const selected = localWhisper.size === tier.id;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => handleLocalWhisperPatch({ size: tier.id })}
                      className={`p-2 rounded-md text-xs text-center border transition-colors ${
                        selected
                          ? 'border-(--brand-accent) bg-(--brand-accent)/10 text-brand-textMain font-semibold'
                          : 'border-brand-border bg-brand-bg/50 text-brand-textMuted hover:border-brand-border/80'
                      }`}
                    >
                      <div className="font-medium">{tier.label}</div>
                      <div className="text-[10px] text-brand-textMuted/70 mt-0.5">{tier.approx}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Compute Device & Language */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-brand-textMain mb-1.5">Compute Target</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'auto' as const, label: 'Auto' },
                    { id: 'gpu' as const, label: 'WebGPU' },
                    { id: 'cpu' as const, label: 'CPU (WASM)' }
                  ].map((dev) => {
                    const selected = localWhisper.device === dev.id;
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => handleLocalWhisperPatch({ device: dev.id })}
                        className={`py-1.5 px-2 rounded text-xs text-center border transition-colors ${
                          selected
                            ? 'border-(--brand-accent) bg-(--brand-accent)/10 text-brand-textMain font-medium'
                            : 'border-brand-border bg-brand-bg/50 text-brand-textMuted'
                        }`}
                      >
                        {dev.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-brand-textMain">Language</label>
                  <label className="flex items-center gap-1.5 text-xs text-brand-textMuted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localWhisper.autoDetect}
                      onChange={(e) => handleLocalWhisperPatch({ autoDetect: e.target.checked })}
                      className="rounded border-brand-border bg-brand-bg text-(--brand-accent) focus:ring-0"
                    />
                    Auto-detect
                  </label>
                </div>
                <select
                  disabled={localWhisper.autoDetect}
                  value={localWhisper.language}
                  onChange={(e) => handleLocalWhisperPatch({ language: e.target.value })}
                  className="w-full rounded-md border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain focus:outline-none focus:ring-1 focus:ring-brand-accent disabled:opacity-50"
                >
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.name} ({lang.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Download & Storage Control Buttons */}
            <div className="pt-2 border-t border-brand-border/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={localBusy}
                  onClick={handleLocalDownload}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-(--brand-accent) text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  <Download size={14} />
                  {localStatus?.state === 'downloaded' ? 'Re-download Model' : 'Download Model'}
                </button>

                {localStatus?.state === 'downloaded' && (
                  <button
                    type="button"
                    disabled={localBusy}
                    onClick={handleLocalDelete}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-500/40 bg-red-500/10 text-red-300 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleLocalSetDir}
                className="inline-flex items-center gap-1.5 text-xs text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
              >
                <Folder size={14} />
                <span>{localWhisper.modelDir ? localWhisper.modelDir : 'Default cache location'}</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── SECTION 5: CUSTOM DICTIONARY ─────────────────────────────────── */}
      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Custom Dictionary</h3>
        <p className="settings-section-sub mb-3">
          Add specialized project terms, proper nouns, or phonetic corrections to bias transcription accuracy.
        </p>

        <div className="settings-section px-5 py-4 flex flex-col gap-5">
          {/* Custom Vocabulary Words */}
          <div>
            <label className="block text-xs font-medium text-brand-textMain mb-1.5">Vocabulary Words</label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={wordDraft}
                onChange={(e) => setWordDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addWord();
                  }
                }}
                placeholder="Add word or term (e.g. Antigravity, TypeScript)"
                className="flex-1 rounded-md border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
              <button
                type="button"
                onClick={addWord}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-brand-border/60 text-xs font-medium text-brand-textMain hover:bg-brand-border transition-colors cursor-pointer"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {dictionary.words.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-auto">
                {dictionary.words.map((w) => (
                  <span
                    key={w}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-bg border border-brand-border text-xs text-brand-textMain"
                  >
                    <span>{w}</span>
                    <button
                      type="button"
                      onClick={() => removeWord(w)}
                      className="text-brand-textMuted hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-brand-textMuted/70 italic">No custom words added yet.</div>
            )}
          </div>

          {/* Phonetic Word Corrections */}
          <div className="pt-4 border-t border-brand-border/60">
            <label className="block text-xs font-medium text-brand-textMain mb-1.5">Phonetic Word Corrections</label>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-3">
              <input
                type="text"
                value={corrFrom}
                onChange={(e) => setCorrFrom(e.target.value)}
                placeholder="From (e.g. super agent)"
                className="sm:col-span-2 rounded-md border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
              <input
                type="text"
                value={corrTo}
                onChange={(e) => setCorrTo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCorrection();
                  }
                }}
                placeholder="To (e.g. SuperAgent)"
                className="sm:col-span-2 rounded-md border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-textMain focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
              <button
                type="button"
                onClick={addCorrection}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-brand-border/60 text-xs font-medium text-brand-textMain hover:bg-brand-border transition-colors cursor-pointer"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {dictionary.corrections.length > 0 ? (
              <div className="flex flex-col gap-1.5 max-h-36 overflow-auto">
                {dictionary.corrections.map((c) => (
                  <div
                    key={c.from}
                    className="flex items-center justify-between px-3 py-1.5 rounded-md bg-brand-bg border border-brand-border text-xs text-brand-textMain"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-brand-textMuted line-through">{c.from}</span>
                      <span className="text-brand-textMuted">→</span>
                      <span className="font-medium text-(--brand-accent)">{c.to}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCorrection(c.from)}
                      className="text-brand-textMuted hover:text-red-400 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-brand-textMuted/70 italic">No word corrections added yet.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
