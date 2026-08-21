import React, { useState } from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  KeyRound, 
  Sliders, 
  ShieldAlert, 
  Globe, 
  User, 
  Moon, 
  Sun, 
  Monitor,
  Bot,
  Laptop,
  CheckCircle,
  Power
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { getIpc } from '../lib/ipc';
import { ProviderConnection, ModelConfig } from '../pages/Settings/types';

interface OnboardingWizardProps {
  onComplete: () => void;
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete, onConnectProvider }) => {
  const [step, setStep] = useState(1);
  const [ownerName, setOwnerName] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  
  // API Keys (BYOK)
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');

  // Custom base URLs (optional)
  const [openaiUrl, setOpenaiUrl] = useState('https://api.openai.com/v1');
  const [anthropicUrl, setAnthropicUrl] = useState('https://api.anthropic.com');
  const [geminiUrl, setGeminiUrl] = useState('https://generativelanguage.googleapis.com');

  // Preferences
  const [workMode, setWorkMode] = useState<'coding' | 'everyday'>('coding');
  const [confirmShellCommands, setConfirmShellCommands] = useState(true);
  const [unsandboxedActions, setUnsandboxedActions] = useState(false);
  const [internetAccessLevel, setInternetAccessLevel] = useState<'all' | 'observation' | 'none'>('all');
  const [runOnStartup, setRunOnStartup] = useState(true);
  const [closeToTray, setCloseToTray] = useState(true);

  const ipc = getIpc();

  const handleNext = () => {
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  const handleFinish = async () => {
    // 1. Build and save general application settings
    const settings = {
      theme: { desktop: theme, cli: theme },
      general: {
        ownerName: ownerName.trim() || 'SuperAgent User',
        workMode,
        confirmShellCommands,
        autoReviewPlan: true,
        unsandboxedActions,
        openAtLogin: runOnStartup,
        closeToTray: closeToTray
      },
      internetAccess: { level: internetAccessLevel }
    };

    if (ipc) {
      try {
        const currentSettings = await ipc.invoke('settings-read');
        await ipc.invoke('settings-write', {
          ...currentSettings,
          ...settings
        });

        // Register or unregister OS startup key
        if (runOnStartup) {
          await ipc.invoke('autostart-enable').catch(() => {});
        } else {
          await ipc.invoke('autostart-disable').catch(() => {});
        }
      } catch (err) {
        console.error('Failed to write settings during onboarding:', err);
      }
    }

    // 2. Register active provider connections based on entered API keys
    const providersToConnect: Array<{ conn: ProviderConnection; models: ModelConfig[] }> = [];

    if (openaiKey.trim()) {
      providersToConnect.push({
        conn: {
          id: 'openai',
          name: 'OpenAI',
          type: 'key',
          apiKey: openaiKey.trim(),
          baseUrl: openaiUrl.trim()
        },
        models: [
          { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true, description: 'OpenAI high-reasoning model' },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', enabled: true, description: 'Fast, lightweight model' },
          { id: 'o1-mini', name: 'o1-mini', providerId: 'openai', enabled: true, description: 'Specialized reasoning model' }
        ]
      });
    }

    if (anthropicKey.trim()) {
      providersToConnect.push({
        conn: {
          id: 'anthropic',
          name: 'Anthropic',
          type: 'key',
          apiKey: anthropicKey.trim(),
          baseUrl: anthropicUrl.trim()
        },
        models: [
          { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', providerId: 'anthropic', enabled: true, description: 'State-of-the-art coding assistant' },
          { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', providerId: 'anthropic', enabled: true, description: 'Blazing fast helper' }
        ]
      });
    }

    if (geminiKey.trim()) {
      providersToConnect.push({
        conn: {
          id: 'gemini',
          name: 'Gemini',
          type: 'key',
          apiKey: geminiKey.trim(),
          baseUrl: geminiUrl.trim()
        },
        models: [
          { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', providerId: 'gemini', enabled: true, description: 'High capability model with huge context window' },
          { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', providerId: 'gemini', enabled: true, description: 'Fast, lightweight multimodal helper' }
        ]
      });
    }

    // Connect all configured providers
    for (const item of providersToConnect) {
      onConnectProvider(item.conn, item.models);
    }

    // Trigger parent complete callback
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans text-brand-textMain">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl flex flex-col min-h-[500px]">
        {/* Ambient atmospheric glow in top right */}
        <div 
          className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-30"
          style={{ background: 'radial-gradient(circle, var(--brand-accent-glow), transparent 70%)' }}
        />

        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-brand-border/60 px-8 py-5 bg-brand-bg/40">
          <div className="flex items-center gap-3">
            <BrandLogo size={32} />
            <span className="font-outfit text-lg font-semibold tracking-tight">SuperAgent Setup</span>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map(s => (
              <div 
                key={s} 
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step 
                    ? 'w-6 bg-[color:var(--brand-accent)]' 
                    : s < step 
                      ? 'w-2 bg-[color:var(--neon-constructive)]' 
                      : 'w-2 bg-brand-border-strong'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step Content Area */}
        <div className="flex-1 px-8 py-8 overflow-y-auto">
          {/* STEP 1: Welcome & Persona */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="space-y-2">
                <h1 className="font-outfit text-3xl font-semibold tracking-tight">Welcome to SuperAgent</h1>
                <p className="text-brand-textMuted text-sm">
                  Let's configure your local workspace. Tell us a bit about yourself to seed your preferences.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-brand-textMuted">
                    Your Name / Developer Tag
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-brand-border bg-brand-inner-bg/40">
                    <User size={16} className="text-brand-textMuted shrink-0" />
                    <input 
                      type="text" 
                      placeholder="e.g. Aninda" 
                      value={ownerName}
                      onChange={e => setOwnerName(e.target.value)}
                      className="bg-transparent text-sm w-full outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-brand-textMuted">
                    App Theme Preference
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'dark', label: 'Dark Mode', Icon: Moon },
                      { id: 'light', label: 'Light Mode', Icon: Sun },
                      { id: 'system', label: 'System Default', Icon: Monitor }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTheme(t.id as any)}
                        className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
                          theme === t.id 
                            ? 'border-[color:var(--brand-accent-border)] bg-[color:var(--brand-accent-tint)] text-brand-textMain'
                            : 'border-brand-border bg-brand-bg/40 hover:bg-brand-hover text-brand-textMuted'
                        }`}
                      >
                        <t.Icon size={20} />
                        <span className="text-xs font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Connect AI Keys */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="space-y-2">
                <h1 className="font-outfit text-3xl font-semibold tracking-tight">Connect AI Providers</h1>
                <p className="text-brand-textMuted text-sm">
                  SuperAgent runs fully client-side and requires your own API keys. Paste at least one key to get started. Keys are stored locally on your device.
                </p>
              </div>

              <div className="space-y-4">
                {/* Anthropic */}
                <div className="space-y-2 p-4 rounded-xl border border-brand-border bg-brand-bg/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-amber-500/10 text-amber-500 flex items-center justify-center text-xs font-bold">A</div>
                      <span className="text-sm font-semibold">Anthropic (Claude)</span>
                    </div>
                    {anthropicKey && <span className="text-[10px] uppercase font-bold text-[color:var(--neon-constructive)]">Ready</span>}
                  </div>
                  <input 
                    type="password" 
                    placeholder="sk-ant-..." 
                    value={anthropicKey}
                    onChange={e => setAnthropicKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-brand-border bg-brand-inner-bg/60 text-xs font-mono outline-none focus:border-[color:var(--brand-accent)]"
                  />
                </div>

                {/* OpenAI */}
                <div className="space-y-2 p-4 rounded-xl border border-brand-border bg-brand-bg/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs font-bold">O</div>
                      <span className="text-sm font-semibold">OpenAI (ChatGPT)</span>
                    </div>
                    {openaiKey && <span className="text-[10px] uppercase font-bold text-[color:var(--neon-constructive)]">Ready</span>}
                  </div>
                  <input 
                    type="password" 
                    placeholder="sk-..." 
                    value={openaiKey}
                    onChange={e => setOpenaiKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-brand-border bg-brand-inner-bg/60 text-xs font-mono outline-none focus:border-[color:var(--brand-accent)]"
                  />
                </div>

                {/* Gemini */}
                <div className="space-y-2 p-4 rounded-xl border border-brand-border bg-brand-bg/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs font-bold">G</div>
                      <span className="text-sm font-semibold">Google Gemini</span>
                    </div>
                    {geminiKey && <span className="text-[10px] uppercase font-bold text-[color:var(--neon-constructive)]">Ready</span>}
                  </div>
                  <input 
                    type="password" 
                    placeholder="AIzaSy..." 
                    value={geminiKey}
                    onChange={e => setGeminiKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-brand-border bg-brand-inner-bg/60 text-xs font-mono outline-none focus:border-[color:var(--brand-accent)]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Workspace & Permissions */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div className="space-y-2">
                <h1 className="font-outfit text-3xl font-semibold tracking-tight">Configure Preferences</h1>
                <p className="text-brand-textMuted text-sm">
                  Fine-tune governance and automation styles for your workspace.
                </p>
              </div>

              <div className="space-y-5">
                {/* Work Mode */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-brand-textMuted">Work Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setWorkMode('coding')}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        workMode === 'coding'
                          ? 'border-[color:var(--brand-accent-border)] bg-[color:var(--brand-accent-tint)]'
                          : 'border-brand-border bg-brand-bg/40'
                      }`}
                    >
                      <Bot size={20} className="text-brand-textMain mb-2" />
                      <div className="text-sm font-semibold text-brand-textMain">Software Engineering</div>
                      <div className="text-xs text-brand-textMuted mt-1">Focuses on workspace files, code editing, terminal commands.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkMode('everyday')}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        workMode === 'everyday'
                          ? 'border-[color:var(--brand-accent-border)] bg-[color:var(--brand-accent-tint)]'
                          : 'border-brand-border bg-brand-bg/40'
                      }`}
                    >
                      <Laptop size={20} className="text-brand-textMain mb-2" />
                      <div className="text-sm font-semibold text-brand-textMain">Everyday Automation</div>
                      <div className="text-xs text-brand-textMuted mt-1">Web research, documents generation, lightweight planning, and scheduling.</div>
                    </button>
                  </div>
                </div>

                {/* Permissions Guard */}
                <div className="space-y-3 p-4 rounded-xl border border-brand-border bg-brand-bg/20">
                  <div className="flex items-start gap-3">
                    <ShieldAlert size={20} className="text-[color:var(--neon-attention)] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-sm font-semibold block">Execution Safety & Sandboxing</span>
                      <p className="text-xs text-brand-textMuted">
                        Configure how the autonomous engine behaves when executing commands on your terminal.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2.5 pt-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={confirmShellCommands}
                        onChange={e => setConfirmShellCommands(e.target.checked)}
                        className="rounded border-brand-border accent-[color:var(--brand-accent)]"
                      />
                      <span className="text-xs text-brand-textMain font-medium">Prompt before executing commands (Recommended)</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={unsandboxedActions}
                        onChange={e => setUnsandboxedActions(e.target.checked)}
                        className="rounded border-brand-border accent-[color:var(--brand-accent)]"
                      />
                      <span className="text-xs text-brand-textMain font-medium">Allow execution outside sandboxed workspace directory</span>
                    </label>
                  </div>
                </div>

                {/* Background Service & System Startup */}
                <div className="space-y-3 p-4 rounded-xl border border-brand-border bg-brand-bg/20">
                  <div className="flex items-start gap-3">
                    <Power size={20} className="text-[color:var(--brand-accent)] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold block">Background Service &amp; OS Startup</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[color:var(--brand-accent-tint)] text-[color:var(--brand-accent)] border border-[color:var(--brand-accent-border)]">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-brand-textMuted">
                        Automatically launch SuperAgent on system boot. SuperAgent stays dormant in the background with the system tray icon always accessible for instant AI actions, Voice dictation, and Artifacts.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2.5 pt-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={runOnStartup}
                        onChange={e => setRunOnStartup(e.target.checked)}
                        className="rounded border-brand-border accent-[color:var(--brand-accent)]"
                      />
                      <span className="text-xs text-brand-textMain font-medium">Launch dormant on system startup (System tray available)</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={closeToTray}
                        onChange={e => setCloseToTray(e.target.checked)}
                        className="rounded border-brand-border accent-[color:var(--brand-accent)]"
                      />
                      <span className="text-xs text-brand-textMain font-medium">Minimize to system tray when closing window</span>
                    </label>
                  </div>
                </div>

                {/* Internet access */}
                <div className="space-y-2 p-4 rounded-xl border border-brand-border bg-brand-bg/20">
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-brand-textMuted" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-textMuted">Internet Access Level</span>
                  </div>
                  <select
                    value={internetAccessLevel}
                    onChange={e => setInternetAccessLevel(e.target.value as any)}
                    className="w-full mt-2 p-2 bg-brand-inner-bg/85 border border-brand-border rounded-lg text-sm text-brand-textMain outline-none focus:border-[color:var(--brand-accent)] cursor-pointer"
                  >
                    <option value="all">Unrestricted (Web use, browser automation)</option>
                    <option value="observation">Observation Only (Read-only GET requests)</option>
                    <option value="none">Fully Airgapped (Disable internet tools)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Setup Complete */}
          {step === 4 && (
            <div className="flex flex-col items-center justify-center text-center space-y-6 py-12 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 animate-bounce">
                <CheckCircle size={36} />
              </div>
              <div className="space-y-2">
                <h1 className="font-outfit text-3xl font-semibold tracking-tight">SuperAgent is Ready!</h1>
                <p className="text-brand-textMuted text-sm max-w-md">
                  Your local workspace preferences have been successfully configured. You can edit these settings at any time from the sidebar.
                </p>
              </div>

              {/* Status table */}
              <div className="w-full max-w-sm rounded-xl border border-brand-border bg-brand-bg/40 p-4 space-y-2 text-left text-xs text-brand-textMuted">
                <div className="flex justify-between">
                  <span>Owner:</span>
                  <span className="font-semibold text-brand-textMain">{ownerName.trim() || 'SuperAgent User'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Theme:</span>
                  <span className="font-semibold text-brand-textMain capitalize">{theme}</span>
                </div>
                <div className="flex justify-between">
                  <span>Work Mode:</span>
                  <span className="font-semibold text-brand-textMain capitalize">{workMode === 'coding' ? 'Software Engineering' : 'Everyday'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Safety Confirmations:</span>
                  <span className="font-semibold text-brand-textMain">{confirmShellCommands ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Run on Startup:</span>
                  <span className="font-semibold text-brand-textMain">{runOnStartup ? 'Enabled (Dormant in Tray)' : 'Disabled'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Configured Providers:</span>
                  <span className="font-semibold text-brand-textMain">
                    {[
                      openaiKey && 'OpenAI',
                      anthropicKey && 'Anthropic',
                      geminiKey && 'Gemini'
                    ].filter(Boolean).join(', ') || 'None (Setup later)'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="border-t border-brand-border/60 px-8 py-5 bg-brand-bg/20 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button 
                type="button" 
                onClick={handleBack}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-all cursor-pointer"
              >
                <ArrowLeft size={16} /> Back
              </button>
            )}
          </div>

          <div>
            {step < 4 ? (
              <button 
                type="button" 
                onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)] transition-all cursor-pointer font-outfit shadow-sm"
              >
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button 
                type="button" 
                onClick={handleFinish}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg bg-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)] transition-all cursor-pointer font-outfit shadow-sm"
              >
                Enter Workspace <Check size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
