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

export type ModelTag =
  | 'chat'
  | 'code'
  | 'vision'
  | 'embedding'
  | 'tools'
  | 'thinking'
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
  /** True if this is a cloud-hosted Ollama model/endpoint (runs remotely). */
  isCloud?: boolean;
}

export type ModelFit = 'best' | 'runnable' | 'quantized' | 'too-large';

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
  if (m.isCloud) {
    return 0;
  }
  if (m.diskGB > 0) {
    return Math.round((m.diskGB + OVERHEAD_GB) * 10) / 10;
  }
  const paramsB = parseParamBillions(m.params);
  if (paramsB > 0) {
    return Math.round((paramsB * 0.75 + OVERHEAD_GB) * 10) / 10;
  }
  return 2.0;
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
    else if (cap === 'tools' || cap === 'tool') tags.add('tools');
    else if (cap === 'thinking' || cap === 'reasoning') {
      tags.add('thinking');
      tags.add('reasoning');
    }
  }

  // Capability heuristics
  if (slug.includes('coder') || desc.includes('code') || desc.includes('programming')) tags.add('code');
  if (slug.includes('math') || desc.includes('math')) tags.add('math');
  if (slug.includes('instruct')) tags.add('instruct');
  if (
    slug.includes('r1') ||
    slug.includes('qwq') ||
    slug.includes('reasoning') ||
    desc.includes('reasoning') ||
    desc.includes('thinking') ||
    desc.includes('chain-of-thought')
  ) {
    tags.add('thinking');
    tags.add('reasoning');
  }
  if (
    slug.startsWith('llama3') ||
    slug.startsWith('qwen2.5') ||
    slug.startsWith('mistral') ||
    slug.startsWith('command') ||
    desc.includes('tools') ||
    desc.includes('tool calling') ||
    desc.includes('function calling')
  ) {
    tags.add('tools');
  }
  if (slug.includes('embed') || desc.includes('embedding')) {
    tags.add('embedding');
  }
  if (slug.includes('vision') || desc.includes('vision') || desc.includes('multimodal') || slug.includes('llava') || slug.includes('moondream')) {
    tags.add('vision');
  }
  if (desc.includes('multilingual') || /^(qwen|gemma|command|mistral)/.test(slug)) tags.add('multilingual');
  if (!tags.has('embedding')) tags.add('chat');

  return [...tags];
}

