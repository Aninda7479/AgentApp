import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { ContextMessage } from './compact.js';

/**
 * Options for the `/last` slash command. Pulls the current conversation so the
 * command can re-surface the most recent model output.
 */
export interface LastCommandOptions {
  /** Returns the live conversation messages. */
  getMessages: () => ContextMessage[];
}

/**
 * Roles that count as "model output" worth recalling. `system` and `user`
 * turns are skipped — `/last` is about re-reading what the assistant said.
 */
const RECALLABLE_ROLES = new Set(['assistant', 'tool']);

/**
 * Find the most recent recallable message (assistant or tool) by scanning from
 * the end of the array. Returns `undefined` when no such message exists.
 */
export function findLastResponse(messages: ContextMessage[]): ContextMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (RECALLABLE_ROLES.has(message.role)) return message;
  }
  return undefined;
}

/** Render a recalled message with a short role-prefixed header. */
export function formatLastResponse(message: ContextMessage): string {
  const roleLabel = message.role === 'assistant' ? 'Assistant' : 'Tool';
  return `**Last ${roleLabel} message:**\n\n${message.content}`;
}

/**
 * Registers the `/last` slash command, which re-displays the last assistant
 * (or tool) message so the user can re-read or copy it without scrolling back
 * through the transcript. Aliased as `/recall`.
 */
export function registerLastCommand(router: SlashCommandRouter, options: LastCommandOptions): void {
  router.register(
    'last',
    (ctx: SlashCommandContext): SlashCommandResult => {
      const message = findLastResponse(options.getMessages());
      if (!message) {
        return {
          success: true,
          command: ctx.command,
          output: 'No assistant messages yet — start a conversation first.'
        };
      }
      return {
        success: true,
        command: ctx.command,
        output: formatLastResponse(message)
      };
    },
    {
      description: 'Re-display the last assistant message so you can re-read or copy it',
      aliases: ['recall'],
      usage: '/last'
    }
  );
}
