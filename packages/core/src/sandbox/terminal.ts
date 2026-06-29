import { spawn } from 'child_process';
import { EnvironmentSanitizer } from './sanitizer.js';
import { TerminalAccessControl } from './access.js';
import { PermissionModeController } from './permissions.js';

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

export interface ExecutionOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  shell?: string | boolean;
}

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

    if (check.riskLevel === 'potentially_dangerous' && this.permissionController.getMode() !== 'full-autonomy') {
      const approved = await this.permissionController.requestApproval({
        action: 'execute_command',
        command,
        details: { riskLevel: check.riskLevel, reason: check.reason }
      });
      if (!approved) {
        throw new Error(`Execution rejected by user permission policy for command: ${command}`);
      }
    } else if (this.permissionController.getMode() === 'read-only') {
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
      const child = spawn(command, [], {
        cwd: options.cwd ?? process.cwd(),
        env: mergedEnv as Record<string, string>,
        shell: shellOption
      });

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

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          stdout: this.sanitizer.sanitizeString(stdoutData),
          stderr: this.sanitizer.sanitizeString(stderrData),
          exitCode: code,
          durationMs,
          timedOut
        });
      });

      child.on('error', (err) => {
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
