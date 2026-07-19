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
import type { SystemInfo } from '../../main/system-info';

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
}

const LIB_URL = 'https://ollama.com/library';
const MODEL_URL = (slug: string) => `https://ollama.com/library/${slug}`;
const FETCH_TIMEOUT_MS = 12_000;
const CONCURRENCY = 12;

const OVERHEAD_GB = 1.5; // KV cache + runtime overhead per model

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
  // Space before a digit, but keep version/reasoning markers like "r1"/"v1.5" intact
  // and uppercase them (e.g. "deepseek-r1" → "Deepseek R1").
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
  // Each tag renders a mobile anchor whose metadata line carries "SIZE · CONTEXT · MODALITY · DATE".
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
    // The real default tag is marked with a "latest" badge; the bare "latest"
    // alias is a duplicate we drop when the real tag is present.
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

/**
 * Builds the full Ollama catalog by scraping ollama.com live. Returns an empty
 * array if the library page is unreachable (never fabricated data). `onProgress`
 * fires once per model page as it resolves: (done, total).
 */
export async function fetchLiveCatalog(
  onProgress?: (done: number, total: number) => void
): Promise<OllamaCatalogModel[]> {
  const libHtml = await fetchText(LIB_URL);
  if (!libHtml) return [];
  const families = parseLibrary(libHtml);
  if (families.length === 0) return [];

  const results: OllamaCatalogModel[] = [];
  let done = 0;
  await mapWithConcurrency(families, CONCURRENCY, async (fam) => {
    try {
      const page = await fetchText(MODEL_URL(fam.slug));
      if (page) {
        const models = parseModelPage(page, fam);
        if (models.length) results.push(...models);
      }
    } finally {
      done++;
      onProgress?.(done, families.length);
    }
  });

  // Stable sort: family, then largest first within a family.
  results.sort((a, b) =>
    a.family === b.family ? b.diskGB - a.diskGB : a.family.localeCompare(b.family)
  );
  return results;
}

/**
 * Ranks the catalog against detected hardware. Returns models tagged:
 *  - 'best'      : largest model that fits the VRAM budget (GPU; or unified RAM)
 *  - 'runnable'  : fits RAM (GPU or CPU) but isn't the top GPU pick
 *  - 'too-large' : doesn't even fit in RAM
 * Sorted best → runnable (largest first) → too-large (smallest first).
 */
export function rankModels(
  catalog: OllamaCatalogModel[],
  sys: SystemInfo | null
): RankedModel[] {
  if (!sys || sys.ramGB <= 0) {
    // No hardware yet — show everything as 'runnable' (fit unknown) so the user
    // can still browse and the page isn't empty before detection resolves.
    return catalog.map((m) => ({
      model: m,
      fit: 'runnable' as ModelFit,
      reason: 'Hardware not detected yet',
      needGB: estimateRequirement(m),
      storageWarning: false
    }));
  }

  const need = (m: OllamaCatalogModel) => estimateRequirement(m);
  const maxFreeDisk = sys.storage.length
    ? Math.max(...sys.storage.map((s) => s.freeGB))
    : Infinity;

  const fitsVram = (m: OllamaCatalogModel) => need(m) <= sys.vramBudgetGB;
  const fitsRam = (m: OllamaCatalogModel) => need(m) <= sys.ramGB;

  const gpuLabel = sys.isUnifiedMemory
    ? `${sys.ramGB}GB unified memory`
    : `${sys.vramBudgetGB}GB vRAM`;

  const ranked: RankedModel[] = catalog.map((m) => {
    const n = need(m);
    const storageWarning = n > maxFreeDisk;

    let fit: ModelFit;
    let reason: string;
    if (!fitsRam(m)) {
      fit = 'too-large';
      reason = sys.isUnifiedMemory
        ? `Too large — needs ~${n}GB but you have ${sys.ramGB}GB unified memory`
        : `Too large — needs ~${n}GB but you have ${sys.ramGB}GB RAM / ${sys.vramBudgetGB}GB vRAM`;
    } else if (fitsVram(m)) {
      fit = 'runnable';
      reason = sys.isUnifiedMemory
        ? `Runs on your ${gpuLabel}`
        : `Runs on your ${gpuLabel} GPU`;
    } else {
      fit = 'runnable';
      reason = `Runs on CPU (needs ~${n}GB of your ${sys.ramGB}GB RAM; slower than GPU)`;
    }
    return { model: m, fit, reason, needGB: n, storageWarning };
  });

  // Largest VRAM/GPU-fitting model is the single "best performance" pick.
  const gpuFitting = ranked
    .filter((r) =>
      r.fit === 'runnable' && (sys.isUnifiedMemory ? r.needGB <= sys.ramGB : r.needGB <= sys.vramBudgetGB)
    )
    .sort((a, b) => b.model.diskGB - a.model.diskGB);
  if (gpuFitting.length > 0) {
    gpuFitting[0].fit = 'best';
    gpuFitting[0].reason = sys.isUnifiedMemory
      ? `Best performance — largest model for your ${gpuLabel}`
      : `Best performance — largest model for your ${gpuLabel} GPU`;
  }

  const order: Record<ModelFit, number> = { best: 0, runnable: 1, 'too-large': 2 };
  ranked.sort((a, b) => {
    if (order[a.fit] !== order[b.fit]) return order[a.fit] - order[b.fit];
    // Within a bucket: largest first for best/runnable, smallest-first for too-large.
    return a.fit === 'too-large'
      ? a.model.diskGB - b.model.diskGB
      : b.model.diskGB - a.model.diskGB;
  });

  return ranked;
}
