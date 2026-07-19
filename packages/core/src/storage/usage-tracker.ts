import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { getConfigDirectory } from './locations.js';
import { SettingsStorage } from './settings-store.js';

/**
 * Usage tracking is on the hot path: `trackUsage` is called once per agent turn,
 * potentially hundreds of times per second across 100+ concurrent agents. The
 * old implementation did a synchronous full-file read + full-file rewrite of
 * `usage-log.json` on *every* call — that blocks the single Node event loop and
 * starves every other agent. We now buffer records in memory and flush them to
 * disk asynchronously (debounced, atomic), so `trackUsage` never touches disk.
 */

/** A single recorded usage entry for a model call. */
export interface ModelUsageRecord {
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: string;
  /** Wall-clock duration of the generation call, in ms (used for tok/s). Optional for back-compat. */
  durationMs?: number;
  /** Status of the model call. */
  status?: 'success' | 'failure';
}

/** Aggregated usage statistics grouped by model+provider. */
export interface ModelUsageSummary {
  model: string;
  provider: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  callCount: number;
}

/** Returns per-million-token pricing for a given provider/model combo. */
export function getModelPricing(provider: string, model: string): { inputPrice: number; outputPrice: number } {
  try {
    const settings = SettingsStorage.loadSettings();
    if (settings.models) {
      const modelSetting = settings.models.find(m => m.id === model || m.name === model);
      if (modelSetting?.pricing) {
        const input = parseFloat(modelSetting.pricing.inputPer1M || '0');
        const output = parseFloat(modelSetting.pricing.outputPer1M || '0');
        if (!isNaN(input) && !isNaN(output)) {
          return { inputPrice: input, outputPrice: output };
        }
      }
    }
  } catch (e) {
    // Ignore settings load errors
  }

  // Fallback default pricing per 1M tokens (current rates as of 2026)
  const cleanModel = model.toLowerCase();
  const cleanProvider = provider.toLowerCase();

  if (cleanProvider === 'ollama' || cleanModel.includes('local')) {
    return { inputPrice: 0, outputPrice: 0 };
  }

  if (cleanModel.includes('gpt-4o-mini')) {
    return { inputPrice: 0.15, outputPrice: 0.60 };
  }
  if (cleanModel.includes('gpt-4o')) {
    return { inputPrice: 2.50, outputPrice: 10.00 };
  }
  if (cleanModel.includes('o3-mini')) {
    return { inputPrice: 1.10, outputPrice: 4.40 };
  }

  if (cleanModel.includes('claude-3-7-sonnet') || cleanModel.includes('claude-3-5-sonnet')) {
    return { inputPrice: 3.00, outputPrice: 15.00 };
  }
  if (cleanModel.includes('claude-3-opus')) {
    return { inputPrice: 15.00, outputPrice: 75.00 };
  }

  if (cleanModel.includes('gemini-2.5-flash') || cleanModel.includes('gemini-1.5-flash') || cleanModel.includes('gemini-2.0-flash')) {
    return { inputPrice: 0.075, outputPrice: 0.30 };
  }
  if (cleanModel.includes('gemini-1.5-pro')) {
    return { inputPrice: 1.25, outputPrice: 5.00 };
  }

  if (cleanModel.includes('deepseek-reasoner')) {
    return { inputPrice: 0.55, outputPrice: 2.19 };
  }
  if (cleanModel.includes('deepseek-chat') || cleanModel.includes('deepseek')) {
    return { inputPrice: 0.14, outputPrice: 0.28 };
  }

  // Generic fallback
  return { inputPrice: 0.20, outputPrice: 0.60 };
}

/** Tracks per-model token usage and costs, persisted to disk. */
export class UsageTracker {
  private static getUsageFilePath(): string {
    return path.join(getConfigDirectory(), 'usage-log.json');
  }

  /** Max records retained on disk. `trackUsage` runs on every agent turn, so
   * without a cap the log would grow unbounded and the per-call full-file
   * rewrite would get progressively slower. */
  private static readonly MAX_RECORDS = 5000;

  /** In-memory buffer of not-yet-persisted records. */
  private static buffer: ModelUsageRecord[] = [];
  /** Whether a flush is currently scheduled or in flight. */
  private static flushTimer: ReturnType<typeof setTimeout> | null = null;
  private static flushing = false;

