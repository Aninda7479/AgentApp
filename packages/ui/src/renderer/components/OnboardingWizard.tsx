import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  User, 
  Moon, 
  Sun, 
  Monitor, 
  Power,
  RefreshCw,
  Send,
  Eye,
  EyeOff,
  Server,
  HardDrive,
  Layers,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Ban,
  CheckCircle2,
  AlertCircle,
  X,
  Globe,
  Search,
  Plus
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { getIpc } from '../lib/ipc';
import { ProviderConnection, ModelConfig, ModelPricing } from '../pages/Settings/types';
import { ProviderLogo } from '../pages/Settings/ProvidersSettings';
import { browserSafeFetch } from '../web-fetch.js';
import { ProvidersService } from '../logic/providers';

export interface OnboardingWizardProps {
  onComplete: () => void;
  onConnectProvider?: (provider: ProviderConnection, models: ModelConfig[]) => void;
  onConnectProviders?: (batch: Array<{ provider: ProviderConnection; models: ModelConfig[] }>) => void;
  /** Optional mode for targeted modular feature setup */
  mode?: 'full' | 'providers_only' | 'telegram_only' | 'preferences_only';
  /** Optional step number to start on */
  initialStep?: number;
}

export interface ProviderItem {
  id: string;
  name: string;
  category: 'local' | 'open' | 'cloud' | 'custom';
  defaultUrl: string;
  url: string;
  apiKey: string;
  desc: string;
  status: 'idle' | 'testing' | 'connected' | 'error';
  statusMessage?: string;
  models: ModelConfig[];
  expanded?: boolean;
}

/** Known popular providers list matching Settings page catalog with ZERO hardcoded models. */
const POPULAR_PROVIDERS_CONFIG: ProviderItem[] = [
  { id: 'ollama', name: 'Ollama (Local Models)', category: 'local', defaultUrl: 'http://localhost:11434', url: 'http://localhost:11434', apiKey: '', desc: 'Local model runner (Ollama daemon on localhost:11434)', status: 'idle', models: [], expanded: true },
  { id: 'omniroute', name: 'OmniRoute Local', category: 'local', defaultUrl: 'http://127.0.0.1:20128/v1', url: 'http://127.0.0.1:20128/v1', apiKey: '', desc: 'OmniRoute Local LLM proxy & router endpoint', status: 'idle', models: [] },
  { id: 'deepseek', name: 'DeepSeek', category: 'open', defaultUrl: 'https://api.deepseek.com', url: 'https://api.deepseek.com', apiKey: '', desc: 'DeepSeek API developer platform endpoints', status: 'idle', models: [] },
  { id: 'openrouter', name: 'OpenRouter', category: 'open', defaultUrl: 'https://openrouter.ai/api/v1', url: 'https://openrouter.ai/api/v1', apiKey: '', desc: 'Unified open router broker with 100+ models', status: 'idle', models: [] },
  { id: 'groq', name: 'Groq', category: 'open', defaultUrl: 'https://api.groq.com/openai/v1', url: 'https://api.groq.com/openai/v1', apiKey: '', desc: 'Groq LPU ultra-fast inference engine', status: 'idle', models: [] },
  { id: 'kimi', name: 'Kimi (Moonshot AI)', category: 'open', defaultUrl: 'https://api.moonshot.cn/v1', url: 'https://api.moonshot.cn/v1', apiKey: '', desc: 'Moonshot AI developer platform provider', status: 'idle', models: [] },
  { id: 'nvidia', name: 'NVIDIA NIM', category: 'open', defaultUrl: 'https://integrate.api.nvidia.com/v1', url: 'https://integrate.api.nvidia.com/v1', apiKey: '', desc: 'NVIDIA NIM inference microservices', status: 'idle', models: [] },
  { id: 'deepinfra', name: 'DeepInfra', category: 'open', defaultUrl: 'https://api.deepinfra.com/v1', url: 'https://api.deepinfra.com/v1', apiKey: '', desc: 'Low cost serverless inference provider', status: 'idle', models: [] },
  { id: 'ollama-cloud', name: 'Ollama Cloud', category: 'cloud', defaultUrl: 'https://api.ollama.com', url: 'https://api.ollama.com', apiKey: '', desc: 'Ollama Cloud hosted model inference API', status: 'idle', models: [] },
  { id: 'claude', name: 'Anthropic (Claude)', category: 'cloud', defaultUrl: 'https://api.anthropic.com/v1', url: 'https://api.anthropic.com/v1', apiKey: '', desc: 'Anthropic Claude Developer API platform', status: 'idle', models: [] },
  { id: 'chatgpt', name: 'OpenAI (ChatGPT)', category: 'cloud', defaultUrl: 'https://api.openai.com/v1', url: 'https://api.openai.com/v1', apiKey: '', desc: 'OpenAI Developer platform API access', status: 'idle', models: [] },
  { id: 'google', name: 'Google Gemini', category: 'cloud', defaultUrl: 'https://generativelanguage.googleapis.com', url: 'https://generativelanguage.googleapis.com', apiKey: '', desc: 'Google Gemini Developer models', status: 'idle', models: [] },
  { id: 'vertex', name: 'Google Vertex AI', category: 'cloud', defaultUrl: '', url: '', apiKey: '', desc: 'Google Cloud Vertex platform integration endpoint', status: 'idle', models: [] }
];

