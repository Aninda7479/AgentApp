/**
 * Trajectory Utility Functions
 */

import type { TrajectoryStep } from '../core/types';
import { IpcBridge } from '../core/ipc';

export class TrajectoryUtils {
  static stripAnsi(value: string): string {
    return value.replace(/\x1b\[[0-9;]*m/g, '').replace(/ \[[0-9;]*m/g, '');
  }

  static truncatePreview(value: string, maxLength: number = 88): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
  }

  static summarizeToolContent(step: TrajectoryStep): string {
    const toolName = step.toolName || 'tool';
    const rawContent = TrajectoryUtils.stripAnsi(step.content || '');
    const trimmed = rawContent.trim();

    if (!trimmed) return toolName;

    if (toolName === 'read_file') {
      if (/%PDF-\d\.\d/i.test(trimmed) || /\uFFFD{2,}/.test(trimmed)) {
        return 'Opened a binary document preview';
      }
      const firstLine = TrajectoryUtils.truncatePreview(trimmed.split('\n')[0] || trimmed);
      return firstLine || 'Read file contents';
    }

    if (toolName === 'run_command') {
      const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
      const firstLine = lines[0] || '';
      const commandFailureMatch = firstLine.match(/^Error:\s*Command failed:\s*(.+)$/i);
      if (commandFailureMatch) {
        return `Command failed: ${TrajectoryUtils.truncatePreview(commandFailureMatch[1])}`;
      }
      if (/^Error:/i.test(firstLine)) {
        return TrajectoryUtils.truncatePreview(firstLine);
      }
      return TrajectoryUtils.truncatePreview(firstLine) || 'Executed command';
    }

    return TrajectoryUtils.truncatePreview(trimmed);
  }

  static async readLocalImageBase64(filePath: string): Promise<string | null> {
    if (!IpcBridge.isDesktop()) return null;
    try {
      return await IpcBridge.invoke<string | null>('read-file-base64', filePath);
    } catch {
      return null;
    }
  }
}
