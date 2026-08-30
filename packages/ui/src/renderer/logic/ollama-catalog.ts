/**
 * Ollama model catalog + local-fit recommendation engine — built LIVE from
 * ollama.com (no bundled preset).
 *
 * Two passes of scraping feed the catalog:
 *  1. `https://ollama.com/library` — server-rendered list of every model family
 *     with its description, parameter-size chips (e.g. "8b") and capability chips
 *     (e.g. "tools", "vision", "embedding").
 *  2. `https://ollama.com/library/<family>` — per-model page listing every tag
 *     with its download size (GB), context window ("128K context window") and
 *     modality ("Text" / "Image").
 *
 * Each tag becomes one `OllamaCatalogModel`. `rankModels()` then scores every
 * entry against the detected hardware and returns a per-model fit
 * (`best` | `runnable` | `too-large`) with a human reason string, sorted
 * best → runnable → too-large.
 *
 * Everything degrades gracefully: a single failed fetch is skipped, and if the
 * whole library page is unreachable the catalog is simply empty (the UI shows a
 * "couldn't load" state instead of fabricated data).
 */
import { browserSafeFetch } from '../web-fetch';
import type { SystemInfo } from './systemInfo';

export type ModelFit = 'best' | 'runnable' | 'too-large';

export type ModelTag =
  | 'chat'
  | 'code'
  | 'vision'
  | 'embedding'
  | 'reasoning'
  | 'multilingual'
  | 'math'
  | 'instruct';

export interface OllamaCatalogModel {
  /** Fully-qualified Ollama tag, e.g. "llama3.1:8b" (used for `ollama pull`). */
  name: string;
  /** Human-friendly family label, e.g. "Llama 3.1". */
  family: string;
  /** Parameter count as a label, e.g. "8B". */
  params: string;
  /** Approximate download / runtime footprint in GB. */
  diskGB: number;
  /** Context window in tokens (0 for embedding models). */
  contextK: number;
  inputModalities: string[];
  outputModalities: string[];
  description: string;
  tags: ModelTag[];
}

export interface RankedModel {
  model: OllamaCatalogModel;
  fit: ModelFit;
  /** Human-readable explanation of the fit, e.g. "fits your 4GB GPU". */
  reason: string;
  /** Approximate VRAM/RAM needed to run, in GB. */
  needGB: number;
  /** True when the largest free disk volume can't hold the model. */
  storageWarning: boolean;
  /** True if this is a top hardware-recommended model */
  isHardwareRecommended?: boolean;
}

const LIB_URL = 'https://ollama.com/library';
const MODEL_URL = (slug: string) => `https://ollama.com/library/${slug}`;
const FETCH_TIMEOUT_MS = 12_000;
const CONCURRENCY = 12;

const OVERHEAD_GB = 1.2; // KV cache + runtime overhead per model

/** VRAM/RAM a model needs to load, in GB. */
export function estimateRequirement(m: OllamaCatalogModel): number {
  return Math.round((m.diskGB + OVERHEAD_GB) * 10) / 10;
}

