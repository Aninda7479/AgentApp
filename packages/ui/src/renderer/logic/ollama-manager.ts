/**
 * Ollama daemon manager — talks to a locally running Ollama instance over its
 * REST API (default http://localhost:11434). Used by the Local Model settings
 * page for install detection, listing, /api/show metadata, pull (with progress)
 * and delete.
 *
 * All requests go through `browserSafeFetch`, which is a privileged `fetch` in
 * the desktop shell (CORS-exempt, so localhost works) and proxies through the
 * server in the web build. Pull streaming relies on a real `Response.body`
 * ReadableStream, which exists in the desktop shell; the page degrades to a
 * non-streaming pull elsewhere.
 */
import { browserSafeFetch } from '../web-fetch';
import { getIpc } from '../lib/ipc';

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export interface OllamaStatusResult {
  installed: boolean;
  running: boolean;
  version?: string;
  path?: string;
  port?: number;
  baseUrl: string;
}

export interface OllamaSettingsConfig {
  baseUrl: string;
  defaultContextLimit: string;
  defaultTemperature: number;
  keepAlive: string;
  autoStart: boolean;
  gpuOffload?: string;
  modelContextOverrides?: Record<string, string>;
  modelTemperatureOverrides?: Record<string, number>;
}

export const DEFAULT_OLLAMA_SETTINGS: OllamaSettingsConfig = {
  baseUrl: DEFAULT_OLLAMA_URL,
  defaultContextLimit: '8k',
  defaultTemperature: 0.7,
  keepAlive: '5m',
  autoStart: true,
  gpuOffload: 'auto',
  modelContextOverrides: {},
  modelTemperatureOverrides: {},
};

export interface InstalledModel {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  parameterSize?: string;
  quantLevel?: string;
  family?: string;
  contextLimit?: string;
  temperature?: number;
  isRunning?: boolean;
  vramBytes?: number;
}

export interface RunningModelInfo {
  name: string;
  model: string;
  size: number;
  sizeVram: number;
  expiresAt: string;
}

export interface PullProgress {
  status: string;
  completed: number;
  total: number;
  /** 0..100, or -1 when total is unknown. */
  percent: number;
}

export interface ModelShowInfo {
  name: string;
  contextLimit?: string; // e.g. "128k"
  parameterSize?: string; // e.g. "7B"
  quantLevel?: string; // e.g. "Q4_K_M"
  family?: string;
  inputModalities: string[];
  outputModalities: string[];
}

function url(base?: string): string {
  return (base || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
}

/**
 * Checks whether Ollama is installed on disk and whether the service daemon is actively running.
 * Prioritizes native backend inspection (checking disk paths & binary existence) rather than merely port ping.
 */
export async function checkOllamaStatus(base?: string): Promise<OllamaStatusResult> {
  const currentUrl = url(base);
  let installed = false;
  let running = false;
  let version: string | undefined;
  let path: string | undefined;

  try {
    const ipc = getIpc();
    if (ipc) {
      const res = await ipc.invoke('ollama-status');
      if (res && typeof res === 'object') {
        installed = Boolean(res.installed);
        running = Boolean(res.running);
        version = res.version || undefined;
        path = res.path || undefined;
      }
    }
  } catch {
    /* fallback to REST check */
  }

  // Double check HTTP ping if running is false or not in desktop shell
  if (!running) {
    running = await isOllamaReachable(currentUrl);
    if (running) {
      installed = true; // if reachable, it must be installed
    }
  }

  if (running && !version) {
    try {
      const res = await browserSafeFetch(`${currentUrl}/api/version`);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.version) {
          version = String(data.version);
        }
      }
    } catch {}
  }

  return {
    installed,
    running,
    version,
    path,
    port: 11434,
    baseUrl: currentUrl,
  };
}

/**
 * Starts the local Ollama background service if installed.
 */
export async function startOllamaService(): Promise<{ success: boolean; running: boolean; error?: string }> {
  try {
    const ipc = getIpc();
    if (ipc) {
      const res = await ipc.invoke('ollama-start');
      if (res && typeof res === 'object') {
        return { success: Boolean(res.success), running: Boolean(res.running), error: res.error };
      }
    }
  } catch (err: any) {
    return { success: false, running: false, error: err.message || String(err) };
  }
  return { success: false, running: false, error: 'Could not invoke backend starter' };
}

/**
 * Loads Ollama engine settings from persistent store.
 */
export async function loadOllamaSettings(): Promise<OllamaSettingsConfig> {
  try {
    const ipc = getIpc();
    if (ipc) {
      const res = await ipc.invoke('ollama-settings-get');
      if (res && typeof res === 'object') {
        return {
          baseUrl: res.baseUrl || DEFAULT_OLLAMA_URL,
          defaultContextLimit: res.defaultContextLimit || '8k',
          defaultTemperature: typeof res.defaultTemperature === 'number' ? res.defaultTemperature : 0.7,
          keepAlive: res.keepAlive || '5m',
          autoStart: res.autoStart ?? true,
          gpuOffload: res.gpuOffload || 'auto',
          modelContextOverrides: res.modelContextOverrides || {},
          modelTemperatureOverrides: res.modelTemperatureOverrides || {},
        };
      }
      const fullSettings = await ipc.invoke('settings-read');
      if (fullSettings?.ollama) {
        return {
          ...DEFAULT_OLLAMA_SETTINGS,
          ...fullSettings.ollama,
        };
      }
    }
  } catch {}
  return DEFAULT_OLLAMA_SETTINGS;
}

/**
 * Saves Ollama engine settings to persistent store.
 */
