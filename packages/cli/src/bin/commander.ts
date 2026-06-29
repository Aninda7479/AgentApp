import { Command } from 'commander';

export interface CliOptions {
  key?: string;
  provider: string;
  model?: string;
  verbose: boolean;
  permission: 'ask' | 'auto' | 'deny';
  interactive: boolean;
}

export function createCliProgram(onExecute?: (options: CliOptions, prompt?: string) => void): Command {
  const program = new Command();

  program
    .name('superagent')
    .description('SuperAgent Terminal CLI — Powered by BYOK AI Models')
    .version('0.1.0')
    .exitOverride();

  program
    .command('chat [prompt]', { isDefault: true })
    .description('Start interactive terminal chat session or execute single prompt')
    .option('-k, --key <key>', 'Specify API key')
    .option('-p, --provider <provider>', 'Specify AI provider (openai, anthropic, gemini)')
    .option('-m, --model <model>', 'Specify model identifier')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('--permission <level>', 'Execution permission level (ask, auto, deny)', 'ask')
    .option('-i, --interactive', 'Start interactive TUI session', true)
    .action((prompt, options) => {
      const mergedOptions: CliOptions = {
        key: options.key,
        provider: options.provider || 'openai',
        model: options.model,
        verbose: Boolean(options.verbose),
        permission: (options.permission || 'ask') as 'ask' | 'auto' | 'deny',
        interactive: !prompt && Boolean(options.interactive ?? true),
      };

      if (onExecute) {
        onExecute(mergedOptions, prompt);
      }
    });

  return program;
}

export function parseCliArguments(args: string[], onExecute?: (options: CliOptions, prompt?: string) => void): CliOptions {
  let parsedOptions: CliOptions = {
    provider: 'openai',
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
