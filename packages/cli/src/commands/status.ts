import { TrajectoryTokenCounter } from '@superagent/core';
import { SessionContext, CLICommandResult } from '../types.js';

export interface StatusReport {
  sessionDurationSeconds: number;
  activeProvider: string;
  activeModel: string;
  activeTheme: string;
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  contextWindowLimit: number;
  usagePercentage: number;
  estimatedCostUSD: number;
}

export class SessionTracker {
  private tokenCounter: TrajectoryTokenCounter = new TrajectoryTokenCounter();

  public recordTokenUsage(context: SessionContext, prompt: number, completion: number, costUSD?: number): void {
    context.tokenUsage.promptTokens += prompt;
    context.tokenUsage.completionTokens += completion;
    context.tokenUsage.totalTokens += prompt + completion;
    if (costUSD) {
      context.tokenUsage.estimatedCost += costUSD;
    }
  }

  public getStatusReport(context: SessionContext): StatusReport {
    const now = Date.now();
    const duration = Math.floor((now - context.startTime) / 1000);

    // Get active model capability for context window limit
    const capability = context.capabilityRegistry.getCapability(context.activeModel);
    const limit = capability ? capability.contextWindow : 128000;

    // Recalculate trajectory usage from messages if totalTokens is 0 or to ensure precision
    const trajectoryUsage = this.tokenCounter.calculateTrajectoryUsage(
      context.messages,
      [],
      '',
      limit
    );

    const promptTokens = context.tokenUsage.promptTokens || trajectoryUsage.messageTokens;
    const completionTokens = context.tokenUsage.completionTokens || 0;
    const totalTokens = context.tokenUsage.totalTokens > 0 ? context.tokenUsage.totalTokens : trajectoryUsage.totalTokens;
    const usagePercentage = limit > 0 ? Number(((totalTokens / limit) * 100).toFixed(2)) : 0;

    return {
      sessionDurationSeconds: duration,
      activeProvider: context.activeProvider,
      activeModel: context.activeModel,
      activeTheme: context.activeTheme.name,
      messageCount: context.messages.length,
      promptTokens,
      completionTokens,
      totalTokens,
      contextWindowLimit: limit,
      usagePercentage,
      estimatedCostUSD: Number(context.tokenUsage.estimatedCost.toFixed(5))
    };
  }

  public formatStatusReport(context: SessionContext): string {
    const report = this.getStatusReport(context);
    const mins = Math.floor(report.sessionDurationSeconds / 60);
    const secs = report.sessionDurationSeconds % 60;
    const timeFormatted = `${mins}m ${secs}s`;

    const lines: string[] = [
      '=== Session Status & Token Meter ===',
      `Elapsed Time:      ${timeFormatted}`,
      `Active Provider:   ${report.activeProvider}`,
      `Active Model:      ${report.activeModel}`,
      `Visual Theme:      ${report.activeTheme}`,
      `Messages Tracked:  ${report.messageCount}`,
      '------------------------------------',
      `Prompt Tokens:     ${report.promptTokens.toLocaleString()}`,
      `Completion Tokens: ${report.completionTokens.toLocaleString()}`,
      `Total Tokens:      ${report.totalTokens.toLocaleString()} / ${report.contextWindowLimit.toLocaleString()} (${report.usagePercentage}%)`,
      `Estimated Cost:    $${report.estimatedCostUSD.toFixed(4)} USD`
    ];

    return lines.join('\n');
  }
}

export function handleStatusCommand(args: string[], context: SessionContext): CLICommandResult {
  const tracker = new SessionTracker();
  const reportString = tracker.formatStatusReport(context);
  return {
    success: true,
    message: reportString,
    data: tracker.getStatusReport(context)
  };
}
