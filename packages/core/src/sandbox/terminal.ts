import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { EnvironmentSanitizer } from './sanitizer.js';
import { TerminalAccessControl } from './access.js';
import { PermissionModeController } from './permissions.js';

/** Result of a terminal command execution. */
export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

/** Options for running a terminal command. */
export interface ExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  shell?: string | boolean;
}

/** Executes shell commands with permission gating, access control, and env sanitization. */
export class TerminalShellExecutor {
  private sanitizer: EnvironmentSanitizer;
  private accessControl: TerminalAccessControl;
  private permissionController: PermissionModeController;

  constructor(
    permissionController?: PermissionModeController,
    accessControl?: TerminalAccessControl,
    sanitizer?: EnvironmentSanitizer
  ) {
    this.permissionController = permissionController ?? new PermissionModeController();
    this.accessControl = accessControl ?? new TerminalAccessControl();
    this.sanitizer = sanitizer ?? new EnvironmentSanitizer();
  }

  public async execute(command: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    const check = this.accessControl.inspectCommand(command);
    if (!check.allowed) {
      throw new Error(`Command blocked by access control: ${check.reason}`);
    }

    const preApproved = this.permissionController.isPreApproved(command);
    const executorMode = this.permissionController.getMode();
    // Deny-all never prompts here: the runner has already filtered to
    // allowlisted / pre-approved commands only, so anything reaching the
    // executor under deny-all is permitted to run. Only full-autonomy and
    // deny-all skip the prompt for dangerous commands; everything else
    // (auto-approve-edits, read-only) gates risky commands.
    if (
      check.riskLevel === 'potentially_dangerous' &&
      executorMode !== 'full-autonomy' &&
      executorMode !== 'deny-all' &&
      !preApproved
    ) {
      const approved = await this.permissionController.requestApproval({
        action: 'execute_command',
        command,
        details: { riskLevel: check.riskLevel, reason: check.reason }
      });
      if (!approved) {
        throw new Error(`Execution rejected by user permission policy for command: ${command}`);
      }
    } else if (executorMode === 'read-only' && !preApproved) {
      const isReadOnlyCommand = /^(ls|dir|cat|echo|pwd|whoami|git status|git log|git diff)\b/i.test(command.trim());
      if (!isReadOnlyCommand) {
        const approved = await this.permissionController.requestApproval({
          action: 'execute_command',
          command
        });
        if (!approved) {
          throw new Error(`Execution rejected under read-only mode for command: ${command}`);
        }
      }
    }

    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 30000;
    const isWindows = process.platform === 'win32';
    const defaultShell = isWindows ? 'powershell.exe' : '/bin/sh';
    const shellOption = options.shell ?? defaultShell;

    return new Promise((resolve) => {
      let stdoutData = '';
      let stderrData = '';
      let timedOut = false;

      const mergedEnv = { ...process.env, ...(options.env ?? {}) };
      const spawnOpts = {
        cwd: options.cwd ?? process.cwd(),
        env: mergedEnv as Record<string, string>
      };

      // Build the argv so the command reaches the shell predictably. Node's
      // default Windows wrapping (`<shell> /d /s /c "<cmd>"`) is meant for
      // cmd.exe and is not honored correctly by PowerShell, so we construct the
      // invocation explicitly per shell. `shell: false` disables Node's wrapping.
      let child: ChildProcess;
      if (typeof shellOption === 'string') {
        const shellName = path.basename(shellOption).toLowerCase();
        const isPowershell =
          shellName === 'powershell.exe' ||
          shellName === 'powershell' ||
          shellName === 'pwsh.exe' ||
          shellName === 'pwsh';
        if (isWindows && isPowershell) {
          // -NoProfile avoids loading the user's profile on every spawn (slow
          // and can error under redirection); -NonInteractive prevents prompts.
          child = spawn(shellOption, ['-NoProfile', '-NonInteractive', '-Command', command], {
            ...spawnOpts,
            shell: false
          });
        } else if (isWindows) {
          child = spawn(shellOption, ['/d', '/s', '/c', command], {
            ...spawnOpts,
            shell: false
          });
        } else {
          child = spawn(shellOption, ['-c', command], {
            ...spawnOpts,
            shell: false
          });
        }
      } else {
        // Boolean shell: let Node choose the platform-appropriate shell.
        child = spawn(command, [], { ...spawnOpts, shell: shellOption });
      }

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutData += chunk.toString('utf8');
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrData += chunk.toString('utf8');
      });

      // Resolve as soon as the process *exits*. We deliberately key off `exit`
      // rather than `close`: `close` only fires once every stdio stream has
      // closed, and on Windows `powershell.exe` does not reliably close its
      // stdout/stderr pipes on normal termination — so `close` can hang until
      // the command timeout kills the process (this is why the executor worked
      // for killed commands but hung for normally-exiting ones). `exit` fires
      // reliably when the process terminates, by which point all stdout/stderr
      // `data` events have already been delivered, so we capture the full
      // output without waiting on stream closure. `close` is kept as a
      // redundant safety net; `settled` guards against a double resolve.
      let settled = false;
      const settle = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          stdout: this.sanitizer.sanitizeString(stdoutData),
          stderr: this.sanitizer.sanitizeString(stderrData),
          exitCode: code,
          durationMs,
          timedOut
        });
      };

      child.on('exit', (code) => settle(code));
      child.on('close', (code) => settle(code));

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          stdout: this.sanitizer.sanitizeString(stdoutData),
          stderr: this.sanitizer.sanitizeString(err.message),
          exitCode: 1,
          durationMs,
          timedOut: false
        });
      });
    });
  }
}
