import http from 'http';
import https from 'https';

/** Helper to format numeric token count into human-readable contextLimit string (e.g. 2000000 -> '2M', 128000 -> '128k'). */
export function formatTokensLimit(num?: number | null): string | undefined {
  if (!num || num <= 0) return undefined;
  if (num >= 1_000_000) {
    const m = num / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (num >= 1_000) {
    const k = num / 1_000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(num);
}

/**
 * A model exposed by a provider.
 */
export interface DetectedModel {
  id: string;
  name: string;
  contextLimit?: string;
}

/**
 * A provider discovered on the host machine or via environment variables.
 * `type` mirrors the settings model: `env` (key from environment), `key`
 * (user-entered key) or `custom` (self-hosted endpoint such as Ollama).
 */
export interface DetectedProvider {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
  models: DetectedModel[];
}

/** Declarative description of a cloud provider that is keyed via env vars. */
interface EnvProviderSpec {
  id: string;
  name: string;
  envKey: string;
  modelsUrl: string;
  authHeader: (key: string) => Record<string, string>;
  parseModels: (data: any) => DetectedModel[];
}

/**
 * ProviderAutoDetector — shared provider discovery used by Desktop and Web.
 *
 * Previously this logic was duplicated between the desktop backend and
 * the Express server. It now lives in `@superagent/core` so both surfaces call
 * the exact same implementation (`ProviderAutoDetector.detect()`), keeping
 * behavior identical everywhere and removing duplication.
 *
 * Detection covers:
 *  - A local Ollama instance (http://localhost:11434)
 *  - Cloud providers whose API keys are present in the environment
 *    (OpenAI, DeepSeek, DeepInfra, Google Gemini)
 */
export class ProviderAutoDetector {
  /** Default local Ollama endpoint. */
  private static readonly OLLAMA_URL = 'http://localhost:11434';
  /** Default local OmniRoute endpoint. */
  private static readonly OMNIROUTE_URL = 'http://127.0.0.1:20128/v1';
  /** Network timeout for detection probes (ms). */
  private static readonly TIMEOUT_MS = 5000;

  /** Cloud providers discovered via environment variables. */
  private static readonly ENV_PROVIDERS: EnvProviderSpec[] = [
    {
      id: 'chatgpt',
      name: 'OpenAI (ChatGPT)',
      envKey: 'OPENAI_API_KEY',
      modelsUrl: 'https://api.openai.com/v1/models',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d) => (d?.data ?? []).map((m: any) => ({
        id: m.id,
        name: m.id,
        contextLimit: m.context_window || m.context_length ? formatTokensLimit(m.context_window || m.context_length) : undefined
      }))
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      envKey: 'DEEPSEEK_API_KEY',
      modelsUrl: 'https://api.deepseek.com/models',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d) => (d?.data ?? []).map((m: any) => ({
        id: m.id,
        name: m.id,
        contextLimit: m.context_window || m.context_length ? formatTokensLimit(m.context_window || m.context_length) : undefined
      }))
    },
    {
      id: 'deepinfra',
      name: 'DeepInfra',
      envKey: 'DEEPINFRA_API_KEY',
      modelsUrl: 'https://api.deepinfra.com/v1/models',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d) => {
        const list = Array.isArray(d) ? d : (d?.data ?? []);
        return list.map((m: any) => {
          const rawCtx = m.context_length ?? m.max_tokens ?? m.context_window;
          return {
            id: m.model_name ?? m.id,
            name: m.model_name ?? m.id,
            contextLimit: rawCtx ? formatTokensLimit(rawCtx) : undefined
          };
        });
      }
    },
    {
      id: 'groq',
      name: 'Groq',
      envKey: 'GROQ_API_KEY',
      modelsUrl: 'https://api.groq.com/openai/v1/models',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d) => (d?.data ?? []).map((m: any) => ({
        id: m.id,
        name: m.id,
        contextLimit: m.context_window ? formatTokensLimit(m.context_window) : undefined
      }))
    },
    {
      id: 'google',
      name: 'Google Gemini',
      envKey: 'GEMINI_API_KEY',
      modelsUrl: '', // Gemini passes the key as a query param — handled specially below.
      authHeader: () => ({}),
      parseModels: (d) =>
        (d?.models ?? []).map((m: any) => ({
          id: String(m.name).replace('models/', ''),
          name: m.displayName ?? m.name,
          contextLimit: m.inputTokenLimit ? formatTokensLimit(m.inputTokenLimit) : undefined
        }))
    }
  ];

  /**
   * Performs a lightweight GET request and parses the JSON body.
   * Resolves `null` on any network/parse error so callers can skip silently.
   */
  private static fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve) => {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(this.TIMEOUT_MS, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /** Probes the local Ollama daemon and returns it as a provider (or null). */
  private static async detectOllama(): Promise<DetectedProvider | null> {
    const data = await this.fetchJson(`${this.OLLAMA_URL}/api/tags`);
    if (!data?.models?.length) return null;
    return {
      id: 'ollama',
      name: 'Ollama (Local)',
      type: 'custom',
      apiKey: '',
      baseUrl: this.OLLAMA_URL,
      models: (data.models as any[]).map((m: any) => ({ id: m.name, name: m.name }))
    };
  }

  /** Probes the local OmniRoute instance and returns it as a provider (or null). */
  private static async detectOmniRoute(): Promise<DetectedProvider | null> {
    const data = await this.fetchJson(`${this.OMNIROUTE_URL}/models`);
    if (!data?.data?.length) return null;
    return {
      id: 'omniroute',
      name: 'OmniRoute Local',
      type: 'custom',
      apiKey: '',
      baseUrl: this.OMNIROUTE_URL,
      models: (data.data as any[]).map((m: any) => ({ id: m.id, name: m.id }))
    };
  }

  /** Resolves a single env-keyed cloud provider, or null if unavailable. */
  private static async detectEnvProvider(spec: EnvProviderSpec): Promise<DetectedProvider | null> {
    const apiKey = process.env[spec.envKey];
    if (!apiKey) return null;

    const data =
      spec.id === 'google'
        ? await this.fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
        : await this.fetchJson(spec.modelsUrl, spec.authHeader(apiKey));

    if (!data) return null;
    const models = spec.parseModels(data);
    if (!models.length) return null;

    return { id: spec.id, name: spec.name, type: 'env', apiKey, baseUrl: '', models };
  }

  /**
   * Detects all available providers (local + env cloud keys).
   * Probes run in parallel; unavailable providers are omitted.
   */
  public static async detect(): Promise<DetectedProvider[]> {
    const probes: Promise<DetectedProvider | null>[] = [
      this.detectOllama(),
      this.detectOmniRoute(),
      ...this.ENV_PROVIDERS.map((spec) => this.detectEnvProvider(spec))
    ];
    const results = await Promise.all(probes);
    return results.filter((p): p is DetectedProvider => p !== null);
  }
}
