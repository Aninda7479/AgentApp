/**
 * Ollama daemon manager — talks to a locally running Ollama instance over its
 * REST API (default http://localhost:11434). Used by the Local Model settings
 * page for install detection, listing, /api/show metadata, pull (with progress)
 * and delete.
 *
 * All requests go through `browserSafeFetch`, which is a privileged `fetch` in
 * the Electron shell (CORS-exempt, so localhost works) and proxies through the
 * server in the web build. Pull streaming relies on a real `Response.body`
 * ReadableStream, which exists in the Electron shell; the page degrades to a
 * non-streaming pull elsewhere.
 */
import { browserSafeFetch } from '../web-fetch';

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export interface InstalledModel {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  parameterSize?: string;
  quantLevel?: string;
  family?: string;
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

/** True when an Ollama daemon is reachable (responds to /api/version). */
export async function isOllamaReachable(base?: string): Promise<boolean> {
  try {
    const res = await browserSafeFetch(`${url(base)}/api/version`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Lists models currently installed in the local Ollama instance. */
export async function listInstalled(base?: string): Promise<InstalledModel[]> {
  try {
    const res = await browserSafeFetch(`${url(base)}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({ models: [] }));
    const models: any[] = data?.models ?? [];
    return models.map((m) => ({
      name: m.name,
      sizeBytes: m.size ?? 0,
      modifiedAt: m.modified_at ?? '',
      parameterSize: m.details?.parameter_size,
      quantLevel: m.details?.quantization_level,
      family: m.details?.family
    }));
  } catch {
    return [];
  }
}

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
 * Fetches detailed metadata for an installed model via /api/show. Pulls the
 * context length out of the `model_info` dict (key ends with `.context_length`)
 * and parameter/quant/family from `details`.
 */
export async function showModel(name: string, base?: string): Promise<ModelShowInfo> {
  const res = await browserSafeFetch(`${url(base)}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name })
  });
  if (!res.ok) throw new Error(`Ollama /api/show failed [${res.status}]`);
  const data: any = await res.json().catch(() => ({}));

  const modelInfo = data?.model_info ?? {};
  let contextTokens: number | undefined;
  for (const key of Object.keys(modelInfo)) {
    if (/context_length$/i.test(key) && Number.isFinite(modelInfo[key])) {
      contextTokens = modelInfo[key];
      break;
    }
  }

  const modalities = inferModalities(name);
  if (data?.details?.family) {
    // vision families may still be text-only models; keep the name-based hint.
  }

  return {
    name,
    contextLimit: formatContext(contextTokens),
    parameterSize: data?.details?.parameter_size,
    quantLevel: data?.details?.quantization_level,
    family: data?.details?.family,
    inputModalities: modalities.input,
    outputModalities: modalities.output
  };
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

  // Streaming path (Electron shell): parse NDJSON lines from the body.
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
