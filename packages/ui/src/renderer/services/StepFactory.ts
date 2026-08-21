/**
 * Step Factory for Constructing Typed Trajectory Steps
 */

import type { TrajectoryStep, TrajectoryAttachment } from '../core/types';
import { FormatUtils } from '../util/format';

export class StepFactory {
  static id(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  static detectMediaType(filename: string): 'image' | 'pdf' | 'ppt' | 'audio' | 'video' | 'code' | 'file' {
    const lower = filename.toLowerCase();
    if (/\.(png|jpe?g|webp|gif|svg|bmp|ico)$/.test(lower)) return 'image';
    if (/\.(mp4|webm|mov|mkv|avi)$/.test(lower)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(lower)) return 'audio';
    if (lower.endsWith('.pdf')) return 'pdf';
    if (/\.(ppt|pptx)$/.test(lower)) return 'ppt';
    if (/\.(ts|tsx|js|jsx|py|rs|go|c|cpp|h|json|yaml|yml|md|html|css|sql|sh|ps1)$/.test(lower)) return 'code';
    return 'file';
  }

  static userStep(
    content: string,
    id?: string,
    ts?: string,
    sandboxMode?: 'sandboxed' | 'full',
    model?: string,
    attachments?: TrajectoryAttachment[]
  ): TrajectoryStep {
    return {
      id: id || StepFactory.id('step-user'),
      type: 'user',
      content,
      model,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: {
        model,
        ...(sandboxMode ? { sandboxMode } : {}),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      },
    };
  }

  static thoughtStep(content: string, id?: string, ts?: string, regenerationSeq?: number, model?: string): TrajectoryStep {
    return {
      id: id || StepFactory.id('step-thought'),
      type: 'thought',
      content,
      model,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: {
        model,
        ...(regenerationSeq !== undefined ? { regenerationSeq } : {}),
      },
    };
  }

  static toolCallStep(
    toolName: string,
    content: string,
    status: 'pending' | 'running' | 'success' | 'error' = 'running',
    id?: string,
    ts?: string,
    regenerationSeq?: number,
    sandboxMode?: 'sandboxed' | 'full',
    toolArgs?: Record<string, unknown>,
    model?: string
  ): TrajectoryStep {
    const cwd = (toolArgs?.Cwd || toolArgs?.cwd) as string | undefined;
    const command = (toolArgs?.CommandLine || toolArgs?.command) as string | undefined;

    return {
      id: id || StepFactory.id(`tool-${toolName}`),
      type: 'tool_call',
      toolName,
      content,
      status,
      model,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: {
        model,
        cwd,
        command,
        ...(regenerationSeq !== undefined ? { regenerationSeq } : {}),
        ...(sandboxMode ? { sandboxMode } : {}),
        ...(toolArgs ? { toolArgs } : {}),
      },
    };
  }

  static toolResultStep(
    toolName: string,
    content: string,
    id?: string,
    ts?: string,
    sandboxMode?: 'sandboxed' | 'full',
    toolArgs?: Record<string, unknown>,
    model?: string,
    exitCode?: number
  ): TrajectoryStep {
    const cwd = (toolArgs?.Cwd || toolArgs?.cwd) as string | undefined;
    const command = (toolArgs?.CommandLine || toolArgs?.command) as string | undefined;

    return {
      id: id || StepFactory.id(`tool-result-${toolName}`),
      type: 'tool_result',
      toolName,
      content,
      status: 'success',
      model,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: {
        model,
        cwd,
        command,
        toolResult: content,
        exitCode,
        ...(sandboxMode ? { sandboxMode } : {}),
        ...(toolArgs ? { toolArgs } : {}),
      },
    };
  }

  static assistantStep(
    content: string,
    id?: string,
    ts?: string,
    regenerationSeq?: number,
    sandboxMode?: 'sandboxed' | 'full',
    model?: string
  ): TrajectoryStep {
    return {
      id: id || StepFactory.id('step-assistant'),
      type: 'assistant',
      content,
      model,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: {
        model,
        ...(regenerationSeq !== undefined ? { regenerationSeq } : {}),
        ...(sandboxMode ? { sandboxMode } : {}),
      },
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
    const mediaType = StepFactory.detectMediaType(filename);
    const attachment: TrajectoryAttachment = {
      name: filename,
      path: fullPath,
      mediaType,
    };
    return {
      id: id || StepFactory.id('attach'),
      type: 'user',
      content: `📎 Attached context: ${filename}`,
      timestamp: ts || FormatUtils.formatTimestamp(),
      metadata: {
        mediaType,
        mediaPath: fullPath,
        attachments: [attachment]
      },
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