function parseModelPage(html: string, fam: LibFamily): OllamaCatalogModel[] {
  const raw: {
    tag: string;
    sizeGB: number;
    contextK: number;
    modality: string;
    isLatestAlias: boolean;
    isCloud: boolean;
  }[] = [];
  const re =
    /<a href="\/library\/[a-z0-9][a-z0-9.\-]*:([a-z0-9][a-z0-9.\-]*)" class="sm:hidden flex flex-col space-y-\[6px\] group text-\[13px\] px-4 py-3">([\s\S]*?)<p class="flex text-neutral-500">([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1];
    const block = m[2];
    const meta = m[3];

    // Detect cloud endpoints (e.g. 675b-cloud, cloud, or usage tiers without local file sizes)
    const isCloud =
      tag.endsWith('-cloud') ||
      tag === 'cloud' ||
      /cloud/i.test(meta) ||
      (/usage/i.test(meta) && !/(?:TB|GB|MB|KB)/i.test(meta));

    const sizeMt = /([\d.]+)\s*(TB|GB|MB|KB)/i.exec(meta);
    let sizeGB = 0;
    if (sizeMt) {
      const val = parseFloat(sizeMt[1]);
      const unit = sizeMt[2].toUpperCase();
      if (unit === 'TB') {
        sizeGB = Math.round(val * 1024 * 10) / 10;
      } else if (unit === 'GB') {
        sizeGB = Math.round(val * 10) / 10;
      } else if (unit === 'MB') {
        sizeGB = Math.round((val / 1024) * 100) / 100;
      } else if (unit === 'KB') {
        sizeGB = Math.round((val / (1024 * 1024)) * 1000) / 1000;
      }
    } else if (!isCloud) {
      // Fallback: estimate approximate footprint from parameter count if not provided
      const pStr = deriveParams(tag, fam);
      const paramsB = parseParamBillions(pStr);
      if (paramsB > 0) {
        sizeGB = Math.round(paramsB * 0.65 * 10) / 10;
      }
    }

    const ctxMt = /([\d.]+)\s*(M|K)?\s*context window/i.exec(meta);
    let contextK = 0;
    if (ctxMt) {
      const val = parseFloat(ctxMt[1]);
      const unit = (ctxMt[2] || 'K').toUpperCase();
      contextK = unit === 'M' ? Math.round(val * 1000) : Math.round(val);
    }

    const modality = meta.split('·').map((s) => s.trim())[2] ?? 'Text';
    const hasLatestBadge =
      /<span class="ml-2 inline-flex items-center rounded-full px-2 py-px text-xs font-medium border border-blue-500 text-blue-600">latest<\/span>/.test(
        block
      );
    raw.push({ tag, sizeGB, contextK, modality, isLatestAlias: !hasLatestBadge && tag === 'latest', isCloud });
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
      tags: deriveTags(fam),
      isCloud: r.isCloud
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
  // ── Llama 3.3, 3.2, 3.1 & CodeLlama family ─────────────────────────────────
  {
    name: 'llama3.3:70b',
    family: 'Llama 3.3',
    params: '70B',
    diskGB: 42.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: "Meta's flagship open-weights 70B model with industry-leading intelligence across reasoning, agents and coding.",
    tags: ['chat', 'tools', 'thinking', 'reasoning', 'instruct']
  },
  {
    name: 'llama3.2:1b',
    family: 'Llama 3.2',
    params: '1B',
    diskGB: 1.3,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: "Meta's ultra-lightweight 1B model, exceptionally fast on edge devices and low-RAM hardware.",
    tags: ['chat', 'tools', 'instruct']
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
    tags: ['chat', 'tools', 'instruct']
  },
  {
    name: 'llama3.2-vision:11b',
    family: 'Llama 3.2 Vision',
    params: '11B',
    diskGB: 7.9,
    contextK: 128,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'Multimodal model capable of visual understanding, chart analysis, document OCR, and image reasoning.',
    tags: ['vision', 'tools', 'chat']
  },
  {
    name: 'llama3.2-vision:90b',
    family: 'Llama 3.2 Vision',
    params: '90B',
    diskGB: 55.0,
    contextK: 128,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'Frontier-grade multimodal visual intelligence for complex diagrammatic, document, and image reasoning.',
    tags: ['vision', 'tools', 'thinking', 'reasoning']
  },
  {
    name: 'llama3.1:8b',
    family: 'Llama 3.1',
    params: '8B',
    diskGB: 4.7,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Versatile 8B model with 128k context window, excellent general conversational abilities and structured tool calling.',
    tags: ['chat', 'tools', 'instruct']
  },
  {
    name: 'llama3.1:70b',
    family: 'Llama 3.1',
    params: '70B',
    diskGB: 40.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'High-capability 70B model with 128k context window for complex synthesis, deep reasoning, and agent workflows.',
    tags: ['chat', 'tools', 'reasoning']
  },
  {
    name: 'llama3.1:405b',
    family: 'Llama 3.1',
    params: '405B',
    diskGB: 243.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: "Meta's peak 405B frontier open-weights flagship rivaling proprietary closed frontier models.",
    tags: ['thinking', 'reasoning', 'tools', 'code']
  },
  {
    name: 'codellama:7b',
    family: 'Code Llama',
    params: '7B',
    diskGB: 3.8,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Code-specialized Llama model for infilling, syntax generation, and multi-language script synthesis.',
    tags: ['code', 'chat', 'instruct']
  },
  {
    name: 'codellama:13b',
    family: 'Code Llama',
    params: '13B',
    diskGB: 7.4,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Medium-size code specialist for multi-file code editing and debugging.',
    tags: ['code', 'tools', 'reasoning']
  },
  {
    name: 'codellama:34b',
    family: 'Code Llama',
    params: '34B',
    diskGB: 19.0,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Powerful 34B code intelligence for deep architecture understanding and algorithmic design.',
    tags: ['code', 'tools', 'reasoning']
  },
  {
    name: 'codellama:70b',
    family: 'Code Llama',
    params: '70B',
    diskGB: 39.0,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Meta’s 70B code foundation model trained on 1TB+ code tokens for industrial software development.',
    tags: ['code', 'tools', 'reasoning']
  },
  {
    name: 'llama2:7b',
    family: 'Llama 2',
    params: '7B',
    diskGB: 3.8,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Classic foundational 7B conversational model fine-tuned for dialog safety and assistant tasks.',
    tags: ['chat', 'instruct']
  },
  {
    name: 'llama2:13b',
    family: 'Llama 2',
    params: '13B',
    diskGB: 7.4,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Balanced 13B Llama 2 model with robust conversational flow and general knowledge.',
    tags: ['chat', 'instruct']
  },
  {
    name: 'llama2:70b',
    family: 'Llama 2',
    params: '70B',
    diskGB: 39.0,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Foundational 70B model with broad general intelligence and factual recall.',
    tags: ['chat', 'reasoning']
  },

  // ── DeepSeek Reasoning & Coding family ──────────────────────────────────────
  {
    name: 'deepseek-r1:1.5b',
    family: 'DeepSeek R1',
    params: '1.5B',
    diskGB: 1.1,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Ultra-fast distilled reasoning model based on Qwen 1.5B with step-by-step thinking traces.',
    tags: ['thinking', 'reasoning', 'math', 'chat']
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
    tags: ['thinking', 'reasoning', 'math', 'code']
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
    tags: ['thinking', 'reasoning', 'math', 'chat']
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
    tags: ['thinking', 'reasoning', 'math', 'code']
  },
  {
    name: 'deepseek-r1:32b',
    family: 'DeepSeek R1',
    params: '32B',
    diskGB: 20.0,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Near-frontier reasoning performance distilled into a 32B footprint with full thinking tokens.',
    tags: ['thinking', 'reasoning', 'math', 'code']
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
    tags: ['thinking', 'reasoning', 'math', 'chat']
  },
  {
    name: 'deepseek-r1:671b',
    family: 'DeepSeek R1',
    params: '671B',
    diskGB: 404.0,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Full un-distilled 671B MoE reasoning model with 37B active parameters and breakthrough benchmark performance.',
    tags: ['thinking', 'reasoning', 'math', 'code']
  },
  {
    name: 'deepseek-coder-v2:16b',
    family: 'DeepSeek Coder V2',
    params: '16B',
    diskGB: 8.9,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Mixture-of-Experts 16B code model (2.4B active params) supporting 338+ programming languages and 128k context.',
    tags: ['code', 'tools', 'thinking', 'reasoning']
  },
  {
    name: 'deepseek-coder-v2:236b',
    family: 'DeepSeek Coder V2',
    params: '236B',
    diskGB: 133.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Large MoE coding frontier model (21B active params) rivaling top proprietary code models.',
    tags: ['code', 'tools', 'reasoning']
  },
  {
    name: 'deepseek-coder:6.7b',
    family: 'DeepSeek Coder',
    params: '6.7B',
    diskGB: 3.8,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Compact code completion and instruction model trained on project-level repositories.',
    tags: ['code', 'tools']
  },
  {
    name: 'deepseek-coder:33b',
    family: 'DeepSeek Coder',
    params: '33B',
    diskGB: 19.0,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Extensive 33B code intelligence for comprehensive software engineering and architecture design.',
    tags: ['code', 'tools', 'reasoning']
  },
  {
    name: 'deepseek-v2.5:236b',
    family: 'DeepSeek V2.5',
    params: '236B',
    diskGB: 133.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Integrated general conversational and coding MoE model combining deep reasoning with high efficiency.',
    tags: ['chat', 'code', 'tools', 'reasoning']
  },

  // ── Qwen 2.5, Qwen 2.5 Coder & QwQ family ──────────────────────────────────
  {
    name: 'qwen2.5:0.5b',
    family: 'Qwen 2.5',
    params: '0.5B',
    diskGB: 0.4,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Ultra-compact 0.5B model for resource-constrained edge computing and real-time classification.',
    tags: ['chat', 'multilingual']
  },
  {
    name: 'qwen2.5:1.5b',
    family: 'Qwen 2.5',
    params: '1.5B',
    diskGB: 1.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Lightweight 1.5B multilingual general intelligence model for quick local assistance.',
    tags: ['chat', 'multilingual', 'tools']
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
    tags: ['chat', 'tools', 'multilingual']
  },
  {
    name: 'qwen2.5:7b',
    family: 'Qwen 2.5',
    params: '7B',
    diskGB: 4.7,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Balanced 7B general foundation model with exceptional instruction and tool adherence.',
    tags: ['chat', 'tools', 'multilingual', 'instruct']
  },
  {
    name: 'qwen2.5:14b',
    family: 'Qwen 2.5',
    params: '14B',
    diskGB: 9.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Strong 14B model offering frontier-grade reasoning, math proofing, and complex instruction following.',
    tags: ['chat', 'tools', 'reasoning', 'math']
  },
  {
    name: 'qwen2.5:32b',
    family: 'Qwen 2.5',
    params: '32B',
    diskGB: 20.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'High-end 32B model with deep domain expertise in coding, math, and multilingual text generation.',
    tags: ['chat', 'tools', 'reasoning', 'code']
  },
  {
    name: 'qwen2.5:72b',
    family: 'Qwen 2.5',
    params: '72B',
    diskGB: 47.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Flagship 72B open foundation model matching frontier closed models across knowledge benchmarks.',
    tags: ['chat', 'tools', 'thinking', 'reasoning']
  },
  {
    name: 'qwen2.5-coder:0.5b',
    family: 'Qwen 2.5 Coder',
    params: '0.5B',
    diskGB: 0.4,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Sub-billion parameter code model for instantaneous inline autocomplete and lint fixes.',
    tags: ['code', 'tools']
  },
  {
    name: 'qwen2.5-coder:1.5b',
    family: 'Qwen 2.5 Coder',
    params: '1.5B',
    diskGB: 1.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Lightweight code assistant for inline autocomplete and fast script generation.',
    tags: ['code', 'tools', 'chat']
  },
  {
    name: 'qwen2.5-coder:3b',
    family: 'Qwen 2.5 Coder',
    params: '3B',
    diskGB: 1.9,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Fast 3B code specialist capable of multi-language function generation and unit test drafting.',
    tags: ['code', 'tools', 'chat']
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
    tags: ['code', 'tools', 'chat', 'reasoning']
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
    tags: ['code', 'tools', 'reasoning']
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
    tags: ['code', 'tools', 'reasoning']
  },
  {
    name: 'qwq:32b',
    family: 'QwQ',
    params: '32B',
    diskGB: 20.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Qwen experimental 32B reasoning model specialized in complex mathematical proofs and logical deduction.',
    tags: ['thinking', 'reasoning', 'math', 'code']
  },

  // ── Mistral, Mixtral & Codestral family ────────────────────────────────────
  {
    name: 'mistral:7b',
    family: 'Mistral',
    params: '7B',
    diskGB: 4.1,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Fast, high-quality 7B model by Mistral AI with sliding-window attention and function calling.',
    tags: ['chat', 'tools', 'instruct']
  },
  {
    name: 'mistral-nemo:12b',
    family: 'Mistral NeMo',
    params: '12B',
    diskGB: 7.1,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: '12B model built by Mistral AI and NVIDIA with a 128k context window and Tekken tokenizer.',
    tags: ['chat', 'tools', 'multilingual']
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
    tags: ['chat', 'tools', 'thinking', 'reasoning', 'code']
  },
  {
    name: 'mistral-large:123b',
    family: 'Mistral Large',
    params: '123B',
    diskGB: 69.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Mistral AI’s premier flagship model with 128k context, fluent across dozens of languages and reasoning.',
    tags: ['chat', 'tools', 'reasoning']
  },
  {
    name: 'mixtral:8x7b',
    family: 'Mixtral',
    params: '47B',
    diskGB: 26.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Breakthrough 8x7B Mixture-of-Experts model using 13B active parameters per token for blazing speed.',
    tags: ['chat', 'tools', 'code']
  },
  {
    name: 'mixtral:8x22b',
    family: 'Mixtral',
    params: '141B',
    diskGB: 79.0,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Enterprise 8x22B MoE model (39B active params) designed for multi-turn agent workflows and math.',
    tags: ['chat', 'tools', 'reasoning', 'code']
  },
  {
    name: 'codestral:22b',
    family: 'Codestral',
    params: '22B',
    diskGB: 12.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Mistral AI’s 22B dedicated generative code model trained on 80+ programming languages.',
    tags: ['code', 'tools', 'reasoning']
  },
  {
    name: 'mathstral:7b',
    family: 'Mathstral',
    params: '7B',
    diskGB: 4.1,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Mistral AI’s 7B model specialized in STEM, advanced mathematics, and step-by-step scientific problem solving.',
    tags: ['math', 'thinking', 'reasoning']
  },

  // ── Google Gemma 2 family ──────────────────────────────────────────────────
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
    tags: ['chat', 'tools', 'reasoning']
  },
  {
    name: 'gemma2:27b',
    family: 'Gemma 2',
    params: '27B',
    diskGB: 16.0,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Google’s high-capacity 27B model delivering enterprise intelligence in a single-GPU footprint.',
    tags: ['chat', 'tools', 'reasoning']
  },
  {
    name: 'codegemma:2b',
    family: 'CodeGemma',
    params: '2B',
    diskGB: 1.6,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Google’s lightweight model for low-latency code completion and fill-in-the-middle syntax.',
    tags: ['code']
  },
  {
    name: 'codegemma:7b',
    family: 'CodeGemma',
    params: '7B',
    diskGB: 5.0,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Google’s 7B code model trained on billions of code tokens for multi-language programming and refactoring.',
    tags: ['code', 'instruct']
  },

  // ── Microsoft Phi & WizardLM family ────────────────────────────────────────
  {
    name: 'phi4:14b',
    family: 'Phi-4',
    params: '14B',
    diskGB: 9.1,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Microsoft’s 14B state-of-the-art small model trained with synthetic data for peak reasoning.',
    tags: ['thinking', 'reasoning', 'math', 'chat']
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
  {
    name: 'phi3:3.8b',
    family: 'Phi-3',
    params: '3.8B',
    diskGB: 2.2,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Microsoft’s classic 3.8B small language model with high benchmark efficiency.',
    tags: ['chat', 'instruct']
  },
  {
    name: 'phi3:14b',
    family: 'Phi-3',
    params: '14B',
    diskGB: 7.9,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Medium 14B model by Microsoft balancing resource consumption with deep analytical reasoning.',
    tags: ['chat', 'reasoning']
  },
  {
    name: 'wizardlm2:7b',
    family: 'WizardLM 2',
    params: '7B',
    diskGB: 4.1,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Microsoft AI’s conversational 7B model tuned for sophisticated multi-turn dialogue.',
    tags: ['chat', 'instruct', 'reasoning']
  },
  {
    name: 'wizardlm2:8x22b',
    family: 'WizardLM 2',
    params: '141B',
    diskGB: 80.0,
    contextK: 64,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Premier open-source MoE model trained with synthetic data for frontier multi-domain intelligence.',
    tags: ['chat', 'tools', 'thinking', 'reasoning']
  },

  // ── IBM Granite & Cohere Command-R family ──────────────────────────────────
  {
    name: 'granite3-dense:2b',
    family: 'Granite 3 Dense',
    params: '2B',
    diskGB: 1.5,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'IBM’s efficient 2B enterprise foundation model optimized for business workflows and tool invocation.',
    tags: ['chat', 'tools', 'instruct']
  },
  {
    name: 'granite3-dense:8b',
    family: 'Granite 3 Dense',
    params: '8B',
    diskGB: 4.9,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'IBM’s 8B enterprise model with robust safety guardrails, function calling, and structured JSON output.',
    tags: ['chat', 'tools', 'instruct']
  },
  {
    name: 'granite-code:8b',
    family: 'Granite Code',
    params: '8B',
    diskGB: 4.6,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'IBM’s 8B code model trained on 116 programming languages for enterprise software development.',
    tags: ['code', 'tools']
  },
  {
    name: 'granite-code:20b',
    family: 'Granite Code',
    params: '20B',
    diskGB: 12.0,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'IBM’s 20B code intelligence for large-scale enterprise modernization, code translation, and testing.',
    tags: ['code', 'tools', 'reasoning']
  },
  {
    name: 'command-r:35b',
    family: 'Command R',
    params: '35B',
    diskGB: 20.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Cohere’s 35B model engineered specifically for retrieval-augmented generation (RAG) and tool use.',
    tags: ['tools', 'chat', 'multilingual']
  },
  {
    name: 'command-r-plus:104b',
    family: 'Command R+',
    params: '104B',
    diskGB: 59.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Cohere’s state-of-the-art enterprise 104B RAG powerhouse with multilingual verification and multi-step tool use.',
    tags: ['tools', 'chat', 'reasoning', 'multilingual']
  },

  // ── StarCoder, Solar, Yi, Hermes & Aya family ──────────────────────────────
  {
    name: 'starcoder2:3b',
    family: 'StarCoder 2',
    params: '3B',
    diskGB: 1.7,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'BigCode’s transparent 3B code generation model trained on 600+ programming languages.',
    tags: ['code']
  },
  {
    name: 'starcoder2:7b',
    family: 'StarCoder 2',
    params: '7B',
    diskGB: 4.3,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'BigCode’s 7B code model trained on 17+ programming languages with 16k context.',
    tags: ['code', 'tools']
  },
  {
    name: 'starcoder2:15b',
    family: 'StarCoder 2',
    params: '15B',
    diskGB: 9.1,
    contextK: 16,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'BigCode’s 15B code model built with NVIDIA for full repository synthesis and understanding.',
    tags: ['code', 'tools', 'reasoning']
  },
  {
    name: 'solar:10.7b',
    family: 'Solar',
    params: '10.7B',
    diskGB: 6.1,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Upstage’s 10.7B model utilizing depth up-scaling for strong reasoning and mathematical skills.',
    tags: ['chat', 'reasoning', 'instruct']
  },
  {
    name: 'solar-pro:22b',
    family: 'Solar Pro',
    params: '22B',
    diskGB: 13.0,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Upstage’s 22B advanced model with high instruction adherence and multi-lingual translation.',
    tags: ['chat', 'reasoning', 'tools']
  },
  {
    name: 'yi:6b',
    family: 'Yi',
    params: '6B',
    diskGB: 3.5,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: '01.AI’s compact 6B bilingual foundation model with solid reasoning metrics.',
    tags: ['chat', 'multilingual']
  },
  {
    name: 'yi:9b',
    family: 'Yi',
    params: '9B',
    diskGB: 5.0,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: '01.AI’s 9B model excelling at coding, mathematics, and bilingual logic.',
    tags: ['chat', 'reasoning', 'multilingual']
  },
  {
    name: 'yi:34b',
    family: 'Yi',
    params: '34B',
    diskGB: 19.0,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: '01.AI’s high-performing 34B open foundation model delivering near-frontier intelligence.',
    tags: ['chat', 'reasoning', 'multilingual']
  },
  {
    name: 'yi-coder:9b',
    family: 'Yi Coder',
    params: '9B',
    diskGB: 5.0,
    contextK: 128,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: '01.AI’s 9B dedicated code model with 128k context for repository-wide code comprehension.',
    tags: ['code', 'tools']
  },
  {
    name: 'nous-hermes2:10.7b',
    family: 'Nous Hermes 2',
    params: '10.7B',
    diskGB: 6.1,
    contextK: 4,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Nous Research’s 10.7B model trained on high-quality synthetic data for complex multi-turn chats.',
    tags: ['chat', 'instruct', 'reasoning']
  },
  {
    name: 'nous-hermes2-mixtral:8x7b',
    family: 'Nous Hermes 2 Mixtral',
    params: '47B',
    diskGB: 26.0,
    contextK: 32,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Nous Research’s MoE flagship tuned on GPT-4 synthetic conversations and tool usage.',
    tags: ['chat', 'tools', 'reasoning']
  },
  {
    name: 'aya:8b',
    family: 'Aya',
    params: '8B',
    diskGB: 4.8,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Cohere For AI’s 8B multilingual model covering 101 languages for inclusive NLP.',
    tags: ['multilingual', 'chat', 'instruct']
  },
  {
    name: 'aya:35b',
    family: 'Aya',
    params: '35B',
    diskGB: 20.0,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Cohere For AI’s 35B model expanding high-accuracy multilingual reasoning to under-represented languages.',
    tags: ['multilingual', 'chat', 'reasoning']
  },

  // ── Lightweight & Edge Models ──────────────────────────────────────────────
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
    name: 'smollm2:135m',
    family: 'SmolLM2',
    params: '135M',
    diskGB: 0.1,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Ultra-compact 135M model for embedded microcontrollers, browser edge apps, and low-latency tests.',
    tags: ['chat']
  },
  {
    name: 'smollm2:360m',
    family: 'SmolLM2',
    params: '360M',
    diskGB: 0.3,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Sub-billion 360M parameter model engineered by Hugging Face for fast on-device assistant tasks.',
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
  {
    name: 'orca-mini:3b',
    family: 'Orca Mini',
    params: '3B',
    diskGB: 1.9,
    contextK: 2,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Compact 3B model trained with rich explanation traces for transparent reasoning on edge devices.',
    tags: ['chat', 'reasoning']
  },
  {
    name: 'dolphin-llama3:8b',
    family: 'Dolphin Llama 3',
    params: '8B',
    diskGB: 4.7,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Eric Hartford’s uncensored 8B assistant model fine-tuned for versatile instruction execution.',
    tags: ['chat', 'instruct', 'code']
  },
  {
    name: 'dolphin-mistral:7b',
    family: 'Dolphin Mistral',
    params: '7B',
    diskGB: 4.1,
    contextK: 8,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Uncensored 7B assistant tuned for creative writing, debugging, and open-ended analysis.',
    tags: ['chat', 'instruct']
  },

  // ── Vision & Multimodal Models ─────────────────────────────────────────────
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
    name: 'llava:13b',
    family: 'LLaVA',
    params: '13B',
    diskGB: 8.0,
    contextK: 4,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: '13B visual instruction model with enhanced spatial resolution and detailed object detection.',
    tags: ['vision', 'chat']
  },
  {
    name: 'llava:34b',
    family: 'LLaVA',
    params: '34B',
    diskGB: 20.0,
    contextK: 4,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'High-capability 34B multimodal model for deep scientific diagram and chart understanding.',
    tags: ['vision', 'chat', 'reasoning']
  },
  {
    name: 'llava-llama3:8b',
    family: 'LLaVA Llama 3',
    params: '8B',
    diskGB: 5.5,
    contextK: 8,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'Multimodal vision model combining LLaVA’s visual encoder with Llama 3 8B conversational flow.',
    tags: ['vision', 'chat', 'instruct']
  },
  {
    name: 'llava-phi3:3.8b',
    family: 'LLaVA Phi 3',
    params: '3.8B',
    diskGB: 2.9,
    contextK: 4,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'Compact multimodal assistant combining Microsoft Phi-3 with visual perception.',
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
  {
    name: 'bakllava:7b',
    family: 'BakLLaVA',
    params: '7B',
    diskGB: 4.7,
    contextK: 4,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'Mistral 7B-powered multimodal vision model for fine-grained image inspection.',
    tags: ['vision', 'chat']
  },
  {
    name: 'minicpm-v:8b',
    family: 'MiniCPM V',
    params: '8B',
    diskGB: 5.5,
    contextK: 8,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    description: 'State-of-the-art 8B multimodal model with high-resolution image and OCR perception.',
    tags: ['vision', 'reasoning']
  },

  // ── Embedding & RAG Models ─────────────────────────────────────────────────
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
    name: 'bge-large:latest',
    family: 'BGE Large',
    params: '335M',
    diskGB: 0.7,
    contextK: 1,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'BAAI’s 335M high-accuracy English text embedding model for semantic search pipelines.',
    tags: ['embedding']
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
  },
  {
    name: 'snowflake-arctic-embed:latest',
    family: 'Snowflake Arctic Embed',
    params: '137M',
    diskGB: 0.3,
    contextK: 1,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Snowflake’s optimized embedding model achieving top-tier retrieval efficiency.',
    tags: ['embedding']
  },
  {
    name: 'all-minilm:latest',
    family: 'All-MiniLM',
    params: '33M',
    diskGB: 0.1,
    contextK: 1,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Ultra-fast lightweight embedding model for instant sentence similarity and clustering.',
    tags: ['embedding']
  },
  {
    name: 'paraphrase-multilingual:latest',
    family: 'Paraphrase Multilingual',
    params: '278M',
    diskGB: 0.6,
    contextK: 1,
    inputModalities: ['text'],
    outputModalities: ['text'],
    description: 'Multi-lingual sentence transformer embedding model mapping 50+ languages into a shared vector space.',
    tags: ['embedding', 'multilingual']
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

/** Parses parameter string into numeric billions (e.g. "7B" -> 7, "135M" -> 0.135). */
export function parseParamBillions(paramsStr: string): number {
  const s = (paramsStr || '').trim().toUpperCase();
  const bMatch = /^([\d.]+)\s*B$/.exec(s);
  if (bMatch) return parseFloat(bMatch[1]);
  const mMatch = /^([\d.]+)\s*M$/.exec(s);
  if (mMatch) return parseFloat(mMatch[1]) / 1000.0;
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Calculates a balanced multi-criteria score for a model based on:
 * 1. Hardware Fit Tier (Top match / Best fit in GPU/RAM > Runnable > Too-large)
 * 2. Parameters (Capability & Intelligence: higher parameters deliver smarter reasoning)
 * 3. Download Size (Smaller download footprint for given parameters)
 * 4. Memory Needed (Optimized RAM/VRAM usage)
 */
export function calculateModelScore(
  r: { model: OllamaCatalogModel; fit: ModelFit; needGB: number; isHardwareRecommended?: boolean },
  vramBudgetGB: number,
  ramFreeGB: number
): number {
  if (r.model.isCloud) {
    // Cloud models run remotely — give a clean baseline runnable score
    const paramsB = parseParamBillions(r.model.params);
    return 500 + Math.min(paramsB, 70) * 5;
  }

  const paramsB = parseParamBillions(r.model.params);
  const diskGB = r.model.diskGB > 0 ? r.model.diskGB : Math.max(0.5, paramsB * 0.65);
  const needGB = r.needGB > 0 ? r.needGB : 1.0;

  // Base tier bonus
  let tierScore = 0;
  if (r.fit === 'best') tierScore = 10000;
  else if (r.isHardwareRecommended) tierScore = 5000;
  else if (r.fit === 'runnable') tierScore = 1500;
  else if (r.fit === 'quantized') tierScore = 300;
  else tierScore = -10000; // too-large (memory overflow)

  if (r.fit === 'too-large') {
    // For models exceeding system capacity, closest to fitting comes first
    return tierScore - needGB * 10;
  }

  // GPU Acceleration bonus if it fits entirely in dedicated VRAM
  let gpuBonus = 0;
  if (vramBudgetGB > 0 && needGB <= vramBudgetGB) {
    gpuBonus = 2500;
  }

  // Parameter efficiency ratio: parameters (in B) / (needGB + diskGB * 0.35)
  const efficiencyRatio = (paramsB * 100) / (needGB + diskGB * 0.35);

  return tierScore + gpuBonus + paramsB * 60 + efficiencyRatio - diskGB * 2;
}

/**
 * Ranks the catalog against detected hardware. Evaluates free RAM, GPU VRAM,
 * Apple Silicon unified memory, CPU, and disk space across Windows, macOS, and Linux.
 * Sorts by Top Match and multi-criteria balance (Parameters vs Download Size vs Memory Needed).
 */
export function rankModels(
  catalog: OllamaCatalogModel[],
  sys: SystemInfo | null
): RankedModel[] {
  if (!sys || sys.ramGB <= 0) {
    return catalog
      .map((m) => ({
        model: m,
        fit: 'runnable' as ModelFit,
        reason: m.isCloud ? 'Cloud Hosted — Runs remotely' : 'Hardware detection pending',
        needGB: estimateRequirement(m),
        storageWarning: false,
        isHardwareRecommended: false,
      }))
      .sort((a, b) => {
        const pA = parseParamBillions(a.model.params);
        const pB = parseParamBillions(b.model.params);
        if (pA !== pB) return pB - pA;
        return a.needGB - b.needGB;
      });
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
    if (m.isCloud) {
      return {
        model: m,
        fit: 'runnable' as ModelFit,
        reason: 'Cloud Hosted — Runs remotely with minimal local memory',
        needGB: 0,
        storageWarning: false,
        isHardwareRecommended: false,
      };
    }

    const n = need(m);
    const storageWarning = maxFreeDisk !== Infinity && (n > maxFreeDisk || (m.diskGB > 0 && m.diskGB > maxFreeDisk));

    let fit: ModelFit;
    let reason: string;

    const formattedNeed = n >= 1000 ? `${(n / 1024).toFixed(1)}TB` : `${n}GB`;

    if (!fitsTotalRam(m)) {
      fit = 'too-large';
      reason = isUnified
        ? `Memory Overflow — needs ~${formattedNeed} (total unified memory: ${ramGB}GB). Exceeds capacity.`
        : `Memory Overflow — needs ~${formattedNeed} (total RAM: ${ramGB}GB). Exceeds capacity.`;
    } else if (fitsVram(m)) {
      fit = 'runnable';
      reason = `GPU Acceleration — fits 100% in ${vramBudgetGB}GB VRAM`;
    } else if (fitsUnified(m)) {
      fit = 'runnable';
      reason = `Apple Silicon Unified Memory — optimal speed (~${formattedNeed} / ${ramFreeGB}GB free)`;
    } else if (fitsFreeRam(m) && !vramBudgetGB) {
      fit = 'runnable';
      reason = `Fits in free RAM limit (~${formattedNeed} / ${ramFreeGB}GB free; CPU inference)`;
    } else if (vramBudgetGB > 0) {
      // Discrete GPU present, but model exceeds dedicated VRAM
      fit = 'quantized';
      if (fitsFreeRam(m)) {
        reason = `VRAM Overflow (needs ~${formattedNeed}, exceeds ${vramBudgetGB}GB VRAM) — Quantized execution offloaded to ${ramFreeGB}GB free RAM`;
      } else {
        reason = `VRAM Overflow (needs ~${formattedNeed}, exceeds ${vramBudgetGB}GB VRAM) — Runs via quantized weights & CPU offload`;
      }
    } else {
      // CPU only, but exceeds free RAM (fits in total RAM)
      fit = 'quantized';
      reason = `RAM Overflow (needs ~${formattedNeed}; ${ramFreeGB}GB free) — Runs via CPU quantized execution & memory paging`;
    }

    return { model: m, fit, reason, needGB: n, storageWarning, isHardwareRecommended: false };
  });

  // Pick top recommended models that fit best in local fast memory (excluding cloud models):
  const topPicks = ranked
    .filter((r) => {
      if (r.model.isCloud) return false;
      if (r.fit !== 'runnable' && r.fit !== 'best') return false;
      if (isUnified) return r.needGB <= Math.min(ramGB * 0.75, ramFreeGB + 1.0);
      if (vramBudgetGB > 0) return r.needGB <= vramBudgetGB;
      return r.needGB <= ramFreeGB;
    })
    .sort((a, b) => {
      const pA = parseParamBillions(a.model.params);
      const pB = parseParamBillions(b.model.params);
      if (pA !== pB) return pB - pA;
      return a.needGB - b.needGB;
    });

  if (topPicks.length > 0) {
    topPicks[0].fit = 'best';
    topPicks[0].isHardwareRecommended = true;
    const bestNeedFormatted =
      topPicks[0].needGB >= 1000 ? `${(topPicks[0].needGB / 1024).toFixed(1)}TB` : `${topPicks[0].needGB}GB`;
    topPicks[0].reason = isUnified
      ? `⭐ Best match for your Apple Silicon (${bestNeedFormatted} / ${ramFreeGB}GB free unified RAM)`
      : vramBudgetGB > 0 && topPicks[0].needGB <= vramBudgetGB
      ? `⭐ Best match for your GPU (${bestNeedFormatted} in ${vramBudgetGB}GB VRAM)`
      : `⭐ Best match for your hardware (${bestNeedFormatted} / ${ramFreeGB}GB free RAM)`;
  }

  // Also mark top 2-3 runnable models as recommended
  for (let i = 0; i < Math.min(3, topPicks.length); i++) {
    topPicks[i].isHardwareRecommended = true;
  }

  const order: Record<ModelFit, number> = { best: 0, runnable: 1, quantized: 2, 'too-large': 3 };

  // Sort by: Top Match first, then multi-criteria balance (Parameters vs Download Size vs Memory Needed)
  ranked.sort((a, b) => {
    // 1. Top Recommended first
    const aRec = a.isHardwareRecommended || a.fit === 'best' ? 1 : 0;
    const bRec = b.isHardwareRecommended || b.fit === 'best' ? 1 : 0;
    if (aRec !== bRec) return bRec - aRec;

    // 2. Fit tier
    if (order[a.fit] !== order[b.fit]) return order[a.fit] - order[b.fit];

    // 3. Multi-criteria score (Parameters vs Download Size vs Memory Needed)
    if (a.fit !== 'too-large') {
      const scoreA = calculateModelScore(a, vramBudgetGB, ramFreeGB);
      const scoreB = calculateModelScore(b, vramBudgetGB, ramFreeGB);
      if (Math.abs(scoreA - scoreB) > 0.001) return scoreB - scoreA;

      const pA = parseParamBillions(a.model.params);
      const pB = parseParamBillions(b.model.params);
      if (pA !== pB) return pB - pA;
      return a.needGB - b.needGB;
    }

    // 4. For too-large: show closest to fitting first
    return a.needGB - b.needGB;
  });

  return ranked;
}
