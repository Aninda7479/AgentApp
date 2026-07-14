import { TerminalShellExecutor, PermissionModeController } from '@superagent/core';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { CLICommandResult } from '../types.js';
import { PermissionLevel } from '../shortcuts/permissions.js';

/** Maximum number of characters of stdout/stderr echoed back to the user. */
const MAX_OUTPUT_CHARS = 8000;

/** Options for {@link registerExecSlashCommand}. */
export interface ExecCommandOptions {
  /** Current TUI permission level; gates whether commands may run. */
  permission: PermissionLevel;
  /** Sets the TUI permission level (unused today, accepted for symmetry with other commands). */
  setPermission?: (level: PermissionLevel) => void;
  /** Working directory for executed commands (defaults to process.cwd()). */
  cwd?: string;
}

/**
 * Maps the CLI permission level onto the core `PermissionModeController`
 * vocabulary so `deny` blocks everything, `auto` runs without prompts, and
 * `ask` auto-runs non-dangerous commands while requiring approval for risky ones.
 */
function toExecutorMode(permission: PermissionLevel): 'full-autonomy' | 'auto-approve-edits' {
  return permission === 'auto' ? 'full-autonomy' : 'auto-approve-edits';
}

/**
 * Runs a raw shell command and returns the result as a {@link CLICommandResult}.
 * Honors the session permission level: `deny` refuses outright, `auto` executes
 * without approval prompts, and `ask` auto-runs safe commands but requires
 * approval for dangerous ones (rejected automatically in the headless CLI).
 */
export async function handleExecCommand(
  rawArgs: string,
  permission: PermissionLevel,
  cwd: string = process.cwd()
): Promise<CLICommandResult> {
  const command = rawArgs.trim();
  if (!command) {
    return {
      success: false,
      message: 'Usage: /exec <shell command>  (or prefix with ! — e.g. ! ls -la)'
    };
  }

  if (permission === 'deny') {
    return {
      success: false,
      message: `Command execution denied by the current permission policy (deny). Use /permissions set auto to allow.`
    };
  }

  try {
    const executor = new TerminalShellExecutor(
      new PermissionModeController({ initialMode: toExecutorMode(permission) })
    );
    const result = await executor.execute(command, { timeoutMs: 120000, cwd });

    const truncate = (s: string) =>
      s.length > MAX_OUTPUT_CHARS ? `${s.slice(0, MAX_OUTPUT_CHARS)}\n…(output truncated)` : s;

    const ok = result.exitCode === 0 && !result.timedOut;
    const header = ok
      ? `=== Command Output ===\n$ ${command}\n`
      : `=== Command Failed ===\n$ ${command}\nExit code: ${result.exitCode ?? 'killed'}${result.timedOut ? ' (timed out)' : ''}\n`;
    const body = [
      result.stdout.trim() ? `Stdout:\n${truncate(result.stdout.trim())}` : '',
      result.stderr.trim() ? `Stderr:\n${truncate(result.stderr.trim())}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    return {
      success: ok,
      message: `${header}Duration: ${(result.durationMs / 1000).toFixed(2)}s\n\n${body || '(no output)'}`
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `=== Command Error ===\n$ ${command}\n${message}`
    };
  }
}

/**
 * Registers the `/exec` slash command (aliases: `run`, `!`) which runs a raw
 * shell command through the core `TerminalShellExecutor`, honoring the session
 * permission level. A leading `!` on a prompt is routed to this command by the
 * router, matching Codex's "run raw terminal command" affordance.
 */
export function registerExecSlashCommand(router: SlashCommandRouter, options: ExecCommandOptions): void {
  router.register(
    'exec',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      const res = await handleExecCommand(ctx.rawArgs, options.permission, options.cwd ?? process.cwd());
      return {
        success: res.success,
        command: ctx.command,
        output: res.message
      };
    },
    {
      description: 'Run a raw shell command in the workspace (respects permission level)',
      aliases: ['run', '!'],
      usage: '/exec <command>   (or: ! <command>)'
    }
  );
}
