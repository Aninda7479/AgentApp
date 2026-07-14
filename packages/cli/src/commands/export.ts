import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { ContextMessage } from './compact.js';

/** Options for the `/export` slash command. */
export interface ExportCommandOptions {
  /** Returns the current conversation messages to serialize. */
  getMessages: () => ContextMessage[];
}

/** Human-readable label for a message role in the exported transcript. */
function roleLabel(role: ContextMessage['role']): string {
  switch (role) {
    case 'system':
      return 'System';
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'tool':
      return 'Tool';
    default:
      return role;
  }
}

/**
 * Renders the conversation as a Markdown transcript. System and tool messages
 * are included but visually de-emphasized so the human-readable exchange (user
 * ↔ assistant) stays front and center.
 */
export function formatConversationMarkdown(messages: ContextMessage[]): string {
  if (messages.length === 0) {
    return '# SuperAgent Conversation Export\n\n_No messages to export._\n';
  }

  const sections = messages
    .map((m, i) => {
      const label = roleLabel(m.role);
      const body = m.content?.trim() || '_empty_';
      if (m.role === 'tool') {
        return `## ${i + 1}. ${label}\n\n\`\`\`\n${body}\n\`\`\``;
      }
      return `## ${i + 1}. ${label}\n\n${body}`;
    })
    .join('\n\n');

  return `# SuperAgent Conversation Export\n\n${sections}\n`;
}

/**
 * Renders the conversation as a JSON array of `{ role, content }` records,
 * preserving order and tokens where present.
 */
export function formatConversationJSON(messages: ContextMessage[]): string {
  const records = messages.map((m) => {
    const rec: Record<string, unknown> = { role: m.role, content: m.content };
    if (typeof m.tokens === 'number') rec.tokens = m.tokens;
    return rec;
  });
  return JSON.stringify(records, null, 2);
}

/**
 * Registers the `/export` slash command, which serializes the current
 * conversation to a Markdown (default) or JSON (`--json`) transcript. When a
 * path is supplied the transcript is written to that file; otherwise it is
 * returned inline so the caller can print it to stdout.
 */
export function registerExportCommand(router: SlashCommandRouter, options: ExportCommandOptions): void {
  router.register(
    'export',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      const messages = options.getMessages();

      // Parse a leading --json flag (anywhere in args) and a trailing path.
      const asJson = ctx.args.includes('--json');
      const path = ctx.args.find((a) => a !== '--json') ?? '';

      const body = asJson
        ? formatConversationJSON(messages)
        : formatConversationMarkdown(messages);

      if (!path) {
        if (messages.length === 0) {
          return { success: true, command: ctx.command, output: 'No messages to export.' };
        }
        return {
          success: true,
          command: ctx.command,
          output: body,
          data: { format: asJson ? 'json' : 'markdown', count: messages.length }
        };
      }

      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, body, 'utf8');
        return {
          success: true,
          command: ctx.command,
          output: `Exported ${messages.length} message(s) to ${path} (${asJson ? 'JSON' : 'Markdown'}).`,
          data: { path, format: asJson ? 'json' : 'markdown', count: messages.length }
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          command: ctx.command,
          output: `Failed to export to "${path}": ${reason}`
        };
      }
    },
    {
      description: 'Export the current conversation to a file (Markdown or JSON)',
      aliases: ['save', 'dump'],
      usage: '/export [--json] [path]'
    }
  );
}
