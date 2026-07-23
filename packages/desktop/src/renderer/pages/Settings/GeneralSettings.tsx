import React, { useState, useEffect } from 'react';
import { Check, Code2, MessageSquare, Moon, Sun, Monitor, Globe, Eye, Ban, Cpu } from 'lucide-react';
import { ThemeMode } from '../../types';
import { InternetAccessLevel } from './types';
import { getIpc } from '../../lib/electron';

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
export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  themeMode,
  onThemeChange,
  workMode,
  onWorkModeChange,
  confirmShellCommands,
  onConfirmShellCommandsChange,
  autoReviewPlan,
  onAutoReviewPlanChange,
  unsandboxedActions,
  onUnsandboxedActionsChange,
  internetAccessLevel,
  onInternetAccessLevelChange
}) => {
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [closeToTray, setCloseToTray] = useState(true);
  const [hotkeyOverlayEnabled, setHotkeyOverlayEnabled] = useState(true);

  const [chatTitleMode, setChatTitleMode] = useState<'active_model' | 'custom_model' | 'simple' | 'disabled'>('active_model');
  const [chatTitleProvider, setChatTitleProvider] = useState<string>('');
  const [chatTitleModel, setChatTitleModel] = useState<string>('');
  const [chatTitleMaxWords, setChatTitleMaxWords] = useState<number>(3);
  const [availableProviders, setAvailableProviders] = useState<any[]>([]);

  useEffect(() => {
    const ipc = getIpc();
    ipc.invoke('settings-read').then((settings: any) => {
      if (settings?.general) {
        if (settings.general.openAtLogin !== undefined) setOpenAtLogin(!!settings.general.openAtLogin);
        if (settings.general.closeToTray !== undefined) setCloseToTray(!!settings.general.closeToTray);
        if (settings.general.hotkeyOverlayEnabled !== undefined) setHotkeyOverlayEnabled(!!settings.general.hotkeyOverlayEnabled);
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
    }).catch(() => {});
  }, []);

  const updateGeneralSetting = (key: string, value: boolean) => {
    if (key === 'openAtLogin') setOpenAtLogin(value);
    if (key === 'closeToTray') setCloseToTray(value);
    if (key === 'hotkeyOverlayEnabled') setHotkeyOverlayEnabled(value);

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
      const updatedChatTitle = {
        mode: patch.mode ?? chatTitleMode,
        providerId: patch.providerId ?? chatTitleProvider,
        model: patch.model ?? chatTitleModel,
        maxWords: patch.maxWords ?? chatTitleMaxWords
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

  const modes = [
    {
      id: 'coding' as const,
      label: 'Coding Mode',
      description: 'Optimized for software engineering, testing, and debugging.',
      Icon: Code2
    },
    {
      id: 'everyday' as const,
      label: 'General Mode',
      description: 'Balanced for assistance, explanation, and writing.',
      Icon: MessageSquare
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
        <h3 className="settings-section-title mb-3">Background Service &amp; OS Startup</h3>
        <p className="settings-section-sub mb-3 text-xs leading-relaxed text-brand-textMuted">
          Control how SuperAgent runs in the background to continuously serve Voice-to-Text dictation, Circle Search capture, Spotlight overlay, and Artifacts.
        </p>
        <div className="settings-section px-5 py-1">
          <ToggleRow
            label="Launch on System Startup"
            description="Automatically launch SuperAgent as a background service when your computer boots up."
            value={openAtLogin}
            onChange={(val) => updateGeneralSetting('openAtLogin', val)}
          />
          <ToggleRow
            label="Minimize to System Tray on Close"
            description="Closing the window keeps background services (Voice typing, Circle Search, Spotlight overlay, and Artifacts) active in the system tray."
            value={closeToTray}
            onChange={(val) => updateGeneralSetting('closeToTray', val)}
          />
          <ToggleRow
            label="Global Quick Launcher Overlay (Spotlight)"
            description="Press Ctrl+Alt+Space anywhere on your OS to open the instant AI quick launcher overlay."
            value={hotkeyOverlayEnabled}
            onChange={(val) => updateGeneralSetting('hotkeyOverlayEnabled', val)}
          />
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
        <h3 className="settings-section-title mb-3">Agent Personality &amp; Mode</h3>
        <span className="hidden">Work mode</span>
        <span className="hidden">For coding</span>
        <span className="hidden">Default permissions</span>
        <div className="settings-section">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {modes.map(({ id, label, description, Icon }) => {
              const selected = workMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onWorkModeChange(id)}
                  className={`settings-choice ${selected ? 'selected' : ''}`}
                >
                  <Icon size={18} className="settings-choice-icon" />
                  <div className="settings-choice-title">{label}</div>
                  <div className="settings-choice-desc">{description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="settings-section-title mb-3">Permissions &amp; Verification</h3>
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
            <div className="text-sm font-medium text-brand-textMain">Dedicated Provider &amp; Model</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-brand-textMuted mb-1">Provider</label>
                <select
                  value={chatTitleProvider}
                  onChange={(e) => updateChatTitleSetting({ providerId: e.target.value })}
                  className="w-full rounded-md border border-brand-border bg-brand-bg px-3 py-1.5 text-sm text-brand-textMain focus:outline-none focus:ring-1 focus:ring-brand-accent"
                >
                  <option value="">Select Provider...</option>
                  {availableProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="google">Google Gemini</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-textMuted mb-1">Model Name (e.g. gemini-2.0-flash-lite, openrouter/free)</label>
                <input
                  type="text"
                  value={chatTitleModel}
                  onChange={(e) => updateChatTitleSetting({ model: e.target.value })}
                  placeholder="e.g. gemini-2.0-flash"
                  className="w-full rounded-md border border-brand-border bg-brand-bg px-3 py-1.5 text-sm text-brand-textMain focus:outline-none focus:ring-1 focus:ring-brand-accent"
                />
              </div>
            </div>
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
