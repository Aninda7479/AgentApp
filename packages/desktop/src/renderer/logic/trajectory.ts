import type { TrajectoryStep } from './types';
import { getIpc } from '../lib/electron';

/**
 * Pure rendering-support transforms and the Electron image-read boundary
 * for the trajectory canvas. None of these hold React state — they are
 * imported by `TrajectoryCanvas.tsx` so the component's JSX stays a thin
 * view layer that only renders what this service computes.
 */
export class TrajectoryService {
  /** Removes ANSI color / escape sequences from a raw tool-output string. */
  static stripAnsi(value: string): string {
    return value.replace(/\[[0-9;]*m/g, '');
  }

  /**
   * Collapses all whitespace, trims, and truncates a string into a single
   * one-line preview (appending `...` when it exceeds `maxLength`).
   */
  static truncatePreview(value: string, maxLength: number = 88): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength - 3)}...`
      : normalized;
  }

  /**
   * Produces a short, human-readable summary line for a tool step. Binary
   * (PDF) content and command output get tailored copy; everything else is
   * truncated to a one-line preview.
   */
  static summarizeToolContent(step: TrajectoryStep): string {
    const toolName = step.toolName || 'tool';
    const rawContent = TrajectoryService.stripAnsi(step.content || '');
    const trimmed = rawContent.trim();

    if (!trimmed) {
      return toolName;
    }

    if (toolName === 'read_file') {
      if (/%PDF-\d\.\d/i.test(trimmed) || /�{2,}/.test(trimmed)) {
        return 'Opened a binary document preview';
      }

      const firstLine = TrajectoryService.truncatePreview(trimmed.split('\n')[0] || trimmed);
      return firstLine || 'Read file contents';
    }

    if (toolName === 'run_command') {
      const lines = trimmed.split('\n').map(line => line.trim()).filter(Boolean);
      const firstLine = lines[0] || '';
      const commandFailureMatch = firstLine.match(/^Error:\s*Command failed:\s*(.+)$/i);
      if (commandFailureMatch) {
        return `Command failed: ${TrajectoryService.truncatePreview(commandFailureMatch[1])}`;
      }

      if (/^Error:/i.test(firstLine)) {
        return TrajectoryService.truncatePreview(firstLine);
      }

      return TrajectoryService.truncatePreview(firstLine) || 'Executed command';
    }

    return TrajectoryService.truncatePreview(trimmed);
  }

  /**
   * Reads a local image file as a base64 data URL via the Electron
   * `read-file-base64` IPC channel. Returns `null` when running outside
   * the Electron shell (so the component can show its loading placeholder).
   */
  static readLocalImageBase64(filePath: string): Promise<string | null> {
    const ipc = getIpc();
    if (!ipc) return Promise.resolve(null);
    return ipc.invoke('read-file-base64', filePath);
  }
}
