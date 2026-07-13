import readline from 'readline';
import { AuthStore } from '@superagent/core';

/**
 * CLI credential management.
 *
 * These commands operate on the SAME shared credential store used by the Web
 * server (core's `AuthStore`, persisted to `<userData>/Config/auth.json`). So an
 * admin can set or rotate the Web/VPS login password straight from the terminal:
 *
 *   superagent password status
 *   superagent password set
 *
 * Out of the box (no custom password configured) the default password is "admin";
 * `set` overwrites it with a proper scrypt hash.
 */

/** Prompts the user for a line of input; masks the echo when `hidden` is true. */
function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (hidden) {
      // Suppress echo of typed characters while still showing the prompt text.
      let promptShown = false;
      (rl as any)._writeToOutput = (str: string) => {
        if (!promptShown) {
          process.stdout.write(str);
          promptShown = true;
        }
        // Ignore subsequent keystroke echoes.
      };
    }

    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

/** Prints whether a password is configured. */
export function printPasswordStatus(): void {
  if (AuthStore.isPasswordSet()) {
    console.log(`Password: SET`);
    console.log(`File:     ${AuthStore.getAuthFilePath()}`);
  } else {
    console.log('Password: NOT SET');
    console.log('Run `superagent password set` to create the admin login.');
  }
}

/** Interactive first-time / reset password setup. */
async function runSet(): Promise<void> {
  const password = await prompt('New password: ', true);
  const confirm = await prompt('Confirm password: ', true);

  if (password !== confirm) {
    throw new Error('Passwords do not match.');
  }

  const result = AuthStore.setPassword(password);
  if (!result.ok) throw new Error(result.error || 'Failed to set password.');
  console.log(`✓ Password set.`);
}

/**
 * Entry point for the `superagent password <subcommand>` command.
 * Supported subcommands: status | set.
 */
export async function runPasswordCommand(args: string[]): Promise<void> {
  const sub = (args[0] || 'status').toLowerCase();
  switch (sub) {
    case 'status':
      printPasswordStatus();
      return;
    case 'set':
      await runSet();
      return;
    default:
      console.log('Usage: superagent password <status|set>');
      return;
  }
}
