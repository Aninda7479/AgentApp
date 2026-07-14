import { TerminalShellExecutor } from '@superagent/core';
import { CLICommandResult } from '../types.js';

/** Handles `/verify` command: runs tests or application checks to verify recent changes. */
export async function handleVerifyCommand(args: string[]): Promise<CLICommandResult> {
  const verifyCommand = args.length > 0 ? args.join(' ') : 'npm test';

  try {
    const executor = new TerminalShellExecutor();
    
    // Execute the command in the workspace directory
    const result = await executor.execute(verifyCommand, {
      timeoutMs: 60000 // 60s timeout limit for verification checks
    });

    if (result.exitCode === 0) {
      return {
        success: true,
        message: `=== Verification Succeeded ===\nCommand: ${verifyCommand}\nDuration: ${(result.durationMs / 1000).toFixed(2)}s\n\nStdout:\n${result.stdout.trim()}`,
        data: result
      };
    } else {
      return {
        success: false,
        message: `=== Verification Failed ===\nCommand: ${verifyCommand}\nExit Code: ${result.exitCode}\nDuration: ${(result.durationMs / 1000).toFixed(2)}s\n\nStderr:\n${result.stderr.trim()}\n\nStdout:\n${result.stdout.trim()}`,
        data: result
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Verification check error: ${err.message || String(err)}`
    };
  }
}
