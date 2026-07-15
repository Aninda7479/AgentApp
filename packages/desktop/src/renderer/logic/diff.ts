/**
 * Pure diff computation for the `DiffViewer`. Performs a simple line-alignment
 * (looking ahead up to 5 modified lines for a match) and returns the aligned
 * lines plus addition/deletion counts. No React state — the component renders
 * whatever this returns.
 */

/** A single aligned line in a computed diff. */
export interface DiffLine {
  type: 'add' | 'delete' | 'normal';
  content: string;
  origLineNum?: number;
  modLineNum?: number;
}

/** Computes an aligned line diff between two code strings. */
export class DiffService {
  static computeDiff(
    originalCode: string,
    modifiedCode: string
  ): { lines: DiffLine[]; additions: number; deletions: number } {
    const origLines = originalCode.split('\n');
    const modLines = modifiedCode.split('\n');
    const diffLines: DiffLine[] = [];
    let additions = 0;
    let deletions = 0;

    let i = 0;
    let j = 0;

    while (i < origLines.length || j < modLines.length) {
      if (i < origLines.length && j < modLines.length) {
        if (origLines[i] === modLines[j]) {
          diffLines.push({
            type: 'normal',
            content: origLines[i],
            origLineNum: i + 1,
            modLineNum: j + 1
          });
          i++;
          j++;
        } else {
          let matched = false;
          for (let k = j + 1; k < Math.min(j + 5, modLines.length); k++) {
            if (origLines[i] === modLines[k]) {
              while (j < k) {
                diffLines.push({
                  type: 'add',
                  content: modLines[j],
                  modLineNum: j + 1
                });
                additions++;
                j++;
              }
              matched = true;
              break;
            }
          }
          if (!matched) {
            diffLines.push({
              type: 'delete',
              content: origLines[i],
              origLineNum: i + 1
            });
            deletions++;
            i++;
          }
        }
      } else if (i < origLines.length) {
        diffLines.push({
          type: 'delete',
          content: origLines[i],
          origLineNum: i + 1
        });
        deletions++;
        i++;
      } else if (j < modLines.length) {
        diffLines.push({
          type: 'add',
          content: modLines[j],
          modLineNum: j + 1
        });
        additions++;
        j++;
      }
    }

    return { lines: diffLines, additions, deletions };
  }
}
