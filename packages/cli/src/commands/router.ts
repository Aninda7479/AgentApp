/** Parsed representation of a slash command input. */
export interface SlashCommandContext {
  command: string;
  args: string[];
  rawArgs: string;
  fullInput: string;
}

/** Function signature for slash command handlers. */
export type SlashCommandHandler = (context: SlashCommandContext) => Promise<SlashCommandResult> | SlashCommandResult;

/** Metadata describing a slash command for help text. */
export interface SlashCommandMetadata {
  description: string;
  aliases?: string[];
  usage?: string;
}

/** Result returned after executing a slash command. */
export interface SlashCommandResult {
  success: boolean;
  command: string;
  output?: string;
  data?: unknown;
  error?: string;
}

/** Associates a command name with its handler and metadata. */
export interface SlashCommandDefinition {
  name: string;
  handler: SlashCommandHandler;
  metadata: SlashCommandMetadata;
}

/** Routes slash commands to their registered handlers. */
export class SlashCommandRouter {
  private commands: Map<string, SlashCommandDefinition> = new Map();
  private aliases: Map<string, string> = new Map();

  /** Registers a slash command with its handler, name, and metadata. */
  public register(name: string, handler: SlashCommandHandler, metadata: SlashCommandMetadata): void {
    const cleanName = name.startsWith('/') ? name.substring(1) : name;
    const def: SlashCommandDefinition = { name: cleanName, handler, metadata };
    this.commands.set(cleanName.toLowerCase(), def);

    if (metadata.aliases) {
      for (const alias of metadata.aliases) {
        const cleanAlias = alias.startsWith('/') ? alias.substring(1) : alias;
        this.aliases.set(cleanAlias.toLowerCase(), cleanName.toLowerCase());
      }
    }
  }

  /** Returns true if the input starts with '/' or with '!' (raw shell exec). */
  public isSlashCommand(input: string): boolean {
    const trimmed = input.trim();
    return trimmed.startsWith('/') || trimmed.startsWith('!');
  }

  /** Parses a slash command string into a SlashCommandContext, or null if invalid. */
  public parse(input: string): SlashCommandContext | null {
    const trimmed = input.trim();

    // A leading '!' is shorthand for the `exec` command (run a raw shell command).
    if (trimmed.startsWith('!')) {
      const command = trimmed.substring(1).trim();
      if (!command) return null;
      return {
        command: 'exec',
        args: command.split(/\s+/),
        rawArgs: command,
        fullInput: input
      };
    }

    if (!trimmed.startsWith('/')) return null;

    const body = trimmed.substring(1);
    if (!body) return null;

    const parts = body.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    const rawArgs = body.substring(command.length).trim();

    return {
      command,
      args,
      rawArgs,
      fullInput: input
    };
  }

  /** Executes a slash command string, resolving aliases and invoking the handler. */
  public async execute(input: string): Promise<SlashCommandResult> {
    const parsed = this.parse(input);
    if (!parsed) {
      return {
        success: false,
        command: '',
        error: 'Invalid slash command format.'
      };
    }

    let targetName = parsed.command;
    if (this.aliases.has(targetName)) {
      targetName = this.aliases.get(targetName)!;
    }

    const def = this.commands.get(targetName);
    if (!def) {
      return {
        success: false,
        command: parsed.command,
        error: `Unknown slash command: /${parsed.command}`
      };
    }

    try {
      return await def.handler(parsed);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        command: parsed.command,
        error: `Command execution error: ${errorMessage}`
      };
    }
  }

  /** Returns all registered command definitions. */
  public getCommands(): SlashCommandDefinition[] {
    return Array.from(this.commands.values());
  }
}

import { SessionContext } from '../types.js';
import { handleModelCommand } from './model.js';
import { handleStatusCommand } from './status.js';
import { handleThemeCommand } from './theme.js';
import { handleLearnCommand } from './learn.js';
import { handleInitCommand } from './init.js';

/**
 * Convenience function: parses and executes a slash command string against built-in handlers.
 * @param input - Raw slash command string (e.g. '/model list')
 * @param context - Active session context
 */
export async function processSlashCommand(input: string, context: SessionContext): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return 'Invalid slash command.';
  const body = trimmed.substring(1);
  const parts = body.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Dispatch to built-in command handlers
  if (cmd === 'model') {
    return handleModelCommand(args, context).message;
  }
  if (cmd === 'status') {
    return handleStatusCommand(args, context).message;
  }
  if (cmd === 'theme') {
    return handleThemeCommand(args, context).message;
  }
  if (cmd === 'learn') {
    const res = await handleLearnCommand(args, context);
    return res.message;
  }
  if (cmd === 'init') {
    const res = await handleInitCommand(args);
    return res.message;
  }
  return `Command /${cmd} processed.`;
}

