import { Command } from 'commander';
import { SettingsStorage } from '@superagent/core';
import { runUpdate } from '../commands/update.js';

/** Parsed CLI flags and options for the chat command. */
export interface CliOptions {
  key?: string;
  provider: string;
  model?: string;
  verbose: boolean;
  permission: 'ask' | 'auto' | 'deny';
  interactive: boolean;
  resume?: string;
}

/**
 * Builds and returns the main Commander program with chat subcommand.
 * @param onExecute - Optional callback invoked when a command is executed
 */
export function createCliProgram(onExecute?: (options: CliOptions, prompt?: string) => void): Command {
  const program = new Command();

  program
    .name('superagent')
    .description('SuperAgent Terminal CLI — Powered by BYOK AI Models')
    .version('0.1.0')
    .exitOverride()
    .option('--start-web', 'Start the SuperAgent web server and host the web app (same as `npm start:web`)')
    .option('--stop-web', 'Stop the running SuperAgent web server (even one started by the Desktop app)')
    .option('--web-status', 'Print whether the SuperAgent web server is running, and who started it')
    .option('--web-port <port>', 'Port for the web server when using --start-web', '3000');

  program
    .command('chat [prompt]', { isDefault: true })
    .description('Start interactive terminal chat session or execute single prompt')
    .option('-k, --key <key>', 'Specify API key')
    .option('-p, --provider <provider>', 'Specify AI provider (openai, anthropic, gemini)')
    .option('-m, --model <model>', 'Specify model identifier')
    .option('--chat <prompt>', 'Run a single prompt and exit (alias for a positional prompt)')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--permission <level>', 'Execution permission level (ask, auto, deny)', 'ask')
    .option('-i, --interactive', 'Start interactive TUI session', true)
    .option('--resume <id>', 'Resume a previous session by its id')
    .action((prompt, options) => {
      const savedSettings = SettingsStorage.loadSettings();
      // A `--model provider/model` value (e.g. openrouter/tencent/hy3:free)
      // encodes the provider in the model string. Split it out, but only when
      // `--provider` wasn't given explicitly, so an explicit flag always wins.
      let provider = options.provider || savedSettings.lastUsedModel?.provider || 'openai';
      let model = options.model || savedSettings.lastUsedModel?.model;
      if (model && model.includes('/') && !options.provider) {
        const slashIdx = model.indexOf('/');
        provider = model.slice(0, slashIdx);
        model = model.slice(slashIdx + 1);
      }
      const effectivePrompt = prompt || options.chat;
      const mergedOptions: CliOptions = {
        key: options.key,
        provider,
        model,
        verbose: Boolean(options.verbose),
        permission: (options.permission || 'ask') as 'ask' | 'auto' | 'deny',
        interactive: !effectivePrompt && Boolean(options.interactive ?? true),
        resume: options.resume,
      };

      // Return the (possibly async) result so `program.parseAsync` awaits it.
      return onExecute?.(mergedOptions, effectivePrompt);
    });

  // `superagent update` — self-update the Core + CLI + Web install from npm
  // (Option 1). Mirrors the desktop's in-app "Check for Updates" flow.
  program
    .command('update')
    .description('Update the SuperAgent CLI and web server to the latest published npm version')
    .option('-c, --check', 'Check for a newer version without installing', false)
    .action((options: { check?: boolean }) => {
      runUpdate({ check: Boolean(options.check) });
    });

  return program;
}

/**
 * Parses raw CLI arguments and returns merged options.
 * @param args - Raw process.argv slice (e.g. process.argv.slice(2))
 * @param onExecute - Optional callback invoked when a command is executed
 */
export function parseCliArguments(args: string[], onExecute?: (options: CliOptions, prompt?: string) => void): CliOptions {
  const savedSettings = SettingsStorage.loadSettings();
  let parsedOptions: CliOptions = {
    provider: savedSettings.lastUsedModel?.provider || 'openai',
    model: savedSettings.lastUsedModel?.model,
    verbose: false,
    permission: 'ask',
    interactive: true,
  };

  const program = createCliProgram((opts, prompt) => {
    parsedOptions = opts;
    if (onExecute) {
      onExecute(opts, prompt);
    }
  });

  program.parse(args, { from: 'user' });
  return parsedOptions;
}
