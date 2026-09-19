import type { TrajectoryStep } from './types';
import { getIpc } from '../lib/ipc';

export interface ParsedThinkingContent {
  thinking: string | null;
  mainContent: string;
  isThinkingActive: boolean;
}

/**
 * Pure rendering-support transforms and the desktop image-read boundary
 * for the trajectory canvas. None of these hold React state — they are
 * imported by `TrajectoryCanvas.tsx` so the component's JSX stays a thin
 * view layer that only renders what this service computes.
 */
export class TrajectoryService {
  /**
   * Separates reasoning/thinking blocks (<think>, <thought>, <reasoning>) from
   * the final assistant response text. Handles completed tags and active streaming
   * unclosed tags.
   */
  static parseThinkingContent(content: string): ParsedThinkingContent {
    if (!content) {
      return { thinking: null, mainContent: '', isThinkingActive: false };
    }

    const thinkTagRegex = /<(think|thought|reasoning)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi;
    const thoughts: string[] = [];
    let isThinkingActive = false;

    // 1. Extract all closed thinking blocks
    let stripped = content.replace(thinkTagRegex, (_match, _tag, inner) => {
      if (inner && inner.trim()) {
        thoughts.push(inner.trim());
      }
      return '';
    });

    // 2. Check for an unclosed thinking block at the end (active streaming)
    const unclosedMatch = stripped.match(/<(think|thought|reasoning)(?:\s+[^>]*)?>([\s\S]*)$/i);
    if (unclosedMatch) {
      isThinkingActive = true;
      const unclosedContent = unclosedMatch[2];
      if (unclosedContent && unclosedContent.trim()) {
        thoughts.push(unclosedContent.trim());
      }
      stripped = stripped.slice(0, unclosedMatch.index);
    }

    const thinking = thoughts.length > 0 ? thoughts.join('\n\n') : null;
    const mainContent = stripped.replace(/^\n+/, '');

    return { thinking, mainContent, isThinkingActive };
  }

