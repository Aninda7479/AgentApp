import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tokens?: number;
}

export interface CompactOptions {
  maxTokens?: number;
  keepRecentCount?: number;
  summarizer?: (messages: ContextMessage[]) => Promise<string> | string;
}

export interface CompactResult {
  originalCount: number;
  compactedCount: number;
  summaryAdded: boolean;
  messages: ContextMessage[];
  tokensSaved?: number;
}

export class ContextCompressor {
  public static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

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
    while (startIndex < messages.length && messages[startIndex].role === 'system') {
      systemMessages.push(messages[startIndex]);
      startIndex++;
    }

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
