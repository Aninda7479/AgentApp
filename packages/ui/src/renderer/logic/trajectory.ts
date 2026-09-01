import type { TrajectoryStep } from './types';
import { getIpc } from '../lib/ipc';

/**
 * Pure rendering-support transforms and the desktop image-read boundary
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
   * Returns a language badge icon, label, and accent color based on filename extension.
   */
  static getFileLanguageBadge(filename: string): { icon: string; label: string; color: string } {
    const clean = filename.split(/[/\\]/).pop() || filename;
    const ext = clean.split('.').pop()?.toLowerCase() || '';

    switch (ext) {
      case 'rs':
        return { icon: '🦀', label: 'Rust', color: 'text-orange-400' };
      case 'ts':
      case 'tsx':
        return { icon: '⚛️', label: 'TypeScript', color: 'text-cyan-400' };
      case 'js':
      case 'jsx':
      case 'mjs':
      case 'cjs':
        return { icon: '🟨', label: 'JavaScript', color: 'text-yellow-400' };
      case 'py':
        return { icon: '🐍', label: 'Python', color: 'text-emerald-400' };
      case 'css':
      case 'scss':
      case 'sass':
      case 'less':
        return { icon: '🎨', label: 'CSS', color: 'text-pink-400' };
      case 'html':
      case 'htm':
        return { icon: '🌐', label: 'HTML', color: 'text-orange-500' };
      case 'json':
      case 'yaml':
      case 'yml':
      case 'toml':
        return { icon: '📄', label: 'Config', color: 'text-blue-300' };
      case 'md':
      case 'markdown':
        return { icon: '📝', label: 'Markdown', color: 'text-purple-300' };
      case 'sh':
      case 'bash':
      case 'ps1':
      case 'bat':
      case 'cmd':
        return { icon: '⚡', label: 'Shell', color: 'text-green-300' };
      default:
        return { icon: '📄', label: 'File', color: 'text-slate-400' };
    }
  }

  /**
   * Parses and structures tool call details for modern Antigravity-style rendering.
   */
  static parseToolDetails(step: TrajectoryStep): {
    category: 'analyze' | 'edit' | 'command' | 'search' | 'thought' | 'task' | 'generic';
    actionLabel: string;
    icon: string;
    targetName: string;
    badgeText?: string;
    diffStats?: { added: number; removed: number };
    lineRange?: string;
    commandLine?: string;
    cwd?: string;
  } {
    const toolName = (step.toolName || '').toLowerCase();
    const input = step.metadata?.toolInput || {};
    const meta = step.metadata || {};

    // 1. File read / view / analyze
    if (toolName === 'view_file' || toolName === 'read_file' || toolName === 'fetch_file') {
      const summary = TrajectoryService.summarizeToolContent(step);
      const rawPath = input.AbsolutePath || input.path || input.FilePath || meta.filename || '';

      let filename = rawPath.split(/[/\\]/).pop() || rawPath || '';
      if (!filename || summary === 'Opened a binary document preview') {
        filename = summary || 'file';
      }

      const badge = TrajectoryService.getFileLanguageBadge(filename);

      let lineRange = '';
      if (input.StartLine !== undefined || input.EndLine !== undefined) {
        const start = input.StartLine || 1;
        const end = input.EndLine || '';
        lineRange = end ? `#L${start}-${end}` : `#L${start}`;
      }

      return {
        category: 'analyze',
        actionLabel: 'Analyzed',
        icon: badge.icon,
        targetName: filename,
        lineRange,
      };
    }

    // 2. File edit / replace / write
    if (
      toolName === 'edit_file' ||
      toolName === 'replace_file_content' ||
      toolName === 'write_to_file' ||
      toolName === 'patch_file' ||
      toolName === 'fs_write'
    ) {
      const rawPath =
        input.TargetFile || input.AbsolutePath || input.path || input.FilePath || meta.filename || '';
      const filename = rawPath.split(/[/\\]/).pop() || rawPath || step.toolName || 'file';
      const badge = TrajectoryService.getFileLanguageBadge(filename);

      let added = meta.addedLines ?? 0;
      let removed = meta.removedLines ?? 0;

      if (added === 0 && removed === 0 && input.ReplacementContent !== undefined) {
        const repLines = (input.ReplacementContent || '').split('\n').length;
        const targetLines = (input.TargetContent || '').split('\n').length;
        added = repLines;
        removed = targetLines;
      }

      return {
        category: 'edit',
        actionLabel: 'Edited',
        icon: badge.icon,
        targetName: filename,
        diffStats: { added, removed },
      };
    }

    // 3. Command execution
    if (toolName === 'run_command' || toolName === 'execute_command' || toolName === 'terminal') {
      const cmd = input.CommandLine || input.command || meta.command || '';
      const cwd = input.Cwd || input.cwd || '';
      const summary = TrajectoryService.summarizeToolContent(step);
      const shortCmd = cmd
        ? cmd.split('\n')[0]
        : summary !== 'run_command' && summary !== 'Executed command'
        ? summary
        : 'command';

      return {
        category: 'command',
        actionLabel: 'Ran',
        icon: '⚡',
        targetName: shortCmd,
        commandLine: cmd || (summary !== 'command' ? summary : ''),
        cwd,
      };
    }

    // 4. Search tools
    if (toolName === 'grep_search' || toolName === 'search_web' || toolName === 'find_by_name') {
      const query = input.Query || input.query || input.Pattern || input.pattern || '';
      return {
        category: 'search',
        actionLabel: 'Searched',
        icon: '🔍',
        targetName: query ? TrajectoryService.truncatePreview(query, 50) : 'codebase',
      };
    }

    // 5. Tasks / Schedule / Subagents
    if (toolName === 'schedule' || toolName === 'manage_task') {
      const duration = input.DurationSeconds;
      return {
        category: 'task',
        actionLabel: duration ? `Timed ${duration}s` : 'Explored 1 task',
        icon: '⏱️',
        targetName: '',
      };
    }

    if (toolName === 'invoke_subagent') {
      return {
        category: 'task',
        actionLabel: 'Delegated subagent',
        icon: '🤖',
        targetName: '',
      };
    }

    // 6. Thought
    if (step.type === 'thought') {
      const dur = meta.workedDuration || '13s';
      return {
        category: 'thought',
        actionLabel: `Thought for ${dur}`,
        icon: '💡',
        targetName: step.content ? TrajectoryService.truncatePreview(step.content, 60) : '',
      };
    }

    // Generic fallback
    const friendlyName = step.toolName ? step.toolName.replace(/_/g, ' ') : 'tool';
    return {
      category: 'generic',
      actionLabel: friendlyName,
      icon: '⚙️',
      targetName: TrajectoryService.summarizeToolContent(step),
    };
  }

  /**
   * Reads a local image file as a base64 data URL via the
   * `read-file-base64` IPC channel. Returns `null` when running outside
   * the desktop shell (so the component can show its loading placeholder).
   */
  static readLocalImageBase64(filePath: string): Promise<string | null> {
    const ipc = getIpc();
    if (!ipc) return Promise.resolve(null);
    return ipc.invoke('read-file-base64', filePath);
  }
}