  /** Loads all usage records from the JSON log file (disk only). */
  private static loadUsageFromDisk(): ModelUsageRecord[] {
    const filePath = this.getUsageFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const data = fs.readFileSync(filePath, 'utf-8').trim();
      return data ? (JSON.parse(data) as ModelUsageRecord[]) : [];
    } catch {
      return [];
    }
  }

  /** Flushes the in-memory buffer to disk asynchronously (atomic tmp+rename). */
  public static async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      if (this.buffer.length === 0) return;
      const records = this.loadUsageFromDisk().concat(this.buffer);
      if (records.length > UsageTracker.MAX_RECORDS) {
        records.splice(0, records.length - UsageTracker.MAX_RECORDS);
      }
      const filePath = this.getUsageFilePath();
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(records, null, 2), 'utf-8');
      await fsp.rename(tmp, filePath);
      this.buffer = [];
    } catch (e) {
      console.error('Failed to flush usage stats:', e);
    } finally {
      this.flushing = false;
    }
  }

  /** Best-effort flush on process exit so recent records are not lost. */
  public static shutdown(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Synchronous best-effort write (process is going down anyway).
    try {
      if (this.buffer.length === 0) return;
      const records = this.loadUsageFromDisk().concat(this.buffer);
      if (records.length > UsageTracker.MAX_RECORDS) {
        records.splice(0, records.length - UsageTracker.MAX_RECORDS);
      }
      const filePath = this.getUsageFilePath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
      this.buffer = [];
    } catch {
      // ignore — process is exiting
    }
  }

  private static scheduleFlush(): void {
    if (this.flushTimer) return;
    const delay = Math.max(100, parseInt(process.env.SUPERAGENT_USAGE_FLUSH_MS || '', 10) || 1000);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void UsageTracker.flush();
    }, delay);
    // Don't keep the process alive just for a usage flush.
    (this.flushTimer as unknown as { unref?: () => void }).unref?.();
  }

  /** Loads all usage records (disk + buffered). */
  public static loadUsage(): ModelUsageRecord[] {
    const merged = this.loadUsageFromDisk().concat(this.buffer);
    if (merged.length > UsageTracker.MAX_RECORDS) {
      return merged.slice(merged.length - UsageTracker.MAX_RECORDS);
    }
    return merged;
  }

  /** Records a new usage event, calculating cost from pricing. Buffer-only;
   * persistence happens asynchronously via `flush()`. */
  public static trackUsage(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    costPer1MPrompt?: number,
    costPer1MCompletion?: number,
    durationMs?: number,
    status?: 'success' | 'failure'
  ): void {
    // Determine rates
    let rates = { inputPrice: 0, outputPrice: 0 };
    if (costPer1MPrompt !== undefined && costPer1MCompletion !== undefined) {
      rates = { inputPrice: costPer1MPrompt, outputPrice: costPer1MCompletion };
    } else {
      rates = getModelPricing(provider, model);
    }

    // Calculate cost
    const promptCost = (promptTokens * rates.inputPrice) / 1000000;
    const completionCost = (completionTokens * rates.outputPrice) / 1000000;
    const totalCost = promptCost + completionCost;

    const newRecord: ModelUsageRecord = {
      model,
      provider,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost: totalCost,
      timestamp: new Date().toISOString(),
      durationMs,
      status: status || 'success'
    };

    this.buffer.push(newRecord);
    if (this.buffer.length > UsageTracker.MAX_RECORDS) {
      this.buffer.splice(0, this.buffer.length - UsageTracker.MAX_RECORDS);
    }
    this.scheduleFlush();
  }

  /** Returns aggregated usage summaries grouped by model. */
  public static getSummary(): ModelUsageSummary[] {
    const records = this.loadUsage();
    const map = new Map<string, ModelUsageSummary>();

    for (const r of records) {
      const key = `${r.provider}:${r.model}`;
      if (!map.has(key)) {
        map.set(key, {
          model: r.model,
          provider: r.provider,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          totalCost: 0,
          callCount: 0
        });
      }
      const summary = map.get(key)!;
      summary.totalPromptTokens += r.promptTokens;
      summary.totalCompletionTokens += r.completionTokens;
      summary.totalTokens += r.totalTokens;
      summary.totalCost += r.cost;
      summary.callCount += 1;
    }

    return Array.from(map.values());
  }

  /** Returns per-million-token pricing for every distinct model in the log. */
  public static getPricing(): { model: string; provider: string; inputPrice: number; outputPrice: number }[] {
    const records = this.loadUsage();
    const seen = new Set<string>();
    const result: { model: string; provider: string; inputPrice: number; outputPrice: number }[] = [];
    for (const r of records) {
      const key = `${r.provider}:${r.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { inputPrice, outputPrice } = getModelPricing(r.provider, r.model);
      result.push({ model: r.model, provider: r.provider, inputPrice, outputPrice });
    }
    return result;
  }

  /** Clears all recorded usage history from disk. */
  public static clearUsage(): void {
    this.buffer = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      const filePath = this.getUsageFilePath();
      if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', 'utf-8');
      }
    } catch (e) {
      console.error('Failed to clear usage stats:', e);
    }
  }
}

// Best-effort flush of buffered usage records when the process exits cleanly,
// so the last <flush-interval of data is not silently dropped.
if (typeof process !== 'undefined' && typeof process.once === 'function') {
  process.once('beforeExit', () => UsageTracker.shutdown());
}
