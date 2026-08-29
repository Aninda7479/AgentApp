import React, { useState, useEffect, useMemo } from 'react';
import { Check, Code2, MessageSquare, Moon, Sun, Monitor, Globe, Eye, Ban, Cpu, Copy, Server, HardDrive, Layers, Mic, Search, AppWindow } from 'lucide-react';
import { ThemeMode } from '../../types';
import { InternetAccessLevel, ModelConfig, ProviderConnection } from './types';
import { getIpc } from '../../lib/ipc';
import { SearchableSelect, SearchableSelectOption } from '../../components/ui/SearchableSelect';

/**
 * Copy for the terminal execution-scope toggle. The old label
 * ("Unsandboxed Terminal Actions") was jargon a first-time user couldn't parse;
 * this names the ON state plainly ("Full System Access") and tells the user
 * that OFF (the safe default) confines the agent to the project folder, while
 * destructive commands are always blocked either way.
 */
export const FULL_SYSTEM_ACCESS_TOGGLE = {
  label: 'Full System Access',
  description:
    'Lets the agent run terminal commands anywhere on this machine. Off (recommended) confines it to your project folder. Even when on, destructive commands (rm -rf /, format) are always blocked.'
} as const;

/** Props for the general settings panel. */
interface GeneralSettingsProps {
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  workMode: 'coding' | 'everyday';
  onWorkModeChange: (mode: 'coding' | 'everyday') => void;
  confirmShellCommands: boolean;
  onConfirmShellCommandsChange: (val: boolean) => void;
  autoReviewPlan: boolean;
  onAutoReviewPlanChange: (val: boolean) => void;
  unsandboxedActions: boolean;
  onUnsandboxedActionsChange: (val: boolean) => void;
  internetAccessLevel: InternetAccessLevel;
  onInternetAccessLevelChange: (level: InternetAccessLevel) => void;
  connectedProviders?: ProviderConnection[];
  modelsCatalog?: ModelConfig[];
}

