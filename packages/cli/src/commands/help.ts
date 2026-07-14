import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { formatSlashCommandHelp } from './registry.js';

/**
 * Registers the `/help` slash command, exposing the same command listing the
 * interactive TUI prints. Wiring it on the router means non-interactive
 * callers (and tests) get identical help output.
 */
export function registerHelpCommand(router: SlashCommandRouter): void {
  router.register(
    'help',
    (_ctx: SlashCommandContext): SlashCommandResult => {
      return {
        success: true,
        command: 'help',
        output: formatSlashCommandHelp(router)
      };
    },
    {
      description: 'Show the list of available slash commands',
      aliases: ['?', 'h'],
      usage: '/help'
    }
  );
}
