import { existsSync, readFileSync } from 'fs';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { CodeReviewer, ReviewFile } from './review.js';

/** Severity tier for a security finding, ordered high → low. */
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * The five official vulnerability families used by Claude Code's
 * `/security-review`, plus a dependency family. Every finding is tagged with
 * one so reports group cleanly.
 */
export type SecurityFamily =
  | 'injection'
  | 'xss'
  | 'auth'
  | 'insecure-data'
  | 'dependencies'
  | 'ssrf'
  | 'crypto';

/** A single security vulnerability finding. */
export interface SecurityFinding {
  file: string;
  line: number;
  severity: SecuritySeverity;
  family: SecurityFamily;
  cwe: string;
  title: string;
  detail: string;
}

/** Aggregated result of a security scan. */
export interface SecurityReport {
  filesScanned: number;
  findings: SecurityFinding[];
  summary: Record<SecuritySeverity, number>;
}

interface SecurityRule {
  family: SecurityFamily;
  severity: SecuritySeverity;
  cwe: string;
  title: string;
  detail: string;
  test: RegExp;
  /** Optional guard: skip when this pattern also matches (reduces false positives). */
  skipIf?: RegExp;
}

/**
 * Heuristic, network-free security scanner (maps to the Claude Code
 * `/security-review` slash command). Rules are aligned with Anthropic's five
 * official vulnerability families — SQL injection, XSS, auth/authz flaws,
 * insecure data handling, and dependency risks — plus SSRF and weak crypto,
 * each tagged with a CWE id. Designed to run fully offline so results are
 * deterministic and unit-testable.
 */
