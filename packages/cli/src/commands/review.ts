import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';

/** Severity tier for a code-review finding. */
export type ReviewSeverity = 'critical' | 'warning' | 'info';

/** A single issue surfaced while reviewing source files. */
export interface ReviewFinding {
  file: string;
  line: number;
  severity: ReviewSeverity;
  category: string;
  message: string;
}

/** Aggregated result of a static code review. */
export interface ReviewReport {
  filesScanned: number;
  findings: ReviewFinding[];
  summary: { critical: number; warning: number; info: number };
}

/** A source file with its content, used as input to the reviewer. */
export interface ReviewFile {
  path: string;
  content: string;
}

/**
 * Heuristic, network-free static code reviewer (maps to the Claude
 * `/code-review` and Codex `/review` slash commands described in the docs).
 *
 * It scans changed source for common pitfalls — leftover debug output,
 * `TODO`/`FIXME` markers, `eval`, `innerHTML`, hardcoded secrets, loose
 * TypeScript `any`, empty `catch` blocks, and SQL concatenation — and returns
 * structured, severity-ranked findings. Designed to be fully testable with
 * in-memory file content (no git or LLM required).
 */
export class CodeReviewer {
  /**
   * Scans a single file's content and returns findings with line numbers.
   */
  public static analyzeFile(path: string, content: string): ReviewFinding[] {
    const findings: ReviewFinding[] = [];
    const lines = content.split(/\r?\n/);

    const push = (line: number, severity: ReviewSeverity, category: string, message: string): void => {
      findings.push({ file: path, line, severity, category, message });
    };

    lines.forEach((raw, idx) => {
      const lineNo = idx + 1;
      const line = raw.trim();

      if (line.length === 0 || line.startsWith('//') || line.startsWith('*') || line.startsWith('#')) {
        // Still scan comments for TODO-style markers below.
      }

      // Leftover debug output (console.warn/error are treated as legitimate)
      const consoleMatch = line.match(/\bconsole\.(log|debug|info)\s*\(/);
      if (consoleMatch) {
        push(lineNo, 'warning', 'debug-output', 'Leftover debug logging via console.' + consoleMatch[1] + '()');
      }

      // TODO / FIXME / XXX / HACK markers
      const todoMatch = line.match(/\b(TODO|FIXME|XXX|HACK)\b\s*[:\-]?\s*(.*)$/);
      if (todoMatch) {
        const detail = todoMatch[2] ? `: "${todoMatch[2].slice(0, 60)}"` : '';
        push(lineNo, 'info', 'todo-marker', `${todoMatch[1]} marker left in code${detail}`);
      }

      // eval() — arbitrary code execution risk
      if (/\beval\s*\(/.test(line)) {
        push(lineNo, 'critical', 'code-injection', 'Use of eval() allows arbitrary code execution');
      }

      // Direct innerHTML / outerHTML assignment — XSS risk
      if (/\.(innerHTML|outerHTML)\s*=/.test(line) || /\binsertAdjacentHTML\s*\(/.test(line)) {
        push(lineNo, 'warning', 'xss-risk', 'Untrusted assignment to innerHTML/outerHTML may enable XSS');
      }

      // Hardcoded secrets (skips obvious placeholders / env references)
      const secretMatch = line.match(/(api[_-]?key|secret|token|passwd|password|access[_-]?key)\s*[:=]\s*['"]([^'"]{8,})['"]/i);
      if (secretMatch) {
        const value = secretMatch[2];
        const isPlaceholder = /(your[-_]?|example|xxxx|placeholder|changeme|<|\$\{|process\.env|import\.meta\.env)/i.test(value);
        if (!isPlaceholder) {
          push(lineNo, 'critical', 'hardcoded-secret', `Possible hardcoded credential in assignment to "${secretMatch[1]}"`);
        }
      }

      // Loose TypeScript any typing
      if (/:\s*any\b/.test(line) || /<any>/.test(line) || /\bas any\b/.test(line)) {
        push(lineNo, 'info', 'loose-typing', 'Use of `any` weakens type safety');
      }

      // Empty catch block
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        push(lineNo, 'warning', 'empty-catch', 'Empty catch block swallows errors silently');
      }

      // SQL built via string concatenation — injection risk
      if (/\b(SELECT|INSERT|UPDATE|DELETE|ALTER)\b[\s\S]{0,80}\+/.test(line) || /\+[\s\S]{0,80}\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(line)) {
        if (!/execute\s*\([^)]*\)\s*,\s*\[/.test(line)) {
          push(lineNo, 'warning', 'sql-injection', 'SQL statement assembled via string concatenation may allow injection');
        }
      }

      // alert() debugging
      if (/\balert\s*\(/.test(line)) {
        push(lineNo, 'info', 'debug-alert', 'Stray alert() call (likely debug leftover)');
      }

      // debugger statement
      if (/\bdebugger\s*;/.test(line)) {
        push(lineNo, 'warning', 'debugger', 'Leftover debugger; statement');
      }
    });

    return findings;
  }

  /**
   * Reviews a set of in-memory files and returns an aggregated report.
   */
  public static analyze(files: ReviewFile[]): ReviewReport {
    const findings: ReviewFinding[] = [];
    for (const f of files) {
      findings.push(...CodeReviewer.analyzeFile(f.path, f.content));
    }
    const summary = {
      critical: findings.filter((f) => f.severity === 'critical').length,
      warning: findings.filter((f) => f.severity === 'warning').length,
      info: findings.filter((f) => f.severity === 'info').length
    };
    return { filesScanned: files.length, findings, summary };
  }

  /**
   * Gathers changed files from the working tree via git and reads their
   * current on-disk content. Returns an empty array when not in a git repo
   * or when git is unavailable, so callers can degrade gracefully.
   */
  public static getChangedFiles(cwd: string = process.cwd()): ReviewFile[] {
    try {
      const porcelain = execSync('git status --porcelain', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const paths = new Set<string>();
      for (const row of porcelain.split(/\r?\n/)) {
        if (!row.trim()) continue;
        const path = row.slice(3).trim();
        if (path && !path.startsWith('"')) paths.add(path);
      }
      const files: ReviewFile[] = [];
      for (const p of paths) {
        const full = `${cwd}/${p}`;
        if (existsSync(full)) {
          try {
            files.push({ path: p, content: readFileSync(full, 'utf8') });
          } catch {
            /* skip unreadable */
          }
        }
      }
      return files;
    } catch {
      return [];
    }
  }

  /** Renders a review report as a human-readable multi-line string. */
  public static formatReport(report: ReviewReport): string {
    const icon: Record<ReviewSeverity, string> = { critical: '[CRIT]', warning: '[WARN]', info: '[INFO]' };
    const lines: string[] = ['=== SuperAgent Code Review ==='];
    lines.push(`Files scanned: ${report.filesScanned} | Critical: ${report.summary.critical} | Warnings: ${report.summary.warning} | Info: ${report.summary.info}`);

    if (report.findings.length === 0) {
      lines.push('No issues found. Looking clean! 🎉');
    } else {
      const ordered: ReviewSeverity[] = ['critical', 'warning', 'info'];
      const sorted = [...report.findings].sort(
        (a, b) => ordered.indexOf(a.severity) - ordered.indexOf(b.severity) || a.file.localeCompare(b.file) || a.line - b.line
      );
      for (const f of sorted) {
        lines.push(`${icon[f.severity]} ${f.file}:${f.line} [${f.category}] ${f.message}`);
      }
    }
    return lines.join('\n');
  }
}

/**
 * Registers the `/review` slash command: reviews local working-tree changes
 * (or explicit files) and prints a severity-ranked static analysis report.
 */
export function registerReviewCommand(router: SlashCommandRouter): void {
  router.register(
    'review',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      let files: ReviewFile[];
      if (ctx.args.length > 0) {
        files = ctx.args
          .filter((p) => existsSync(p))
          .map((p) => {
            try {
              return { path: p, content: readFileSync(p, 'utf8') };
            } catch {
              return null;
            }
          })
          .filter((f): f is ReviewFile => f !== null);
      } else {
        files = CodeReviewer.getChangedFiles();
      }

      if (files.length === 0) {
        return {
          success: true,
          command: ctx.command,
          output: 'No changed files to review. Run inside a git repo with uncommitted changes, or pass file paths: /review src/foo.ts'
        };
      }

      const report = CodeReviewer.analyze(files);
      return {
        success: true,
        command: ctx.command,
        output: CodeReviewer.formatReport(report),
        data: report
      };
    },
    {
      description: 'Static code review of working-tree changes (no network needed)',
      aliases: ['audit', 'cr'],
      usage: '/review [file ...]'
    }
  );
}
