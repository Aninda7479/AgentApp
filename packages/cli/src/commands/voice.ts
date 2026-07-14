import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';

/**
 * Registers the `/voice` slash command. The headless CLI has no microphone, so
 * this acknowledges the limitation and points users to the Desktop/Web clients
 * where dictation is available. Kept as a real, discoverable command so the
 * documented slash-command surface is complete and consistent.
 */
export function registerVoiceCommand(router: SlashCommandRouter): void {
  router.register(
    'voice',
    (ctx: SlashCommandContext): SlashCommandResult => {
      const sub = ctx.args[0];
      if (sub === 'on' || sub === 'off' || sub === 'toggle') {
        return {
          success: true,
          command: ctx.command,
          output:
            'Voice dictation is not available in the headless CLI (no microphone input). ' +
            'Use the Desktop or Web client to enable microphone dictation.'
        };
      }
      return {
        success: true,
        command: ctx.command,
        output:
          'Voice dictation: not supported in this CLI build. The Desktop and Web clients provide ' +
          'microphone dictation. Pass `on`/`off`/`toggle` to acknowledge the preference.'
      };
    },
    {
      description: 'Toggle voice dictation mode (available in Desktop/Web; CLI is headless)',
      aliases: ['dictate', 'mic'],
      usage: '/voice [on | off | toggle]'
    }
  );
}
