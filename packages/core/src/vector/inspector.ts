/** A single message in the LLM prompt context. */
export interface ContextPayloadMessage {
  role: string;
  content: string;
  name?: string;
}

/** A tool function definition included in the prompt. */
export interface ContextPayloadTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** A single vector-retrieval result injected into context. */
export interface ContextPayloadVectorItem {
  source: string;
  content: string;
  score?: number;
}

/** The complete context payload being sent to an LLM. */
export interface ContextPayload {
  systemPrompt?: string;
  messages?: ContextPayloadMessage[];
  tools?: ContextPayloadTool[];
  vectorContext?: ContextPayloadVectorItem[];
}

/** Token count breakdown across context sections. */
export interface TokenDistribution {
  system: number;
  messages: number;
  tools: number;
  vectorContext: number;
  total: number;
}

/** Full debug report with token estimates and formatted dump. */
export interface ContextDebugReport {
  timestamp: string;
  totalEstimatedTokens: number;
  tokenDistribution: TokenDistribution;
  formattedDump: string;
  payloadSummary: {
    messageCount: number;
    toolCount: number;
    vectorItemCount: number;
  };
}

/** Inspects LLM prompt context and generates token distribution reports. */
export class ContextInspector {
  /**
   * Inspects LLM prompt payload and generates detailed token breakdown & raw debug dump.
   */
  public inspectContext(payload: ContextPayload): ContextDebugReport {
    const timestamp = new Date().toISOString();
    const tokenDistribution = this.calculateTokenDistribution(payload);

    const messageCount = payload.messages?.length ?? 0;
    const toolCount = payload.tools?.length ?? 0;
    const vectorItemCount = payload.vectorContext?.length ?? 0;

    const formattedDump = this.generateDumpText(payload, tokenDistribution);

    return {
      timestamp,
      totalEstimatedTokens: tokenDistribution.total,
      tokenDistribution,
      formattedDump,
      payloadSummary: {
        messageCount,
        toolCount,
        vectorItemCount,
      },
    };
  }

  /**
   * Helper to estimate token counts (~4 characters per token).
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  private calculateTokenDistribution(payload: ContextPayload): TokenDistribution {
    const system = this.estimateTokens(payload.systemPrompt ?? '');

    let messages = 0;
    if (payload.messages) {
      for (const msg of payload.messages) {
        messages += this.estimateTokens(msg.role) + this.estimateTokens(msg.content);
        if (msg.name) messages += this.estimateTokens(msg.name);
      }
    }

    let tools = 0;
    if (payload.tools) {
      for (const tool of payload.tools) {
        tools += this.estimateTokens(tool.name) + this.estimateTokens(tool.description);
        if (tool.parameters) {
          tools += this.estimateTokens(JSON.stringify(tool.parameters));
        }
      }
    }

    let vectorContext = 0;
    if (payload.vectorContext) {
      for (const vec of payload.vectorContext) {
        vectorContext += this.estimateTokens(vec.source) + this.estimateTokens(vec.content);
      }
    }

    const total = system + messages + tools + vectorContext;
    return { system, messages, tools, vectorContext, total };
  }

  private generateDumpText(payload: ContextPayload, dist: TokenDistribution): string {
    const sections: string[] = [];

    sections.push(`================ CONTEXT DEBUG DUMP ================`);
    sections.push(`Total Tokens: ~${dist.total} (Sys: ${dist.system}, Msg: ${dist.messages}, Tools: ${dist.tools}, Vec: ${dist.vectorContext})\n`);

    if (payload.systemPrompt) {
      sections.push(`--- [SYSTEM PROMPT] (${dist.system} tokens) ---`);
      sections.push(payload.systemPrompt);
      sections.push('');
    }

    if (payload.vectorContext && payload.vectorContext.length > 0) {
      sections.push(`--- [VECTOR RETRIEVAL CONTEXT] (${dist.vectorContext} tokens) ---`);
      payload.vectorContext.forEach((vec, idx) => {
        const scoreStr = vec.score !== undefined ? ` (score: ${vec.score.toFixed(3)})` : '';
        sections.push(`[Fragment #${idx + 1} | Source: ${vec.source}${scoreStr}]`);
        sections.push(vec.content);
      });
      sections.push('');
    }

    if (payload.tools && payload.tools.length > 0) {
      sections.push(`--- [REGISTERED TOOLS SCHEMAS] (${dist.tools} tokens) ---`);
      payload.tools.forEach((tool) => {
        sections.push(`Tool: ${tool.name} - ${tool.description}`);
        if (tool.parameters) {
          sections.push(`Schema: ${JSON.stringify(tool.parameters)}`);
        }
      });
      sections.push('');
    }

    if (payload.messages && payload.messages.length > 0) {
      sections.push(`--- [CONVERSATION TRAJECTORY] (${dist.messages} tokens) ---`);
      payload.messages.forEach((msg, idx) => {
        const nameStr = msg.name ? ` (${msg.name})` : '';
        sections.push(`[#${idx + 1} ${msg.role.toUpperCase()}${nameStr}]:`);
        sections.push(msg.content);
      });
      sections.push('');
    }

    sections.push(`====================================================`);
    return sections.join('\n');
  }
}
