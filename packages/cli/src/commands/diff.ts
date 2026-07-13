import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';

/** A single line in a unified diff output. */
export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

/** Represents a pending file modification awaiting review. */
export interface DiffFileChange {
  id: string;
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  status: 'pending' | 'accepted' | 'rejected';
}

/** Aggregated counts of changes by status. */
export interface DiffSummary {
  totalFiles: number;
  pending: number;
  accepted: number;
  rejected: number;
}

/** Manages pending file diffs and provides accept/reject operations. */
export class DiffReviewer {
  private changes: Map<string, DiffFileChange> = new Map();

  /** Adds a new file change with original and modified content. */
  public addChange(filePath: string, originalContent: string, modifiedContent: string): DiffFileChange {
    const id = `diff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const change: DiffFileChange = {
      id,
      filePath,
      originalContent,
      modifiedContent,
      status: 'pending'
    };
    this.changes.set(id, change);
    return change;
  }

  /** Removes all tracked changes. */
  public clear(): void {
    this.changes.clear();
  }

  /** Returns only changes with status 'pending'. */
  public getPendingChanges(): DiffFileChange[] {
    return Array.from(this.changes.values()).filter((c) => c.status === 'pending');
  }

  /** Returns all tracked changes regardless of status. */
  public getAllChanges(): DiffFileChange[] {
    return Array.from(this.changes.values());
  }

  /** Finds a change by its ID or file path. */
  public getChange(idOrPath: string): DiffFileChange | undefined {
    if (this.changes.has(idOrPath)) {
      return this.changes.get(idOrPath);
    }
    return Array.from(this.changes.values()).find((c) => c.filePath === idOrPath);
  }

  /** Marks a change as accepted by ID or file path. */
  public accept(idOrPath: string): boolean {
    const change = this.getChange(idOrPath);
    if (change) {
      change.status = 'accepted';
      return true;
    }
    return false;
  }

  /** Marks a change as rejected by ID or file path. */
  public reject(idOrPath: string): boolean {
    const change = this.getChange(idOrPath);
    if (change) {
      change.status = 'rejected';
      return true;
    }
    return false;
  }

  /** Accepts all pending changes and returns the count accepted. */
  public acceptAll(): number {
    let count = 0;
    for (const change of this.changes.values()) {
      if (change.status === 'pending') {
        change.status = 'accepted';
        count++;
      }
    }
    return count;
  }

  /** Rejects all pending changes and returns the count rejected. */
  public rejectAll(): number {
    let count = 0;
    for (const change of this.changes.values()) {
      if (change.status === 'pending') {
        change.status = 'rejected';
        count++;
      }
    }
    return count;
  }

  /** Returns aggregated counts of changes by status. */
  public getSummary(): DiffSummary {
    const all = Array.from(this.changes.values());
    return {
      totalFiles: all.length,
      pending: all.filter((c) => c.status === 'pending').length,
      accepted: all.filter((c) => c.status === 'accepted').length,
      rejected: all.filter((c) => c.status === 'rejected').length
    };
  }

  /** Generates a simple line-by-line diff between two strings. */
  public static generateDiffLines(original: string, modified: string): DiffLine[] {
    const origLines = original ? original.split('\n') : [];
    const modLines = modified ? modified.split('\n') : [];
    const diffLines: DiffLine[] = [];

    let i = 0;
    let j = 0;
    // Walk both line arrays simultaneously, comparing line by line
    while (i < origLines.length || j < modLines.length) {
      // Lines match — emit as context (unchanged)
      if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
        diffLines.push({
          type: 'context',
          oldLineNumber: i + 1,
          newLineNumber: j + 1,
          content: origLines[i]
        });
        i++;
        j++;
      } else {
        // Line removed from original (or not found ahead in modified)
        if (i < origLines.length && (j >= modLines.length || !modLines.slice(j).includes(origLines[i]))) {
          diffLines.push({
            type: 'delete',
            oldLineNumber: i + 1,
            content: origLines[i]
          });
          i++;
        } else if (j < modLines.length) {
          diffLines.push({
            type: 'add',
            newLineNumber: j + 1,
            content: modLines[j]
          });
          j++;
        }
      }
    }

    return diffLines;
  }

  /** Renders diff lines into a human-readable formatted string. */
  public static renderFormattedDiff(filePath: string, diffLines: DiffLine[]): string {
    const output: string[] = [`=== Diff: ${filePath} ===`];
    for (const line of diffLines) {
      if (line.type === 'add') {
        output.push(`+ [${line.newLineNumber ?? ''}] ${line.content}`);
      } else if (line.type === 'delete') {
        output.push(`- [${line.oldLineNumber ?? ''}] ${line.content}`);
      } else {
        output.push(`  [${line.oldLineNumber ?? ''}] ${line.content}`);
      }
    }
    return output.join('\n');
  }
}

/** Registers the `/diff` slash command for reviewing file modifications. */
export function registerDiffCommand(router: SlashCommandRouter, reviewer: DiffReviewer): void {
  router.register(
    'diff',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      const subCommand = ctx.args[0]?.toLowerCase();
      const target = ctx.args[1];

      if (!subCommand || subCommand === 'list' || subCommand === 'summary') {
        const summary = reviewer.getSummary();
        const pending = reviewer.getPendingChanges();
        let out = `Pending Diffs: ${summary.pending}/${summary.totalFiles} files.\n`;
        if (pending.length > 0) {
          out += pending.map((p) => `- [${p.id}] ${p.filePath}`).join('\n');
        } else {
          out += 'No pending changes to review.';
        }
        return { success: true, command: ctx.command, output: out, data: summary };
      }

      if (subCommand === 'accept') {
        if (target === 'all') {
          const count = reviewer.acceptAll();
          return { success: true, command: ctx.command, output: `Accepted all ${count} pending diffs.` };
        } else if (target) {
          const ok = reviewer.accept(target);
          return ok
            ? { success: true, command: ctx.command, output: `Accepted diff for ${target}.` }
            : { success: false, command: ctx.command, error: `Diff not found: ${target}` };
        }
      }

      if (subCommand === 'reject') {
        if (target === 'all') {
          const count = reviewer.rejectAll();
          return { success: true, command: ctx.command, output: `Rejected all ${count} pending diffs.` };
        } else if (target) {
          const ok = reviewer.reject(target);
          return ok
            ? { success: true, command: ctx.command, output: `Rejected diff for ${target}.` }
            : { success: false, command: ctx.command, error: `Diff not found: ${target}` };
        }
      }

      if (subCommand === 'view' || subCommand === 'show') {
        if (target) {
          const change = reviewer.getChange(target);
          if (change) {
            const lines = DiffReviewer.generateDiffLines(change.originalContent, change.modifiedContent);
            const rendered = DiffReviewer.renderFormattedDiff(change.filePath, lines);
            return { success: true, command: ctx.command, output: rendered, data: change };
          }
          return { success: false, command: ctx.command, error: `Diff not found: ${target}` };
        }
      }

      return {
        success: false,
        command: ctx.command,
        error: 'Usage: /diff [list | accept <file|all> | reject <file|all> | view <file>]'
      };
    },
    {
      description: 'Review interactive terminal diffs and accept or reject file modifications',
      aliases: ['d'],
      usage: '/diff [list|accept|reject|view]'
    }
  );
}
