/**
 * SandboxRunner — the cohesive, agent-facing safe-execution layer.
 *
 * This is the ONLY API the agent runtime should call to run shell commands or
 * read/write files. It wires together the individual sandbox primitives
 * (PermissionModeController, TerminalShellExecutor, TerminalAccessControl,
 * EnvironmentSanitizer, FileSystemInspector, AtomicFileWriter) and enforces the
 * safety contract in one place so the policy cannot be bypassed by calling a
 * lower-level primitive directly.
 *
 * Safety contract
 * ───────────────
 *  - HARD BLOCK: commands matching a blocked dangerous pattern are NEVER executed,
 *    in any mode (rm -rf /, mkfs, shutdown, fork-bomb, write to /dev/sd*, …).
 *  - ALLOWLIST: when a per-project allowlist is set, only matching commands run.
 *  - SCOPE: file reads/writes/lists are confined to the project root unless the
 *    runner is explicitly `unsandboxed`.
 *  - APPROVAL: the user-in-the-loop `requestApproval` callback gates risky or
 *    read-only commands; full-autonomy mode auto-allows (still hard-blocked).
 *  - SANITIZE: secrets/tokens are redacted from all command output returned to
 *    the model.
 *  - ATOMIC: file writes are temp+rename with an automatic backup.
 *
 * This is a *policy/permission* sandbox, not an OS container.
 */
import * as path from 'path';
import { PermissionModeController, ConfirmationHandler, PermissionMode } from './permissions.js';
import { TerminalShellExecutor, ExecutionResult } from './terminal.js';
import { TerminalAccessControl } from './access.js';
import { EnvironmentSanitizer } from './sanitizer.js';
import { FileSystemInspector, ReadFileOptions, ReadFileResult, FileInspectResult } from './inspector.js';
import { AtomicFileWriter } from './writer.js';

/** Options for constructing a SandboxRunner. */
export interface SandboxRunnerOptions {
  projectRoot?: string;
  /** Full system access: disables project-root path scoping for files. Default false. */
  unsandboxed?: boolean;
  /** Permission mode controlling approval gating. Default 'auto-approve-edits'. */
  permissionMode?: PermissionMode;
  /** Opt-in per-project command allowlist (prefix-matched). Empty = permit all. */
  allowedCommands?: string[];
  /** User-in-the-loop approval callback (injected by the desktop host). */
  requestApproval?: ConfirmationHandler;
  /** Default command timeout in ms. Default 30000. */
  timeoutMs?: number;
}

/** Result of an atomic file write. */
export interface WriteFileResult {
  written: boolean;
  backupPath?: string;
  error?: string;
}

/**
 * Resolves `target` against the project root and refuses anything that escapes
 * it. Returns the resolved absolute path, or null if it escapes the root.
 * Case-insensitive so it behaves on Windows (which folds case on paths).
 */
function resolveWithinRoot(projectRoot: string, target: string): string | null {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(projectRoot, target);
  const normRoot = root.toLowerCase();
  const normResolved = resolved.toLowerCase();
  const inside = normResolved === normRoot || normResolved.startsWith(normRoot + path.sep);
  return inside ? resolved : null;
}

/**
 * Returns true when `command` is permitted by the allowlist. An empty allowlist
 * permits everything. Matching is prefix-based on the first token(s): allowing
 * "git" permits `git` and `git status`, but not `github-clone …`.
 */
function isCommandAllowed(command: string, allowedCommands: string[]): boolean {
  if (!allowedCommands || allowedCommands.length === 0) return true;
  const cmd = command.trim();
  if (cmd.length === 0) return false;
  const firstToken = cmd.split(/\s+/)[0];
  return allowedCommands.some((allowed) => {
    const a = allowed.trim();
    return a !== '' && (cmd === a || firstToken === a || cmd.startsWith(a + ' '));
  });
}

export class SandboxRunner {
  private projectRoot?: string;
  private unsandboxed: boolean;
  private allowedCommands: string[];
  private timeoutMs: number;
  private controller: PermissionModeController;
  private access: TerminalAccessControl;
  private sanitizer: EnvironmentSanitizer;
  private inspector: FileSystemInspector;
  private executor: TerminalShellExecutor;
  private writer: AtomicFileWriter;

  constructor(options: SandboxRunnerOptions = {}) {
    this.projectRoot = options.projectRoot;
    this.unsandboxed = options.unsandboxed ?? false;
    this.allowedCommands = options.allowedCommands ?? [];
    this.timeoutMs = options.timeoutMs ?? 30000;

    this.controller = new PermissionModeController({
      initialMode: options.permissionMode ?? 'auto-approve-edits',
      onConfirmationRequired: options.requestApproval
    });
    this.access = new TerminalAccessControl();
    this.sanitizer = new EnvironmentSanitizer();
    this.inspector = new FileSystemInspector();
    this.executor = new TerminalShellExecutor(this.controller, this.access, this.sanitizer);
    this.writer = new AtomicFileWriter(this.controller);
  }

  // ── Configuration mutators (used live by the host) ──────────────────────────