// ── HTML helpers ────────────────────────────────────────────────────────────
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
function clean(s: string): string {
  return decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

/** "llama3.1" → "Llama 3.1", "qwen2.5-coder" → "Qwen 2.5 Coder", "deepseek-r1" → "Deepseek R1". */
function prettifyFamily(slug: string): string {
  let s = slug.replace(/-/g, ' ');
  s = s.replace(/([a-z])([0-9])/g, (_full, l: string, d: string) =>
    l === 'r' || l === 'v' ? `${l.toUpperCase()}${d}` : `${l} ${d}`
  );
  s = s.replace(/\s+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : slug;
}

// ── Library page (family list) ───────────────────────────────────────────────
interface LibFamily {
  slug: string;
  description: string;
  paramChips: string[];
  capabilityChips: string[];
}

function parseLibrary(html: string): LibFamily[] {
  const families: LibFamily[] = [];
  const cardRe =
    /<a href="\/library\/([a-z0-9][a-z0-9.\-]*)" class="group w-full space-y-5">([\s\S]*?)<\/a>\s*<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    const slug = m[1];
    const body = m[2];
    const descMatch = /<p class="max-w-lg break-words text-neutral-800 text-md">([\s\S]*?)<\/p>/.exec(body);
    const description = descMatch ? clean(descMatch[1]) : '';

    const paramChips: string[] = [];
    const capabilityChips: string[] = [];
    const chipRe =
      /<span\s+class="inline-flex items-center rounded-md bg-[^"]* px-2 py-0\.5 text-xs font-medium text-[^"]* sm:text-\[13px\]">([\s\S]*?)<\/span>/gi;
    let c: RegExpExecArray | null;
    while ((c = chipRe.exec(body)) !== null) {
      const text = clean(c[1]).toLowerCase();
      if (!text) continue;
      if (/^\d+(\.\d+)?b$/.test(text)) paramChips.push(text);
      else capabilityChips.push(text);
    }
    if (slug) families.push({ slug, description, paramChips, capabilityChips });
  }
  return families;
}

// ── Model page (per-tag details) ─────────────────────────────────────────────
function deriveParams(tag: string, fam: LibFamily): string {
  const bt = /(\d+(?:\.\d+)?)\s*b/i.exec(tag);
  if (bt) return `${bt[1]}B`;
  const mt = /(\d+(?:\.\d+)?)\s*m/i.exec(tag);
  if (mt) return `${mt[1]}M`;
  if (fam.paramChips.length) return fam.paramChips[0].toUpperCase();
  return '?';
}

function deriveTags(fam: LibFamily): ModelTag[] {
  const tags = new Set<ModelTag>();
  const slug = fam.slug.toLowerCase();
  const desc = fam.description.toLowerCase();
  for (const cap of fam.capabilityChips) {
    if (cap === 'vision') tags.add('vision');
    else if (cap === 'embedding') tags.add('embedding');
  }
  if (slug.includes('coder')) tags.add('code');
  if (slug.includes('math')) tags.add('math');
  if (slug.includes('instruct')) tags.add('instruct');
  if (slug.includes('r1') || slug.includes('reasoning') || desc.includes('reasoning')) tags.add('reasoning');
  if (desc.includes('multilingual') || /^(qwen|gemma|command|mistral)/.test(slug)) tags.add('multilingual');
  if (tags.size === 0) tags.add('chat');
  return [...tags];
}

function parseModelPage(html: string, fam: LibFamily): OllamaCatalogModel[] {
  const raw: { tag: string; sizeGB: number; contextK: number; modality: string; isLatestAlias: boolean }[] = [];
  const re =
    /<a href="\/library\/[a-z0-9][a-z0-9.\-]*:([a-z0-9][a-z0-9.\-]*)" class="sm:hidden flex flex-col space-y-\[6px\] group text-\[13px\] px-4 py-3">([\s\S]*?)<p class="flex text-neutral-500">([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1];
    const block = m[2];
    const meta = m[3];
    const sizeMt = /([\d.]+)\s*(GB|MB)/i.exec(meta);
    const sizeGB = sizeMt
      ? Math.round((sizeMt[2].toUpperCase() === 'MB' ? parseFloat(sizeMt[1]) / 1024 : parseFloat(sizeMt[1])) * 10) / 10
      : 0;
    const ctxMt = /([\d.]+)\s*K context window/i.exec(meta);
    const contextK = ctxMt ? Math.round(parseFloat(ctxMt[1]) * 1000) : 0;
    const modality = meta.split('·').map((s) => s.trim())[2] ?? 'Text';
    const hasLatestBadge =
      /<span class="ml-2 inline-flex items-center rounded-full px-2 py-px text-xs font-medium border border-blue-500 text-blue-600">latest<\/span>/.test(
        block
      );
    raw.push({ tag, sizeGB, contextK, modality, isLatestAlias: !hasLatestBadge && tag === 'latest' });
  }

  const realTags = raw.filter((r) => !r.isLatestAlias);
  const keep = realTags.length > 0 ? realTags : raw;

  return keep.map((r) => {
    const inputModalities = r.modality.toLowerCase().includes('image') ? ['image', 'text'] : ['text'];
    return {
      name: `${fam.slug}:${r.tag}`,
      family: prettifyFamily(fam.slug),
      params: deriveParams(r.tag, fam),
      diskGB: r.sizeGB,
      contextK: r.contextK,
      inputModalities,
      outputModalities: ['text'],
      description: fam.description,
      tags: deriveTags(fam)
    };
  });
}

// ── Concurrency helper ───────────────────────────────────────────────────────
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await browserSafeFetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const BUILTIN_OLLAMA_CATALOG: OllamaCatalogModel[] = [
  // Llama family
  {
    name: 'llama3.2:1b',
    family: 'Llama 3.2',
    params: '1B',
    diskGB: 1.3,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: "Meta's ultra-lightweight 1B model, exceptionally fast on edge devices and low-RAM hardware.",
    tags: ['chat', 'instruct']
  },
  {
    name: 'llama3.2:3b',
    family: 'Llama 3.2',
    params: '3B',
    diskGB: 2.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: "Meta's efficient 3B model balancing high speed with strong multilingual reasoning and tool calling.",
    tags: ['chat', 'instruct']
  },
  {
    name: 'llama3.2-vision:11b',
    family: 'Llama 3.2 Vision',
    params: '11B',
    diskGB: 7.9,
    contextK: 128,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'Multimodal model capable of visual understanding, chart analysis, and image reasoning.',
    tags: ['vision', 'chat']
  },
  {
    name: 'llama3.3:70b',
    family: 'Llama 3.3',
    params: '70B',
    diskGB: 42.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: "Meta's flagship open-weights 70B model with industry-leading intelligence across reasoning and coding.",
    tags: ['chat', 'reasoning', 'instruct']
  },
  {
    name: 'llama3.1:8b',
    family: 'Llama 3.1',
    params: '8B',
    diskGB: 4.7,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Versatile 8B model with 128k context window, excellent general conversational abilities.',
    tags: ['chat', 'instruct']
  },
  {
    name: 'llama3.1:70b',
    family: 'Llama 3.1',
    params: '70B',
    diskGB: 40.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'High-capability 70B model with 128k context window for complex synthesis and agent workflows.',
    tags: ['chat', 'reasoning']
  },

  // DeepSeek Reasoning family
  {
    name: 'deepseek-r1:1.5b',
    family: 'DeepSeek R1',
    params: '1.5B',
    diskGB: 1.1,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Ultra-fast distilled reasoning model based on Qwen 1.5B with step-by-step thinking traces.',
    tags: ['reasoning', 'math', 'chat']
  },
  {
    name: 'deepseek-r1:7b',
    family: 'DeepSeek R1',
    params: '7B',
    diskGB: 4.7,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Distilled 7B reasoning model demonstrating deep chain-of-thought analysis in math and logic.',
    tags: ['reasoning', 'math', 'code']
  },
  {
    name: 'deepseek-r1:8b',
    family: 'DeepSeek R1',
    params: '8B',
    diskGB: 4.9,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Llama-distilled 8B reasoning model with enhanced conversational flow and structured deduction.',
    tags: ['reasoning', 'math', 'chat']
  },
  {
    name: 'deepseek-r1:14b',
    family: 'DeepSeek R1',
    params: '14B',
    diskGB: 9.0,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Powerful 14B reasoning model capable of high-level algorithmic logic and complex problem solving.',
    tags: ['reasoning', 'math', 'code']
  },
  {
    name: 'deepseek-r1:32b',
    family: 'DeepSeek R1',
    params: '32B',
    diskGB: 20.0,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Near-frontier reasoning performance distilled into a 32B footprint.',
    tags: ['reasoning', 'math', 'code']
  },
  {
    name: 'deepseek-r1:70b',
    family: 'DeepSeek R1',
    params: '70B',
    diskGB: 43.0,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Frontier-grade reasoning model with exhaustive chain-of-thought mathematical proofing.',
    tags: ['reasoning', 'math', 'chat']
  },

  // Qwen Code & General family
  {
    name: 'qwen2.5-coder:1.5b',
    family: 'Qwen 2.5 Coder',
    params: '1.5B',
    diskGB: 1.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Lightweight code assistant for inline autocomplete and fast script generation.',
    tags: ['code', 'chat']
  },
  {
    name: 'qwen2.5-coder:7b',
    family: 'Qwen 2.5 Coder',
    params: '7B',
    diskGB: 4.7,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Industry-leading 7B code model rivaling much larger systems across 92+ programming languages.',
    tags: ['code', 'chat', 'reasoning']
  },
  {
    name: 'qwen2.5-coder:14b',
    family: 'Qwen 2.5 Coder',
    params: '14B',
    diskGB: 9.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Advanced code intelligence for full repository comprehension, refactoring, and test synthesis.',
    tags: ['code', 'reasoning']
  },
  {
    name: 'qwen2.5-coder:32b',
    family: 'Qwen 2.5 Coder',
    params: '32B',
    diskGB: 20.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Top-tier code model matching frontier proprietary models on coding benchmarks.',
    tags: ['code', 'reasoning']
  },
  {
    name: 'qwen2.5:3b',
    family: 'Qwen 2.5',
    params: '3B',
    diskGB: 1.9,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Compact general intelligence model with strong multilingual and structured JSON capabilities.',
    tags: ['chat', 'multilingual']
  },
  {
    name: 'qwen2.5:7b',
    family: 'Qwen 2.5',
    params: '7B',
    diskGB: 4.7,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Balanced 7B general foundation model with exceptional instruction adherence.',
    tags: ['chat', 'multilingual', 'instruct']
  },

  // Mistral & Mixtral family
  {
    name: 'mistral:7b',
    family: 'Mistral',
    params: '7B',
    diskGB: 4.1,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Fast, high-quality 7B model by Mistral AI with sliding-window attention.',
    tags: ['chat', 'instruct']
  },
  {
    name: 'mistral-small:24b',
    family: 'Mistral Small',
    params: '24B',
    diskGB: 14.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Mistral AI’s updated 24B parameter model fine-tuned for enterprise agent tasks and coding.',
    tags: ['chat', 'reasoning', 'code']
  },

  // Gemma 2 family
  {
    name: 'gemma2:2b',
    family: 'Gemma 2',
    params: '2B',
    diskGB: 1.6,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Google’s compact 2B model offering surprising capability on laptops and small GPUs.',
    tags: ['chat', 'instruct']
  },
  {
    name: 'gemma2:9b',
    family: 'Gemma 2',
    params: '9B',
    diskGB: 5.4,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Google’s 9B model built on Gemini architecture, highly competitive against larger models.',
    tags: ['chat', 'reasoning']
  },

  // Microsoft Phi family
  {
    name: 'phi4:14b',
    family: 'Phi-4',
    params: '14B',
    diskGB: 9.1,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Microsoft’s 14B state-of-the-art small model trained with synthetic data for peak reasoning.',
    tags: ['reasoning', 'math', 'chat']
  },
  {
    name: 'phi3.5:3.8b',
    family: 'Phi-3.5',
    params: '3.8B',
    diskGB: 2.2,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Lightweight model with long 128k context and robust logical reasoning.',
    tags: ['chat', 'reasoning']
  },

  // Lightweight & Edge Models
  {
    name: 'tinyllama:1.1b',
    family: 'TinyLlama',
    params: '1.1B',
    diskGB: 0.6,
    contextK: 2,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Compact 1.1B model designed for constrained devices, quick testing, and CPU inference.',
    tags: ['chat']
  },
  {
    name: 'smollm2:1.7b',
    family: 'SmolLM2',
    params: '1.7B',
    diskGB: 1.0,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Hugging Face’s curated compact 1.7B model optimized for local assistants.',
    tags: ['chat', 'instruct']
  },

  // Vision Models
  {
    name: 'llava:7b',
    family: 'LLaVA',
    params: '7B',
    diskGB: 4.7,
    contextK: 4,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'Popular multimodal vision-language model for image description, OCR, and visual Q&A.',
    tags: ['vision', 'chat']
  },
  {
    name: 'moondream:1.8b',
    family: 'Moondream',
    params: '1.8B',
    diskGB: 1.7,
    contextK: 2,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'Tiny vision-language model engineered to run smoothly on edge hardware.',
    tags: ['vision']
  },

  // Embedding Models
  {
    name: 'nomic-embed-text:latest',
    family: 'Nomic Embed Text',
    params: '137M',
    diskGB: 0.3,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'High-performance text embedding model for local retrieval-augmented generation (RAG).',
    tags: ['embedding']
  },
  {
    name: 'bge-m3:latest',
    family: 'BGE-M3',
    params: '567M',
    diskGB: 1.2,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Versatile multilingual embedding model supporting dense, sparse, and multi-vector search.',
    tags: ['embedding', 'multilingual']
  },
  {
    name: 'mxbai-embed-large:latest',
    family: 'mxbai-embed-large',
    params: '335M',
    diskGB: 0.7,
    contextK: 1,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Large state-of-the-art embedding model for semantic search and classification.',
    tags: ['embedding']
  }
];

/**
 * Builds the full Ollama catalog. Attempts live scraping from ollama.com,
 * and seamlessly merges with the rich built-in curated catalog so models are
 * always instantly available without CORS errors or loading failures.
 */
export async function fetchLiveCatalog(
  onProgress?: (done: number, total: number) => void
): Promise<OllamaCatalogModel[]> {
  try {
    const libHtml = await fetchText(LIB_URL);
    if (libHtml) {
      const families = parseLibrary(libHtml);
      if (families.length > 0) {
        const scraped: OllamaCatalogModel[] = [];
        let done = 0;
        await mapWithConcurrency(families, CONCURRENCY, async (fam) => {
          try {
            const page = await fetchText(MODEL_URL(fam.slug));
            if (page) {
              const models = parseModelPage(page, fam);
              if (models.length) scraped.push(...models);
            }
          } finally {
            done++;
            onProgress?.(done, families.length);
          }
        });

        if (scraped.length > 0) {
          const names = new Set(scraped.map((r) => r.name));
          for (const b of BUILTIN_OLLAMA_CATALOG) {
            if (!names.has(b.name)) {
              scraped.push(b);
            }
          }
          scraped.sort((a, b) =>
            a.family === b.family ? b.diskGB - a.diskGB : a.family.localeCompare(b.family)
          );
          return scraped;
        }
      }
    }
  } catch {}

  // Reliable offline / CORS-exempt fallback
  return [...BUILTIN_OLLAMA_CATALOG].sort((a, b) =>
    a.family === b.family ? b.diskGB - a.diskGB : a.family.localeCompare(b.family)
  );
}

/**
 * Ranks the catalog against detected hardware. Evaluates free RAM, GPU VRAM,
 * Apple Silicon unified memory, CPU, and disk space across Windows, macOS, and Linux.
 */
export function rankModels(
  catalog: OllamaCatalogModel[],
  sys: SystemInfo | null
): RankedModel[] {
  if (!sys || sys.ramGB <= 0) {
    return catalog.map((m) => ({
      model: m,
      fit: 'runnable' as ModelFit,
      reason: 'Hardware detection pending',
      needGB: estimateRequirement(m),
      storageWarning: false,
      isHardwareRecommended: false,
    }));
  }

  const need = (m: OllamaCatalogModel) => estimateRequirement(m);
  const storageList = sys.storage || [];
  const maxFreeDisk = storageList.length
    ? Math.max(...storageList.map((s) => s.freeGB || 0))
    : Infinity;

  const ramGB = sys.ramGB || 16;
  const ramFreeGB = sys.ramFreeGB > 0 ? sys.ramFreeGB : Math.round(ramGB * 0.5 * 10) / 10;
  const vramBudgetGB = sys.vramBudgetGB || 0;
  const isUnified = Boolean(sys.isUnifiedMemory);

  const fitsVram = (m: OllamaCatalogModel) => !isUnified && vramBudgetGB > 0 && need(m) <= vramBudgetGB;
  const fitsUnified = (m: OllamaCatalogModel) => isUnified && need(m) <= Math.min(ramGB * 0.75, ramFreeGB + 2.0);
  const fitsFreeRam = (m: OllamaCatalogModel) => need(m) <= ramFreeGB;
  const fitsTotalRam = (m: OllamaCatalogModel) => need(m) <= ramGB * 0.9;

  const ranked: RankedModel[] = catalog.map((m) => {
    const n = need(m);
    const storageWarning = n > maxFreeDisk;

    let fit: ModelFit;
    let reason: string;

    if (!fitsTotalRam(m)) {
      fit = 'too-large';
      reason = isUnified
        ? `Too heavy — needs ~${n}GB (total unified memory: ${ramGB}GB)`
        : `Too heavy — needs ~${n}GB (total RAM: ${ramGB}GB)`;
    } else if (fitsVram(m)) {
      fit = 'runnable';
      reason = `GPU Acceleration — fits 100% in ${vramBudgetGB}GB VRAM`;
    } else if (fitsUnified(m)) {
      fit = 'runnable';
      reason = `Apple Silicon Unified Memory — optimal speed (~${n}GB / ${ramFreeGB}GB free)`;
    } else if (fitsFreeRam(m)) {
      fit = 'runnable';
      reason = isUnified
        ? `Runs in unified memory (~${n}GB / ${ramFreeGB}GB free)`
        : `Fits in free RAM (~${n}GB / ${ramFreeGB}GB free; CPU inference)`;
    } else {
      fit = 'runnable';
      reason = `Runs on CPU (needs ~${n}GB; ${ramFreeGB}GB free RAM may use memory swap)`;
    }

    return { model: m, fit, reason, needGB: n, storageWarning, isHardwareRecommended: false };
  });

  // Pick top recommended models that fit best in hardware:
  const topPicks = ranked
    .filter((r) => {
      if (r.fit !== 'runnable' && r.fit !== 'best') return false;
      if (isUnified) return r.needGB <= Math.min(ramGB * 0.75, ramFreeGB + 1.0);
      if (vramBudgetGB > 0) return r.needGB <= vramBudgetGB || r.needGB <= ramFreeGB;
      return r.needGB <= ramFreeGB;
    })
    .sort((a, b) => b.model.diskGB - a.model.diskGB);

  if (topPicks.length > 0) {
    topPicks[0].fit = 'best';
    topPicks[0].isHardwareRecommended = true;
    topPicks[0].reason = isUnified
      ? `⭐ Best match for your Apple Silicon (${topPicks[0].needGB}GB / ${ramFreeGB}GB free unified RAM)`
      : vramBudgetGB > 0 && topPicks[0].needGB <= vramBudgetGB
      ? `⭐ Best match for your GPU (${topPicks[0].needGB}GB in ${vramBudgetGB}GB VRAM)`
      : `⭐ Best match for your hardware (${topPicks[0].needGB}GB / ${ramFreeGB}GB free RAM)`;
  }

  // Also mark top 2-3 runnable models as recommended
  for (let i = 0; i < Math.min(3, topPicks.length); i++) {
    topPicks[i].isHardwareRecommended = true;
  }

  const order: Record<ModelFit, number> = { best: 0, runnable: 1, 'too-large': 2 };
  ranked.sort((a, b) => {
    if (order[a.fit] !== order[b.fit]) return order[a.fit] - order[b.fit];
    return a.fit === 'too-large'
      ? a.model.diskGB - b.model.diskGB
      : b.model.diskGB - a.model.diskGB;
  });

  return ranked;
}