/** Dynamic model enrichment logic with ZERO hardcoded model names. */
const enrichDynamicModel = (raw: {
  id: string;
  name: string;
  contextLimit?: string;
  outputLimit?: string;
  description?: string;
  apiType?: string;
  free?: boolean;
  enabled?: boolean;
  pricing?: ModelPricing;
  inputModalities?: string[];
  outputModalities?: string[];
}, providerId: string, index: number = 0): ModelConfig => {
  let isFree = raw.free;
  let ctxLimit = raw.contextLimit;

  if (providerId === 'ollama' || providerId === 'ollama-cloud') {
    isFree = true;
  }

  const inferModalities = (mId: string): { inputModalities: string[]; outputModalities: string[] } => {
    const id = mId.toLowerCase();
    if (/vision|image|vl/i.test(id)) return { inputModalities: ['text', 'image'], outputModalities: ['text'] };
    return { inputModalities: ['text'], outputModalities: ['text'] };
  };

  const mods = inferModalities(raw.id);
  // Default to enabling only the primary/first model (index === 0) with zero hardcoded model names
  const isEnabled = raw.enabled !== undefined ? raw.enabled : (index === 0);

  return {
    id: `${providerId}-${raw.id}`,
    name: raw.name || raw.id,
    providerId,
    enabled: isEnabled,
    free: isFree,
    contextLimit: ctxLimit,
    outputLimit: raw.outputLimit,
    description: raw.description,
    pricing: raw.pricing,
    inputModalities: raw.inputModalities || mods.inputModalities,
    outputModalities: raw.outputModalities || mods.outputModalities
  };
};

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ 
  onComplete, 
  onConnectProvider,
  onConnectProviders,
  mode = 'full',
  initialStep
}) => {
  const getStartingStep = () => {
    if (initialStep) return initialStep;
    if (mode === 'providers_only') return 2;
    if (mode === 'telegram_only') return 3;
    if (mode === 'preferences_only') return 4;
    return 1;
  };

  const [step, setStep] = useState(getStartingStep());
  const [ownerName, setOwnerName] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  
  // ── AI Providers State ───────────────────────────────────────────────────────
  const [providerList, setProviderList] = useState<ProviderItem[]>(POPULAR_PROVIDERS_CONFIG);
  const [providerSearch, setProviderSearch] = useState('');
  const [providerCategory, setProviderCategory] = useState<'all' | 'local' | 'open' | 'cloud' | 'custom'>('all');
  const [scanningLocal, setScanningLocal] = useState(false);

  // ── Telegram Integration State ──────────────────────────────────────────────
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramShowToken, setTelegramShowToken] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramVerified, setTelegramVerified] = useState<{
    botName?: string;
    username?: string;
    message?: string;
  } | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramSkipped, setTelegramSkipped] = useState(false);

  // ── Preferences State ───────────────────────────────────────────────────────
  const [confirmShellCommands, setConfirmShellCommands] = useState(true);
  const [unsandboxedActions, setUnsandboxedActions] = useState(false);
  const [autoReviewPlan, setAutoReviewPlan] = useState(true);
  const [internetAccessLevel, setInternetAccessLevel] = useState<'all' | 'observation' | 'none'>('all');
  const [runOnStartup, setRunOnStartup] = useState(true);
  const [keepBackgroundAlive, setKeepBackgroundAlive] = useState(true);

  const ipc = getIpc();

  // ── Hydrate State from Saved Settings and Store on Mount ────────────────────
  useEffect(() => {
    if (!ipc) return;
    Promise.all([
      ipc.invoke('settings-read').catch(() => null),
      ipc.invoke('store-read').catch(() => null)
    ]).then(([settings, storeData]) => {
      if (settings?.general?.ownerName) setOwnerName(settings.general.ownerName);
      if (settings?.theme?.desktop) setTheme(settings.theme.desktop);
      if (settings?.general?.confirmShellCommands !== undefined) setConfirmShellCommands(settings.general.confirmShellCommands);
      if (settings?.general?.unsandboxedActions !== undefined) setUnsandboxedActions(settings.general.unsandboxedActions);
      if (settings?.general?.autoReviewPlan !== undefined) setAutoReviewPlan(settings.general.autoReviewPlan);
      if (settings?.internetAccess?.level) setInternetAccessLevel(settings.internetAccess.level);
      if (settings?.general?.openAtLogin !== undefined) setRunOnStartup(settings.general.openAtLogin);
      if (settings?.general?.closeToTray !== undefined) setKeepBackgroundAlive(settings.general.closeToTray);

      if (settings?.telegram) {
        if (settings.telegram.botToken) setTelegramToken(settings.telegram.botToken);
        if (settings.telegram.chatId) setTelegramChatId(settings.telegram.chatId);
        if (settings.telegram.botToken) {
          setTelegramVerified({
            botName: 'Configured Telegram Bot',
            message: 'Configured from saved settings'
          });
        }
      }

      // Merge saved providers and models
      const savedProviders: ProviderConnection[] = settings?.providers || storeData?.connectedProviders || [];
      const savedModels: ModelConfig[] = settings?.models || storeData?.modelsCatalog || [];

      if (savedProviders.length > 0) {
        setProviderList(prev => {
          const knownIds = new Set(prev.map(p => p.id));
          const updated = prev.map(p => {
            const match = savedProviders.find(sp => sp.id === p.id);
            if (!match) return p;
            const pModels = savedModels.filter(m => m.providerId === p.id);
            const hasKey = Boolean(match.apiKey?.trim());
            const isLocal = p.id === 'ollama' || p.id === 'omniroute';
            const isConn = hasKey || isLocal || pModels.length > 0;
            return {
              ...p,
              apiKey: match.apiKey || '',
              url: match.baseUrl || p.defaultUrl,
              status: isConn ? 'connected' : p.status,
              statusMessage: pModels.length > 0 ? `Loaded ${pModels.length} saved model${pModels.length === 1 ? '' : 's'}` : p.statusMessage,
              models: pModels.length > 0 ? pModels : p.models
            };
          });

          // Add any custom providers that are not in default list
          const customProviders: ProviderItem[] = savedProviders
            .filter(sp => !knownIds.has(sp.id))
            .map(sp => {
              const pModels = savedModels.filter(m => m.providerId === sp.id);
              return {
                id: sp.id,
                name: sp.name || 'Custom LLM Server',
                category: 'custom',
                defaultUrl: sp.baseUrl || 'http://localhost:8000/v1',
                url: sp.baseUrl || 'http://localhost:8000/v1',
                apiKey: sp.apiKey || '',
                desc: 'Configured custom LLM server',
                status: 'connected',
                statusMessage: pModels.length > 0 ? `Loaded ${pModels.length} saved model${pModels.length === 1 ? '' : 's'}` : 'Connected',
                models: pModels
              };
            });

          return [...customProviders, ...updated];
        });
      }
    });
  }, [ipc]);

  // ── Auto-Scan Local Ollama & Local OmniRoute on Mount ────────────────────────
  const scanLocalProviders = useCallback(async () => {
    setScanningLocal(true);
    try {
      // 1. Scan Ollama local tags
      const candidateOllamaUrls = ['http://localhost:11434', 'http://127.0.0.1:11434'];
      let foundOllamaModels: ModelConfig[] = [];
      let successOllamaUrl = 'http://localhost:11434';

      for (const base of candidateOllamaUrls) {
        try {
          const res = await browserSafeFetch(`${base}/api/tags`);
          if (res.ok) {
            const data = await res.json();
            const list = data.models ?? [];
            if (list.length > 0) {
              foundOllamaModels = list.map((m: any, idx: number) => enrichDynamicModel({
                id: m.name || m.model || String(m),
                name: m.name || m.model || String(m),
                contextLimit: m.details?.parameter_size ? `${m.details.parameter_size}` : undefined,
                free: true
              }, 'ollama', idx));
              successOllamaUrl = base;
              break;
            }
          }
        } catch {
          /* try next host */
        }
      }

      // 2. Scan OmniRoute local proxy
      const candidateOmniUrls = ['http://127.0.0.1:20128/v1', 'http://localhost:20128/v1'];
      let foundOmniModels: ModelConfig[] = [];
      let successOmniUrl = 'http://127.0.0.1:20128/v1';

      for (const base of candidateOmniUrls) {
        try {
          const res = await browserSafeFetch(`${base}/models`);
          if (res.ok) {
            const data = await res.json();
            const list = data.data ?? [];
            if (list.length > 0) {
              foundOmniModels = list.map((m: any, idx: number) => enrichDynamicModel({
                id: m.id || m.name || String(m),
                name: m.id || m.name || String(m),
                free: true
              }, 'omniroute', idx));
              successOmniUrl = base;
              break;
            }
          }
        } catch {
          /* try next host */
        }
      }

      setProviderList(prev => prev.map(p => {
        if (p.id === 'ollama') {
          if (foundOllamaModels.length > 0) {
            return {
              ...p,
              url: successOllamaUrl,
              status: 'connected',
              statusMessage: `Discovered ${foundOllamaModels.length} local model${foundOllamaModels.length === 1 ? '' : 's'}`,
              models: foundOllamaModels
            };
          }
          return {
            ...p,
            status: p.status === 'connected' ? 'connected' : 'idle',
            statusMessage: p.status === 'connected' ? p.statusMessage : 'Ollama is not running locally.'
          };
        }
        if (p.id === 'omniroute') {
          if (foundOmniModels.length > 0) {
            return {
              ...p,
              url: successOmniUrl,
              status: 'connected',
              statusMessage: `Discovered ${foundOmniModels.length} local model${foundOmniModels.length === 1 ? '' : 's'}`,
              models: foundOmniModels
            };
          }
          return p;
        }
        return p;
      }));
    } catch {
      /* ignore */
    } finally {
      setScanningLocal(false);
    }
  }, []);

  useEffect(() => {
    if (step === 2 || mode === 'providers_only') {
      scanLocalProviders();
    }
  }, [step, mode, scanLocalProviders]);

  // ── Dynamic Provider Testing & Model Fetching (Direct API Calls) ────────────
  const testProvider = async (pId: string) => {
    const target = providerList.find(p => p.id === pId);
    if (!target) return;

    const key = target.apiKey.trim();
    const url = target.url.trim();

    if (!key && pId !== 'ollama' && pId !== 'omniroute') {
      setProviderList(prev => prev.map(p => p.id === pId ? {
        ...p,
        status: 'error',
        statusMessage: 'Please enter an API key to test connection.'
      } : p));
      return;
    }

    setProviderList(prev => prev.map(p => p.id === pId ? {
      ...p,
      status: 'testing',
      statusMessage: 'Testing connection & fetching models...'
    } : p));

    try {
      let rawModels: any[] = [];

      const fmtTokens = (n: number): string => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
        return String(n);
      };

      if (pId === 'ollama') {
        const base = (url || 'http://localhost:11434').replace(/\/+$/, '');
        const authHeaders: Record<string, string> = {};
        if (key) authHeaders['Authorization'] = `Bearer ${key}`;

        let fetchSucceeded = false;
        const candidateHosts = [base];
        if (base.includes('localhost')) candidateHosts.push(base.replace('localhost', '127.0.0.1'));
        else if (base.includes('127.0.0.1')) candidateHosts.push(base.replace('127.0.0.1', 'localhost'));

        for (const host of candidateHosts) {
          try {
            const res = await browserSafeFetch(`${host}/api/tags`, { headers: authHeaders });
            if (res.ok) {
              const data = await res.json();
              const modelsList = data.models ?? [];
              if (modelsList.length > 0) {
                rawModels = modelsList.map((m: any) => ({
                  id: m.name || m.model || String(m),
                  name: m.name || m.model || String(m),
                  contextLimit: m.details?.parameter_size ? `~${m.details.parameter_size}` : undefined,
                  free: true
                }));
                fetchSucceeded = true;
                break;
              }
            }
          } catch {
            /* try /v1/models */
          }

          try {
            const v1Url = host.endsWith('/v1') ? `${host}/models` : `${host}/v1/models`;
            const res = await browserSafeFetch(v1Url, { headers: authHeaders });
            if (res.ok) {
              const data = await res.json();
              const modelsList = data.data ?? [];
              if (modelsList.length > 0) {
                rawModels = modelsList.map((m: any) => ({ id: m.id, name: m.id, free: true }));
                fetchSucceeded = true;
                break;
              }
            }
          } catch {
            /* ignore */
          }
        }

        if (!fetchSucceeded && rawModels.length === 0) {
          throw new Error(`Could not reach Ollama at ${base}. Make sure Ollama is running.`);
        }
      } else if (pId === 'chatgpt' || pId === 'openai') {
        const base = url || 'https://api.openai.com/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (pId === 'deepseek') {
        const base = url || 'https://api.deepseek.com';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (pId === 'deepinfra') {
        const base = url || 'https://api.deepinfra.com/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data ?? []);
        rawModels = list.map((m: any) => ({
          id: m.model_name ?? m.id ?? m,
          name: m.model_name ?? m.id ?? m,
          apiType: m.type ?? m.model_type ?? undefined
        }));
      } else if (pId === 'google' || pId === 'gemini') {
        const res = await browserSafeFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', ''),
          description: m.description,
          contextLimit: m.inputTokenLimit ? fmtTokens(m.inputTokenLimit) : undefined,
          outputLimit: m.outputTokenLimit ? fmtTokens(m.outputTokenLimit) : undefined
        }));
      } else if (pId === 'claude' || pId === 'anthropic') {
        const base = url || 'https://api.anthropic.com/v1';
        const res = await browserSafeFetch(`${base}/models`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name ?? m.id }));
      } else if (pId === 'kimi') {
        const base = url || 'https://api.moonshot.cn/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (pId === 'openrouter') {
        const res = await browserSafeFetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => {
          const free = ProvidersService.detectFree(m.id, m.name ?? m.id, m.pricing);
          let pricing: any;
          if (!free && m.pricing) {
            const per1M = (s: string) => {
              const n = parseFloat(s);
              return Number.isFinite(n) ? `$${(n * 1_000_000).toFixed(2)}` : String(s);
            };
            pricing = { inputPer1M: per1M(m.pricing.prompt), outputPer1M: per1M(m.pricing.completion) };
          }
          return {
            id: m.id,
            name: m.name ?? m.id,
            contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined,
            description: m.description,
            free,
            pricing
          };
        });
      } else if (pId === 'nvidia') {
        const base = url || 'https://integrate.api.nvidia.com/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({
          id: m.id,
          name: m.name ?? m.id,
          contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined,
          description: m.description,
          free: ProvidersService.detectFree(m.id, m.name ?? m.id, m.pricing)
        }));
      } else if (pId === 'groq') {
        const base = url || 'https://api.groq.com/openai/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({
          id: m.id,
          name: m.id,
          contextLimit: m.context_window ? fmtTokens(m.context_window) : undefined
        }));
      } else if (pId === 'ollama-cloud') {
        const base = url.replace(/\/+$/, '');
        const authHeaders: Record<string, string> = {};
        if (key) authHeaders['Authorization'] = `Bearer ${key}`;
        const res = await browserSafeFetch(`${base}/api/tags`, { headers: authHeaders });
        if (!res.ok) throw new Error(`Ollama Cloud error [${res.status}]: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name,
          name: m.name,
          contextLimit: m.details?.parameter_size ? `~${m.details.parameter_size}` : undefined
        }));
      } else {
        // Generic OpenAI-compatible / Custom endpoint
        const base = (url || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const headers: Record<string, string> = {};
        if (key) headers['Authorization'] = `Bearer ${key}`;
        let res: Response | null = null;
        try {
          res = await browserSafeFetch(`${base}/models`, { headers });
        } catch {
          if (base.includes('localhost')) {
            res = await browserSafeFetch(`${base.replace('localhost', '127.0.0.1')}/models`, { headers });
          }
        }
        if (!res || !res.ok) throw new Error(`Could not connect to ${base}/models`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data ?? []);
        rawModels = list.map((m: any) => ({ id: m.id || m.name || String(m), name: m.id || m.name || String(m) }));
      }

      if (rawModels.length === 0) {
        throw new Error('Endpoint reached successfully, but zero models were returned.');
      }

      const enrichedList = rawModels.map((m, idx) => enrichDynamicModel(m, pId, idx));

      setProviderList(prev => prev.map(p => p.id === pId ? {
        ...p,
        status: 'connected',
        statusMessage: `Connected: ${enrichedList.filter(m => m.enabled).length} enabled (${enrichedList.length} discovered)`,
        models: enrichedList
      } : p));
    } catch (err: any) {
      setProviderList(prev => prev.map(p => p.id === pId ? {
        ...p,
        status: 'error',
        statusMessage: err?.message || 'Connection failed. Verify your key and endpoint URL.'
      } : p));
    }
  };

  // ── Toggle Individual Model in Onboarding ──────────────────────────────────
  const toggleProviderModel = (providerId: string, modelId: string) => {
    setProviderList(prev => prev.map(p => {
      if (p.id !== providerId) return p;
      return {
        ...p,
        models: p.models.map(m => m.id === modelId ? { ...m, enabled: !m.enabled } : m)
      };
    }));
  };

  // ── Add Custom Provider ─────────────────────────────────────────────────────
  const addCustomProvider = () => {
    const newId = `custom-${Date.now()}`;
    const newProvider: ProviderItem = {
      id: newId,
      name: 'Custom LLM Server',
      category: 'custom',
      defaultUrl: 'http://localhost:8000/v1',
      url: 'http://localhost:8000/v1',
      apiKey: '',
      desc: 'Private OpenAI-compatible proxy, vLLM, or LM Studio endpoint',
      status: 'idle',
      models: [],
      expanded: true
    };
    setProviderList(prev => [newProvider, ...prev]);
  };

  // ── Telegram Connection Test ────────────────────────────────────────────────
  const handleTestTelegram = async () => {
    if (!telegramToken.trim()) {
      setTelegramError('Please enter a Bot Token before testing.');
      return;
    }
    setTelegramTesting(true);
    setTelegramError(null);
    setTelegramVerified(null);

    try {
      if (ipc) {
        const res = await ipc.invoke('telegram-test', {
          botToken: telegramToken.trim(),
          chatId: telegramChatId.trim() || undefined,
          sendTestMessage: Boolean(telegramChatId.trim())
        });
        if (res?.success) {
          setTelegramVerified({
            botName: res.botName || 'Telegram Bot',
            username: res.username ? `@${res.username}` : undefined,
            message: telegramChatId.trim() ? 'Test message sent to your chat!' : 'Bot token verified successfully!'
          });
          setTelegramSkipped(false);
        } else {
          setTelegramError(res?.error || 'Failed to verify bot token.');
        }
      } else {
        const res = await browserSafeFetch(`https://api.telegram.org/bot${telegramToken.trim()}/getMe`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.result) {
            setTelegramVerified({
              botName: data.result.first_name,
              username: data.result.username ? `@${data.result.username}` : undefined,
              message: 'Bot token verified successfully!'
            });
            setTelegramSkipped(false);
          } else {
            setTelegramError('Invalid bot token.');
          }
        } else {
          setTelegramError(`Telegram API error: ${res.statusText}`);
        }
      }
    } catch (err: any) {
      setTelegramError(err?.message || 'Failed to connect to Telegram API.');
    } finally {
      setTelegramTesting(false);
    }
  };

  const totalSteps = 5;
  const handleNext = () => setStep(prev => Math.min(prev + 1, totalSteps));
  const handleBack = () => setStep(prev => Math.max(prev - 1, 1));

  // ── Save & Complete ─────────────────────────────────────────────────────────
  const handleFinish = async () => {
    // Collect all tested or saved providers
    const batchToConnect: Array<{ provider: ProviderConnection; models: ModelConfig[] }> = [];
    for (const p of providerList) {
      const hasKey = Boolean(p.apiKey.trim());
      const isLocalConnected = (p.id === 'ollama' || p.id === 'omniroute') && (p.status === 'connected' || p.models.length > 0);
      if (hasKey || isLocalConnected) {
        const conn: ProviderConnection = {
          id: p.id,
          name: p.name,
          type: (p.id === 'ollama' || p.id === 'omniroute' || p.category === 'custom') ? 'custom' : 'key',
          apiKey: p.apiKey.trim(),
          baseUrl: p.url.trim() || p.defaultUrl
        };
        const modelsWithDefault = p.models.length > 0
          ? (p.models.some(m => m.enabled) ? p.models : p.models.map((m, idx) => idx === 0 ? { ...m, enabled: true } : m))
          : [];
        batchToConnect.push({
          provider: conn,
          models: modelsWithDefault
        });
      }
    }

    const allProviders = batchToConnect.map(b => b.provider);
    const allModels = batchToConnect.flatMap(b => b.models);

    const settingsPatch = {
      theme: { desktop: theme, cli: theme },
      general: {
        ownerName: ownerName.trim() || 'SuperAgent User',
        confirmShellCommands,
        autoReviewPlan,
        unsandboxedActions,
        openAtLogin: runOnStartup,
        closeToTray: keepBackgroundAlive,
        setupState: { completed: true, version: 1, completedSteps: ['welcome', 'providers', 'telegram', 'preferences'] }
      },
      providers: allProviders,
      models: allModels,
      internetAccess: { level: internetAccessLevel }
    };

    if (ipc) {
      try {
        const currentSettings = (await ipc.invoke('settings-read')) || {};
        await ipc.invoke('settings-write', { ...currentSettings, ...settingsPatch });
        await ipc.invoke('store-write', {
          connectedProviders: allProviders,
          modelsCatalog: allModels
        }).catch(() => {});
        if (!telegramSkipped && telegramToken.trim()) {
          await ipc.invoke('telegram-config-save', { botToken: telegramToken.trim(), chatId: telegramChatId.trim(), enabled: true }).catch(() => {});
        }
        if (runOnStartup) {
          await ipc.invoke('autostart-enable').catch(() => {});
        } else {
          await ipc.invoke('autostart-disable').catch(() => {});
        }
      } catch (err) {
        console.error('Failed to write settings during setup:', err);
      }
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('superagent_setup_completed', 'true');
      }
    } catch {}

    if (onConnectProviders) {
      onConnectProviders(batchToConnect);
    } else if (onConnectProvider) {
      for (const item of batchToConnect) {
        onConnectProvider(item.provider, item.models);
      }
    }
    onComplete();
  };

  const filteredProviders = useMemo(() => {
    return providerList.filter(p => {
      const matchesCat = providerCategory === 'all' || p.category === providerCategory;
      const matchesSearch = !providerSearch.trim() || 
        p.name.toLowerCase().includes(providerSearch.toLowerCase()) || 
        p.desc.toLowerCase().includes(providerSearch.toLowerCase()) ||
        p.id.toLowerCase().includes(providerSearch.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [providerList, providerCategory, providerSearch]);

  const configuredProviders = providerList.filter(
    p => (p.apiKey.trim().length > 0 && (p.status === 'connected' || p.models.length > 0)) || ((p.id === 'ollama' || p.id === 'omniroute') && (p.status === 'connected' || p.models.length > 0))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-sans text-brand-textMain">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brand-border/60 px-7 py-4 bg-brand-bg/40 shrink-0">
          <div className="flex items-center gap-3">
            <BrandLogo size={28} />
            <span className="font-outfit text-base font-semibold tracking-tight">SuperAgent Setup</span>
          </div>
          {mode === 'full' && (
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-6 bg-[color:var(--brand-accent)]' : s < step ? 'w-2 bg-[color:var(--neon-constructive)]' : 'w-2 bg-brand-border-strong'}`} />
              ))}
            </div>
          )}
        </div>

        {/* Content Container (Scrollable) */}
        <div className="flex-1 px-7 py-5 overflow-y-auto pr-3 custom-scrollbar">
          
          {/* STEP 1: Welcome */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in text-left">
              <div>
                <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Welcome to SuperAgent</h1>
                <p className="text-brand-textMuted text-xs sm:text-sm mt-1">Configure your personal workspace settings.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-brand-textMuted">Your Name / Developer Tag</label>
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-brand-border bg-brand-inner-bg/40 focus-within:border-[color:var(--brand-accent)]">
                    <User size={16} className="text-brand-textMuted shrink-0" />
                    <input type="text" placeholder="e.g. Developer" value={ownerName} onChange={e => setOwnerName(e.target.value)} className="bg-transparent text-sm w-full outline-none text-brand-textMain placeholder:text-brand-textMuted/60" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-brand-textMuted">App Theme</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: 'dark', label: 'Dark Mode', Icon: Moon },
                      { id: 'light', label: 'Light Mode', Icon: Sun },
                      { id: 'system', label: 'System Default', Icon: Monitor }
                    ].map(t => (
                      <button key={t.id} type="button" onClick={() => setTheme(t.id as any)} className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer ${theme === t.id ? 'border-[color:var(--brand-accent-border)] bg-[color:var(--brand-accent-tint)] text-brand-textMain shadow-sm' : 'border-brand-border bg-brand-bg/40 hover:bg-brand-hover text-brand-textMuted'}`}>
                        <t.Icon size={18} />
                        <span className="text-xs font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Connect AI Providers */}
          {step === 2 && (
            <div className="space-y-3.5 animate-fade-in text-left">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-outfit text-xl sm:text-2xl font-semibold tracking-tight text-brand-textMain">Connect AI Providers</h1>
                  <p className="text-brand-textMuted text-xs">Configure any local or cloud AI providers below and test them to discover models.</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={scanLocalProviders} disabled={scanningLocal} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-border bg-brand-bg/60 text-xs font-medium text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors disabled:opacity-50 cursor-pointer">
                    <RefreshCw size={11} className={scanningLocal ? 'animate-spin' : ''} /> Scan Local
                  </button>
                  <button type="button" onClick={addCustomProvider} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-border bg-brand-bg/60 text-xs font-medium text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer">
                    <Plus size={12} /> Add Custom
                  </button>
                </div>
              </div>

              {/* Search & Categories */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brand-border bg-brand-inner-bg/50 focus-within:border-[color:var(--brand-accent)]">
                  <Search size={13} className="text-brand-textMuted shrink-0" />
                  <input type="text" placeholder="Search providers (DeepSeek, Ollama, Groq, Claude, OpenAI...)" value={providerSearch} onChange={e => setProviderSearch(e.target.value)} className="w-full bg-transparent text-xs text-brand-textMain outline-none placeholder:text-brand-textMuted/60" />
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
                  {[ {id: 'all', label: 'All Providers'}, {id: 'local', label: 'Local & Offline'}, {id: 'open', label: 'Open-Weight / Fast'}, {id: 'cloud', label: 'Cloud APIs'}, {id: 'custom', label: 'Custom'} ].map(cat => (
                    <button key={cat.id} type="button" onClick={() => setProviderCategory(cat.id as any)} className={`px-2.5 py-0.5 rounded-lg border whitespace-nowrap font-medium transition-colors cursor-pointer ${providerCategory === cat.id ? 'border-[color:var(--brand-accent-border)] bg-[color:var(--brand-accent-tint)] text-brand-textMain' : 'border-brand-border/60 bg-brand-bg/40 text-brand-textMuted hover:text-brand-textMain'}`}>{cat.label}</button>
                  ))}
                </div>
              </div>

              {/* Provider List */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
                {filteredProviders.map(p => {
                  const isLocal = p.id === 'ollama' || p.id === 'omniroute';
                  const isReady = p.status === 'connected';

                  return (
                    <div key={p.id} className={`rounded-xl border transition-all ${isReady ? 'border-emerald-500/30 bg-emerald-500/5' : p.expanded ? 'border-brand-accent/40 bg-brand-bg/40' : 'border-brand-border/70 bg-brand-bg/20 hover:border-brand-border'}`}>
                      <div onClick={() => setProviderList(prev => prev.map(item => item.id === p.id ? { ...item, expanded: !item.expanded } : item))} className="flex items-center justify-between p-3 cursor-pointer select-none">
                        <div className="flex items-center gap-2.5">
                          <ProviderLogo providerId={p.id} size={24} />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-brand-textMain">{p.name}</span>
                              {p.category === 'local' && <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono">Offline</span>}
                              {p.category === 'open' && <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 font-mono">Open</span>}
                            </div>
                            <span className="text-[10px] text-brand-textMuted block line-clamp-1">{p.statusMessage || p.desc}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.status === 'connected' && <span className="flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><CheckCircle2 size={10} /> Connected ({p.models.length})</span>}
                          {p.apiKey.trim() && p.status !== 'connected' && <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-brand-accent/15 text-brand-accent border border-brand-accent/30">Ready to Test</span>}
                          {p.expanded ? <ChevronDown size={14} className="text-brand-textMuted" /> : <ChevronRight size={14} className="text-brand-textMuted" />}
                        </div>
                      </div>

                      {p.expanded && (
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-brand-border/40">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-brand-textMuted uppercase">Endpoint URL</label>
                            <input type="text" value={p.url} placeholder={p.defaultUrl || 'http://localhost:8000/v1'} onChange={e => setProviderList(prev => prev.map(item => item.id === p.id ? { ...item, url: e.target.value } : item))} className="w-full px-2.5 py-1.5 rounded-lg border border-brand-border bg-brand-inner-bg/60 text-xs font-mono outline-none text-brand-textMain focus:border-[color:var(--brand-accent)]" />
                          </div>

                          {!isLocal ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-semibold text-brand-textMuted uppercase">API Key</label>
                                <button type="button" onClick={() => testProvider(p.id)} disabled={p.status === 'testing' || !p.apiKey.trim()} className="text-xs font-semibold text-[color:var(--brand-accent)] hover:underline disabled:opacity-40 cursor-pointer flex items-center gap-1">
                                  {p.status === 'testing' ? <RefreshCw size={10} className="animate-spin" /> : null} Test &amp; Fetch Models
                                </button>
                              </div>
                              <input type="password" placeholder="Enter API Key / Token..." value={p.apiKey} onChange={e => setProviderList(prev => prev.map(item => item.id === p.id ? { ...item, apiKey: e.target.value, status: 'idle', statusMessage: undefined } : item))} className="w-full px-2.5 py-1.5 rounded-lg border border-brand-border bg-brand-inner-bg/60 text-xs font-mono outline-none text-brand-textMain focus:border-[color:var(--brand-accent)]" />
                            </div>
                          ) : (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] text-brand-textMuted">Local self-hosted runner (no external key required)</span>
                              <button type="button" onClick={() => testProvider(p.id)} disabled={p.status === 'testing'} className="px-3 py-1 rounded-lg bg-[color:var(--brand-accent)] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer">
                                {p.status === 'testing' ? 'Testing...' : 'Test & Scan'}
                              </button>
                            </div>
                          )}

                          {p.models.length > 0 && (
                            <div className="pt-1.5 border-t border-brand-border/30">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-semibold text-brand-textMuted uppercase">
                                  Models ({p.models.filter(m => m.enabled).length}/{p.models.length} active)
                                </span>
                                <span className="text-[9px] text-brand-textMuted">Click to toggle</span>
                              </div>
                              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
                                {p.models.map(m => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => toggleProviderModel(p.id, m.id)}
                                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer font-mono flex items-center gap-1 ${
                                      m.enabled
                                        ? 'bg-[color:var(--brand-accent)]/15 border-[color:var(--brand-accent)]/40 text-[color:var(--brand-accent)] font-medium'
                                        : 'bg-brand-bg/50 border-brand-border/40 text-brand-textMuted hover:text-brand-textMain opacity-60'
                                    }`}
                                    title={m.enabled ? 'Enabled (click to disable)' : 'Disabled (click to enable)'}
                                  >
                                    {m.enabled && <Check size={10} className="shrink-0" />}
                                    <span>{m.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Telegram Integration */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in text-left">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                  <Send size={15} />
                </div>
                <div>
                  <h1 className="font-outfit text-xl font-semibold tracking-tight text-brand-textMain">Telegram Integration</h1>
                  <p className="text-brand-textMuted text-xs">Receive task summaries and approve actions on mobile.</p>
                </div>
              </div>

              {telegramVerified && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-brand-textMain">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={13} /> Bot Connected Successfully</div>
                  <div className="mt-0.5">Verified as <strong>{telegramVerified.botName}</strong> {telegramVerified.username && <span className="text-sky-400">({telegramVerified.username})</span>}</div>
                </div>
              )}

              {telegramError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400 flex items-center gap-1.5">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{telegramError}</span>
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-brand-border bg-brand-bg/30 p-3.5">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-brand-textMuted">Telegram Bot Token (Optional)</label>
                  <div className="relative">
                    <input type={telegramShowToken ? 'text' : 'password'} placeholder="123456789:ABC-DEF1234..." value={telegramToken} onChange={e => { setTelegramToken(e.target.value); setTelegramVerified(null); setTelegramError(null); }} className="w-full px-2.5 py-1.5 pr-8 rounded-lg border border-brand-border bg-brand-inner-bg/60 text-xs font-mono outline-none text-brand-textMain" />
                    <button type="button" onClick={() => setTelegramShowToken(!telegramShowToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-textMuted cursor-pointer">
                      {telegramShowToken ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-brand-textMuted">Target Chat ID (Optional)</label>
                  <input type="text" placeholder="e.g. 12345678 or @my_channel" value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-brand-border bg-brand-inner-bg/60 text-xs font-mono outline-none text-brand-textMain" />
                </div>

                <div className="pt-1 flex items-center justify-between border-t border-brand-border/40">
                  <button type="button" onClick={() => { setTelegramSkipped(true); handleNext(); }} className="text-xs text-brand-textMuted hover:text-brand-textMain cursor-pointer">
                    Skip Telegram setup →
                  </button>
                  <button type="button" onClick={handleTestTelegram} disabled={telegramTesting || !telegramToken.trim()} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[color:var(--brand-accent)] text-white text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer">
                    {telegramTesting ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                    {telegramTesting ? 'Testing...' : 'Test & Verify'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Preferences (Scrollable) */}
          {step === 4 && (
            <div className="space-y-4 animate-fade-in text-left">
              <div>
                <h1 className="font-outfit text-xl font-semibold tracking-tight text-brand-textMain">Configure Preferences</h1>
                <p className="text-brand-textMuted text-xs">Security boundaries, background daemon, and network access.</p>
              </div>

              <div className="space-y-3">
                {/* Safety & Sandboxing */}
                <div className="space-y-2 p-3 rounded-xl border border-brand-border bg-brand-bg/30">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-brand-textMain">Execution Safety &amp; Sandboxing</span>
                  </div>
                  <div className="space-y-2 pt-1">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={confirmShellCommands} onChange={e => setConfirmShellCommands(e.target.checked)} className="mt-0.5 rounded accent-[color:var(--brand-accent)]" />
                      <div>
                        <span className="text-xs text-brand-textMain font-medium block">Prompt before executing terminal commands</span>
                        <span className="text-[10px] text-brand-textMuted block">Manual confirmation before scripts execute on your machine.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={unsandboxedActions} onChange={e => setUnsandboxedActions(e.target.checked)} className="mt-0.5 rounded accent-[color:var(--brand-accent)]" />
                      <div>
                        <span className="text-xs text-brand-textMain font-medium block">Full System Terminal Access</span>
                        <span className="text-[10px] text-brand-textMuted block">Off restricts the agent strictly to the project workspace directory.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={autoReviewPlan} onChange={e => setAutoReviewPlan(e.target.checked)} className="mt-0.5 rounded accent-[color:var(--brand-accent)]" />
                      <div>
                        <span className="text-xs text-brand-textMain font-medium block">Require Plan Review Before Modifying Files</span>
                        <span className="text-[10px] text-brand-textMuted block">Generates a plan artifact for review before code edits.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Background Service */}
                <div className="space-y-2 p-3 rounded-xl border border-brand-border bg-brand-bg/30">
                  <div className="flex items-center gap-2">
                    <Power size={16} className="text-[color:var(--brand-accent)]" />
                    <span className="text-xs font-semibold text-brand-textMain">Background Service &amp; OS Startup</span>
                  </div>
                  <p className="text-[11px] text-brand-textMuted">Keeps Web Server (<code className="font-mono text-brand-textMain">--serve</code>) and Artifacts micro-apps running.</p>
                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={runOnStartup} onChange={e => setRunOnStartup(e.target.checked)} className="rounded accent-[color:var(--brand-accent)]" />
                      <span className="text-xs text-brand-textMain font-medium">Launch background runtime on system startup</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={keepBackgroundAlive} onChange={e => setKeepBackgroundAlive(e.target.checked)} className="rounded accent-[color:var(--brand-accent)]" />
                      <span className="text-xs text-brand-textMain font-medium">Keep artifacts and server active when closing the window</span>
                    </label>
                  </div>
                </div>

                {/* Internet Access Level */}
                <div className="space-y-2 p-3 rounded-xl border border-brand-border bg-brand-bg/30">
                  <div className="flex items-center gap-2">
                    <Globe size={15} className="text-brand-textMuted" />
                    <span className="text-xs font-semibold text-brand-textMain">Internet Access Level</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { id: 'all' as const, label: 'Full Access', desc: 'Search & browsing', Icon: Globe },
                      { id: 'observation' as const, label: 'Observation', desc: 'Read-only web', Icon: Eye },
                      { id: 'none' as const, label: 'Air-Gapped', desc: 'Local & API only', Icon: Ban }
                    ].map(opt => (
                      <button key={opt.id} type="button" onClick={() => setInternetAccessLevel(opt.id)} className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${internetAccessLevel === opt.id ? 'border-[color:var(--brand-accent-border)] bg-[color:var(--brand-accent-tint)] text-brand-textMain' : 'border-brand-border bg-brand-bg/40 text-brand-textMuted'}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <opt.Icon size={14} className={internetAccessLevel === opt.id ? 'text-[color:var(--brand-accent)]' : ''} />
                          {internetAccessLevel === opt.id && <Check size={12} className="text-[color:var(--brand-accent)]" />}
                        </div>
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="text-[10px] text-brand-textMuted">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Complete / Summary */}
          {step === 5 && (
            <div className="flex flex-col items-center justify-center text-center space-y-4 py-4 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 size={28} />
              </div>
              <div>
                <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">SuperAgent is Ready!</h1>
                <p className="text-brand-textMuted text-xs max-w-sm mt-1">Your preferences and AI provider connections are saved.</p>
              </div>

              <div className="w-full max-w-md rounded-xl border border-brand-border bg-brand-bg/40 p-3.5 space-y-2 text-left text-xs text-brand-textMuted">
                <div className="flex justify-between"><span>User:</span><span className="font-semibold text-brand-textMain">{ownerName.trim() || 'SuperAgent User'}</span></div>
                <div className="flex justify-between"><span>Configured Providers:</span><span className="font-semibold text-brand-textMain">{configuredProviders.map(p => p.name.split(' ')[0]).join(', ') || 'None (Configure later in Settings)'}</span></div>
                <div className="flex justify-between"><span>Telegram:</span><span className="font-semibold text-brand-textMain">{telegramVerified ? `Connected (${telegramVerified.botName})` : telegramToken.trim() ? 'Configured' : 'Skipped'}</span></div>
                <div className="flex justify-between"><span>Safety:</span><span className="font-semibold text-brand-textMain">{confirmShellCommands ? 'Approval Prompt' : 'Autonomous'}</span></div>
                <div className="flex justify-between"><span>Background Daemon:</span><span className="font-semibold text-brand-textMain">{runOnStartup ? 'Enabled (--serve & artifacts)' : 'Manual'}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="border-t border-brand-border/60 px-7 py-3.5 bg-brand-bg/30 flex items-center justify-between shrink-0">
          <div>
            {step > 1 && mode === 'full' && (
              <button type="button" onClick={handleBack} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-all cursor-pointer">
                <ArrowLeft size={14} /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mode !== 'full' ? (
              <button type="button" onClick={handleFinish} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)] transition-all cursor-pointer font-outfit shadow-sm">
                Save &amp; Close <Check size={14} />
              </button>
            ) : step < totalSteps ? (
              <button type="button" onClick={handleNext} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)] transition-all cursor-pointer font-outfit shadow-sm">
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" onClick={handleFinish} className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)] transition-all cursor-pointer font-outfit shadow-sm">
                Enter Workspace <Check size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
