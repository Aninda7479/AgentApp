/**
 * Format Utility Functions for SuperAgent Desktop
 */

export class FormatUtils {
  static generateStorageId(): string {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  static formatTimestamp(date: Date = new Date()): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  static formatWorkedDuration(ms: number): string {
    if (ms <= 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${remMinutes}m`;
  }

  static stampWorkedDuration<T extends { metadata?: Record<string, unknown> }>(
    steps: T[],
    workedDuration: string
  ): T[] {
    if (steps.length === 0) return steps;
    const lastIdx = steps.length - 1;
    const lastStep = steps[lastIdx];
    if (lastStep.metadata?.workedDuration === workedDuration) return steps;

    const updated = [...steps];
    updated[lastIdx] = {
      ...lastStep,
      metadata: { ...lastStep.metadata, workedDuration },
    };
    return updated;
  }
}
