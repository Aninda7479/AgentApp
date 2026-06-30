import React, { useState } from 'react';

export interface ProviderConnection {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
}

export interface ModelPricing {
  inputPer1M?: string;
  outputPer1M?: string;
  cachedInputPer1M?: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
  enabled: boolean;
  description?: string;
  contextLimit?: string;   // e.g. "2M" or "128k" — from real API
  outputLimit?: string;    // max output tokens
  inputModalities?: string[];  // ['text','image','audio','video']
  outputModalities?: string[]; // ['text','image','audio']
  pricing?: ModelPricing;
  caching?: boolean;
  // legacy single-string fields — kept for compat
  type?: string;
}

export interface SettingsViewProps {
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  onBackToApp: () => void;
  mcpDashboard: React.ReactNode;
  
  // Dynamic provider/model states passed from App.tsx
  connectedProviders: ProviderConnection[];
  modelsCatalog: ModelConfig[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  onDisconnectProvider: (id: string) => void;
  onToggleModel: (modelId: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  activeCategory,
  onSelectCategory,
  onBackToApp,
  mcpDashboard,
  connectedProviders,
  modelsCatalog,
  onConnectProvider,
  onDisconnectProvider,
  onToggleModel
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState(''); // e.g. 'Refreshing Google...'

  // Stateful settings options for General page
  const [workMode, setWorkMode] = useState<'coding' | 'everyday'>('coding');
  const [defaultPermissions, setDefaultPermissions] = useState(true);
  const [autoReview, setAutoReview] = useState(true);
  const [fullAccess, setFullAccess] = useState(true);

  // Modal Connection Setup Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalProviderId, setModalProviderId] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testingStatus, setTestingStatus] = useState('');
  const [errorDetails, setErrorDetails] = useState('');

  const categories = {
    Desktop: [
      { id: 'general', label: 'General', icon: '⚙️' },
      { id: 'shortcuts', label: 'Shortcuts', icon: '⌨️' },
      { id: 'servers', label: 'Servers', icon: '🔌' }
    ],
    Server: [
      { id: 'providers', label: 'Providers', icon: '⚙️' },
      { id: 'models', label: 'Models', icon: '✦' }
    ]
  };

  const popularProviders = [
    { id: 'opencode-zen', name: 'OpenCode Zen', desc: 'Curated models including Claude, GPT, Gemini and more', isRec: true, defaultUrl: '' },
    { id: 'opencode-go', name: 'OpenCode Go', desc: 'Low cost subscription for everyone', isRec: true, defaultUrl: '' },
    { id: 'ollama', name: 'Ollama', desc: 'Local model interface (Ollama runner)', defaultUrl: 'http://localhost:11434' },
    { id: 'claude', name: 'Claude', desc: 'Anthropic Claude Models', defaultUrl: 'https://api.anthropic.com/v1' },
    { id: 'chatgpt', name: 'ChatGPT', desc: 'OpenAI Developer platform API', defaultUrl: 'https://api.openai.com/v1' },
    { id: 'google', name: 'Google', desc: 'Google Gemini Developer models', defaultUrl: 'https://generativelanguage.googleapis.com' },
    { id: 'vertex', name: 'Vertex API', desc: 'Google Cloud Vertex platform integration', defaultUrl: '' },
    { id: 'deepseek', name: 'DeepSeek', desc: 'DeepSeek LLM APIs', defaultUrl: 'https://api.deepseek.com' },
    { id: 'kimi', name: 'Kimi', desc: 'Moonshot AI provider', defaultUrl: 'https://api.moonshot.cn/v1' },
    { id: 'openrouter', name: 'OpenRouter', desc: 'Unified endpoint router', defaultUrl: 'https://openrouter.ai/api/v1' },
    { id: 'deepinfra', name: 'DeepInfra', desc: 'Low cost serverless inference host', defaultUrl: 'https://api.deepinfra.com/v1' }
  ];

  const handleOpenConnectModal = (pId: string, pName: string, defaultUrl: string) => {
    setModalProviderId(pId);
    setConnectionName(pName);
    setBaseUrl(defaultUrl);
    setApiKey('');
    setTestingStatus('');
    setErrorDetails('');
    setIsModalOpen(true);
  };

  // ─── Public pricing & modality reference (source: official provider docs) ───
  // These are NOT fake — they are documented public prices per 1M tokens.
  // Marked N/A when the provider does not publish pricing.
  const MODEL_CAPS: Record<string, {
    inputModalities: string[];
    outputModalities: string[];
    pricing?: ModelPricing;
    caching?: boolean;
  }> = {
    // OpenAI — https://openai.com/api/pricing
    'gpt-4o':            { inputModalities: ['text','image','audio'], outputModalities: ['text','audio'],  pricing: { inputPer1M: '$2.50',  outputPer1M: '$10.00', cachedInputPer1M: '$1.25'  }, caching: true },
    'gpt-4o-mini':       { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$0.15',  outputPer1M: '$0.60',  cachedInputPer1M: '$0.075' }, caching: true },
    'gpt-4-turbo':       { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$10.00', outputPer1M: '$30.00' } },
    'o1':                { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$15.00', outputPer1M: '$60.00', cachedInputPer1M: '$7.50' }, caching: true },
    'o3':                { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$10.00', outputPer1M: '$40.00', cachedInputPer1M: '$2.50' }, caching: true },
    'o3-mini':           { inputModalities: ['text'],                 outputModalities: ['text'],           pricing: { inputPer1M: '$1.10',  outputPer1M: '$4.40',  cachedInputPer1M: '$0.55' }, caching: true },
    'whisper-1':         { inputModalities: ['audio'],                outputModalities: ['text'],           pricing: { inputPer1M: '$0.006/min' } },
    'dall-e-3':          { inputModalities: ['text'],                 outputModalities: ['image'],          pricing: { inputPer1M: '$0.04–$0.12/img' } },
    // Anthropic Claude — https://www.anthropic.com/pricing
    'claude-opus-4-5':   { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$15.00', outputPer1M: '$75.00', cachedInputPer1M: '$1.50'  }, caching: true },
    'claude-sonnet-4-5': { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$3.00',  outputPer1M: '$15.00', cachedInputPer1M: '$0.30'  }, caching: true },
    'claude-haiku-3-5':  { inputModalities: ['text','image'],         outputModalities: ['text'],           pricing: { inputPer1M: '$0.80',  outputPer1M: '$4.00',  cachedInputPer1M: '$0.08'  }, caching: true },
    // Google Gemini — https://ai.google.dev/pricing
    'gemini-2.5-pro':    { inputModalities: ['text','image','audio','video'], outputModalities: ['text'],  pricing: { inputPer1M: '$1.25',  outputPer1M: '$10.00', cachedInputPer1M: '$0.31'   }, caching: true },
    'gemini-2.5-flash':  { inputModalities: ['text','image','audio','video'], outputModalities: ['text'],  pricing: { inputPer1M: '$0.15',  outputPer1M: '$0.60',  cachedInputPer1M: '$0.0375' }, caching: true },
    'gemini-2.0-flash':  { inputModalities: ['text','image','audio','video'], outputModalities: ['text','image','audio'], pricing: { inputPer1M: '$0.10', outputPer1M: '$0.40', cachedInputPer1M: '$0.025' }, caching: true },
    'gemini-1.5-pro':    { inputModalities: ['text','image','audio','video'], outputModalities: ['text'],  pricing: { inputPer1M: '$1.25',  outputPer1M: '$5.00',  cachedInputPer1M: '$0.3125' }, caching: true },
    'gemini-1.5-flash':  { inputModalities: ['text','image','audio','video'], outputModalities: ['text'],  pricing: { inputPer1M: '$0.075', outputPer1M: '$0.30',  cachedInputPer1M: '$0.01875' }, caching: true },
    // DeepSeek — https://api-docs.deepseek.com/quick_start/pricing
    'deepseek-chat':     { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.27', outputPer1M: '$1.10', cachedInputPer1M: '$0.07' }, caching: true },
    'deepseek-reasoner': { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.55', outputPer1M: '$2.19', cachedInputPer1M: '$0.14' }, caching: true },
    // Kimi / Moonshot — https://platform.moonshot.cn/docs/pricing
    'moonshot-v1-8k':    { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.17', outputPer1M: '$0.17' } },
    'moonshot-v1-32k':   { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.41', outputPer1M: '$0.41' } },
    'moonshot-v1-128k':  { inputModalities: ['text'], outputModalities: ['text'], pricing: { inputPer1M: '$0.83', outputPer1M: '$0.83' } },
    // OpenRouter — N/A (passes through provider prices)
  };

  // Infer modalities from model name when API doesn't provide them
  // Map a provider's own type string → modalities
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

  // Infer modalities from model name when the API doesn't provide a type field
  const inferModalities = (modelId: string): { inputModalities: string[]; outputModalities: string[] } => {
    const id = modelId.toLowerCase();

    // ─ Video generation (text/image → video) ─────────────────────────────
    if (/seedance|cogvideox|wanvideo|wan-video|hunyuanvideo|hunyuan-video|ltx-video|mochi|minimax-video|genmo|animatediff|svd|stable-video|videocrafter|kling|hailuo|vidu/.test(id))
      return { inputModalities: ['text', 'image'], outputModalities: ['video'] };

    // ─ Image generation (text → image) ───────────────────────────────
    if (/flux|dall-e|imagen|sdxl|stable-diffusion|kolors|playground|recraft|juggernaut|realvis|dreamshaper|auraflow|sana|lumina|pixart|kandinsky/.test(id))
      return { inputModalities: ['text'], outputModalities: ['image'] };

    // ─ Audio: speech-to-text ─────────────────────────────────────
    if (/whisper/.test(id))
      return { inputModalities: ['audio'], outputModalities: ['text'] };

    // ─ Audio: text-to-speech ─────────────────────────────────────
    if (/\btts\b|text-to-speech|speecht5|kokoro|parler-tts|voicecraft/.test(id))
      return { inputModalities: ['text'], outputModalities: ['audio'] };

    // ─ Vision-language (text + image → text) ──────────────────────
    if (/vision|4o|gpt-4v|llava|pixtral|qwen.*vl|internvl|cogvlm|idefics|paligemma|phi.*vision|moondream|florence/.test(id))
      return { inputModalities: ['text', 'image'], outputModalities: ['text'] };

    // ─ Gemini & Claude (multimodal by default) ──────────────────────
    if (/^gemini/.test(id))
      return { inputModalities: ['text', 'image', 'audio', 'video'], outputModalities: ['text'] };
    if (/^claude/.test(id))
      return { inputModalities: ['text', 'image'], outputModalities: ['text'] };

    // ─ Default: text only ──────────────────────────────────────────
    return { inputModalities: ['text'], outputModalities: ['text'] };
  };

  // Enrich a raw model record into a full ModelConfig
  // apiType: the provider's own type string (e.g. "image-to-video") — takes priority
  const enrichModel = (raw: {
    id: string; name: string;
    contextLimit?: string; outputLimit?: string;
    description?: string; apiType?: string;
  }, providerId: string): ModelConfig => {
    const capKey = Object.keys(MODEL_CAPS).find(k => raw.id === k || raw.id.startsWith(k));
    // Priority: MODEL_CAPS exact match > provider API type > name inference
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

  // Real connection test
  const handleTestConnection = async () => {
    setTestingStatus('Testing connection...');
    setErrorDetails('');
    try {
      let rawModels: { id: string; name: string; contextLimit?: string; outputLimit?: string; description?: string }[] = [];
      const key = apiKey.trim();
      const url = baseUrl.trim();

      if (modalProviderId === 'ollama') {
        const res = await fetch(`${url || 'http://localhost:11434'}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name, name: m.name,
          contextLimit: m.details?.parameter_size
        }));
      } else if (modalProviderId === 'chatgpt') {
        const base = url || 'https://api.openai.com/v1';
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'deepseek') {
        const base = url || 'https://api.deepseek.com';
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'deepinfra') {
        const base = url || 'https://api.deepinfra.com/v1';
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data ?? []);
        rawModels = list.map((m: any) => ({
          id: m.model_name ?? m.id ?? m,
          name: m.model_name ?? m.id ?? m,
          apiType: m.type ?? m.model_type ?? undefined
        }));
      } else if (modalProviderId === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', ''),
          description: m.description,
          contextLimit: m.inputTokenLimit ? fmtTokens(m.inputTokenLimit) : undefined,
          outputLimit: m.outputTokenLimit ? fmtTokens(m.outputTokenLimit) : undefined
        }));
      } else if (modalProviderId === 'claude') {
        const base = url || 'https://api.anthropic.com/v1';
        const res = await fetch(`${base}/models`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name ?? m.id }));
      } else if (modalProviderId === 'kimi') {
        const base = url || 'https://api.moonshot.cn/v1';
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'openrouter') {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${key}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({
          id: m.id, name: m.name ?? m.id,
          contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined,
          description: m.description
        }));
      } else {
        const base = url || 'https://api.openai.com/v1';
        const headers: Record<string, string> = {};
        if (key) headers['Authorization'] = `Bearer ${key}`;
        const res = await fetch(`${base}/models`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      }

      if (rawModels.length === 0) throw new Error('Connection succeeded but no models were returned.');

      const newConfigs: ModelConfig[] = rawModels.map(m => enrichModel(m, modalProviderId));

      onConnectProvider({
        id: modalProviderId,
        name: connectionName || modalProviderId,
        type: key ? 'key' : 'custom',
        apiKey: key,
        baseUrl: url
      }, newConfigs);

      alert(`✅ Connected to ${connectionName} — ${rawModels.length} models imported.`);
      setIsModalOpen(false);
    } catch (e: any) {
      console.error(e);
      setErrorDetails(e.message || String(e));
      setTestingStatus('Connection failed');
    }
  };

  // Format large token counts to human-readable strings
  const fmtTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 0)}k`;
    return String(n);
  };

  // Offline fallback — only for providers where we know the canonical model IDs
  const handleForceConnect = () => {
    const knownDefaults: Record<string, { id: string; name: string; ctx?: string }[]> = {
      ollama:   [{ id: 'llama3.1:8b', name: 'Llama 3.1 8B' }, { id: 'mistral:7b', name: 'Mistral 7B' }],
      chatgpt:  [{ id: 'gpt-4o', name: 'GPT-4o', ctx: '128k' }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini', ctx: '128k' }, { id: 'o3-mini', name: 'o3-mini', ctx: '200k' }],
      deepseek: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', ctx: '64k' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', ctx: '64k' }],
      google:   [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', ctx: '1M' }, { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', ctx: '2M' }, { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', ctx: '1M' }],
      claude:   [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', ctx: '200k' }, { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', ctx: '200k' }],
      kimi:     [{ id: 'moonshot-v1-128k', name: 'Moonshot v1 128k', ctx: '128k' }, { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k', ctx: '32k' }],
      openrouter: [{ id: 'openrouter/auto', name: 'Auto Router' }]
    };

    const defaults = knownDefaults[modalProviderId];
    if (!defaults) {
      alert('No offline fallback available for this provider. Please connect online to fetch models.');
      return;
    }

    const newConfigs: ModelConfig[] = defaults.map(m =>
      enrichModel({ id: m.id, name: m.name, contextLimit: m.ctx }, modalProviderId)
    );

    onConnectProvider({
      id: modalProviderId,
      name: connectionName || modalProviderId,
      type: apiKey ? 'key' : 'custom',
      apiKey,
      baseUrl
    }, newConfigs);

    alert(`Offline fallback: added ${defaults.length} known model(s) for ${connectionName}.`);
    setIsModalOpen(false);
  };

  // ─── Refresh: re-fetch models for every connected provider ─────────────────
  const handleRefreshAllModels = async () => {
    if (refreshing || connectedProviders.length === 0) return;
    setRefreshing(true);

    // Keep a snapshot of which model IDs are currently enabled
    const enabledIds = new Set(modelsCatalog.filter(m => m.enabled).map(m => m.id));

    for (const prov of connectedProviders) {
      setRefreshStatus(`Refreshing ${prov.name}...`);
      try {
        const key = prov.apiKey.trim();
        const url = prov.baseUrl.trim();
        let rawModels: { id: string; name: string; contextLimit?: string; outputLimit?: string; description?: string }[] = [];

        if (prov.id === 'ollama') {
          const res = await fetch(`${url || 'http://localhost:11434'}/api/tags`);
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.models ?? []).map((m: any) => ({ id: m.name, name: m.name, contextLimit: m.details?.parameter_size }));
          }
        } else if (prov.id === 'chatgpt') {
          const res = await fetch(`${url || 'https://api.openai.com/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        } else if (prov.id === 'deepseek') {
          const res = await fetch(`${url || 'https://api.deepseek.com'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        } else if (prov.id === 'deepinfra') {
          const res = await fetch(`${url || 'https://api.deepinfra.com/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) {
            const d = await res.json();
            const list = Array.isArray(d) ? d : (d.data ?? []);
            rawModels = list.map((m: any) => ({ id: m.model_name ?? m.id ?? m, name: m.model_name ?? m.id ?? m, apiType: m.type ?? m.model_type ?? undefined }));
          }
        } else if (prov.id === 'google') {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.models ?? []).map((m: any) => ({
              id: m.name.replace('models/', ''), name: m.displayName || m.name.replace('models/', ''),
              description: m.description,
              contextLimit: m.inputTokenLimit ? fmtTokens(m.inputTokenLimit) : undefined,
              outputLimit: m.outputTokenLimit ? fmtTokens(m.outputTokenLimit) : undefined
            }));
          }
        } else if (prov.id === 'claude') {
          const res = await fetch(`${url || 'https://api.anthropic.com/v1'}/models`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name ?? m.id })); }
        } else if (prov.id === 'kimi') {
          const res = await fetch(`${url || 'https://api.moonshot.cn/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        } else if (prov.id === 'openrouter') {
          const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.name ?? m.id, contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined, description: m.description }));
          }
        } else if (url) {
          const headers: Record<string, string> = {};
          if (key) headers['Authorization'] = `Bearer ${key}`;
          const res = await fetch(`${url}/models`, { headers });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        }

        if (rawModels.length > 0) {
          // Enrich and restore each model's enabled state
          const freshModels = rawModels.map(m => {
            const enriched = enrichModel(m, prov.id);
            return { ...enriched, enabled: enabledIds.has(enriched.id) };
          });
          onConnectProvider(prov, freshModels);
        }
      } catch {
        // Skip failing provider silently — others still refresh
      }
    }

    setRefreshStatus('');
    setRefreshing(false);
  };

  const renderSidebarItem = (id: string, label: string, icon: string) => {
    const isActive = activeCategory === id;
    if (searchQuery && !label.toLowerCase().includes(searchQuery.toLowerCase())) return null;

    return (
      <div
        key={id}
        data-testid={`settings-category-${id}`}
        onClick={() => onSelectCategory(id)}
        style={{
          padding: '8px 10px',
          borderRadius: '8px',
          color: isActive ? '#ffffff' : '#8a8a8a',
          backgroundColor: isActive ? '#2e2220' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.88rem',
          fontWeight: isActive ? 500 : 400,
          marginBottom: '2px',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = '#251c1a';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span style={{ fontSize: '0.95rem' }}>{icon}</span>
        <span>{label}</span>
      </div>
    );
  };

  const renderToggleSwitch = (
    label: string,
    desc: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    testid: string
  ) => {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '16px 0',
          borderBottom: '1px solid #231c1a'
        }}
      >
        <div style={{ flex: 1, paddingRight: '20px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#ffffff', marginBottom: '4px' }}>
            {label}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#8a8a8a', lineHeight: '1.4' }}>
            {desc}
          </div>
        </div>
        <div
          data-testid={testid}
          onClick={() => onChange(!checked)}
          style={{
            width: '40px',
            height: '22px',
            borderRadius: '11px',
            backgroundColor: checked ? '#3b82f6' : '#2d2321',
            padding: '2px',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: checked ? 'flex-end' : 'flex-start'
          }}
        >
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease'
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid="settings-container"
      style={{
        flex: 1,
        display: 'flex',
        backgroundColor: '#141110',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, sans-serif"
      }}
    >
      {/* Settings Navigation Sidebar */}
      <div
        style={{
          width: '240px',
          borderRight: '1px solid #231c1a',
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 8px',
          boxSizing: 'border-box'
        }}
      >
        {/* Back Button */}
        <button
          data-testid="settings-back-btn"
          onClick={onBackToApp}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#8a8a8a',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            borderRadius: '8px',
            marginBottom: '12px',
            textAlign: 'left'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#251c1a')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <span>←</span> Back to app
        </button>

        {/* Settings Search bar */}
        <div
          style={{
            backgroundColor: '#1e1816',
            border: '1px solid #2e2220',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            padding: '6px 12px',
            marginBottom: '16px'
          }}
        >
          <span style={{ color: '#8a8a8a', marginRight: '6px', fontSize: '0.8rem' }}>🔍</span>
          <input
            data-testid="settings-search-input"
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '0.85rem',
              width: '100%'
            }}
          />
        </div>

        {/* Categories Section List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {Object.entries(categories).map(([secName, items]) => {
            const visibleItems = items.filter(i => !searchQuery || i.label.toLowerCase().includes(searchQuery.toLowerCase()));
            if (visibleItems.length === 0) return null;

            return (
              <div key={secName} style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    color: '#8a8a8a',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    marginBottom: '4px',
                    padding: '4px 10px'
                  }}
                >
                  {secName}
                </div>
                {visibleItems.map(item => renderSidebarItem(item.id, item.label, item.icon))}
              </div>
            );
          })}
        </div>

        {/* Muted footer label matching Image 1 */}
        <div
          style={{
            marginTop: 'auto',
            padding: '12px 10px',
            fontSize: '0.78rem',
            color: '#555555',
            borderTop: '1px solid #231c1a',
            letterSpacing: '0.02em',
            fontWeight: 500
          }}
        >
          OpenCode Desktop
        </div>
      </div>

      {/* Settings Main Content View */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', boxSizing: 'border-box' }}>
        
        {/* General Settings */}
        {activeCategory === 'general' && (
          <div style={{ maxWidth: '680px' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#ffffff', marginBottom: '32px' }}>General</h1>

            {/* Work Mode */}
            <div style={{ marginBottom: '40px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Work mode</div>
              <div style={{ fontSize: '0.82rem', color: '#8a8a8a', marginBottom: '16px' }}>
                Choose how much technical detail Codex shows
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  data-testid="workmode-coding-card"
                  onClick={() => setWorkMode('coding')}
                  style={{
                    flex: 1,
                    backgroundColor: '#1b1412',
                    border: workMode === 'coding' ? '1px solid #3b82f6' : '1px solid #2d2321',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'border-color 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.2rem' }}>💻</span>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#ffffff' }}>For coding</span>
                      <span style={{ fontSize: '0.78rem', color: '#8a8a8a' }}>More technical responses and control</span>
                    </div>
                  </div>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: workMode === 'coding' ? '5px solid #3b82f6' : '1px solid #8a8a8a', boxSizing: 'border-box' }} />
                </div>

                <div
                  data-testid="workmode-everyday-card"
                  onClick={() => setWorkMode('everyday')}
                  style={{
                    flex: 1,
                    backgroundColor: '#1b1412',
                    border: workMode === 'everyday' ? '1px solid #3b82f6' : '1px solid #2d2321',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'border-color 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.2rem' }}>💬</span>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#ffffff' }}>For everyday work</span>
                      <span style={{ fontSize: '0.78rem', color: '#8a8a8a' }}>Same power, less technical detail</span>
                    </div>
                  </div>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: workMode === 'everyday' ? '5px solid #3b82f6' : '1px solid #8a8a8a', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            {/* Permissions */}
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#ffffff', marginBottom: '16px', borderBottom: '1px solid #231c1a', paddingBottom: '8px' }}>
                Permissions
              </div>
              {renderToggleSwitch('Default permissions', 'By default, Codex can read and edit files in its workspace. It can ask for additional access when needed', defaultPermissions, setDefaultPermissions, 'toggle-default-permissions')}
              {renderToggleSwitch('Auto-review', 'Codex can read and edit files in its workspace. Codex automatically reviews requests for additional access to make mistakes.', autoReview, setAutoReview, 'toggle-auto-review')}
              {renderToggleSwitch('Full access', 'When Codex runs with full access, it can edit any file on your computer and run commands with full control.', fullAccess, setFullAccess, 'toggle-full-access')}
            </div>
          </div>
        )}

        {/* Shortcuts Section */}
        {activeCategory === 'shortcuts' && (
          <div style={{ maxWidth: '680px' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#ffffff', marginBottom: '24px' }}>Keyboard shortcuts</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #231c1a' }}>
                <span style={{ color: '#ececec', fontSize: '0.9rem' }}>Open Search Command Palette</span>
                <kbd style={{ backgroundColor: '#1e1816', border: '1px solid #3d2b29', borderRadius: '4px', padding: '2px 6px', fontSize: '0.8rem', color: '#ececec' }}>Ctrl + P</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #231c1a' }}>
                <span style={{ color: '#ececec', fontSize: '0.9rem' }}>Open Workspace Settings</span>
                <kbd style={{ backgroundColor: '#1e1816', border: '1px solid #3d2b29', borderRadius: '4px', padding: '2px 6px', fontSize: '0.8rem', color: '#ececec' }}>Ctrl + ,</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #231c1a' }}>
                <span style={{ color: '#ececec', fontSize: '0.9rem' }}>Initialize New Chat Session</span>
                <kbd style={{ backgroundColor: '#1e1816', border: '1px solid #3d2b29', borderRadius: '4px', padding: '2px 6px', fontSize: '0.8rem', color: '#ececec' }}>Ctrl + N</kbd>
              </div>
            </div>
          </div>
        )}

        {/* Servers / MCP Configuration View */}
        {activeCategory === 'servers' && mcpDashboard}

        {/* Providers settings page matching Image 1 */}
        {activeCategory === 'providers' && (
          <div style={{ maxWidth: '780px' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#ffffff', marginBottom: '24px' }}>Providers</h1>

            {/* Connected Providers List */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#ececec', marginBottom: '16px' }}>Connected providers</div>
              
              <div style={{ backgroundColor: '#1b1412', border: '1px solid #2d2321', borderRadius: '12px', overflow: 'hidden' }}>
                {connectedProviders.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#8a8a8a', fontSize: '0.9rem' }}>
                    No providers connected yet. Connect a provider below.
                  </div>
                ) : (
                  connectedProviders.map(p => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderBottom: '1px solid #231c1a'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.2rem' }}>✦</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.92rem', color: '#ffffff' }}>{p.name}</span>
                          <span style={{ fontSize: '0.72rem', backgroundColor: '#2d2321', padding: '2px 8px', borderRadius: '4px', color: '#8a8a8a', textTransform: 'capitalize' }}>
                            {p.type === 'env' ? 'Environment' : p.type === 'key' ? 'API key' : 'Custom'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => onDisconnectProvider(p.id)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#ffffff',
                          fontWeight: 500,
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          padding: '4px 8px'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#ffffff')}
                      >
                        Disconnect
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Popular Providers Grid */}
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#ececec', marginBottom: '16px' }}>Popular providers</div>
              
              <div style={{ backgroundColor: '#1b1412', border: '1px solid #2d2321', borderRadius: '12px', overflow: 'hidden' }}>
                {popularProviders.map((p, idx) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                      borderBottom: idx === popularProviders.length - 1 ? 'none' : '1px solid #231c1a'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, marginRight: '16px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{p.id === 'chatgpt' ? '💬' : p.id === 'google' ? '🌐' : '⚙️'}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.92rem', color: '#ffffff' }}>{p.name}</span>
                          {p.isRec && (
                            <span style={{ fontSize: '0.68rem', backgroundColor: '#2e2220', border: '1px solid #3d302e', color: '#8a8a8a', padding: '1px 6px', borderRadius: '4px' }}>
                              Recommended
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#8a8a8a' }}>{p.desc}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenConnectModal(p.id, p.name, p.defaultUrl)}
                      style={{
                        backgroundColor: '#141110',
                        border: '1px solid #2d2321',
                        borderRadius: '6px',
                        color: '#ffffff',
                        padding: '6px 14px',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2e2220')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#141110')}
                    >
                      + Connect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Models list page matching Image 2 */}
        {activeCategory === 'models' && (
          <div style={{ maxWidth: '780px' }}>
            {/* Models header with Refresh button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>Models</h1>
              <button
                onClick={handleRefreshAllModels}
                disabled={refreshing || connectedProviders.length === 0}
                title={connectedProviders.length === 0 ? 'Connect a provider first' : 'Re-fetch models from all providers'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  backgroundColor: refreshing ? '#1e1614' : '#2a1e1c',
                  border: '1px solid #3d2b29',
                  borderRadius: '8px', color: refreshing ? '#6b6b6b' : '#ffffff',
                  fontSize: '0.85rem', fontWeight: 500,
                  padding: '8px 14px', cursor: refreshing || connectedProviders.length === 0 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease', opacity: connectedProviders.length === 0 ? 0.4 : 1
                }}
                onMouseEnter={e => { if (!refreshing && connectedProviders.length > 0) e.currentTarget.style.backgroundColor = '#3a2622'; }}
                onMouseLeave={e => { if (!refreshing) e.currentTarget.style.backgroundColor = refreshing ? '#1e1614' : '#2a1e1c'; }}
              >
                <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
                {refreshing ? (refreshStatus || 'Refreshing...') : 'Refresh all'}
              </button>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

            {/* Model Search */}
            <div
              style={{
                backgroundColor: '#1b1412',
                border: '1px solid #2d2321',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                padding: '10px 16px',
                marginBottom: '24px'
              }}
            >
              <span style={{ color: '#8a8a8a', marginRight: '8px' }}>🔍</span>
              <input
                data-testid="model-catalog-search"
                type="text"
                placeholder="Search models"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  flex: 1
                }}
              />
            </div>

            {/* Models list grouped by connected provider */}
            <ModelsList
              connectedProviders={connectedProviders}
              modelsCatalog={modelsCatalog}
              modelSearch={modelSearch}
              onToggleModel={onToggleModel}
            />
          </div>
        )}
      </div>

      {/* Connection setup Modal popup */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000
          }}
        >
          <div
            style={{
              width: '460px',
              backgroundColor: '#1e1816',
              border: '1px solid #3d2b29',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#ffffff', marginBottom: '16px' }}>
              Connect {connectionName}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: '#8a8a8a' }}>Connection Name</label>
                <input
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  style={{
                    backgroundColor: '#141110',
                    border: '1px solid #2d2321',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: '#8a8a8a' }}>API Key / Token</label>
                <input
                  type="password"
                  placeholder="Enter credential token"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{
                    backgroundColor: '#141110',
                    border: '1px solid #2d2321',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: '#8a8a8a' }}>Base Endpoint URL</label>
                <input
                  type="text"
                  placeholder="Defaults to standard URL if empty"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  style={{
                    backgroundColor: '#141110',
                    border: '1px solid #2d2321',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Error Message Details */}
            {errorDetails && (
              <div
                style={{
                  backgroundColor: '#3d1c1a',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  textAlign: 'left',
                  marginBottom: '16px',
                  lineHeight: '1.4'
                }}
              >
                <strong>Connection Error:</strong> {errorDetails}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={handleForceConnect}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#8a8a8a',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Force Connect (Offline)
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #2d2321',
                    borderRadius: '6px',
                    color: '#ececec',
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleTestConnection}
                  disabled={testingStatus === 'Testing connection...'}
                  style={{
                    backgroundColor: '#3b82f6',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  {testingStatus === 'Testing connection...' ? 'Testing...' : 'Test & Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SettingsView;

// ─── ModelsList: expandable model rows ────────────────────────────────

const MODALITY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  text:  { bg: '#1e2d1e', text: '#4ade80', icon: '📝' },
  image: { bg: '#1e1e2d', text: '#818cf8', icon: '🖼' },
  audio: { bg: '#2d1e2d', text: '#e879f9', icon: '🎵' },
  video: { bg: '#2d1a1a', text: '#f87171', icon: '🎬' },
};

const ModalityChip: React.FC<{ type: string; label?: string }> = ({ type, label }) => {
  const c = MODALITY_COLORS[type] ?? { bg: '#2d2321', text: '#8a8a8a', icon: '?' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      backgroundColor: c.bg, color: c.text,
      padding: '2px 8px', borderRadius: '999px',
      fontSize: '0.72rem', fontWeight: 500
    }}>
      {c.icon} {label ?? type}
    </span>
  );
};

const Toggle: React.FC<{ enabled: boolean; onToggle: () => void }> = ({ enabled, onToggle }) => (
  <div
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    style={{
      flexShrink: 0, width: '40px', height: '22px', borderRadius: '11px',
      backgroundColor: enabled ? '#3b82f6' : '#2d2321',
      padding: '2px', cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      display: 'flex', alignItems: 'center',
      justifyContent: enabled ? 'flex-end' : 'flex-start'
    }}
  >
    <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
  </div>
);

interface ModelsListProps {
  connectedProviders: ProviderConnection[];
  modelsCatalog: ModelConfig[];
  modelSearch: string;
  onToggleModel: (id: string) => void;
}

export const ModelsList: React.FC<ModelsListProps> = ({ connectedProviders, modelsCatalog, modelSearch, onToggleModel }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (connectedProviders.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', border: '1px dashed #2d2321', borderRadius: '12px', color: '#8a8a8a' }}>
        No models available. Connect a provider in the &ldquo;Providers&rdquo; tab first.
      </div>
    );
  }

  return (
    <div>
      {connectedProviders.map(prov => {
        const models = [...modelsCatalog]
          .filter(m =>
            m.providerId === prov.id &&
            (!modelSearch || m.name.toLowerCase().includes(modelSearch.toLowerCase()))
          )
          .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        if (models.length === 0) return null;

        return (
          <div key={prov.id} style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '0.85rem', fontWeight: 600, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <span style={{ color: '#ef4444' }}>✦</span>
              <span>{prov.name}</span>
              <span style={{ marginLeft: '4px', fontSize: '0.75rem', fontWeight: 400, color: '#4b4b4b' }}>{models.length} model{models.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={{ backgroundColor: '#1b1412', border: '1px solid #2d2321', borderRadius: '12px', overflow: 'hidden' }}>
              {models.map((model, idx) => {
                const isExpanded = expandedId === model.id;
                const hasIn  = (model.inputModalities  ?? []).length > 0;
                const hasOut = (model.outputModalities ?? []).length > 0;
                const p = model.pricing;

                return (
                  <div key={model.id} style={{ borderBottom: idx === models.length - 1 ? 'none' : '1px solid #231c1a' }}>
                    {/* ─ Collapsed row ─ */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : model.id)}
                      style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 20px', cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                        backgroundColor: isExpanded ? '#201918' : 'transparent',
                      }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = '#1e1614'; }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500, fontSize: '0.92rem', color: '#ffffff' }}>{model.name}</span>
                          {/* Modality chips (collapsed preview) */}
                          {hasIn && (model.inputModalities ?? []).map(m => <ModalityChip key={m} type={m} />)}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {model.contextLimit && (
                            <span style={{ fontSize: '0.74rem', color: '#6b6b6b' }}>ctx: <span style={{ color: '#9a9a9a' }}>{model.contextLimit}</span></span>
                          )}
                          {p?.inputPer1M ? (
                            <span style={{ fontSize: '0.74rem', color: '#6b6b6b' }}>in: <span style={{ color: '#a3e6c0' }}>{p.inputPer1M}/1M</span></span>
                          ) : model.contextLimit == null && !hasIn && (
                            <span style={{ fontSize: '0.74rem', color: '#4b4b4b' }}>pricing: N/A</span>
                          )}
                          {p?.outputPer1M && (
                            <span style={{ fontSize: '0.74rem', color: '#6b6b6b' }}>out: <span style={{ color: '#fca5a5' }}>{p.outputPer1M}/1M</span></span>
                          )}
                          {model.caching && (
                            <span style={{ fontSize: '0.72rem', backgroundColor: '#1a2d1a', color: '#4ade80', padding: '1px 6px', borderRadius: '4px' }}>⚡ caching</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.75rem', color: '#4b4b4b', userSelect: 'none' }}>{isExpanded ? '▲' : '▼'}</span>
                        <Toggle enabled={model.enabled} onToggle={() => onToggleModel(model.id)} />
                      </div>
                    </div>

                    {/* ─ Expanded detail panel ─ */}
                    {isExpanded && (
                      <div style={{ padding: '0 20px 16px 20px', borderTop: '1px solid #2a1e1c', backgroundColor: '#1a1210' }}>
                        {model.description && (
                          <p style={{ fontSize: '0.8rem', color: '#7a7a7a', margin: '12px 0 10px', lineHeight: 1.5 }}>{model.description}</p>
                        )}

                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: model.description ? 0 : '12px' }}>
                          {/* Input modalities */}
                          {hasIn && (
                            <div>
                              <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Input</div>
                              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                {(model.inputModalities ?? []).map(m => <ModalityChip key={m} type={m} />)}
                              </div>
                            </div>
                          )}
                          {/* Output modalities */}
                          {hasOut && (
                            <div>
                              <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Output</div>
                              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                {(model.outputModalities ?? []).map(m => <ModalityChip key={m} type={m} />)}
                              </div>
                            </div>
                          )}
                          {/* Context & output limits */}
                          <div>
                            <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Context Window</div>
                            <span style={{ fontSize: '0.85rem', color: '#cccccc', fontWeight: 500 }}>{model.contextLimit ?? 'N/A'}</span>
                          </div>
                          {model.outputLimit && (
                            <div>
                              <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max Output</div>
                              <span style={{ fontSize: '0.85rem', color: '#cccccc', fontWeight: 500 }}>{model.outputLimit}</span>
                            </div>
                          )}
                          {/* Caching */}
                          <div>
                            <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Caching</div>
                            <span style={{ fontSize: '0.85rem', color: model.caching ? '#4ade80' : '#ef4444', fontWeight: 500 }}>{model.caching ? '✓ Supported' : '✗ Not supported'}</span>
                          </div>
                        </div>

                        {/* Pricing table */}
                        {p && (
                          <div style={{ marginTop: '14px' }}>
                            <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pricing (per 1M tokens)</div>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                              {p.inputPer1M && (
                                <div style={{ backgroundColor: '#1a2520', border: '1px solid #2a3a2a', borderRadius: '8px', padding: '8px 14px' }}>
                                  <div style={{ fontSize: '0.7rem', color: '#4b7b5a', marginBottom: '2px' }}>Input</div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#a3e6c0' }}>{p.inputPer1M}</div>
                                </div>
                              )}
                              {p.outputPer1M && (
                                <div style={{ backgroundColor: '#251a1a', border: '1px solid #3a2a2a', borderRadius: '8px', padding: '8px 14px' }}>
                                  <div style={{ fontSize: '0.7rem', color: '#7b4b4b', marginBottom: '2px' }}>Output</div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fca5a5' }}>{p.outputPer1M}</div>
                                </div>
                              )}
                              {p.cachedInputPer1M && (
                                <div style={{ backgroundColor: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: '8px', padding: '8px 14px' }}>
                                  <div style={{ fontSize: '0.7rem', color: '#4b4b7b', marginBottom: '2px' }}>Cached Input</div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#818cf8' }}>{p.cachedInputPer1M}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {!p && (
                          <p style={{ fontSize: '0.78rem', color: '#4b4b4b', marginTop: '12px' }}>Pricing not published by this provider.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
