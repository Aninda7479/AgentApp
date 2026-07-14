import { AgentMessage, ChatMessage, ToolDefinition } from '../types/agent.js';
import { contentToText } from '../providers/multimodal.js';

/** Token usage breakdown for a full context window. */
export interface TokenUsageReport {
  totalTokens: number;
  messageTokens: number;
  toolTokens: number;
  systemTokens: number;
  contextWindowLimit: number;
  usagePercentage: number;
}

/** Estimates token counts for messages, tools, and full trajectories. */
export class TrajectoryTokenCounter {
  /** Estimates tokens in a text (~4 chars per token). */
  public estimateTextTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    // Standard approximation: ~4 characters per token for English text & code
    const words = text.trim().split(/\s+/).length;
    const charCount = text.length;
    const estimatedByChar = Math.ceil(charCount / 4);
    const estimatedByWord = Math.ceil(words * 1.3);
    return Math.max(estimatedByChar, estimatedByWord);
  }

  /** Estimates tokens in a single message including tool calls. */
  public estimateMessageTokens(message: AgentMessage | ChatMessage): number {
    let tokens = 4; // Base per message formatting overhead
    tokens += this.estimateTextTokens(contentToText(message.content));

    if (message.toolCalls && message.toolCalls.length > 0) {
      for (const tc of message.toolCalls) {
        tokens += 6; // Overhead for tool call formatting
        tokens += this.estimateTextTokens(tc.toolName);
        tokens += this.estimateTextTokens(JSON.stringify(tc.args));
        if (tc.result) {
          tokens += this.estimateTextTokens(typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result));
        }
      }
    }

    return tokens;
  }

  /** Estimates tokens consumed by tool definitions. */
  public estimateToolTokens(tools: ToolDefinition[]): number {
    let tokens = 0;
    for (const tool of tools) {
      tokens += 8; // Tool definition schema overhead
      tokens += this.estimateTextTokens(tool.name);
      tokens += this.estimateTextTokens(tool.description);
      if (tool.parameters) {
        tokens += this.estimateTextTokens(JSON.stringify(tool.parameters));
      }
    }
    return tokens;
  }

  /** Calculates full token usage report for a message trajectory. */
  public calculateTrajectoryUsage(
    messages: (AgentMessage | ChatMessage)[],
    tools: ToolDefinition[] = [],
    systemPrompt: string = '',
    contextWindowLimit: number = 128000
  ): TokenUsageReport {
    let messageTokens = 0;
    let systemTokens = this.estimateTextTokens(systemPrompt);

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemTokens += this.estimateMessageTokens(msg);
      } else {
        messageTokens += this.estimateMessageTokens(msg);
      }
    }

    const toolTokens = this.estimateToolTokens(tools);
    const totalTokens = messageTokens + toolTokens + systemTokens;
    const usagePercentage = contextWindowLimit > 0 ? Number(((totalTokens / contextWindowLimit) * 100).toFixed(2)) : 0;

    return {
      totalTokens,
      messageTokens,
      toolTokens,
      systemTokens,
      contextWindowLimit,
      usagePercentage
    };
  }
}
