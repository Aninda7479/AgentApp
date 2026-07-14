import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { DiffReviewer } from './diff.js';

/** Severity tier for a code-review finding. */
export type ReviewSeverity = 'critical' | 'warning' | 'info';

/** Risk level of an auto-fix: safe (line removal) vs risky (needs review). */
export type FixRisk = 'safe' | 'risky';

/** A single issue surfaced while reviewing source files. */
export interface ReviewFinding {
  file: string;
  line: number;
  severity: ReviewSeverity;
  category: string;
  message: string;
  /** Optional suggested remediation. */
  fix?: string;
  /** Whether the fix can be applied automatically without breaking behavior. */
  fixRisk?: FixRisk;
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

/** A single detection rule used by the static reviewer. */
export interface ReviewRule {
  severity: ReviewSeverity;
  category: string;
  title: string;
  detail: string;
  test: RegExp;
  fixRisk: FixRisk;
  fix?: string;
  /** Optional guard: when this matches the line, the rule is skipped. */
  skipIf?: RegExp;
}

/**
 * Heuristic, network-free static code reviewer (maps to the Claude
 * `/code-review` and Codex `/review` slash commands described in the docs).
 *
 * It scans changed source for common pitfalls — leftover debug output,
 * `TODO`/`FIXME` markers, `eval`, `innerHTML`, hardcoded secrets, loose
 * TypeScript `any`, empty `catch` blocks, and SQL concatenation — and returns
 * structured, severity-ranked findings, each optionally carrying a suggested
 * fix. "Safe" fixes (stray debug leftovers) can be auto-applied with
 * `/review --apply`; "risky" findings are reported with a suggestion only.
 * Designed to be fully testable with in-memory file content.
 */
export class CodeReviewer {
  /** A single detection rule with an optional auto-fix. */
  private static readonly RULES: ReviewRule[] = [
    {
      severity: 'warning',
      category: 'debug-output',
      title: 'Leftover debug logging',
      detail: 'Remove stray console.log/debug/info calls before shipping.',
      test: /\bconsole\.(log|debug|info)\s*\(/,
      fixRisk: 'safe',
      fix: 'Remove the console.log/debug/info statement.'
    },
    {
      severity: 'info',
      category: 'todo-marker',
      title: 'TODO/FIXME marker',
      detail: 'Convert the marker into a tracked task or resolve it.',
      test: /^\s*\/\/\s*(TODO|FIXME|XXX|HACK)\b/,
      fixRisk: 'safe',
      fix: 'Remove the comment-only TODO/FIXME marker.'
    },
    {
      severity: 'critical',
      category: 'code-injection',
      title: 'eval() usage',
      detail: 'Replace eval() with a safe parser or structured approach.',
      test: /\beval\s*\(/,
      fixRisk: 'risky',
      fix: 'Avoid eval(); use a dedicated parser or Function construction with care.'
    },
    {
      severity: 'warning',
      category: 'xss-risk',
      title: 'Untrusted innerHTML',
      detail: 'Assigning to innerHTML/outerHTML may enable XSS; sanitize or use textContent.',
      test: /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/,
      fixRisk: 'risky',
      fix: 'Sanitize HTML or use textContent / a vetted sanitizer before inserting.'
    },
    {
      severity: 'critical',
      category: 'hardcoded-secret',
      title: 'Hardcoded credential',
      detail: 'Move secrets to environment variables or a secret manager.',
      test: /(api[_-]?key|secret|token|passwd|password|access[_-]?key)\s*[:=]\s*['"]([^'"]{8,})['"]/i,
      skipIf: /(your[-_]?|example|xxxx|placeholder|changeme|<|\$\{|process\.env|import\.meta\.env)/i,
      fixRisk: 'risky',
      fix: 'Load the value from process.env / a secret store instead of hardcoding.'
    },
    {
      severity: 'info',
      category: 'loose-typing',
      title: 'Loose TypeScript any',
      detail: 'Replace `any` with a precise type or unknown.',
      test: /:\s*any\b|<any>|\bas any\b/,
      fixRisk: 'risky',
      fix: 'Use a specific type or `unknown` instead of `any`.'
    },
    {
      severity: 'warning',
      category: 'empty-catch',
      title: 'Empty catch block',
      detail: 'Log or handle the error instead of swallowing it.',
      test: /catch\s*\([^)]*\)\s*\{\s*\}/,
      fixRisk: 'risky',
      fix: 'Add error handling or a log statement inside the catch.'
    },
    {
      severity: 'warning',
      category: 'sql-injection',
      title: 'SQL string concatenation',
      detail: 'Use parameterized queries / prepared statements.',
      test: /\b(SELECT|INSERT|UPDATE|DELETE|ALTER)\b[\s\S]{0,80}\+|\+[\s\S]{0,80}\b(SELECT|INSERT|UPDATE|DELETE)\b/i,
      skipIf: /execute\s*\([^)]*\)\s*,\s*\[/,
      fixRisk: 'risky',
      fix: 'Parameterize the query instead of concatenating input.'
    },
    {
      severity: 'info',
      category: 'debug-alert',
      title: 'Stray alert()',
      detail: 'Remove debug alert() calls.',
      test: /\balert\s*\(/,
      fixRisk: 'safe',
      fix: 'Remove the alert() call.'
    },
    {
      severity: 'warning',
      category: 'debugger',
      title: 'Leftover debugger',
      detail: 'Remove the debugger; statement.',
      test: /\bdebugger\s*;/,
      fixRisk: 'safe',
      fix: 'Remove the debugger; statement.'
    }
  ];

  /**
   * Scans a single file's content and returns findings with line numbers and
   * (optionally) fix suggestions.
   */
  public static analyzeFile(path: string, content: string): ReviewFinding[] {
    const findings: ReviewFinding[] = [];
    const lines = content.split(/\r?\n/);

    lines.forEach((raw, idx) => {
      const lineNo = idx + 1;
      for (const rule of CodeReviewer.RULES) {
        if (rule.test.test(raw) && !(rule.skipIf && rule.skipIf.test(raw))) {
          findings.push({
            file: path,
            line: lineNo,
            severity: rule.severity,
            category: rule.category,
            message: `${rule.title} — ${rule.detail}`,
            fix: rule.fix,
            fixRisk: rule.fixRisk
          });
        }
      }
    });

    return findings;
  }

  /**
   * Applies only the "safe" auto-fixes (line-level removals) to a file's
   * content, returning the cleaned content and the findings that were fixed.
   * Risky findings are never auto-applied.
   */
  public static applySafeFixes(file: ReviewFile): { fixed: ReviewFile; applied: ReviewFinding[] } {
    const lines = file.content.split(/\r?\n/);
    const applied: ReviewFinding[] = [];
    const kept: string[] = [];

    lines.forEach((raw, idx) => {
      const lineNo = idx + 1;
      const safeHit = CodeReviewer.RULES.find(
        (r) => r.fixRisk === 'safe' && r.test.test(raw) && !(r.skipIf && r.skipIf.test(raw))
      );
      if (safeHit) {
        applied.push({
          file: file.path,
          line: lineNo,
          severity: safeHit.severity,
          category: safeHit.category,
          message: `${safeHit.title} — ${safeHit.detail}`,
          fix: safeHit.fix,
          fixRisk: 'safe'
        });
        // Drop the whole line for safe removals.
      } else {
        kept.push(raw);
      }
    });

    return { fixed: { path: file.path, content: kept.join('\n') }, applied };
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
