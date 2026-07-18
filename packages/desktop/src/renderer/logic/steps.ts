/**
 * `StepFactory` — constructs `TrajectoryStep` objects used throughout the
 * trajectory canvas. Centralizing step creation keeps the step *shape* in one
 * place so the design layer never hand-rolls `{ id, type, ... }` literals.
 *
 * Every builder accepts an optional `id` and `ts` (timestamp) so callers that
 * need a stable id (e.g. the streaming assistant step tracked by a ref) can
 * supply their own; otherwise a fresh id/timestamp is generated.
 */
import type { TrajectoryStep } from '../pages/Workspace/TrajectoryCanvas';

export class StepFactory {
  /** Generates a unique step id with the given prefix (e.g. "step-user"). */
  static id(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  /** Formats the current local time as a short "HH:MM" label for a step. */
  static timestamp(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /** Builds a user message step (the prompt the user sent). */
  static userStep(content: string, id?: string, ts?: string): TrajectoryStep {
    return { id: id ?? StepFactory.id('step-user'), type: 'user', content, timestamp: ts ?? StepFactory.timestamp() };
  }

  /** Builds an internal "thought" step (the agent narrating its plan). */
  static thoughtStep(content: string, id?: string, ts?: string): TrajectoryStep {
    return { id: id ?? StepFactory.id('step-thought'), type: 'thought', content, timestamp: ts ?? StepFactory.timestamp() };
  }

  /** Builds a tool-call step (running or finished). `status` defaults to running. */
  static toolCallStep(
    toolName: string,
    content: string,
    status: 'pending' | 'running' | 'success' | 'error' = 'running',
    id?: string,
    ts?: string
  ): TrajectoryStep {
    return {
      id: id ?? StepFactory.id(`tool-${toolName}`),
      type: 'tool_call',
      toolName,
      content,
      status,
      timestamp: ts ?? StepFactory.timestamp()
    };
  }

  /** Builds a tool-result step (a finished tool call). */
  static toolResultStep(
    toolName: string,
    content: string,
    id?: string,
    ts?: string
  ): TrajectoryStep {
    return {
      id: id ?? StepFactory.id(`tool-result-${toolName}`),
      type: 'tool_result',
      toolName,
      content,
      status: 'success',
      timestamp: ts ?? StepFactory.timestamp()
    };
  }

  /** Builds an assistant message step (the agent's final reply). */
  static assistantStep(content: string, id?: string, ts?: string): TrajectoryStep {
    return { id: id ?? StepFactory.id('step-assistant'), type: 'assistant', content, timestamp: ts ?? StepFactory.timestamp() };
  }

  /**
   * Builds a user step that represents an attached file (image/pdf/ppt). The
   * `fullPath` is stored in metadata so the media viewer can open it later.
   */
  static attachmentStep(filename: string, fullPath: string, id?: string, ts?: string): TrajectoryStep {
    const mediaType = filename.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : filename.toLowerCase().endsWith('.ppt')
      ? 'ppt'
      : 'image';
    return {
      id: id ?? StepFactory.id('attach'),
      type: 'user',
      content: `📎 Attached context: ${filename}`,
      timestamp: ts ?? StepFactory.timestamp(),
      metadata: { mediaType, mediaPath: fullPath }
    };
  }

  /** Builds an assistant step showing the result of an MCP tool invocation. */
  static mcpResultStep(serverName: string, toolName: string, resultText: string, id?: string, ts?: string): TrajectoryStep {
    return {
      id: id ?? StepFactory.id('step-mcp'),
      type: 'assistant',
      content: `🔧 MCP ${serverName}.${toolName}\n\n${resultText}`,
      timestamp: ts ?? StepFactory.timestamp()
    };
  }

  /** Builds an assistant step listing the available slash commands. */
  static helpStep(commands: { name: string; description: string }[], id?: string, ts?: string): TrajectoryStep {
    const helpText = commands.map((c) => `/${c.name} — ${c.description}`).join('\n');
    return {
      id: id ?? StepFactory.id('step-help'),
      type: 'assistant',
      content: `**Available slash commands:**\n${helpText}`,
      timestamp: ts ?? StepFactory.timestamp()
    };
  }
}
