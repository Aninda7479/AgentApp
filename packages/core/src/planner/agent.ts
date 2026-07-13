import { AgentMessage, ToolDefinition, ExecutionTrajectory, BYOKConfig } from '../types/agent.js';
import { BYOKProviderManager } from '../providers/byok.js';

/** High-level agent engine managing trajectory, tools, and turn queue. */
export class SuperAgentEngine {
  private trajectory: ExecutionTrajectory;
  private tools: Map<string, ToolDefinition> = new Map();
  private turnQueue: string[] = [];
  private isProcessing: boolean = false;

  constructor(private providerManager: BYOKProviderManager, sessionId: string = 'default-session') {
    this.trajectory = {
      sessionId,
      messages: [],
      permissionMode: 'auto'
    };
  }

  public registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public queueTurn(userPrompt: string): void {
    this.turnQueue.push(userPrompt);
    if (!this.isProcessing) {
      this.processNextTurn();
    }
  }

  private async processNextTurn(): Promise<void> {
    if (this.turnQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const currentPrompt = this.turnQueue.shift()!;
    
    const userMsg: AgentMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: currentPrompt,
      timestamp: Date.now()
    };
    this.trajectory.messages.push(userMsg);

    try {
      const activeConfig = this.providerManager.getActiveConfig();
      const assistantMsg: AgentMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: `[SuperAgent Powered by ${activeConfig.provider.toUpperCase()}]\nProcessing request: "${currentPrompt}"`,
        timestamp: Date.now()
      };
      this.trajectory.messages.push(assistantMsg);
    } catch (err: any) {
      const errorMsg: AgentMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'system',
        content: `Configuration Error: ${err.message}`,
        timestamp: Date.now()
      };
      this.trajectory.messages.push(errorMsg);
    }

    this.processNextTurn();
  }

  public getTrajectory(): ExecutionTrajectory {
    return this.trajectory;
  }

  public getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
