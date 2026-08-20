import { AutostartManager, AutostartTarget } from '@superagent/core';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { CLICommandResult } from '../types.js';

/** Handles the `startup` command or `/startup` slash command. */
export async function handleStartupCommand(args: string[]): Promise<CLICommandResult> {
  const [sub, ...rest] = args;
  const target: AutostartTarget = rest.includes('--desktop') ? 'desktop' : 'cli';

  if (!sub || sub === 'status' || sub === 'check') {
    const info = await AutostartManager.getInfo(target);
    const lines = [
      '=== SuperAgent Startup Configuration ===',
      `Target:        ${info.target.toUpperCase()}`,
      `OS Platform:   ${info.platform}`,
      `Status:        ${info.enabled ? 'ENABLED (Runs automatically on system boot)' : 'DISABLED'}`,
      `Command:       ${info.command || 'N/A'}`
    ];
    if (info.entryLocation) {
      lines.push(`Location:      ${info.entryLocation}`);
    }
    lines.push('----------------------------------------');
    lines.push('Commands:');
    lines.push('  superagent startup enable   — Enable background service on system boot');
    lines.push('  superagent startup disable  — Disable automatic startup');
    lines.push('  superagent startup status   — Check startup registration status');

    return {
      success: true,
      message: lines.join('\n'),
      data: info
    };
  }

  if (sub === 'enable' || sub === 'on' || sub === 'add') {
    const portArg = rest.find((a) => /^\d+$/.test(a));
    const port = portArg ? Number(portArg) : 1469;
    const res = await AutostartManager.enable(target, { port });
    return {
      success: res.success,
      message: res.message,
      data: res
    };
  }

  if (sub === 'disable' || sub === 'off' || sub === 'remove') {
    const res = await AutostartManager.disable(target);
    return {
      success: res.success,
      message: res.message,
      data: res
    };
  }

  return {
    success: false,
    message: `Usage: superagent startup [enable | disable | status] [--desktop]\nUnknown startup action: ${sub}`
  };
}

/** Registers the `/startup` slash command in CLI router. */
export function registerStartupCommand(router: SlashCommandRouter): void {
  router.register(
    'startup',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      const res = await handleStartupCommand(ctx.args);
      return {
        success: res.success,
        command: ctx.command,
        output: res.message,
        error: res.success ? undefined : res.message,
        data: res.data
      };
    },
    {
      description: 'Manage OS auto-start on boot (CLI --serve or Desktop)',
      aliases: ['autostart', 'boot'],
      usage: '/startup [enable | disable | status]'
    }
  );
}