  public setMode(mode: PermissionMode): void {
    this.controller.setMode(mode);
  }

  public setUnsandboxed(value: boolean): void {
    this.unsandboxed = value;
  }

  public setAllowedCommands(commands: string[]): void {
    this.allowedCommands = commands ?? [];
  }

  public setProjectRoot(root: string): void {
    this.projectRoot = root;
  }

  public getMode(): PermissionMode {
    return this.controller.getMode();
  }

  /**
   * Adds a command to the session allowlist AND the hard-access whitelist so a
   * user's "Always allow" choice suppresses repeat prompts for that command.
   */
  public addSessionAllow(command: string): void {
    if (!command || !command.trim()) return;
    const trimmed = command.trim();
    if (!this.allowedCommands.includes(trimmed)) this.allowedCommands.push(trimmed);
    this.access.addWhitelistedCommand(trimmed);
    // Pre-approve so the executor won't re-prompt this exact command
    // (covers both the hard-block-exempt "Always allow" and the
    // read-only path, which the access whitelist alone doesn't silence).
    this.controller.preApprove(trimmed);
  }

  /** Redacts secrets/tokens from arbitrary text (output shown to the model). */
  public sanitize(text: string): string {
    return this.sanitizer.sanitizeString(text);
  }

  /**
   * Resolves a tool-supplied path against the project root (or leaves it
   * absolute when unsandboxed). Returns null when the path escapes the root in
   * sandboxed mode. File tools MUST call this before touching disk.
   */
  public resolvePath(target: string): string | null {
    if (this.unsandboxed) return path.resolve(target);
    if (!this.projectRoot) return path.resolve(target);
    return resolveWithinRoot(this.projectRoot, target);
  }

  // ── Command execution ───────────────────────────────────────────────────────

  /**
   * Execute a shell command under the full safety contract. Always returns an
   * ExecutionResult (never throws) so the agent sees a clear, sanitized message.
   */
  public async runCommand(
    command: string,
    options: { cwd?: string; timeoutMs?: number } = {}
  ): Promise<ExecutionResult> {
    // 1. Per-project allowlist gate (opt-in confinement).
    if (this.allowedCommands.length > 0 && !isCommandAllowed(command, this.allowedCommands)) {
      return {
        stdout: '',
        stderr: `Command is not in the project's allowed commands: ${command}. Add it to the project's allowed commands in settings to permit it.`,
        exitCode: 126,
        durationMs: 0,
        timedOut: false
      };
    }

    // 2. Hard block — never executes, in any mode.
    const check = this.access.inspectCommand(command);
    if (!check.allowed) {
      return {
        stdout: '',
        stderr: `Blocked by sandbox policy: ${check.reason ?? 'command matches a blocked dangerous pattern.'}`,
        exitCode: 126,
        durationMs: 0,
        timedOut: false
      };
    }

    // 3. Confine the working directory to the project root unless unsandboxed.
    const cwd = options.cwd ?? (this.unsandboxed ? process.cwd() : this.projectRoot ?? process.cwd());

    try {
      return await this.executor.execute(command, {
        cwd,
        timeoutMs: options.timeoutMs ?? this.timeoutMs
      });
    } catch (err: unknown) {
      const message = (err as Error)?.message ?? String(err);
      return {
        stdout: '',
        stderr: this.sanitizer.sanitizeString(message),
        exitCode: 1,
        durationMs: 0,
        timedOut: false
      };
    }
  }

  // ── File operations ─────────────────────────────────────────────────────────

  /**
   * Write content to a file atomically (temp + rename, with backup). Path is
   * scoped to the project root unless unsandboxed. Returns whether the write
   * succeeded and any error (never throws).
   */
  public async writeFile(
    filePath: string,
    content: string,
    options: { backup?: boolean } = {}
  ): Promise<WriteFileResult> {
    const resolved = this.resolvePath(filePath);
    if (!resolved) {
      return { written: false, error: `Path is outside the project root (sandbox): ${filePath}` };
    }
    try {
      await this.writer.writeFileAtomic(resolved, content, { backup: options.backup ?? true });
      return { written: true };
    } catch (err: unknown) {
      return { written: false, error: (err as Error)?.message ?? String(err) };
    }
  }

  /**
   * Read a file (range-supported) scoped to the project root. Returns null when
   * the path escapes the root in sandboxed mode (so callers can emit a clear
   * "outside project root" error).
   */
  public async readFile(filePath: string, options: ReadFileOptions = {}): Promise<ReadFileResult | null> {
    const resolved = this.resolvePath(filePath);
    if (!resolved) return null;
    try {
      return await this.inspector.readFile(resolved, options);
    } catch (err: unknown) {
      return {
        content: `Error reading file: ${(err as Error)?.message ?? String(err)}`,
        startLine: 0,
        endLine: 0,
        totalLines: 0,
        isBinary: false
      };
    }
  }

  /** Inspect a file/directory scoped to the project root. */
  public async inspectPath(filePath: string): Promise<FileInspectResult | null> {
    const resolved = this.resolvePath(filePath);
    if (!resolved) return null;
    return this.inspector.inspect(resolved);
  }
}