  /** Removes ANSI color / escape sequences from a raw tool-output string. */
  static stripAnsi(value: string): string {
    return value.replace(/ \[[0-9;]*m/g, '');
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

    if (toolName === 'read_file' || toolName === 'view_file' || toolName === 'read') {
      if (/%PDF-\d\.\d/i.test(trimmed) || /\uFFFD{2,}/.test(trimmed)) {
        return 'Opened a binary document preview';
      }

      const firstLine = TrajectoryService.truncatePreview(trimmed.split('\n')[0] || trimmed);
      return firstLine || 'Read file contents';
    }

    if (toolName === 'run_command' || toolName === 'bash') {
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

    if (toolName === 'plan') {
      return 'Updated execution roadmap';
    }

    if (toolName === 'todo' || toolName === 'todowrite') {
      return 'Updated session task checklist';
    }

    if (toolName === 'skill') {
      return 'Loaded agent skill instructions';
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
    if (toolName === 'view_file' || toolName === 'read_file' || toolName === 'fetch_file' || toolName === 'read') {
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
      toolName === 'write_file' ||
      toolName === 'write' ||
      toolName === 'edit' ||
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
    if (toolName === 'run_command' || toolName === 'execute_command' || toolName === 'terminal' || toolName === 'bash') {
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

    // 4. Web browser navigation / fetch
    if (toolName === 'browser_navigate' || toolName === 'webfetch' || toolName === 'read_url_content') {
      const targetUrl = input.url || input.Url || input.URL || input.link || '';
      return {
        category: 'search',
        actionLabel: 'Browsed',
        icon: '🌐',
        targetName: targetUrl ? TrajectoryService.truncatePreview(targetUrl, 50) : 'webpage',
      };
    }

    // 5. Search tools (Grep, Web Search, Glob)
    if (
      toolName === 'grep_search' ||
      toolName === 'grep' ||
      toolName === 'search_web' ||
      toolName === 'web_search' ||
      toolName === 'websearch' ||
      toolName === 'find_by_name' ||
      toolName === 'glob'
    ) {
      const query = input.Query || input.query || input.Pattern || input.pattern || '';
      return {
        category: 'search',
        actionLabel: 'Searched',
        icon: '🔍',
        targetName: query ? TrajectoryService.truncatePreview(query, 50) : 'codebase',
      };
    }

    // 6. Active Execution Plan ("a plan to go")
    if (toolName === 'plan' || toolName === 'roadmap') {
      const title = input.title || input.goal || input.objective || (input.action ? `plan: ${input.action}` : 'roadmap');
      return {
        category: 'task',
        actionLabel: 'Planned roadmap',
        icon: '🗺️',
        targetName: TrajectoryService.truncatePreview(title, 45),
      };
    }

    // 7. Todo checklist manager
    if (toolName === 'todo' || toolName === 'todowrite') {
      const taskDesc = input.task || (Array.isArray(input.items) ? `${input.items.length} tasks` : 'checklist');
      return {
        category: 'task',
        actionLabel: 'Updated checklist',
        icon: '☑️',
        targetName: TrajectoryService.truncatePreview(taskDesc, 45),
      };
    }

    // 8. Skill loader & execution
    if (toolName === 'skill' || toolName === 'load_skill') {
      const skillName = input.name || input.skill_name || input.id || 'skills';
      return {
        category: 'task',
        actionLabel: 'Loaded skill',
        icon: '✨',
        targetName: TrajectoryService.truncatePreview(skillName, 40),
      };
    }

    // 9. Tasks / Schedule / Subagents
    if (toolName === 'schedule' || toolName === 'manage_task') {
      const duration = input.DurationSeconds;
      return {
        category: 'task',
        actionLabel: duration ? `Timed ${duration}s` : 'Explored 1 task',
        icon: '⏱️',
        targetName: '',
      };
    }

    if (toolName === 'invoke_subagent' || toolName === 'run_subagent' || toolName === 'task') {
      return {
        category: 'task',
        actionLabel: 'Delegated subagent',
        icon: '🤖',
        targetName: '',
      };
    }

    // 6. Thought
    if (step.type === 'thought') {
      const isRunning = step.status === 'running';
      const dur = meta.workedDuration || '13s';
      return {
        category: 'thought',
        actionLabel: isRunning ? 'Thinking...' : `Thought for ${dur}`,
        icon: '💡',
        targetName: step.content
          ? TrajectoryService.truncatePreview(step.content.replace(/\s+/g, ' '), 60)
          : '',
      };
    }

    // 7. Directory / artifact exploration
    if (toolName === 'list_dir' || toolName === 'list_files' || toolName === 'list_artifacts') {
      const dirPath = (input.DirectoryPath || input.directory || input.path || '') as string;
      const target = dirPath ? dirPath.split(/[/\\]/).pop() || dirPath : '';
      return {
        category: 'search',
        actionLabel: toolName === 'list_artifacts' ? 'Listed artifacts' : 'Explored directory',
        icon: toolName === 'list_artifacts' ? '🎨' : '📁',
        targetName: target,
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
   * Categorizes trajectory steps into thinking steps (thoughts, tool calls, and intermediate
   * pre-tool thoughts) and final assistant steps to be displayed in chat.
   *
   * If all assistant steps occur before the last tool call (e.g. due to streaming buffer
   * updates or tool calls appended late), any assistant step with substantive non-thinking
   * content is promoted to the assistant steps so the user's answer is never buried or lost.
   */
  static categorizeTurnSteps(steps: TrajectoryStep[]): {
    baseThinkingSteps: TrajectoryStep[];
    rawAssistantSteps: TrajectoryStep[];
    toolSteps: TrajectoryStep[];
  } {
    const lastToolIdx = [...steps].reverse().findIndex((s) => s.type === 'tool_call' || s.type === 'tool_result');
    const lastToolAbsoluteIdx = lastToolIdx === -1 ? -1 : steps.length - 1 - lastToolIdx;

    let rawAssistantSteps = steps.filter((s, idx) => s.type === 'assistant' && idx >= lastToolAbsoluteIdx);

    let promotedAssistantStepId: string | null = null;
    if (rawAssistantSteps.length === 0) {
      const candidateAssistantSteps = steps.filter((s) => s.type === 'assistant');
      if (candidateAssistantSteps.length > 0) {
        const substantive = [...candidateAssistantSteps].reverse().find((s) => {
          const parsed = TrajectoryService.parseThinkingContent(s.content);
          return parsed.mainContent.trim().length > 0;
        });
        const chosen = substantive || candidateAssistantSteps[candidateAssistantSteps.length - 1];
        rawAssistantSteps = [chosen];
        promotedAssistantStepId = chosen.id;
      }
    }

    const baseThinkingSteps = steps.filter((s, idx) => {
      if (s.id === promotedAssistantStepId) return false;
      if (s.type === 'thought') return true;
      if (s.type === 'tool_call' || s.type === 'tool_result') return true;
      if (s.type === 'assistant' && idx < lastToolAbsoluteIdx) return true;
      return false;
    });

    const toolSteps = steps.filter((s) => s.type === 'tool_call' || s.type === 'tool_result');

    return { baseThinkingSteps, rawAssistantSteps, toolSteps };
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
