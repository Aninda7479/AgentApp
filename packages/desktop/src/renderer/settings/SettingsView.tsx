import React, { useState, useEffect } from 'react';
import { SettingsViewProps, ModelConfig, ModelPricing, UpdateStatus, InternetAccessLevel } from './types';
export type { ProviderConnection, ModelConfig } from './types';
import { SettingsSidebar } from './SettingsSidebar';
import { GeneralSettings } from './GeneralSettings';
import { IntegrationsSettings, IntegrationsSkill, IntegrationsPlugin } from './IntegrationsSettings';
import { ProvidersSettings } from './ProvidersSettings';
import { ModelsSettings } from './ModelsSettings';
import { PlaceholderSettings } from './PlaceholderSettings';
import { PetsSettings } from './PetsSettings';
import { UsageTrackerSettings } from './UsageTrackerSettings';
import { ModelGovSettings } from './ModelGovSettings';
import { BrowserUseSettings } from './BrowserUseSettings';
import { ComputerUseSettings } from './ComputerUseSettings';
import { ThreeDSettings } from './ThreeDSettings';
import { UpdatesSettings } from './UpdatesSettings';
import { browserSafeFetch } from '../web-fetch.js';

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
  skills,
  onToggleSkill,
  pluginCatalog,
  pluginEnabled,
  onTogglePlugin,
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
  onToast,
  bootstrapping,
  appVersion,
  onCheckForUpdates,
  updateStatus
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const DEFAULT_NVIDIA_FREE_MODELS = React.useMemo(() => new Set([
    'glm-5.2',
    'minimax-m3',
    'diffusiongemma-26b-a4b-it',
    'nemotron-3-ultra-550b-a55b',
    'nemotron-3.5-content-safety',
    'cosmos3-nano',
    'cosmos3-nano-reasoner',
    'step-3.7-flash',
    'mistral-medium-3.5-128b',
    'nemotron-3-nano-omni-30b-a3b-reasoning',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'nemotron-3-content-safety',
    'synthetic-video-detector',
    'active-speaker-detection',
    'ising-calibration-1-35b-a3b',
    'minimax-m2.7',
    'gemma-4-31b-it',
    'mistral-small-4-119b-2603',
    'nemotron-voicechat',
    'nemotron-3-super-120b-a12b',
    'qwen3.5-122b-a10b',
    'gliner-pii',
    'cosmos-transfer2_5-2b',
    'qwen3.5-397b-a17b',
    'step-3.5-flash',
    'nemotron-content-safety-reasoning-4b',
    'nemotron-3-nano-30b-a3b',
    'riva-translate-4b-instruct-v1_1',
    'mistral-large-3-675b-instruct-2512',
    'ministral-14b-instruct-2512',
    'streampetr',
    'nemotron-nano-12b-v2-vl',
    'llama-3_1-nemotron-safety-guard-8b-v3',
    'stockmark-2-100b-instruct',
    'qwen3-next-80b-a3b-instruct',
    'seed-oss-36b-instruct',
    'nvidia-nemotron-nano-9b-v2',
    'gpt-oss-20b',
    'gpt-oss-120b',
    'llama-3_3-nemotron-super-49b-v1_5',
    'sarvam-m',
    'llama-guard-4-12b',
    'gemma-3n-e4b-it',
    'gemma-3n-e2b-it',
    'cosmos-transfer1-7b',
    'bnr',
    'mistral-nemotron',
    'llama-3.1-nemotron-nano-vl-8b-v1',
    'magpie-tts-zeroshot',
    'llama-4-maverick-17b-128e-instruct',
    'sparsedrive',
    'bevformer',
    'llama-3_3-nemotron-super-49b-v1',
    'llama-3_1-nemotron-nano-8b-v1',
    'nv-embedcode-7b-v1',
    'phi-4-mini-instruct',
    'phi-4-multimodal-instruct',
    'llama-3_3-70b-instruct',
    'studiovoice',
    'llama-3.2-3b-instruct',
    'llama-3.2-11b-vision-instruct',
    'llama-3.2-90b-vision-instruct',
    'llama-3.2-1b-instruct',
    'dracarys-llama-3_1-70b-instruct',
    'esm2-650m',
    'nemotron-mini-4b-instruct',
    'gemma-2-2b-it',
    'llama-3_1-70b-instruct',
    'llama-3_1-8b-instruct',
    'nv-embed-v1',
    'solar-10_7b-instruct',
    'google-paligemma',
    'rerank-qa-mistral-4b',
    'esmfold',
    'mixtral-8x7b-instruct'
  ]), []);

  const [nvidiaFreeModels, setNvidiaFreeModels] = useState<Set<string>>(() => {
    const set = new Set<string>();
    DEFAULT_NVIDIA_FREE_MODELS.forEach(name => {
      set.add(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    });
    return set;
  });

  useEffect(() => {
    let active = true;
    const fetchFreeModels = async () => {
      try {
        const collectedNames: string[] = [];
        for (let pageNum = 1; pageNum <= 4; pageNum++) {
          const url = `https://build.nvidia.com/models?filters=nimType%3Anim_type_preview&page=${pageNum}`;
          const res = await browserSafeFetch(url);
          if (!res.ok) continue;
          const html = await res.text();
          
          const pushRegex = /self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)/g;
          const chunks: string[] = [];
          let match;
          while ((match = pushRegex.exec(html)) !== null) {
            chunks.push(match[1]);
          }
          
          const rawConcat = chunks.join('');
          const unescaped = rawConcat
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t');
            
          const resultsIdx = unescaped.indexOf('"results":');
          if (resultsIdx === -1) continue;
          
          let inString = false;
          let escaped = false;
          const openBraces = [];
          for (let i = 0; i < resultsIdx; i++) {
            const char = unescaped[i];
            if (inString) {
              if (escaped) escaped = false;
              else if (char === '\\') escaped = true;
              else if (char === '"') inString = false;
            } else {
              if (char === '"') inString = true;
              else if (char === '{') openBraces.push(i);
              else if (char === '}') openBraces.pop();
            }
          }
          
          if (openBraces.length === 0) continue;
          const startIdx = openBraces[openBraces.length - 1];
          let tempBraces = 0;
          inString = false;
          escaped = false;
          let jsonText = '';
          for (let i = startIdx; i < unescaped.length; i++) {
            const char = unescaped[i];
            jsonText += char;
            if (inString) {
              if (escaped) escaped = false;
              else if (char === '\\') escaped = true;
              else if (char === '"') inString = false;
            } else {
              if (char === '"') inString = true;
              else if (char === '{') tempBraces++;
              else if (char === '}') {
                tempBraces--;
                if (tempBraces === 0) break;
              }
            }
          }
          
          const cleaned = jsonText.replace(/\$undefined/g, 'null').replace(/\$[a-zA-Z0-9_]+/g, 'null');
          const data = JSON.parse(cleaned);
          const results = data.results || [];
          for (const group of results) {
            for (const r of group.resources || []) {
              const nimTypeLabel = (r.labels || []).find((l: any) => l.key === 'nimType');
              const nimTypes = nimTypeLabel ? (nimTypeLabel.values || []) : [];
              if (nimTypes.includes('Free Endpoint') && r.name) {
                collectedNames.push(r.name);
              }
            }
          }
        }
        
        if (collectedNames.length > 0 && active) {
          const newSet = new Set<string>();
          collectedNames.forEach(name => {
            newSet.add(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
          });
          DEFAULT_NVIDIA_FREE_MODELS.forEach(name => {
            newSet.add(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
          });
          setNvidiaFreeModels(newSet);
        }
      } catch (err) {
        // Silent fall back
      }
    };
    
    fetchFreeModels();
    return () => { active = false; };
  }, [DEFAULT_NVIDIA_FREE_MODELS]);


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
    free?: boolean; pricing?: ModelPricing;
  }, providerId: string): ModelConfig => {
    let isFree = raw.free;
    let ctxLimit = raw.contextLimit;
    let pricingInfo = raw.pricing;

    if (providerId === 'nvidia' || providerId === 'deepinfra' || providerId === 'openrouter' || providerId === 'ollama' || providerId === 'ollama-cloud') {
      if (providerId === 'ollama' || providerId === 'ollama-cloud') {
        isFree = true;
      } else if (providerId === 'nvidia') {
        const normId = raw.id.toLowerCase().replace(/[^a-z0-9]/g, '');
        const slashIdx = raw.id.lastIndexOf('/');
        const namePart = slashIdx !== -1 ? raw.id.substring(slashIdx + 1) : raw.id;
        const normNamePart = namePart.toLowerCase().replace(/[^a-z0-9]/g, '');
        isFree = nvidiaFreeModels.has(normId) || nvidiaFreeModels.has(normNamePart);
      }
      const isOllamaParamSize = (providerId === 'ollama' || providerId === 'ollama-cloud') && ctxLimit && /^\s*~?\s*\d+(\.\d+)?B\s*$/i.test(ctxLimit);
      if (!ctxLimit || isOllamaParamSize) {
        const idLower = raw.id.toLowerCase();
        if (
          idLower.includes('llama-3.1') || 
          idLower.includes('llama3.1') || 
          idLower.includes('llama-3.3') || 
          idLower.includes('llama3.3') || 
          idLower.includes('nemotron')
        ) {
          ctxLimit = '128k';
        } else if (idLower.includes('llama-3.2') || idLower.includes('llama3.2')) {
          ctxLimit = idLower.includes('instruct') ? '128k' : '8k';
        } else if (idLower.includes('llama-3') || idLower.includes('llama3')) {
          ctxLimit = '8k';
        } else if (idLower.includes('phi-3') || idLower.includes('phi3')) {
          ctxLimit = '128k';
        } else if (idLower.includes('gemma-2') || idLower.includes('gemma2')) {
          ctxLimit = '8k';
        } else if (idLower.includes('mistral-large')) {
          ctxLimit = '128k';
        } else if (idLower.includes('mixtral-8x22b')) {
          ctxLimit = '64k';
        } else if (idLower.includes('mistral')) {
          ctxLimit = '32k';
        } else if (idLower.includes('deepseek-v3') || idLower.includes('deepseek-r1')) {
          ctxLimit = '64k';
        } else if (idLower.includes('deepseek')) {
          ctxLimit = '64k';
        } else if (idLower.includes('qwen2.5')) {
          ctxLimit = '128k';
        } else if (idLower.includes('qwen')) {
          ctxLimit = '32k';
        } else {
          ctxLimit = '128k';
        }
      }
    }

    const capKey = Object.keys(MODEL_CAPS).find(k => raw.id === k || raw.id.startsWith(k));
    const caps = capKey
      ? MODEL_CAPS[capKey]
      : (raw.apiType ? (apiTypeToModalities(raw.apiType) ?? inferModalities(raw.id)) : inferModalities(raw.id));
    return {
      id: `${providerId}-${raw.id}`,
      name: raw.name,
      providerId,
      // Default to enabled so the workspace/composer dropdown reflects connected
      // models out of the box. The Settings → Models toggle lets the user hide
      // models they don't want; gating on `enabled` then works as expected.
      enabled: true,
      description: raw.description,
      contextLimit: ctxLimit ?? raw.contextLimit,
      outputLimit: raw.outputLimit,
      inputModalities: caps.inputModalities,
      outputModalities: (caps as any).outputModalities ?? ['text'],
      pricing: pricingInfo ?? raw.pricing ?? (caps as any).pricing,
      caching: (caps as any).caching ?? false,
      free: isFree,
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

      <div className="settings-content flex-1 h-full min-w-0 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 md:px-14 md:py-10">
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
          <PetsSettings />
        )}
        {activeCategory === '3d' && (
          <ThreeDSettings />
        )}
        {activeCategory === 'providers' && (
          <ProvidersSettings
            connectedProviders={connectedProviders}
            onConnectProvider={onConnectProvider}
            onDisconnectProvider={onDisconnectProvider}
            enrichModel={enrichModel}
            onToast={onToast}
            bootstrapping={bootstrapping}
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
        {activeCategory === 'mcp' && (
          <IntegrationsSettings
            mcpDashboard={mcpDashboard}
            skills={skills}
            onToggleSkill={onToggleSkill}
            pluginCatalog={pluginCatalog}
            pluginEnabled={pluginEnabled}
            onTogglePlugin={onTogglePlugin}
          />
        )}
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
