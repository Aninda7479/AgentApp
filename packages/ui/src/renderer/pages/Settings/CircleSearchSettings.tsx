import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Key, CheckCircle2, Play, RotateCcw, Bot, HelpCircle, Power } from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';
import { getIpc } from '../../lib/ipc';
import { getPlatform, toAccelerator, toDisplayShortcut } from '../../lib/platform';
import { SearchableSelect, SearchableSelectOption } from '../../components/ui/SearchableSelect';
import { ModelConfig, ProviderConnection } from './types';

interface CircleSearchSettingsProps {
  connectedProviders?: ProviderConnection[];
  modelsCatalog?: ModelConfig[];
}

export const CircleSearchSettings: React.FC<CircleSearchSettingsProps> = ({
  connectedProviders: propProviders,
  modelsCatalog: propModels,
}) => {
  const ipc = getIpc();
  const platform = getPlatform();

  const [enabled, setEnabled] = useState<boolean>(true);
  const [useNativeOverlay, setUseNativeOverlay] = useState<boolean>(true);
  const [shortcut, setShortcut] = useState<string>('CommandOrControl+Shift+S');
  const [displayShortcut, setDisplayShortcut] = useState<string>('');

  const [selectedKey, setSelectedKey] = useState<string>('auto');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');

  const [fallbackProviders, setFallbackProviders] = useState<ProviderConnection[]>([]);
  const [fallbackModels, setFallbackModels] = useState<ModelConfig[]>([]);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  useEffect(() => {
    if (!ipc) return;
    ipc
      .invoke('settings-read')
      .then((settings: any) => {
        let initialShortcut = 'CommandOrControl+Shift+S';
        if (settings?.circleSearch) {
          if (settings.circleSearch.enabled !== undefined) {
            setEnabled(Boolean(settings.circleSearch.enabled));
          }
          if (settings.circleSearch.useNativeOverlay !== undefined) {
            setUseNativeOverlay(Boolean(settings.circleSearch.useNativeOverlay));
          }
          if (settings.circleSearch.shortcut) {
            initialShortcut = settings.circleSearch.shortcut;
          }
          const savedProv = settings.circleSearch.provider || '';
          const savedMod = settings.circleSearch.model || '';
          setSelectedProvider(savedProv);
          setSelectedModel(savedMod);

          if (!savedMod || savedMod === 'auto') {
            setSelectedKey('auto');
          } else if (savedProv) {
            setSelectedKey(`${savedProv}::${savedMod}`);
          } else {
            setSelectedKey(savedMod);
          }
        }
        setShortcut(initialShortcut);
        setDisplayShortcut(toDisplayShortcut(initialShortcut));

        if (Array.isArray(settings?.providers)) {
          setFallbackProviders(settings.providers);
        }
        if (Array.isArray(settings?.models)) {
          setFallbackModels(settings.models);
        }
      })
      .catch(() => {
        setDisplayShortcut(toDisplayShortcut('CommandOrControl+Shift+S'));
      });
  }, []);

  const effectiveProviders = propProviders && propProviders.length > 0 ? propProviders : fallbackProviders;
  const effectiveModels = propModels && propModels.length > 0 ? propModels : fallbackModels;

  // Filter only enabled models from settings
  const enabledModels = useMemo(() => {
    return effectiveModels.filter((m) => m.enabled !== false);
  }, [effectiveModels]);

  // Clean, human-readable model options
  const modelOptions = useMemo<SearchableSelectOption[]>(() => {
    const options: SearchableSelectOption[] = [
      {
        value: 'auto',
        label: 'Automatic (Default Assistant)',
        description: 'Uses your primary workspace AI model',
        metadata: 'Default',
        keywords: 'auto default active assistant',
        raw: { providerId: '', model: 'auto' },
      },
    ];

    const seenKeys = new Set<string>();

    for (const m of enabledModels) {
      const provObj = effectiveProviders.find(
        (p) => p.id === m.providerId || p.name?.toLowerCase() === m.providerId?.toLowerCase()
      );
      const pName = provObj?.name || m.providerId;
      const bareId = m.id.startsWith(`${m.providerId}-`) ? m.id.slice(m.providerId.length + 1) : m.id;
      const key = `${m.providerId}::${bareId}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const hasVision =
          m.inputModalities?.includes('image') ||
          m.id.toLowerCase().includes('vision') ||
          m.id.toLowerCase().includes('llava') ||
          m.id.toLowerCase().includes('4o') ||
          m.id.toLowerCase().includes('gemini') ||
          m.id.toLowerCase().includes('claude');

        options.push({
          value: key,
          label: m.name || bareId,
          description: `By ${pName}`,
          metadata: hasVision ? 'Vision' : '',
          keywords: `${m.name} ${m.id} ${m.providerId} ${pName}`,
          raw: { providerId: m.providerId, model: bareId, providerName: pName, hasVision },
        });
      }
    }

    return options;
  }, [enabledModels, effectiveProviders]);

  const saveSettings = async (
    newEnabled: boolean,
    rawShortcutInput: string,
    newProvider?: string,
    newModel?: string,
    newUseNative?: boolean
  ) => {
    if (!ipc) return;
    try {
      const canonicalAccelerator = toAccelerator(rawShortcutInput);
      const currentSettings = await ipc.invoke('settings-read');
      const providerToSave = newProvider !== undefined ? newProvider : selectedProvider;
      const modelToSave = newModel !== undefined ? newModel : selectedModel;
      const nativeToSave = newUseNative !== undefined ? newUseNative : useNativeOverlay;

      await ipc.invoke('settings-write', {
        ...currentSettings,
        general: {
          ...(currentSettings?.general || {}),
          hotkeyOverlayEnabled: newEnabled,
        },
        circleSearch: {
          enabled: newEnabled,
          useNativeOverlay: nativeToSave,
          shortcut: canonicalAccelerator,
          provider: providerToSave,
          model: modelToSave,
        },
      });

      setShortcut(canonicalAccelerator);
      setDisplayShortcut(toDisplayShortcut(canonicalAccelerator));
      setSelectedProvider(providerToSave);
      setSelectedModel(modelToSave);
      setUseNativeOverlay(nativeToSave);

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2400);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const handleModelChange = (val: string) => {
    setSelectedKey(val);
    if (val === 'auto') {
      setSelectedProvider('');
      setSelectedModel('auto');
      saveSettings(enabled, shortcut, '', 'auto');
      return;
    }

    const matched = modelOptions.find((o) => o.value === val);
    if (matched?.raw) {
      const prov = matched.raw.providerId || '';
      const mod = matched.raw.model || '';
      setSelectedProvider(prov);
      setSelectedModel(mod);
      saveSettings(enabled, shortcut, prov, mod);
    } else if (val.includes('::')) {
      const [prov, mod] = val.split('::');
      setSelectedProvider(prov);
      setSelectedModel(mod);
      saveSettings(enabled, shortcut, prov, mod);
    } else {
      setSelectedModel(val);
      saveSettings(enabled, shortcut, selectedProvider, val);
    }
  };

  const handleToggle = (val: boolean) => {
    setEnabled(val);
    saveSettings(val, shortcut);
  };

  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      return;
    }
    e.preventDefault();

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) {
      parts.push(platform === 'macos' ? '⌘' : 'Ctrl');
    }
    if (e.altKey) {
      parts.push(platform === 'macos' ? '⌥' : 'Alt');
    }
    if (e.shiftKey) {
      parts.push(platform === 'macos' ? '⇧' : 'Shift');
    }

    let keyName = e.key.toUpperCase();
    if (e.code === 'Space' || e.key === ' ') {
      keyName = 'Space';
    } else if (e.key === 'Escape') {
      keyName = 'Esc';
    }

    parts.push(keyName);
    const newFormatted = parts.join(' + ');
    setDisplayShortcut(newFormatted);
    setIsRecording(false);
    saveSettings(enabled, newFormatted);
  };

  const handleResetDefaultShortcut = () => {
    const defaultAcc = 'CommandOrControl+Shift+S';
    setShortcut(defaultAcc);
    setDisplayShortcut(toDisplayShortcut(defaultAcc));
    saveSettings(enabled, defaultAcc);
  };

  const handleTestOverlay = async () => {
    if (ipc?.invoke) {
      try {
        await ipc.invoke('circle-search-show');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const directShortcutDisplay = toDisplayShortcut(shortcut || 'CommandOrControl+Shift+S');
  const activeSelectedOption = modelOptions.find((o) => o.value === selectedKey);

  return (
    <div
      className="max-w-[640px] text-left space-y-6"
      style={{
        fontFamily: platform === 'macos' ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' : 'inherit',
      }}
    >
      {/* Friendly Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-border bg-brand-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <BrandLogo size={44} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-brand-textMain">Circle to Search</h1>
              <p className="mt-1 text-xs text-brand-textMuted leading-relaxed">
                One unified assistant to search your screen, ask questions, explain code, or extract text anywhere.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestOverlay}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow cursor-pointer"
          >
            <Play size={13} className="fill-current" />
            <span>Try It Now</span>
          </button>
        </div>
      </div>

      {/* 1. Master Enable Toggle */}
      <section className="rounded-xl border border-brand-border bg-brand-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              enabled ? 'bg-indigo-500/15 text-indigo-400' : 'bg-brand-bg text-brand-textMuted'
            }`}
          >
            <Power size={18} />
          </span>
          <div>
            <div className="text-sm font-medium text-brand-textMain">Enable Circle to Search</div>
            <div className="text-xs text-brand-textMuted">
              Turn on the global shortcut to search your screen or ask quick questions anywhere.
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => handleToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
            enabled ? 'bg-[color:var(--brand-accent)]' : 'bg-brand-bg border border-brand-border'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </section>

      {/* 1.1 Native Engine Toggle */}
      <section className="flex items-center justify-between p-4 rounded-xl border border-brand-border bg-brand-card">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-brand-textMain">
              Lightweight Native Pop-up (egui / GPU)
            </h2>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Instant (&lt;5ms)
            </span>
          </div>
          <p className="text-xs text-brand-textMuted">
            Uses pure native Rust GPU rendering (~10MB RAM). Turn off to revert to the legacy HTML Webview window.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={useNativeOverlay}
          onClick={() => {
            const next = !useNativeOverlay;
            setUseNativeOverlay(next);
            saveSettings(enabled, shortcut, selectedProvider, selectedModel, next);
          }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
            useNativeOverlay ? 'bg-[color:var(--brand-accent)]' : 'bg-brand-bg border border-brand-border'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              useNativeOverlay ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </section>

      {/* 2. AI Model Selection */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand-textMain flex items-center gap-2">
            <Bot size={16} className="text-indigo-400" />
            <span>AI Assistant</span>
          </h2>
          {isSaved && (
            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 animate-fade-in">
              <CheckCircle2 size={13} />
              <span>Saved</span>
            </span>
          )}
        </div>

        <div className="rounded-xl border border-brand-border bg-brand-card p-4 space-y-3">
          <p className="text-xs text-brand-textMuted">
            Choose which AI answers questions and analyzes your screen. Saves automatically.
          </p>

          <SearchableSelect
            options={modelOptions}
            value={selectedKey}
            onChange={handleModelChange}
            placeholder="Search your available AI models..."
          />

          <div className="rounded-lg bg-brand-bg border border-brand-border/40 p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-brand-textMuted">Selected AI:</span>
              <strong className="text-brand-textMain font-medium">
                {activeSelectedOption?.label || selectedModel || 'Automatic'}
              </strong>
              {activeSelectedOption?.description && (
                <span className="text-brand-textMuted">({activeSelectedOption.description})</span>
              )}
            </div>

            {activeSelectedOption?.metadata && (
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
                {activeSelectedOption.metadata}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 3. Keyboard Shortcut */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand-textMain flex items-center gap-2">
            <Key size={16} className="text-purple-400" />
            <span>Keyboard Shortcut</span>
          </h2>
          <button
            type="button"
            onClick={handleResetDefaultShortcut}
            className="text-[11px] text-brand-textMuted hover:text-brand-textMain flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Reset Default</span>
          </button>
        </div>

        <div className="rounded-xl border border-brand-border bg-brand-card p-4 space-y-3">
          <p className="text-xs text-brand-textMuted">
            Press these keys anywhere on your computer to open Circle to Search.
          </p>

          <div className="relative">
            <input
              type="text"
              value={displayShortcut}
              onFocus={() => setIsRecording(true)}
              onBlur={() => setIsRecording(false)}
              onKeyDown={handleShortcutKeyDown}
              readOnly
              className="ui-input w-full font-mono text-sm tracking-wide text-center cursor-pointer bg-brand-bg hover:border-indigo-500/50"
              placeholder={platform === 'macos' ? '⌘ + Shift + S' : 'Ctrl + Shift + S'}
            />
            {isRecording && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-indigo-400 animate-pulse pointer-events-none">
                Press keys on keyboard...
              </span>
            )}
          </div>
          <p className="text-[11px] text-brand-textMuted text-center">
            Click the box and press your preferred keys (e.g. <span className="font-mono text-zinc-300">{platform === 'macos' ? '⌘ + Shift + S' : 'Ctrl + Shift + S'}</span>).
          </p>
        </div>
      </section>

      {/* 4. Quick How-To Tips */}
      <section className="rounded-xl border border-brand-border/60 bg-brand-card/50 p-4 space-y-2.5">
        <h3 className="text-xs font-semibold text-brand-textMain flex items-center gap-1.5">
          <HelpCircle size={14} className="text-zinc-400" />
          <span>How It Works</span>
        </h3>
        <ul className="text-xs text-brand-textMuted space-y-1.5 pl-4 list-disc leading-relaxed">
          <li>
            Press <kbd className="px-1 py-0.5 rounded bg-brand-bg border border-brand-border font-mono text-[10px] text-zinc-300">{directShortcutDisplay}</kbd> anywhere to open the search bar.
          </li>
          <li>
            <strong>To search your screen:</strong> Drag or circle any area with your mouse.
          </li>
          <li>
            <strong>To ask a question:</strong> Just start typing in the search bar and press Enter.
          </li>
          <li>
            <strong>To close:</strong> Press <kbd className="px-1 py-0.5 rounded bg-brand-bg border border-brand-border font-mono text-[10px] text-zinc-300">Esc</kbd> anytime.
          </li>
        </ul>
      </section>
    </div>
  );
};
