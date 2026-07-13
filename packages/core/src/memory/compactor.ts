import { AgentMessage } from '../types/agent.js';
import { TrajectoryTokenCounter } from './tokens.js';

/** Options controlling trajectory compaction behavior. */
export interface CompactionOptions {
  maxContextTokens: number;
  triggerThresholdPercentage?: number; // Default: 80 (%)
  preserveRecentMessagesCount?: number; // Default: 4
}

/** Result of a compaction operation. */
export interface CompactionResult {
  compactedMessages: AgentMessage[];
  wasCompacted: boolean;
  tokensBefore: number;
  tokensAfter: number;
  summaryCreated?: string;
}

/** Compacts agent trajectories by summarizing older turns to fit within context window limits. */
export class TrajectoryCompactor {
  private tokenCounter: TrajectoryTokenCounter;

  constructor(tokenCounter?: TrajectoryTokenCounter) {
    this.tokenCounter = tokenCounter || new TrajectoryTokenCounter();
  }

  public async compactTrajectory(
    messages: AgentMessage[],
    options: CompactionOptions
  ): Promise<CompactionResult> {
    const thresholdPct = options.triggerThresholdPercentage ?? 80;
    const preserveCount = options.preserveRecentMessagesCount ?? 4;
    const limit = options.maxContextTokens;

    const initialReport = this.tokenCounter.calculateTrajectoryUsage(messages, [], '', limit);
    const tokensBefore = initialReport.totalTokens;

    const triggerLimit = (limit * thresholdPct) / 100;
    if (tokensBefore <= triggerLimit || messages.length <= preserveCount + 1) {
      return {
        compactedMessages: [...messages],
        wasCompacted: false,
        tokensBefore,
        tokensAfter: tokensBefore
      };
    }

    // Separate initial system message(s) and older vs recent messages
    const systemMessages: AgentMessage[] = [];
    const conversationMessages: AgentMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system' && conversationMessages.length === 0) {
        systemMessages.push(msg);
      } else {
        conversationMessages.push(msg);
      }
    }

    if (conversationMessages.length <= preserveCount) {
      return {
        compactedMessages: [...messages],
        wasCompacted: false,
        tokensBefore,
        tokensAfter: tokensBefore
      };
    }

    const olderMessages = conversationMessages.slice(0, conversationMessages.length - preserveCount);
    const recentMessages = conversationMessages.slice(conversationMessages.length - preserveCount);

    // Create compact summary of older turns
    const summaryLines: string[] = [];
    for (const msg of olderMessages) {
      let snippet = msg.content.trim();
      if (snippet.length > 150) {
        snippet = snippet.substring(0, 147) + '...';
      }
      summaryLines.push(`[${msg.role.toUpperCase()}]: ${snippet}`);
    }

    const summaryText = `[COMPACTED CONTEXT SUMMARY]\nThe following historical conversation turns were compacted to optimize memory:\n${summaryLines.join('\n')}`;

    const summaryMessage: AgentMessage = {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: summaryText,
      timestamp: Date.now()
    };

    const compactedMessages = [
      ...systemMessages,
      summaryMessage,
      ...recentMessages
    ];

    const finalReport = this.tokenCounter.calculateTrajectoryUsage(compactedMessages, [], '', limit);

    return {
      compactedMessages,
      wasCompacted: true,
      tokensBefore,
      tokensAfter: finalReport.totalTokens,
      summaryCreated: summaryText
    };
  }
}