export class SecurityScanner {
  /** Line-level rules applied to every source line. */
  private static readonly RULES: SecurityRule[] = [
    // --- Injection (CWE-77/78/89/94) ---
    {
      family: 'injection',
      severity: 'critical',
      cwe: 'CWE-94',
      title: 'Code injection via eval()',
      detail: 'eval()/Function() executes arbitrary strings as code.',
      test: /\beval\s*\(|new\s+Function\s*\(/
    },
    {
      family: 'injection',
      severity: 'critical',
      cwe: 'CWE-78',
      title: 'OS command injection',
      detail: 'Shell command built with dynamic input via child_process; use execFile with an args array.',
      test: /\b(exec|execSync)\s*\(\s*[`'"][^`'"]*\$\{|\b(exec|execSync)\s*\([^)]*\+/
    },
    {
      family: 'injection',
      severity: 'high',
      cwe: 'CWE-89',
      title: 'SQL injection',
      detail: 'SQL string assembled by concatenation/interpolation; use parameterized queries.',
      test: /\b(SELECT|INSERT|UPDATE|DELETE|DROP)\b[^;]*(\$\{|['"]\s*\+|\+\s*['"])/i
    },
    {
      family: 'injection',
      severity: 'high',
      cwe: 'CWE-943',
      title: 'NoSQL injection',
      detail: 'Untrusted value flowed into a Mongo-style query object ($where / dynamic operator).',
      test: /\$where\s*:|\bfind\s*\(\s*\{[^}]*\$\{/
    },

    // --- XSS (CWE-79) ---
    {
      family: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
      title: 'DOM XSS via innerHTML',
      detail: 'Assigning untrusted data to innerHTML/outerHTML enables script injection.',
      test: /\.(innerHTML|outerHTML)\s*=|\binsertAdjacentHTML\s*\(/
    },
    {
      family: 'xss',
      severity: 'high',
      cwe: 'CWE-79',
      title: 'React dangerouslySetInnerHTML',
      detail: 'dangerouslySetInnerHTML bypasses React escaping; sanitize the HTML first.',
      test: /dangerouslySetInnerHTML/
    },
    {
      family: 'xss',
      severity: 'medium',
      cwe: 'CWE-79',
      title: 'document.write with dynamic content',
      detail: 'document.write can inject markup from untrusted input.',
      test: /document\.write(ln)?\s*\(/
    },

    // --- SSRF (CWE-918) ---
    {
      family: 'ssrf',
      severity: 'high',
      cwe: 'CWE-918',
      title: 'Possible SSRF',
      detail: 'HTTP request target built from a variable; validate/allowlist the host.',
      test: /\b(fetch|axios\.get|axios\.post|https?\.get|request)\s*\(\s*[`'"]?\s*\$\{|\bfetch\s*\(\s*[a-zA-Z_]\w*\s*[,)]/
    },

    // --- Auth / Authorization (CWE-287/798/259) ---
    {
      family: 'auth',
      severity: 'critical',
      cwe: 'CWE-798',
      title: 'Hardcoded credential',
      detail: 'A secret/token/password appears to be hardcoded; load it from the environment or a secret store.',
      test: /(api[_-]?key|secret|token|passwd|password|access[_-]?key|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i,
      skipIf: /(your[-_]?|example|xxxx|placeholder|changeme|<|\$\{|process\.env|import\.meta\.env|dummy|test)/i
    },
    {
      family: 'auth',
      severity: 'high',
      cwe: 'CWE-489',
      title: 'Authentication disabled / bypass',
      detail: 'Auth check appears hardcoded to true/false (bypass logic).',
      test: /\b(isAuthenticated|isAdmin|authorized|hasAccess)\s*=\s*(true|false)\b/i
    },

    // --- Weak crypto (CWE-327/338) ---
    {
      family: 'crypto',
      severity: 'high',
      cwe: 'CWE-327',
      title: 'Weak hashing/cipher algorithm',
      detail: 'MD5/SHA1/DES/RC4 are cryptographically broken; use SHA-256+ or AES-GCM.',
      test: /createHash\s*\(\s*['"](md5|sha1)['"]|createCipheriv?\s*\(\s*['"](des|rc4|des-ecb)/i
    },
    {
      family: 'crypto',
      severity: 'medium',
      cwe: 'CWE-338',
      title: 'Insecure randomness for security value',
      detail: 'Math.random() is not cryptographically secure; use crypto.randomBytes/randomUUID for tokens.',
      test: /(token|secret|nonce|salt|otp|session|password)\s*[:=][^;\n]*Math\.random\s*\(/i
    },

    // --- Insecure data handling / configuration (CWE-295/614/942/502) ---
    {
      family: 'insecure-data',
      severity: 'high',
      cwe: 'CWE-295',
      title: 'TLS certificate validation disabled',
      detail: 'rejectUnauthorized:false / NODE_TLS_REJECT_UNAUTHORIZED=0 disables cert checks (MITM risk).',
      test: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/
    },
    {
      family: 'insecure-data',
      severity: 'medium',
      cwe: 'CWE-942',
      title: 'Overly permissive CORS',
      detail: "Access-Control-Allow-Origin '*' allows any site to read responses.",
      test: /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*['"]|cors\s*\(\s*\{\s*origin\s*:\s*['"]\*['"]/
    },
    {
      family: 'insecure-data',
      severity: 'medium',
      cwe: 'CWE-614',
      title: 'Insecure cookie flags',
      detail: 'Cookie set without httpOnly/secure flags may be stolen via XSS or sniffing.',
      test: /(httpOnly|secure)\s*:\s*false/
    },
    {
      family: 'insecure-data',
      severity: 'high',
      cwe: 'CWE-502',
      title: 'Unsafe deserialization',
      detail: 'Deserializing untrusted data (unserialize / vm.runInThisContext / yaml.load) can execute code.',
      test: /\bunserialize\s*\(|vm\.runIn\w*Context\s*\(|yaml\.load\s*\((?!.*safe)/i
    },
    {
      family: 'insecure-data',
      severity: 'medium',
      cwe: 'CWE-22',
      title: 'Possible path traversal',
      detail: 'File path joined with request/user input without normalization can escape the base dir.',
      test: /(readFile|readFileSync|createReadStream|sendFile)\s*\([^)]*(req\.(query|params|body)|request\.)/
    }
  ];

  /** Scans a single file's content and returns security findings. */
  public static scanFile(path: string, content: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const lines = content.split(/\r?\n/);
    lines.forEach((raw, idx) => {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('*')) return;
      for (const rule of SecurityScanner.RULES) {
        if (rule.test.test(line) && !(rule.skipIf && rule.skipIf.test(line))) {
          findings.push({
            file: path,
            line: idx + 1,
            severity: rule.severity,
            family: rule.family,
            cwe: rule.cwe,
            title: rule.title,
            detail: rule.detail
          });
        }
      }
    });
    return findings;
  }

  /**
   * Scans a package.json manifest for dependency risks: wildcard/`latest`
   * version ranges and a small set of known-risky packages.
   */
  public static scanDependencies(path: string, content: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      pkg = JSON.parse(content);
    } catch {
      return findings;
    }
    const RISKY = new Set(['request', 'left-pad', 'event-stream', 'node-uuid']);
    const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const [name, range] of Object.entries(all)) {
      if (range === '*' || range === 'latest' || /^>=?0/.test(range)) {
        findings.push({
          file: path,
          line: 1,
          severity: 'medium',
          family: 'dependencies',
          cwe: 'CWE-1104',
          title: `Unpinned dependency version: ${name}`,
          detail: `"${name}": "${range}" is an unbounded range; pin to a reviewed version.`
        });
      }
      if (RISKY.has(name)) {
        findings.push({
          file: path,
          line: 1,
          severity: 'high',
          family: 'dependencies',
          cwe: 'CWE-1035',
          title: `Deprecated/risky dependency: ${name}`,
          detail: `"${name}" is deprecated or has a history of security issues; consider a maintained alternative.`
        });
      }
    }
    return findings;
  }

  /** Scans a set of in-memory files and returns an aggregated report. */
  public static scan(files: ReviewFile[]): SecurityReport {
    const findings: SecurityFinding[] = [];
    for (const f of files) {
      if (/(^|\/)package\.json$/.test(f.path)) {
        findings.push(...SecurityScanner.scanDependencies(f.path, f.content));
      }
      findings.push(...SecurityScanner.scanFile(f.path, f.content));
    }
    const summary: Record<SecuritySeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) summary[f.severity]++;
    return { filesScanned: files.length, findings, summary };
  }

  /** Renders a security report as a human-readable multi-line string. */
  public static formatReport(report: SecurityReport): string {
    const icon: Record<SecuritySeverity, string> = {
      critical: '[CRITICAL]',
      high: '[HIGH]',
      medium: '[MEDIUM]',
      low: '[LOW]'
    };
    const lines: string[] = ['=== SuperAgent Security Review ==='];
    lines.push(
      `Files: ${report.filesScanned} | Critical: ${report.summary.critical} | High: ${report.summary.high} | Medium: ${report.summary.medium} | Low: ${report.summary.low}`
    );
    if (report.findings.length === 0) {
      lines.push('No security issues detected by heuristic scan. (Not a substitute for manual review.)');
    } else {
      const order: SecuritySeverity[] = ['critical', 'high', 'medium', 'low'];
      const sorted = [...report.findings].sort(
        (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.file.localeCompare(b.file) || a.line - b.line
      );
      for (const f of sorted) {
        lines.push(`${icon[f.severity]} ${f.file}:${f.line} (${f.cwe}, ${f.family}) ${f.title}`);
        lines.push(`    → ${f.detail}`);
      }
      lines.push('');
      lines.push('Heuristic scan complete — review each finding; automated analysis complements manual review.');
    }
    return lines.join('\n');
  }
}

/**
 * Registers the `/security-review` slash command: runs a heuristic security
 * scan over working-tree changes (or explicit files) and prints CWE-tagged,
 * severity-ranked findings.
 */
export function registerSecurityReviewCommand(router: SlashCommandRouter): void {
  const handler = async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
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
        output: 'No changed files to scan. Run inside a git repo with uncommitted changes, or pass file paths: /security-review src/app.ts'
      };
    }

    const report = SecurityScanner.scan(files);
    const hasBlocking = report.summary.critical > 0 || report.summary.high > 0;
    return {
      success: !hasBlocking,
      command: ctx.command,
      output: SecurityScanner.formatReport(report),
      data: report
    };
  };

  router.register('security-review', handler, {
    description: 'Heuristic security scan (injection, XSS, auth, crypto, deps) with CWE tags',
    aliases: ['security', 'secreview', 'sec'],
    usage: '/security-review [file ...]'
  });
}
