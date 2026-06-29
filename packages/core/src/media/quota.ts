export type MediaType = 'image' | 'audio' | 'video' | 'pdf' | 'ppt';

export interface QuotaConfig {
  maxMonthlyBudget?: number;
  maxDailyBudget?: number;
  warningThresholdPercent?: number;
  customRates?: Record<string, number>;
}

export interface UsageRecord {
  id: string;
  timestamp: number;
  mediaType: MediaType;
  provider: string;
  estimatedCost: number;
  metadata?: Record<string, string | number>;
}

export interface PreCheckResult {
  allowed: boolean;
  estimatedCost: number;
  currentDailyTotal: number;
  currentMonthlyTotal: number;
  warning?: string;
  reason?: string;
}

export interface UsageStats {
  totalCost: number;
  count: number;
  byType: Record<MediaType, number>;
}

export class MediaQuotaMonitor {
  private config: QuotaConfig;
  private usageHistory: UsageRecord[] = [];

  constructor(config: QuotaConfig = {}) {
    this.config = {
      warningThresholdPercent: 80,
      ...config
    };
  }

  /**
   * Estimate cost for a planned media generation call.
   */
  estimateCost(mediaType: MediaType, provider: string, options: Record<string, unknown> = {}): number {
    const customKey = `${provider}:${mediaType}`;
    if (this.config.customRates && customKey in this.config.customRates) {
      return this.config.customRates[customKey];
    }

    switch (mediaType) {
      case 'video': {
        const seconds = typeof options.durationSeconds === 'number' ? options.durationSeconds : 5;
        return 0.05 * seconds; // $0.05 per second
      }
      case 'image': {
        const quality = options.quality;
        const count = typeof options.n === 'number' ? options.n : 1;
        const unitCost = quality === 'hd' ? 0.08 : 0.04;
        return unitCost * count;
      }
      case 'audio': {
        const textLength = typeof options.textLength === 'number' ? options.textLength : 100;
        return Math.max(0.005, (textLength / 1000) * 0.015);
      }
      case 'pdf':
      case 'ppt':
        return 0.01;
      default:
        return 0.02;
    }
  }

  /**
   * Check if executing a media generation request violates budget or quota limits.
   */
  checkQuota(mediaType: MediaType, provider: string, options: Record<string, unknown> = {}): PreCheckResult {
    const estimatedCost = this.estimateCost(mediaType, provider, options);
    const dailyTotal = this.calculateTotal(this.getDailyRecords());
    const monthlyTotal = this.calculateTotal(this.getMonthlyRecords());

    const projectDaily = dailyTotal + estimatedCost;
    const projectMonthly = monthlyTotal + estimatedCost;

    let allowed = true;
    let reason: string | undefined;
    let warning: string | undefined;

    if (this.config.maxDailyBudget !== undefined && projectDaily > this.config.maxDailyBudget) {
      allowed = false;
      reason = `Daily media generation budget exceeded ($${projectDaily.toFixed(2)} / $${this.config.maxDailyBudget.toFixed(2)}).`;
    } else if (this.config.maxMonthlyBudget !== undefined && projectMonthly > this.config.maxMonthlyBudget) {
      allowed = false;
      reason = `Monthly media generation budget exceeded ($${projectMonthly.toFixed(2)} / $${this.config.maxMonthlyBudget.toFixed(2)}).`;
    }

    const thresholdRatio = (this.config.warningThresholdPercent || 80) / 100;

    if (allowed) {
      if (this.config.maxDailyBudget !== undefined && projectDaily >= this.config.maxDailyBudget * thresholdRatio) {
        warning = `Approaching daily media budget limit ($${projectDaily.toFixed(2)} / $${this.config.maxDailyBudget.toFixed(2)}).`;
      } else if (this.config.maxMonthlyBudget !== undefined && projectMonthly >= this.config.maxMonthlyBudget * thresholdRatio) {
        warning = `Approaching monthly media budget limit ($${projectMonthly.toFixed(2)} / $${this.config.maxMonthlyBudget.toFixed(2)}).`;
      }
    }

    return {
      allowed,
      estimatedCost,
      currentDailyTotal: dailyTotal,
      currentMonthlyTotal: monthlyTotal,
      warning,
      reason
    };
  }

  /**
   * Record actual usage after or during media generation.
   */
  recordUsage(record: Omit<UsageRecord, 'id' | 'timestamp'>): UsageRecord {
    const fullRecord: UsageRecord = {
      id: `use_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      ...record
    };
    this.usageHistory.push(fullRecord);
    return fullRecord;
  }

  /**
   * Retrieve aggregate statistics for a given timeframe.
   */
  getUsageStats(period: 'daily' | 'monthly' | 'all' = 'all'): UsageStats {
    let records = this.usageHistory;
    if (period === 'daily') {
      records = this.getDailyRecords();
    } else if (period === 'monthly') {
      records = this.getMonthlyRecords();
    }

    const byType: Record<MediaType, number> = {
      image: 0,
      audio: 0,
      video: 0,
      pdf: 0,
      ppt: 0
    };

    let totalCost = 0;
    for (const rec of records) {
      totalCost += rec.estimatedCost;
      if (rec.mediaType in byType) {
        byType[rec.mediaType] += rec.estimatedCost;
      }
    }

    return {
      totalCost: Number(totalCost.toFixed(4)),
      count: records.length,
      byType
    };
  }

  /**
   * Reset all recorded usage history.
   */
  resetUsage(): void {
    this.usageHistory = [];
  }

  private getDailyRecords(): UsageRecord[] {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return this.usageHistory.filter(r => r.timestamp >= startOfDay);
  }

  private getMonthlyRecords(): UsageRecord[] {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return this.usageHistory.filter(r => r.timestamp >= startOfMonth);
  }

  private calculateTotal(records: UsageRecord[]): number {
    return records.reduce((sum, r) => sum + r.estimatedCost, 0);
  }
}
