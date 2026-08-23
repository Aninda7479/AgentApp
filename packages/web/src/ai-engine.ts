import {
  AgentEngine as CoreTsAgentEngine,
  MultiAgentManager,
  multiAgentManager,
  createBuiltinTools,
  isCommandAllowed,
  isContextOverflowError,
  CoreV2Client,
  type AgentEventType,
  type AgentEvent,
  type ToolDefinition,
  type ChatMessage,
  type AgentEngineConfig,
  type ImageAttachment,
} from '@superagent/core';

export class AgentEngine extends CoreTsAgentEngine {
  private v2Client: CoreV2Client;

  constructor(config: AgentEngineConfig, sessionId?: string) {
    super(config, sessionId);
    this.v2Client = new CoreV2Client();
  }

  override async run(
    userPrompt: string,
    onEvent: (event: AgentEvent) => void,
    attachments?: string[] | ImageAttachment[]
  ): Promise<void> {
    try {
      await this.v2Client.checkHealth();

      const sid = (this as any).sessionId || 'default-session';
      await this.v2Client.runChatStream(
        {
          prompt: userPrompt,
          provider: (this as any).config.provider as any,
          model_id: (this as any).config.model,
          api_key: (this as any).config.apiKey,
          base_url: (this as any).config.baseUrl,
          temperature: (this as any).config.temperature,
          max_tokens: (this as any).config.maxTokens,
          workspace: (this as any).config.projectRoot || process.cwd(),
        },
        (event) => {
          if (event.type === 'token' && event.content) {
            onEvent({ type: 'token', sessionId: sid, content: event.content });
          } else if (event.type === 'tool_call') {
            onEvent({
              type: 'tool_call',
              sessionId: sid,
              toolName: event.name,
              toolArgs: event.parameters || {},
            });
          } else if (event.type === 'tool_result') {
            onEvent({
              type: 'tool_result',
              sessionId: sid,
              toolName: event.name,
              toolResult: event.output || '',
            });
          } else if (event.type === 'usage' && event.usage) {
            onEvent({
              type: 'context',
              sessionId: sid,
              usage: {
                promptTokens: event.usage.prompt_tokens || 0,
                completionTokens: event.usage.completion_tokens || 0,
                totalTokens: event.usage.total_tokens || 0,
              },
            });
          } else if (event.type === 'error') {
            onEvent({ type: 'error', sessionId: sid, error: event.message || 'Unknown error' });
          }
        }
      );

      onEvent({ type: 'done', sessionId: sid });
    } catch {
      // Fallback to TS AgentEngine implementation
      await super.run(userPrompt, onEvent, attachments);
    }
  }
}

export {
  MultiAgentManager,
  multiAgentManager,
  createBuiltinTools,
  isCommandAllowed,
  isContextOverflowError,
};

export type {
  AgentEventType,
  AgentEvent,
  ToolDefinition,
  ChatMessage,
  AgentEngineConfig,
};