export async function saveOllamaSettings(config: OllamaSettingsConfig): Promise<void> {
  try {
    const ipc = getIpc();
    if (ipc) {
      await ipc.invoke('ollama-settings-save', config);
      await ipc.invoke('settings-write', { ollama: config });
    }
  } catch (err) {
    console.error('[ollama-manager] Failed to save Ollama settings:', err);
  }
}

/** True when an Ollama daemon is reachable (responds to /api/version). */
export async function isOllamaReachable(base?: string): Promise<boolean> {
  try {
    const res = await browserSafeFetch(`${url(base)}/api/version`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Lists active running models in memory/VRAM via /api/ps. */
export async function listRunningModels(base?: string): Promise<RunningModelInfo[]> {
  try {
    const res = await browserSafeFetch(`${url(base)}/api/ps`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({ models: [] }));
    const models: any[] = data?.models ?? [];
    return models.map((m) => ({
      name: m.name || m.model || '',
      model: m.model || '',
      size: m.size || 0,
      sizeVram: m.size_vram || 0,
      expiresAt: m.expires_at || '',
    }));
  } catch {
    return [];
  }
}

/** Lists models currently installed in the local Ollama instance (via daemon HTTP or direct disk inspection). */
export async function listInstalled(base?: string): Promise<InstalledModel[]> {
  // 1. Try daemon HTTP endpoint if online
  try {
    const res = await browserSafeFetch(`${url(base)}/api/tags`);
    if (res.ok) {
      const data = await res.json().catch(() => ({ models: [] }));
      const models: any[] = data?.models ?? [];
      if (Array.isArray(models) && models.length > 0) {
        return models.map((m) => ({
          name: m.name,
          sizeBytes: m.size ?? 0,
          modifiedAt: m.modified_at ?? '',
          parameterSize: m.details?.parameter_size,
          quantLevel: m.details?.quantization_level,
          family: m.details?.family
        }));
      }
    }
  } catch {}

  // 2. If daemon is stopped or unreachable, fallback to native disk inspection via IPC!
  try {
    const ipc = getIpc();
    if (ipc) {
      const diskModels = await ipc.invoke('ollama-installed-models');
      if (Array.isArray(diskModels) && diskModels.length > 0) {
        return diskModels.map((m: any) => ({
          name: m.name,
          sizeBytes: m.sizeBytes ?? 0,
          modifiedAt: m.modifiedAt ?? '',
          parameterSize: m.parameterSize,
          quantLevel: m.quantLevel,
          family: m.family
        }));
      }
    }
  } catch {}

  return [];
}

const showModelCache = new Map<string, ModelShowInfo>();

function formatContext(tokens: number | undefined): string | undefined {
  if (!tokens || !Number.isFinite(tokens)) return undefined;
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/** Inferred modality from the model family / name (best-effort). */
function inferModalities(name: string): { input: string[]; output: string[] } {
  const n = name.toLowerCase();
  if (/llava|moondream|minicpm-v|phi3-vision|qwen.*vl|internvl/.test(n)) {
    return { input: ['text', 'image'], output: ['text'] };
  }
  return { input: ['text'], output: ['text'] };
}

/**
 * Fetches detailed metadata for an installed model via /api/show (cached).
 * If Ollama daemon is offline, falls back safely to inferred values.
 */
export async function showModel(name: string, base?: string): Promise<ModelShowInfo> {
  const cacheKey = `${url(base)}:${name}`;
  if (showModelCache.has(cacheKey)) {
    return showModelCache.get(cacheKey)!;
  }

  const modalities = inferModalities(name);

  try {
    const res = await browserSafeFetch(`${url(base)}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name })
    });

    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const modelInfo = data?.model_info ?? {};
      let contextTokens: number | undefined;
      for (const key of Object.keys(modelInfo)) {
        if (/context_length$/i.test(key) && Number.isFinite(modelInfo[key])) {
          contextTokens = modelInfo[key];
          break;
        }
      }

      const info: ModelShowInfo = {
        name,
        contextLimit: formatContext(contextTokens),
        parameterSize: data?.details?.parameter_size,
        quantLevel: data?.details?.quantization_level,
        family: data?.details?.family,
        inputModalities: modalities.input,
        outputModalities: modalities.output
      };
      showModelCache.set(cacheKey, info);
      return info;
    }
  } catch {}

  const fallbackInfo: ModelShowInfo = {
    name,
    contextLimit: undefined,
    parameterSize: undefined,
    quantLevel: undefined,
    family: undefined,
    inputModalities: modalities.input,
    outputModalities: modalities.output
  };
  showModelCache.set(cacheKey, fallbackInfo);
  return fallbackInfo;
}

/**
 * Pulls (downloads) a model. Calls `onProgress` for each streamed status line
 * that carries byte counts. Resolves when the final `success` status arrives.
 * Throws on network / API error.
 */
export async function pullModel(
  name: string,
  onProgress?: (p: PullProgress) => void,
  base?: string
): Promise<void> {
  const res = await browserSafeFetch(`${url(base)}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, stream: true })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama pull failed [${res.status}]: ${text}`);
  }

  // Streaming path (desktop shell): parse NDJSON lines from the body.
  const body: any = (res as any).body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const evt = JSON.parse(trimmed);
          const completed = Number(evt.completed) || 0;
          const total = Number(evt.total) || 0;
          const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : -1;
          onProgress?.({ status: evt.status ?? '', completed, total, percent });
          if (evt.status === 'success') return;
        } catch {
          /* partial line — ignore */
        }
      }
    }
    return;
  }

  // Non-streaming fallback (e.g. proxied web build): no progress detail.
  onProgress?.({ status: 'downloading', completed: 0, total: 0, percent: -1 });
}

/** Deletes a model from the local Ollama instance. */
export async function deleteModel(name: string, base?: string): Promise<void> {
  const res = await browserSafeFetch(`${url(base)}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama delete failed [${res.status}]: ${text}`);
  }
}
