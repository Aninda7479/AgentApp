/** Options for generating a unified diff. */
export interface DiffOptions {
  filePath?: string;
  contextLines?: number;
}

/** Generates unified diffs using LCS-based comparison. */
export class UnifiedDiffGenerator {
  public generateDiff(oldContent: string, newContent: string, options: DiffOptions = {}): string {
    const filePath = options.filePath ?? 'file';
    const oldLines = oldContent === '' ? [] : oldContent.split(/\r?\n/);
    const newLines = newContent === '' ? [] : newContent.split(/\r?\n/);

    if (oldContent === newContent) {
      return '';
    }

    const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
    const lcsMatrix = this.computeLCS(oldLines, newLines);
    const edits = this.backtrackLCS(lcsMatrix, oldLines, newLines);

    const hunks = this.createHunks(edits, options.contextLines ?? 3);
    if (hunks.length === 0) {
      return '';
    }

    return header + hunks.join('\n') + '\n';
  }

  private computeLCS(oldLines: string[], newLines: string[]): number[][] {
    const m = oldLines.length;
    const n = newLines.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    return dp;
  }

  private backtrackLCS(
    dp: number[][],
    oldLines: string[],
    newLines: string[]
  ): Array<{ type: 'same' | 'add' | 'delete'; line: string; oldLineNum: number; newLineNum: number }> {
    let i = oldLines.length;
    let j = newLines.length;
    const result: Array<{ type: 'same' | 'add' | 'delete'; line: string; oldLineNum: number; newLineNum: number }> = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        result.push({ type: 'same', line: oldLines[i - 1], oldLineNum: i, newLineNum: j });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.push({ type: 'add', line: newLines[j - 1], oldLineNum: i + 1, newLineNum: j });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        result.push({ type: 'delete', line: oldLines[i - 1], oldLineNum: i, newLineNum: j + 1 });
        i--;
      }
    }
    return result.reverse();
  }

  private createHunks(
    edits: Array<{ type: 'same' | 'add' | 'delete'; line: string; oldLineNum: number; newLineNum: number }>,
    contextLines: number
  ): string[] {
    const hunks: string[] = [];
    let currentHunk: typeof edits = [];

    for (let idx = 0; idx < edits.length; idx++) {
      const edit = edits[idx];
      const isDiff = edit.type !== 'same';

      if (isDiff) {
        if (currentHunk.length === 0) {
          const startCtx = Math.max(0, idx - contextLines);
          for (let c = startCtx; c < idx; c++) {
            currentHunk.push(edits[c]);
          }
        }
        currentHunk.push(edit);
      } else if (currentHunk.length > 0) {
        let futureDiff = false;
        for (let f = idx; f < Math.min(edits.length, idx + contextLines * 2 + 1); f++) {
          if (edits[f].type !== 'same') {
            futureDiff = true;
            break;
          }
        }

        if (futureDiff) {
          currentHunk.push(edit);
        } else {
          for (let c = idx; c < Math.min(edits.length, idx + contextLines); c++) {
            currentHunk.push(edits[c]);
          }
          hunks.push(this.formatHunk(currentHunk));
          currentHunk = [];
        }
      }
    }

    if (currentHunk.length > 0) {
      hunks.push(this.formatHunk(currentHunk));
    }

    return hunks;
  }

  private formatHunk(
    hunkEdits: Array<{ type: 'same' | 'add' | 'delete'; line: string; oldLineNum: number; newLineNum: number }>
  ): string {
    const oldEdits = hunkEdits.filter(e => e.type !== 'add');
    const newEdits = hunkEdits.filter(e => e.type !== 'delete');

    const oldStart = oldEdits.length > 0 ? oldEdits[0].oldLineNum : 0;
    const oldLength = oldEdits.length;
    const newStart = newEdits.length > 0 ? newEdits[0].newLineNum : 0;
    const newLength = newEdits.length;

    let header = `@@ -${oldStart},${oldLength} +${newStart},${newLength} @@`;
    const lines = hunkEdits.map(e => {
      if (e.type === 'add') return `+${e.line}`;
      if (e.type === 'delete') return `-${e.line}`;
      return ` ${e.line}`;
    });

    return [header, ...lines].join('\n');
  }
}
