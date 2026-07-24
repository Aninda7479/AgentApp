/**
 * Step Factory for Constructing Typed Trajectory Steps
 */

import type { TrajectoryStep } from '../core/types';
import { FormatUtils } from '../util/format';

export class StepFactory {
  static id(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  static userStep(content: string, id?: string, ts?: string): TrajectoryStep {
    return {
      id: id || StepFactory.id('step-user'),
      type: 'user',
      content,
      timestamp: ts || FormatUtils.formatTimestamp(),
    };
  }

  static thoughtStep(content: string, id?: string, ts?: string, regenerationSeq?: number): TrajectoryStep {
    return {
      id: id || StepFactory.id('step-thought'),
      type: 'thought',
      content,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: regenerationSeq !== undefined ? { regenerationSeq } : undefined,
    };
  }

  static toolCallStep(
    toolName: string,
    content: string,
    status: 'pending' | 'running' | 'success' | 'error' = 'running',
    id?: string,
    ts?: string,
    regenerationSeq?: number
  ): TrajectoryStep {
    return {
      id: id || StepFactory.id(`tool-${toolName}`),
      type: 'tool_call',
      toolName,
      content,
      status,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: regenerationSeq !== undefined ? { regenerationSeq } : undefined,
    };
  }

  static toolResultStep(toolName: string, content: string, id?: string, ts?: string): TrajectoryStep {
    return {
      id: id || StepFactory.id(`tool-result-${toolName}`),
      type: 'tool_result',
      toolName,
      content,
      status: 'success',
      timestamp: ts || FormatUtils.formatTimestamp(),
    };
  }

  static assistantStep(content: string, id?: string, ts?: string, regenerationSeq?: number): TrajectoryStep {
    return {
      id: id || StepFactory.id('step-assistant'),
      type: 'assistant',
      content,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: regenerationSeq !== undefined ? { regenerationSeq } : undefined,
    };
  }

  static mcpResultStep(serverName: string, toolName: string, resultText: string, id?: string, ts?: string): TrajectoryStep {
    return {
      id: id || StepFactory.id('step-mcp'),
      type: 'assistant',
      content: `🔧 MCP ${serverName}.${toolName}\n\n${resultText}`,
      timestamp: ts || FormatUtils.formatTimestamp(),
    };
  }

  static attachmentStep(filename: string, fullPath: string, id?: string, ts?: string): TrajectoryStep {
    const lower = filename.toLowerCase();
    const mediaType = lower.endsWith('.pdf') ? 'pdf' : lower.endsWith('.ppt') ? 'ppt' : 'image';
    return {
      id: id || StepFactory.id('attach'),
      type: 'user',
      content: `📎 Attached context: ${filename}`,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: { mediaType, mediaPath: fullPath },
    };
  }

  static helpStep(commands: Array<{ name: string; description: string }>, id?: string, ts?: string): TrajectoryStep {
    const helpText = commands.map((c) => `/${c.name} — ${c.description}`).join('\n');
    return {
      id: id || StepFactory.id('step-help'),
      type: 'assistant',
      content: `**Available slash commands:**\n${helpText}`,
      timestamp: ts || FormatUtils.formatTimestamp(),
    };
  }
}
