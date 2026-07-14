import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { ImageAttachment } from '@superagent/core';
import { validateImageFile, formatBytes, VIDEO_EXTENSIONS, MAX_IMAGE_BYTES } from '../attachments.js';

/** Options for the `/attach` slash command. */
export interface AttachCommandOptions {
  /**
   * Mutable queue of attachments that will be merged into the next message the
   * user sends (mirrors how the desktop composer queues attachments). Shared
   * by reference with the TUI, which clears it after sending.
   */
  pendingAttachments: ImageAttachment[];
}

/**
 * Registers the `/attach` slash command for queuing image files onto the next
 * message. Drag-and-dropping an image path into the prompt also attaches it
 * (handled in the TUI), but `/attach` gives an explicit, listable control.
 */
export function registerAttachCommand(router: SlashCommandRouter, options: AttachCommandOptions): void {
  router.register(
    'attach',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      const sub = (ctx.args[0] ?? '').toLowerCase();

      // `/attach` (no args) or `/attach list` — show the pending queue.
      if (ctx.args.length === 0 || sub === 'list') {
        if (options.pendingAttachments.length === 0) {
          return {
            success: true,
            command: ctx.command,
            output: 'No pending attachments. Use /attach <path> to queue an image for the next message.'
          };
        }
        const lines = options.pendingAttachments.map(
          (a, i) => `${i + 1}. ${a.path} (${a.mediaType}, ${formatBytes(a.size)})`
        );
        return {
          success: true,
          command: ctx.command,
          output: `Pending attachments (sent with your next message):\n${lines.join('\n')}`
        };
      }

      // `/attach clear` — empty the queue.
      if (sub === 'clear') {
        options.pendingAttachments.length = 0;
        return { success: true, command: ctx.command, output: 'Cleared all pending attachments.' };
      }

      // `/attach <path>` — validate and queue a single image.
      const target = ctx.args.join(' ').trim();
      if (!target) {
        return { success: false, command: ctx.command, output: 'Usage: /attach <image-path> | list | clear' };
      }

      // Video containers can't be sent to vision models via chat completions.
      const targetExt = target.split('.').pop()?.toLowerCase() ?? '';
      if (VIDEO_EXTENSIONS.includes(targetExt)) {
        return {
          success: false,
          command: ctx.command,
          output: `Could not attach "${target}". Video files are not supported by vision models — attach an image instead (png/jpg/jpeg/gif/webp, under ${formatBytes(MAX_IMAGE_BYTES)}).`
        };
      }

      const att = await validateImageFile(target);
      if (!att) {
        return {
          success: false,
          command: ctx.command,
          output: `Could not attach "${target}". It must be an existing, readable image file (png/jpg/jpeg/gif/webp) under ${formatBytes(MAX_IMAGE_BYTES)}.`
        };
      }

      options.pendingAttachments.push(att);
      return {
        success: true,
        command: ctx.command,
        output: `Attached: ${att.path} (${att.mediaType}, ${formatBytes(att.size)}). It will be sent with your next message.`
      };
    },
    {
      description: 'Queue an image file to attach to your next message (drag-and-drop a path also works)',
      aliases: ['img'],
      usage: '/attach <image-path> | list | clear'
    }
  );
}
