import * as fs from 'fs';
import * as path from 'path';
import { getConfigDirectory, SettingsStorage } from './settings-store.js';

/** A single recorded usage entry for a model call. */
export interface ModelUsageRecord {
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: string;
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

  /** Loads all usage records from the JSON log file. */
  public static loadUsage(): ModelUsageRecord[] {
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

  /** Records a new usage event, calculating cost from pricing. */
  public static trackUsage(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    costPer1MPrompt?: number,
    costPer1MCompletion?: number
  ): void {
    const records = this.loadUsage();
    
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
      timestamp: new Date().toISOString()
    };

    records.push(newRecord);

    // Rolling window: keep only the most recent records so the on-disk log and
    // the per-call full rewrite stay bounded across long-running sessions.
    if (records.length > UsageTracker.MAX_RECORDS) {
      records.splice(0, records.length - UsageTracker.MAX_RECORDS);
    }

    try {
      fs.writeFileSync(this.getUsageFilePath(), JSON.stringify(records, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write usage stats:', e);
    }
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

  /** Clears all recorded usage history from disk. */
  public static clearUsage(): void {
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
