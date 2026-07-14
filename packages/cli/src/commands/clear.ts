import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { ContextMessage } from './compact.js';

/**
 * Registers the `/clear` slash command to reset the conversation context.
 *
 * Note: the interactive TUI intercepts `/clear` directly to clear its own
 * chat state, but registering it on the router keeps the command part of the
 * unified command surface so non-interactive callers (and tests) behave
 * identically. Maps to the Claude/Codex `/clear` slash command.
 */
export function registerClearCommand(
  router: SlashCommandRouter,
  getMessages: () => ContextMessage[],
  setMessages: (messages: ContextMessage[]) => void
): void {
  router.register(
    'clear',
    (_ctx: SlashCommandContext): SlashCommandResult => {
      const before = getMessages().length;
      setMessages([]);
      return {
        success: true,
        command: 'clear',
        output: `Conversation cleared (${before} message(s) removed).`
      };
    },
    {
      description: 'Clear the current conversation context',
      aliases: ['reset', 'new'],
      usage: '/clear'
    }
  );
}
