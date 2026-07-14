import React, { useState } from 'react';
import { SettingsViewProps, ModelConfig, ModelPricing, UpdateStatus, InternetAccessLevel } from './types';
export type { ProviderConnection, ModelConfig } from './types';
import { SettingsSidebar } from './SettingsSidebar';
import { GeneralSettings } from './GeneralSettings';
import { ServersSettings } from './ServersSettings';
import { ProvidersSettings } from './ProvidersSettings';
import { ModelsSettings } from './ModelsSettings';
import { PlaceholderSettings } from './PlaceholderSettings';
import { UsageTrackerSettings } from './UsageTrackerSettings';
import { ModelGovSettings } from './ModelGovSettings';
import { BrowserUseSettings } from './BrowserUseSettings';
import { ComputerUseSettings } from './ComputerUseSettings';
import { UpdatesSettings } from './UpdatesSettings';

/** Top-level settings page that renders a sidebar and the active settings category panel. */
export const SettingsView: React.FC<SettingsViewProps> = ({
  activeCategory,
  onSelectCategory,
  onBackToApp,
  themeMode,
  onThemeChange,
  mcpDashboard,
  connectedProviders,
  modelsCatalog,
  onConnectProvider,
  onDisconnectProvider,
  onToggleModel,
  workMode,
  onWorkModeChange,
  confirmShellCommands,
  onConfirmShellCommandsChange,
  autoReviewPlan,
  onAutoReviewPlanChange,
  unsandboxedActions,
  onUnsandboxedActionsChange,
  internetAccessLevel,
  onInternetAccessLevelChange,
  appVersion,
  onCheckForUpdates,
  updateStatus
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Public pricing & modality reference (source: official provider docs) ───
  // These are NOT fake — they are documented public prices per 1M tokens.
  const MODEL_CAPS: Record<string, {
    inputModalities: string[];
    outputModalities: string[];
    pricing?: ModelPricing;
    caching?: boolean;
  }> = {
    'gpt-4o':            { inputModalities: ['text','image','audio'], outputModalities: ['text','audio'],  pricing: { inputPer1M: '$2.50',  outputPer1M: '$10.00', cachedInputPer1M: '$1.25'  }, caching: true },
    'gpt-4o-mini':       { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$0.15',  outputPer1M: '$0.60',  cachedInputPer1M: '$0.075' }, caching: true },
    'gpt-4-turbo':       { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$10.00', outputPer1M: '$30.00' } },
    'o1':                { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$15.00', outputPer1M: '$60.00', cachedInputPer1M: '$7.50' }, caching: true },
    'o3':                { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$10.00', outputPer1M: '$40.00', cachedInputPer1M: '$2.50' }, caching: true },
    'o3-mini':           { inputModalities: ['text'],                 outputModalities: ['text'],           pricing: { inputPer1M: '$1.10',  outputPer1M: '$4.40',  cachedInputPer1M: '$0.55' }, caching: true },
    'whisper-1':         { inputModalities: ['audio'],                outputModalities: ['text'],           pricing: { inputPer1M: '$0.006/min' } },
    'dall-e-3':          { inputModalities: ['text'],                 outputModalities: ['image'],          pricing: { inputPer1M: '$0.04–$0.12/img' } },
    'claude-opus-4-5':   { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$15.00', outputPer1M: '$75.00', cachedInputPer1M: '$1.50'  }, caching: true },
    'claude-sonnet-4-5': { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$3.00',  outputPer1M: '$15.00', cachedInputPer1M: '$0.30'  }, caching: true },
    'claude-haiku-3-5':  { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$0.80',  outputPer1M: '$4.00',  cachedInputPer1M: '$0.08'  }, caching: true },
    'gemini-2.5-pro':    { inputModalities: ['text','image','audio','video'], outputModalities: ['text'],  pricing: { inputPer1M: '$1.25',  outputPer1M: '$10.00', cachedInputPer1M: '$0.31'   }, caching: true },
    'gemini-2.5-flash':  { inputModalities: ['text','image','audio','video'], outputModalities: ['text'],  pricing: { inputPer1M: '$0.15',  outputPer1M: '$0.60',  cachedInputPer1M: '$0.0375' }, caching: true },
    'gemini-2.0-flash':  { inputModalities: ['text','image','audio','video'], outputModalities: ['text','image','audio'], pricing: { inputPer1M: '$0.10', outputPer1M: '$0.40', cachedInputPer1M: '$0.025' }, caching: true },
    'gemini-1.5-pro':    { inputModalities: ['text','image','audio','video'], outputModalities: ['text'],  pricing: { inputPer1M: '$1.25',  outputPer1M: '$5.00',  cachedInputPer1M: '$0.3125' }, caching: true },
    'gemini-1.5-flash':  { inputModalities: ['text','image','audio','video'], outputModalities: ['text'],  pricing: { inputPer1M: '$0.075', outputPer1M: '$0.30',  cachedInputPer1M: '$0.01875' }, caching: true },
    'deepseek-chat':     { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.27', outputPer1M: '$1.10', cachedInputPer1M: '$0.07' }, caching: true },
    'deepseek-reasoner': { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.55', outputPer1M: '$2.19', cachedInputPer1M: '$0.14' }, caching: true },
    'moonshot-v1-8k':    { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.17', outputPer1M: '$0.17' } },
    'moonshot-v1-32k':   { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.41', outputPer1M: '$0.41' } },
    'moonshot-v1-128k':  { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.83', outputPer1M: '$0.83' } },
  };

  const apiTypeToModalities = (t: string): { inputModalities: string[]; outputModalities: string[] } | null => {
    const s = t.toLowerCase().replace(/_/g, '-');
    if (s.includes('text-to-video') || s.includes('image-to-video') || s.includes('video-generation'))
      return { inputModalities: ['text', 'image'], outputModalities: ['video'] };
    if (s.includes('text-to-image') || s.includes('image-generation'))
      return { inputModalities: ['text'], outputModalities: ['image'] };
    if (s.includes('image-to-image'))
      return { inputModalities: ['image'], outputModalities: ['image'] };
    if (s.includes('text-to-speech') || s.includes('tts') || s.includes('speech-synthesis'))
      return { inputModalities: ['text'], outputModalities: ['audio'] };
    if (s.includes('speech-to-text') || s.includes('asr') || s.includes('transcription'))
      return { inputModalities: ['audio'], outputModalities: ['text'] };
    if (s.includes('embedding') || s.includes('rerank'))
      return { inputModalities: ['text'], outputModalities: ['text'] };
    if (s.includes('text-to-text') || s.includes('chat') || s.includes('language-model'))
      return { inputModalities: ['text'], outputModalities: ['text'] };
    if (s.includes('multimodal') || s.includes('vision-language'))
      return { inputModalities: ['text', 'image'], outputModalities: ['text'] };
    return null;
  };

  const inferModalities = (modelId: string): { inputModalities: string[]; outputModalities: string[] } => {
    const id = modelId.toLowerCase();
    if (/seedance|cogvideox|wanvideo|wan-video|hunyuanvideo|hunyuan-video|ltx-video|mochi|minimax-video|genmo|animatediff|svd|stable-video|videocrafter|kling|hailuo|vidu/.test(id))
      return { inputModalities: ['text', 'image'], outputModalities: ['video'] };
    if (/flux|dall-e|imagen|sdxl|stable-diffusion|kolors|playground|recraft|juggernaut|realvis|dreamshaper|auraflow|sana|lumina|pixart|kandinsky/.test(id))
      return { inputModalities: ['text'], outputModalities: ['image'] };
    if (/whisper/.test(id))
      return { inputModalities: ['audio'], outputModalities: ['text'] };
    if (/\btts\b|text-to-speech|speecht5|kokoro|parler-tts|voicecraft/.test(id))
      return { inputModalities: ['text'], outputModalities: ['audio'] };
    if (/vision|4o|gpt-4v|llava|pixtral|qwen.*vl|internvl|cogvlm|idefics|paligemma|phi.*vision|moondream|florence/.test(id))
      return { inputModalities: ['text', 'image'], outputModalities: ['text'] };
    if (/^gemini/.test(id))
      return { inputModalities: ['text', 'image', 'audio', 'video'], outputModalities: ['text'] };
    if (/^claude/.test(id))
      return { inputModalities: ['text', 'image'], outputModalities: ['text'] };
    return { inputModalities: ['text'], outputModalities: ['text'] };
  };

  const enrichModel = (raw: {
    id: string; name: string;
    contextLimit?: string; outputLimit?: string;
    description?: string; apiType?: string;
  }, providerId: string): ModelConfig => {
    const capKey = Object.keys(MODEL_CAPS).find(k => raw.id === k || raw.id.startsWith(k));
    const caps = capKey
      ? MODEL_CAPS[capKey]
      : (raw.apiType ? (apiTypeToModalities(raw.apiType) ?? inferModalities(raw.id)) : inferModalities(raw.id));
    return {
      id: `${providerId}-${raw.id}`,
      name: raw.name,
      providerId,
      enabled: false,
      description: raw.description,
      contextLimit: raw.contextLimit,
      outputLimit: raw.outputLimit,
      inputModalities: caps.inputModalities,
      outputModalities: (caps as any).outputModalities ?? ['text'],
      pricing: (caps as any).pricing,
      caching: (caps as any).caching ?? false,
      type: undefined
    };
  };

  return (
    <div className="settings-container flex h-full flex-col lg:flex-row bg-brand-bg text-brand-textMain">
      <SettingsSidebar
        activeCategory={activeCategory}
        onSelectCategory={onSelectCategory}
        onBackToApp={onBackToApp}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      <div className="flex-1 h-full min-w-0 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 md:px-14 md:py-10">
        {activeCategory === 'general' && (
          <GeneralSettings
            themeMode={themeMode}
            onThemeChange={onThemeChange}
            workMode={workMode}
            onWorkModeChange={onWorkModeChange}
            confirmShellCommands={confirmShellCommands}
            onConfirmShellCommandsChange={onConfirmShellCommandsChange}
            autoReviewPlan={autoReviewPlan}
            onAutoReviewPlanChange={onAutoReviewPlanChange}
            unsandboxedActions={unsandboxedActions}
            onUnsandboxedActionsChange={onUnsandboxedActionsChange}
            internetAccessLevel={internetAccessLevel}
            onInternetAccessLevelChange={onInternetAccessLevelChange}
          />
        )}
        {activeCategory === 'pets' && (
          <PlaceholderSettings
            title="Pets"
            description="OpenAI-style companion and behavior preferences will live here."
            status="planned"
          />
        )}
        {activeCategory === 'providers' && (
          <ProvidersSettings
            connectedProviders={connectedProviders}
            onConnectProvider={onConnectProvider}
            onDisconnectProvider={onDisconnectProvider}
            enrichModel={enrichModel}
          />
        )}
        {activeCategory === 'models' && (
          <ModelsSettings
            connectedProviders={connectedProviders}
            modelsCatalog={modelsCatalog}
            onConnectProvider={onConnectProvider}
            onToggleModel={onToggleModel}
            enrichModel={enrichModel}
          />
        )}
        {activeCategory === 'model-gov' && (
          <ModelGovSettings
            modelsCatalog={modelsCatalog}
            onSaveSettings={(patch) => {
              const ipc = typeof window !== 'undefined' && (window as any).require
                ? (window as any).require('electron').ipcRenderer
                : null;
              if (ipc) {
                ipc.invoke('settings-read').then((current: any) => {
                  ipc.invoke('settings-write', { ...current, ...patch });
                });
              }
            }}
          />
        )}
        {activeCategory === 'usage' && <UsageTrackerSettings />}
        {activeCategory === 'mcp' && <ServersSettings mcpDashboard={mcpDashboard} />}
        {activeCategory === 'browser-use' && (
          <BrowserUseSettings
            onSaveSettings={(patch) => {
              const ipc = typeof window !== 'undefined' && (window as any).require
                ? (window as any).require('electron').ipcRenderer
                : null;
              if (ipc) {
                ipc.invoke('settings-read').then((current: any) => {
                  ipc.invoke('settings-write', { ...current, ...patch });
                });
              }
            }}
          />
        )}
        {activeCategory === 'computer-use' && (
          <ComputerUseSettings
            onSaveSettings={(patch) => {
              const ipc = typeof window !== 'undefined' && (window as any).require
                ? (window as any).require('electron').ipcRenderer
                : null;
              if (ipc) {
                ipc.invoke('settings-read').then((current: any) => {
                  ipc.invoke('settings-write', { ...current, ...patch });
                });
              }
            }}
          />
        )}
        {activeCategory === 'archived-chats' && (
          <PlaceholderSettings
            title="Archived Chats"
            description="Review and restore archived conversations."
            status="planned"
          />
        )}
        {activeCategory === 'archived-projects' && (
          <PlaceholderSettings
            title="Archived Projects"
            description="Browse archived workspaces and restore them when needed."
            status="planned"
          />
        )}
        {activeCategory === 'updates' && (
          <UpdatesSettings
            appVersion={appVersion}
            updateStatus={updateStatus ?? null}
            onCheckForUpdates={onCheckForUpdates ?? (() => {})}
            checking={updateStatus?.status === 'checking'}
          />
        )}
      </div>
    </div>
  );
};

export default SettingsView;
