import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';

/** A single message in the conversation context with role and content. */
export interface ContextMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tokens?: number;
}

/** Configuration options for context compaction behavior. */
export interface CompactOptions {
  maxTokens?: number;
  keepRecentCount?: number;
  summarizer?: (messages: ContextMessage[]) => Promise<string> | string;
}

/** Result of a context compression operation with token savings. */
export interface CompactResult {
  originalCount: number;
  compactedCount: number;
  summaryAdded: boolean;
  messages: ContextMessage[];
  tokensSaved?: number;
}

/** Compresses conversation context by summarizing older messages. */
export class ContextCompressor {
  /** Estimates token count from text length (~4 chars per token). */
  public static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Compresses messages by replacing middle turns with a summary.
   * @param messages - Full conversation history
   * @param options - Compaction options (keepRecentCount, summarizer, etc.)
   */
  public static async compress(messages: ContextMessage[], options: CompactOptions = {}): Promise<CompactResult> {
    const keepRecent = options.keepRecentCount ?? 4;
    const originalCount = messages.length;

    if (messages.length <= keepRecent + 1) {
      return {
        originalCount,
        compactedCount: messages.length,
        summaryAdded: false,
        messages: [...messages]
      };
    }

    const systemMessages: ContextMessage[] = [];
    let startIndex = 0;
    // Preserve leading system messages (e.g. initial instructions)
    while (startIndex < messages.length && messages[startIndex].role === 'system') {
      systemMessages.push(messages[startIndex]);
      startIndex++;
    }

    // Split: recent messages to keep, middle messages to summarize
    const recentMessages = messages.slice(messages.length - keepRecent);
    const middleMessages = messages.slice(startIndex, messages.length - keepRecent);

    if (middleMessages.length === 0) {
      return {
        originalCount,
        compactedCount: messages.length,
        summaryAdded: false,
        messages: [...messages]
      };
    }

    let summaryText = `[Context summary: ${middleMessages.length} previous turns compacted]`;
    if (options.summarizer) {
      summaryText = await options.summarizer(middleMessages);
    }

    const summaryMessage: ContextMessage = {
      role: 'system',
      content: summaryText,
      tokens: ContextCompressor.estimateTokens(summaryText)
    };

    const newMessages = [...systemMessages, summaryMessage, ...recentMessages];

    const originalTokens = messages.reduce((acc, m) => acc + (m.tokens || ContextCompressor.estimateTokens(m.content)), 0);
    const compactedTokens = newMessages.reduce((acc, m) => acc + (m.tokens || ContextCompressor.estimateTokens(m.content)), 0);

    return {
      originalCount,
      compactedCount: newMessages.length,
      summaryAdded: true,
      messages: newMessages,
      tokensSaved: Math.max(0, originalTokens - compactedTokens)
    };
  }
}

/**
 * Registers the `/compact` slash command for context compression.
 * @param router - SlashCommandRouter to register on
 * @param getMessages - Returns current conversation messages
 * @param setMessages - Replaces conversation messages with compacted version
 * @param options - Compaction configuration
 */
export function registerCompactCommand(
  router: SlashCommandRouter,
  getMessages: () => ContextMessage[],
  setMessages: (messages: ContextMessage[]) => void,
  options: CompactOptions = {}
): void {
  router.register(
    'compact',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      const messages = getMessages();
      const result = await ContextCompressor.compress(messages, options);

      if (result.summaryAdded) {
        setMessages(result.messages);
        return {
          success: true,
          command: ctx.command,
          output: `Context compacted! Reduced turns from ${result.originalCount} to ${result.compactedCount}. Saved ~${result.tokensSaved || 0} tokens.`,
          data: result
        };
      } else {
        return {
          success: true,
          command: ctx.command,
          output: `Context is already compact (${result.originalCount} messages). No compaction needed.`,
          data: result
        };
      }
    },
    {
      description: 'Compress conversation context window and clear old message history',
      aliases: ['summarize', 'c'],
      usage: '/compact'
    }
  );
}
