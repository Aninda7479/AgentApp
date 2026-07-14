import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { SessionContext } from '../types.js';
import { SessionTracker } from './status.js';

/**
 * Handles `/cost` (alias `/stats`): shows cumulative token usage and estimated
 * cost for the session, reusing the same tracker and capability registry that
 * backs `/status`.
 */
export function handleCostCommand(_args: string[], context: SessionContext): CLICommandResult {
  const tracker = new SessionTracker();
  const report = tracker.getStatusReport(context);
  const lines: string[] = [
    '=== Session Cost & Token Meter ===',
    `Prompt Tokens:     ${report.promptTokens.toLocaleString()}`,
    `Completion Tokens: ${report.completionTokens.toLocaleString()}`,
    `Total Tokens:      ${report.totalTokens.toLocaleString()} / ${report.contextWindowLimit.toLocaleString()} (${report.usagePercentage}%)`,
    `Messages:          ${report.messageCount}`,
    `Est. Cost:         $${report.estimatedCostUSD.toFixed(4)} USD`
  ];
  return { success: true, message: lines.join('\n') };
}

/** Minimal result envelope (mirrors types.CLICommandResult). */
interface CLICommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/** Registers the `/cost` (and `/stats`) slash command. */
export function registerCostCommand(router: SlashCommandRouter, session: SessionContext): void {
  const handler = (_ctx: SlashCommandContext): SlashCommandResult => {
    const res = handleCostCommand([], session);
    return { success: res.success, command: 'cost', output: res.message, data: res.data };
  };
  router.register('cost', handler, {
    description: 'Show cumulative session cost and token statistics',
    aliases: ['stats', 'usage'],
    usage: '/cost'
  });
}