/** Props for a labeled boolean toggle row. */
interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, value, onChange }) => (
  <div className="flex items-center justify-between gap-4 border-b border-brand-border/70 py-3 last:border-b-0">
    <div className="text-left">
      <div className="mb-0.5 text-sm font-medium text-brand-textMain">{label}</div>
      <div className="text-xs leading-5 text-brand-textMuted">{description}</div>
    </div>
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
        value ? 'bg-(--brand-accent)' : 'bg-brand-border'
      }`}
      aria-pressed={value}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-brand-card shadow-sm transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

/** Renders appearance, work mode, and permission settings for the agent. */
export const GeneralSettings: React.FC<GeneralSettingsProps> = (props) => {
  const {
    themeMode,
    onThemeChange,
    confirmShellCommands,
    onConfirmShellCommandsChange,
    autoReviewPlan,
    onAutoReviewPlanChange,
    unsandboxedActions,
    onUnsandboxedActionsChange,
    internetAccessLevel,
    onInternetAccessLevelChange,
    connectedProviders,
    modelsCatalog
  } = props;
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [closeToTray, setCloseToTray] = useState(true);
  const [copiedCli, setCopiedCli] = useState(false);

  const [chatTitleMode, setChatTitleMode] = useState<'active_model' | 'custom_model' | 'simple' | 'disabled'>('active_model');
  const [chatTitleProvider, setChatTitleProvider] = useState<string>('');
  const [chatTitleModel, setChatTitleModel] = useState<string>('');
  const [chatTitleMaxWords, setChatTitleMaxWords] = useState<number>(3);
  const [availableProviders, setAvailableProviders] = useState<any[]>([]);
  const [savedModels, setSavedModels] = useState<any[]>([]);

  useEffect(() => {
    const ipc = getIpc();
    ipc.invoke('settings-read').then((settings: any) => {
      if (settings?.general) {
        if (settings.general.openAtLogin !== undefined) setOpenAtLogin(!!settings.general.openAtLogin);
        if (settings.general.closeToTray !== undefined) setCloseToTray(!!settings.general.closeToTray);
      }
      if (settings?.chatTitle) {
        if (settings.chatTitle.mode) setChatTitleMode(settings.chatTitle.mode);
        if (settings.chatTitle.providerId) setChatTitleProvider(settings.chatTitle.providerId);
        if (settings.chatTitle.model) setChatTitleModel(settings.chatTitle.model);
        if (settings.chatTitle.maxWords) setChatTitleMaxWords(settings.chatTitle.maxWords);
      }
      if (Array.isArray(settings?.providers)) {
        setAvailableProviders(settings.providers);
      }
      if (Array.isArray(settings?.models)) {
        setSavedModels(settings.models);
      }
    }).catch(() => {});
  }, []);

  const modelOptions = useMemo<SearchableSelectOption[]>(() => {
    const options: SearchableSelectOption[] = [];
    const seenKeys = new Set<string>();

    if (modelsCatalog && modelsCatalog.length > 0) {
      for (const m of modelsCatalog) {
        const pName = connectedProviders?.find((p) => p.id === m.providerId)?.name || m.providerId;
        const bareId = m.id.startsWith(`${m.providerId}-`) ? m.id.slice(m.providerId.length + 1) : m.id;
        const key = `${m.providerId}::${bareId}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          options.push({
            value: key,
            label: m.name || bareId,
            description: `Provider: ${pName}`,
            metadata: m.free ? 'Free' : (m.contextLimit || ''),
            keywords: `${m.name} ${m.id} ${m.providerId} ${pName}`,
            raw: { providerId: m.providerId, model: bareId }
          });
        }
      }
    }

    if (savedModels && savedModels.length > 0) {
      for (const sm of savedModels) {
        const pId = sm.providerId || 'openai';
        const bareId = sm.id.startsWith(`${pId}-`) ? sm.id.slice(pId.length + 1) : sm.id;
        const key = `${pId}::${bareId}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          options.push({
            value: key,
            label: sm.name || bareId,
            description: `Provider: ${pId}`,
            keywords: `${sm.name} ${sm.id} ${pId}`,
            raw: { providerId: pId, model: bareId }
          });
        }
      }
    }

    const defaultFastModels = [
      { providerId: 'google', model: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', providerName: 'Google Gemini' },
      { providerId: 'google', model: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', providerName: 'Google Gemini' },
      { providerId: 'openai', model: 'gpt-4o-mini', name: 'GPT-4o Mini', providerName: 'OpenAI' },
      { providerId: 'anthropic', model: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', providerName: 'Anthropic' },
      { providerId: 'groq', model: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', providerName: 'Groq' },
      { providerId: 'deepseek', model: 'deepseek-chat', name: 'DeepSeek Chat (V3)', providerName: 'DeepSeek' },
      { providerId: 'openrouter', model: 'google/gemini-2.0-flash-lite:free', name: 'Gemini 2.0 Flash Lite (Free)', providerName: 'OpenRouter' },
      { providerId: 'ollama', model: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', providerName: 'Ollama (Local)' },
      { providerId: 'ollama', model: 'llama3.2', name: 'Llama 3.2', providerName: 'Ollama (Local)' }
    ];

    for (const fm of defaultFastModels) {
      const key = `${fm.providerId}::${fm.model}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        options.push({
          value: key,
          label: fm.name,
          description: `Provider: ${fm.providerName}`,
          keywords: `${fm.name} ${fm.model} ${fm.providerId} ${fm.providerName}`,
          raw: { providerId: fm.providerId, model: fm.model }
        });
      }
    }

    return options;
  }, [modelsCatalog, connectedProviders, savedModels]);

  const selectedModelValue = useMemo(() => {
    if (!chatTitleModel) return '';
    const pId = chatTitleProvider || '';
    if (pId) {
      const key = `${pId}::${chatTitleModel}`;
      if (modelOptions.some((o) => o.value === key)) return key;
    }
    const match = modelOptions.find(
      (o) => o.raw?.model === chatTitleModel || o.value.endsWith(`::${chatTitleModel}`)
    );
    if (match) return match.value;
    return pId ? `${pId}::${chatTitleModel}` : chatTitleModel;
  }, [chatTitleProvider, chatTitleModel, modelOptions]);

  const handleModelSelect = (selectedVal: string) => {
    let pId = '';
    let mId = '';
    const opt = modelOptions.find((o) => o.value === selectedVal);
    if (opt && opt.raw) {
      pId = opt.raw.providerId;
      mId = opt.raw.model;
    } else if (selectedVal.includes('::')) {
      const parts = selectedVal.split('::');
      pId = parts[0];
      mId = parts[1];
    } else {
      pId = chatTitleProvider || 'openai';
      mId = selectedVal;
    }
    updateChatTitleSetting({ providerId: pId, model: mId });
  };

  const updateGeneralSetting = (key: string, value: boolean) => {
    if (key === 'openAtLogin') {
      setOpenAtLogin(value);
      const ipc = getIpc();
      if (value) {
        ipc?.invoke('autostart-enable').catch((err: any) => console.error('Failed enabling OS autostart:', err));
      } else {
        ipc?.invoke('autostart-disable').catch((err: any) => console.error('Failed disabling OS autostart:', err));
      }
    }
    if (key === 'closeToTray') setCloseToTray(value);

    const ipc = getIpc();
    ipc.invoke('settings-write', {
      general: {
        [key]: value
      }
    }).catch((err: any) => console.error(`Failed updating ${key}:`, err));
  };
  const updateChatTitleSetting = (patch: Partial<{ mode: 'active_model' | 'custom_model' | 'simple' | 'disabled'; providerId: string; model: string; maxWords: number }>) => {
    if (patch.mode !== undefined) setChatTitleMode(patch.mode);
    if (patch.providerId !== undefined) setChatTitleProvider(patch.providerId);
    if (patch.model !== undefined) setChatTitleModel(patch.model);
    if (patch.maxWords !== undefined) setChatTitleMaxWords(patch.maxWords);

    const ipc = getIpc();
    ipc.invoke('settings-read').then((current: any) => {
      const existing = current?.chatTitle || {};
      const updatedChatTitle = {
        ...existing,
        ...patch
      };
      ipc.invoke('settings-write', {
        ...current,
        chatTitle: updatedChatTitle
      }).catch((err: any) => console.error('Failed updating chat title settings:', err));
    }).catch(() => {});
  };


  const titleModeOptions: {
    id: 'active_model' | 'custom_model' | 'simple' | 'disabled';
    label: string;
    description: string;
  }[] = [
    {
      id: 'active_model',
      label: 'Active Chat Model',
      description: 'Use the session LLM model to generate short titles.'
    },
    {
      id: 'custom_model',
      label: 'Dedicated Fast Model',
      description: 'Use a specific fast provider/model (e.g. Gemini Flash, Groq, Ollama) for instant titles.'
    },
    {
      id: 'simple',
      label: 'Local Truncation (Offline)',
      description: 'Fastest 0-latency offline title from prompt words. No network calls or API costs.'
    },
    {
      id: 'disabled',
      label: 'Disabled',
      description: 'Use basic fallback titles without summary processing.'
    }
  ];

  const internetAccessOptions: {
    id: InternetAccessLevel;
    label: string;
    description: string;
    Icon: typeof Globe;
  }[] = [
    {
      id: 'all',
      label: 'All Access',
      description: 'The agent may use the network freely — fetch, browse, search, and publish.',
      Icon: Globe
    },
    {
      id: 'observation',
      label: 'Observation Only',
      description: 'Read public web pages (GET) but cannot post, upload, or change remote state.',
      Icon: Eye
    },
    {
      id: 'none',
      label: 'No Internet',
      description: 'Fully air-gapped. The agent can only use local tools and the AI provider API.',
      Icon: Ban
    }
  ];



  return (
    <div className="max-w-170 text-left">
      <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
        General
      </h1>
      <p className="mb-7 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
        Configure default behaviors, workspace appearance, background service mode, and sandbox permissions.
      </p>

      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Running Instances &amp; Process Isolation</h3>
        <p className="settings-section-sub mb-3 text-xs leading-relaxed text-brand-textMuted">
          SuperAgent is architected with modular, isolated running processes. Closing or ending one window/popup will never crash or kill the others.
        </p>

        {/* 5-Instance Architecture Matrix */}
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Desktop App */}
          <div className="flex flex-col justify-between rounded-xl border border-brand-border/60 bg-brand-bg/40 p-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <AppWindow size={15} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-brand-textMain">Desktop App</span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="text-[11px] text-brand-textMuted mt-0.5">
                  Main UI Shell &amp; Window Host. Closing minimizes to system tray.
                </div>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-brand-border/40 text-[10px] text-brand-textMuted flex items-center justify-between">
              <span>Isolation: <strong className="text-emerald-400">Isolated</strong></span>
              <span className="font-mono">superagent.exe</span>
            </div>
          </div>

          {/* 2. Web Server */}
          <div className="flex flex-col justify-between rounded-xl border border-brand-border/60 bg-brand-bg/40 p-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Server size={15} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-brand-textMain">Background Web Server</span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="text-[11px] text-brand-textMuted mt-0.5">
                  Core daemon on <code className="font-mono text-brand-textMain">:1469</code>. Survives window close.
                </div>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-brand-border/40 text-[10px] text-brand-textMuted flex items-center justify-between">
              <span>Isolation: <strong className="text-emerald-400">Independent</strong></span>
              <span className="font-mono">core-daemon</span>
            </div>
          </div>

          {/* 3. Artifact Manager */}
          <div className="flex flex-col justify-between rounded-xl border border-brand-border/60 bg-brand-bg/40 p-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                <HardDrive size={15} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-brand-textMain">System Tray &amp; Artifacts</span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="text-[11px] text-brand-textMuted mt-0.5">
                  Taskbar status icon &amp; popup for running background micro-apps.
                </div>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-brand-border/40 text-[10px] text-brand-textMuted flex items-center justify-between">
              <span>Isolation: <strong className="text-emerald-400">Isolated Popup</strong></span>
              <span className="font-mono">Tray / Window</span>
            </div>
          </div>

          {/* 4. Circle to Search */}
          <div className="flex flex-col justify-between rounded-xl border border-brand-border/60 bg-brand-bg/40 p-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                <Search size={15} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-brand-textMain">Circle to Search</span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
                </div>
                <div className="text-[11px] text-brand-textMuted mt-0.5">
                  Native D3D12 process. Spawned on demand via hotkey.
                </div>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-brand-border/40 text-[10px] text-brand-textMuted flex items-center justify-between">
              <span>Isolation: <strong className="text-emerald-400">Separate Process</strong></span>
              <span className="font-mono">circle-native.exe</span>
            </div>
          </div>

          {/* 5. Voice & Dictation */}
          <div className="flex flex-col justify-between rounded-xl border border-brand-border/60 bg-brand-bg/40 p-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                <Mic size={15} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-brand-textMain">Voice &amp; Dictation</span>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-400" />
                </div>
                <div className="text-[11px] text-brand-textMuted mt-0.5">
                  Native D3D12 HUD. Spawned on demand via hotkey.
                </div>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-brand-border/40 text-[10px] text-brand-textMuted flex items-center justify-between">
              <span>Isolation: <strong className="text-emerald-400">Separate Process</strong></span>
              <span className="font-mono">dictation-native.exe</span>
            </div>
          </div>
        </div>

        <div className="settings-section px-5 py-1">
          <ToggleRow
            label="Launch on System Startup"
            description="Automatically start SuperAgent background services (Web server and Artifacts runtime) when your computer boots up."
            value={openAtLogin}
            onChange={(val) => updateGeneralSetting('openAtLogin', val)}
          />
          <ToggleRow
            label="Keep Background Services Active on Window Close"
            description="Closing the window keeps the backend server, web dashboard, and active artifacts running seamlessly in the background."
            value={closeToTray}
            onChange={(val) => updateGeneralSetting('closeToTray', val)}
          />
        </div>

        {/* CLI Reference callout */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-border/60 bg-brand-card/50 px-4 py-2.5 text-xs text-brand-textMuted">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-brand-textMain">CLI Background Daemon:</span>
            <code className="font-mono text-brand-textMain bg-brand-bg px-2 py-0.5 rounded border border-brand-border/60">
              superagent --serve --web-port 1469
            </code>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText('superagent --serve --web-port 1469');
              setCopiedCli(true);
              setTimeout(() => setCopiedCli(false), 2000);
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-brand-accent hover:text-brand-accent-hover cursor-pointer"
          >
            {copiedCli ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copiedCli ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Appearance</h3>
        <div className="settings-section">
          <div className="ui-label mb-3">Theme</div>
          <div className="settings-segment">
            {[
              { id: 'light' as const, label: 'Lite', Icon: Sun },
              { id: 'system' as const, label: 'System', Icon: Monitor },
              { id: 'dark' as const, label: 'Dark', Icon: Moon }
            ].map(({ id, label, Icon }) => {
              const selected = themeMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onThemeChange(id)}
                  className={selected ? 'selected' : ''}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                  {selected && <Check size={14} className="text-(--brand-accent)" />}
                </button>
              );
            })}
          </div>
        </div>
      </section>



      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Permissions &amp; Verification (Under Devlopment 🚧)</h3>
        <div className="settings-section px-5 py-1">
          <ToggleRow
            label="Confirm Shell Commands"
            description="Always prompt for approval before running terminal scripts or execution utilities."
            value={confirmShellCommands}
            onChange={onConfirmShellCommandsChange}
          />
          <ToggleRow
            label="Automatic Review & Planning"
            description="Require approval of implementation plans before making file modifications."
            value={autoReviewPlan}
            onChange={onAutoReviewPlanChange}
          />
          <ToggleRow
            label={FULL_SYSTEM_ACCESS_TOGGLE.label}
            description={FULL_SYSTEM_ACCESS_TOGGLE.description}
            value={unsandboxedActions}
            onChange={onUnsandboxedActionsChange}
          />
        </div>
      </section>

      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Internet Access</h3>
        <p className="settings-section-sub">
          Controls whether the agent may reach the network on its own. This prevents autonomous, potentially
          dangerous internet actions. The AI provider API is always allowed so the assistant can still respond.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {internetAccessOptions.map(({ id, label, description, Icon }) => {
            const selected = internetAccessLevel === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`internet-access-${id}`}
                onClick={() => onInternetAccessLevelChange(id)}
                className={`settings-choice ${selected ? 'selected' : ''}`}
              >
                <Icon size={18} className="settings-choice-icon" />
                <div className="flex items-center gap-1.5 settings-choice-title">
                  {label}
                  {selected && <Check size={14} className="text-(--brand-accent)" />}
                </div>
                <div className="settings-choice-desc">{description}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Chat Title Generation</h3>
        <p className="settings-section-sub mb-3">
          Customize how conversation names are automatically generated when starting a new session.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-4">
          {titleModeOptions.map(({ id, label, description }) => {
            const selected = chatTitleMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => updateChatTitleSetting({ mode: id })}
                className={`settings-choice ${selected ? 'selected' : ''}`}
              >
                <div className="flex items-center gap-1.5 settings-choice-title font-medium">
                  {label}
                  {selected && <Check size={14} className="text-(--brand-accent)" />}
                </div>
                <div className="settings-choice-desc text-xs mt-1 text-brand-textMuted">{description}</div>
              </button>
            );
          })}
        </div>

        {chatTitleMode === 'custom_model' && (
          <div className="settings-section px-5 py-4 mb-4 flex flex-col gap-3">
            <div>
              <div className="text-sm font-medium text-brand-textMain">Dedicated Fast Model</div>
              <div className="text-xs text-brand-textMuted mt-0.5">
                Select a fast model from your connected providers or models list for instant session titles.
              </div>
            </div>
            <SearchableSelect
              options={modelOptions}
              value={selectedModelValue}
              onChange={handleModelSelect}
              placeholder="Select fast model from models list..."
              allowCustom={true}
            />
          </div>
        )}

        <div className="settings-section px-5 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-brand-textMain">Maximum Title Words</div>
            <div className="text-xs text-brand-textMuted">Limit generated or truncated chat title length (default: 3 words).</div>
          </div>
          <div className="flex items-center gap-2">
            {[2, 3, 4, 5].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => updateChatTitleSetting({ maxWords: count })}
                className={`h-7 w-8 rounded-md text-xs font-semibold transition-colors ${
                  chatTitleMaxWords === count
                    ? 'bg-(--brand-accent) text-white'
                    : 'bg-brand-border/40 text-brand-textMuted hover:bg-brand-border'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
