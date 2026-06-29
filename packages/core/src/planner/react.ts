import { ToolDefinition, ToolCall, BYOKConfig, AgentMessage } from '../types/agent.js';

export interface ReActStep {
  stepNumber: number;
  thought: string;
  action?: ToolCall;
  observation?: string;
  isFinal: boolean;
  finalOutput?: string;
}

export type LLMStepDriver = (
  messages: AgentMessage[],
  tools: ToolDefinition[],
  config?: BYOKConfig
) => Promise<{
  thought: string;
  action?: Omit<ToolCall, 'status'>;
  isFinal?: boolean;
  finalOutput?: string;
}>;

export interface ReActLoopOptions {
  maxSteps?: number;
  tools?: Map<string, ToolDefinition>;
  llmDriver?: LLMStepDriver;
}

export class ReActExecutor {
  private tools: Map<string, ToolDefinition>;
  private maxSteps: number;
  private llmDriver?: LLMStepDriver;

  constructor(options: ReActLoopOptions = {}) {
    this.tools = options.tools || new Map();
    this.maxSteps = options.maxSteps || 10;
    this.llmDriver = options.llmDriver;
  }

  public registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public async executeLoop(
    userPrompt: string,
    history: AgentMessage[] = [],
    config?: BYOKConfig
  ): Promise<{ steps: ReActStep[]; finalOutput: string }> {
    const steps: ReActStep[] = [];
    const messages: AgentMessage[] = [
      ...history,
      {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: userPrompt,
        timestamp: Date.now()
      }
    ];

    let currentStep = 1;
    let finished = false;
    let finalOutput = '';

    while (currentStep <= this.maxSteps && !finished) {
      let stepResult: { thought: string; action?: Omit<ToolCall, 'status'>; isFinal?: boolean; finalOutput?: string };

      if (this.llmDriver) {
        stepResult = await this.llmDriver(messages, Array.from(this.tools.values()), config);
      } else {
        stepResult = {
          thought: `Analyzing prompt: "${userPrompt}" (step ${currentStep})`,
          isFinal: true,
          finalOutput: `Executed ReAct loop for prompt: "${userPrompt}"`
        };
      }

      const stepRecord: ReActStep = {
        stepNumber: currentStep,
        thought: stepResult.thought,
        isFinal: Boolean(stepResult.isFinal),
        finalOutput: stepResult.finalOutput
      };

      if (stepResult.isFinal || !stepResult.action) {
        finished = true;
        finalOutput = stepResult.finalOutput || stepResult.thought;
        steps.push(stepRecord);
        break;
      }

      const toolCall: ToolCall = {
        ...stepResult.action,
        status: 'executing'
      };
      stepRecord.action = toolCall;

      const tool = this.tools.get(toolCall.toolName);
      let obsStr = '';
      if (tool && config) {
        try {
          const res = await tool.execute(toolCall.args, config);
          toolCall.status = 'completed';
          toolCall.result = res;
          obsStr = typeof res === 'string' ? res : JSON.stringify(res);
        } catch (err: unknown) {
          toolCall.status = 'failed';
          const errorMsg = err instanceof Error ? err.message : String(err);
          toolCall.result = { error: errorMsg };
          obsStr = `Error executing tool ${toolCall.toolName}: ${errorMsg}`;
        }
      } else if (!tool) {
        toolCall.status = 'failed';
        obsStr = `Tool ${toolCall.toolName} not found`;
      } else {
        toolCall.status = 'failed';
        obsStr = `BYOKConfig missing for tool execution`;
      }

      stepRecord.observation = obsStr;
      steps.push(stepRecord);

      messages.push({
        id: `msg-${Date.now()}-assistant-${currentStep}`,
        role: 'assistant',
        content: stepResult.thought,
        toolCalls: [toolCall],
        timestamp: Date.now()
      });

      messages.push({
        id: `msg-${Date.now()}-tool-${currentStep}`,
        role: 'tool',
        content: obsStr,
        timestamp: Date.now()
      });

      currentStep++;
    }

    if (!finished && steps.length >= this.maxSteps) {
      finalOutput = `Reached maximum steps (${this.maxSteps}) without completing task.`;
    }

    return { steps, finalOutput };
  }
}
