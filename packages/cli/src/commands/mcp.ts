import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { getConfigDirectory } from '@superagent/core';

/** Transport used to reach an MCP server. */
export type MCPTransport = 'stdio' | 'sse' | 'http';

/** A single MCP server definition (Claude-style mcp.json layout). */
export interface MCPServerConfig {
  name: string;
  transport: MCPTransport;
  /** stdio: command to spawn. */
  command?: string;
  /** stdio: spawn arguments. */
  args?: string[];
  /** stdio: extra environment variables. */
  env?: Record<string, string>;
  /** sse/http: endpoint URL. */
  url?: string;
  enabled?: boolean;
}

/** Parsed mcp.json document. */
export interface MCPConfigDoc {
  mcpServers: MCPServerConfig[];
}

/**
 * Persisted store of MCP server definitions, backed by a Claude-style
 * `mcp.json` in the SuperAgent config directory. Lets the CLI `/mcp` command
 * list, add, inspect, and remove servers offline (actual tool discovery
 * happens at runtime via the core MCP client). Fully deterministic and
 * unit-testable with an in-memory or temp config path.
 */
export class MCPConfigStore {
  /** Resolves the mcp.json path (config dir + 'mcp.json'). */
  public static getConfigPath(overrideDir?: string): string {
    const dir = overrideDir ?? getConfigDirectory();
    return join(dir, 'mcp.json');
  }

  /** Loads and parses the mcp.json document (empty list when absent/invalid). */
  public static load(overrideDir?: string): MCPConfigDoc {
    const path = this.getConfigPath(overrideDir);
    if (!existsSync(path)) return { mcpServers: [] };
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<MCPConfigDoc>;
      if (!Array.isArray(parsed.mcpServers)) return { mcpServers: [] };
      return { mcpServers: parsed.mcpServers as MCPServerConfig[] };
    } catch {
      return { mcpServers: [] };
    }
  }

  /** Persists the document, creating parent directories as needed. */
  public static save(doc: MCPConfigDoc, overrideDir?: string): string {
    const dir = overrideDir ?? getConfigDirectory();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, 'mcp.json');
    writeFileSync(path, JSON.stringify(doc, null, 2), 'utf8');
    return path;
  }

  /** Adds or replaces a server by name. Returns the saved config path. */
  public static upsert(server: MCPServerConfig, overrideDir?: string): string {
    const doc = this.load(overrideDir);
    doc.mcpServers = doc.mcpServers.filter((s) => s.name !== server.name);
    doc.mcpServers.push({ enabled: true, ...server });
    return this.save(doc, overrideDir);
  }

  /** Removes a server by name. Returns true if it existed. */
  public static remove(name: string, overrideDir?: string): boolean {
    const doc = this.load(overrideDir);
    const next = doc.mcpServers.filter((s) => s.name !== name);
    if (next.length === doc.mcpServers.length) return false;
    doc.mcpServers = next;
    this.save(doc, overrideDir);
    return true;
  }

  /** Renders the server list as a human-readable multi-line string. */
  public static formatList(doc: MCPConfigDoc): string {
    if (doc.mcpServers.length === 0) {
      return 'No MCP servers configured. Add one with /mcp add <name> -- <command> [args...]';
    }
    const lines: string[] = ['=== MCP Servers ==='];
    for (const s of doc.mcpServers) {
      const target =
        s.transport === 'stdio'
          ? `${s.command ?? '?'}${s.args && s.args.length ? ' ' + s.args.join(' ') : ''}`
          : s.url ?? '(no url)';
      const flag = s.enabled === false ? ' (disabled)' : '';
      lines.push(`- ${s.name} [${s.transport}] ${target}${flag}`);
    }
    lines.push('', `Total: ${doc.mcpServers.length} server(s).`);
    return lines.join('\n');
  }
}

/** Parses an `add` subcommand: `/mcp add <name> [--sse|--http] -- <command> [args...]`. */
function parseAdd(args: string[]): MCPServerConfig | { error: string } {
  const dashIdx = args.indexOf('--');
  const meta = dashIdx >= 0 ? args.slice(0, dashIdx) : args;
  const target = dashIdx >= 0 ? args.slice(dashIdx + 1) : [];

  if (meta.length < 1) return { error: 'Missing server name' };
  const name = meta[0];
  const transportFlag = meta.find((a) => a === '--sse' || a === '--http');
  const transport: MCPTransport = transportFlag === '--sse' ? 'sse' : transportFlag === '--http' ? 'http' : 'stdio';

  if (transport === 'stdio') {
    if (target.length === 0) return { error: 'Missing command after --' };
    return { name, transport, command: target[0], args: target.slice(1) };
  }
  // sse / http require a URL
  const url = target.join(' ').trim();
  if (!/^https?:\/\//.test(url)) return { error: 'Missing or invalid URL for sse/http transport' };
  return { name, transport, url };
}

/** Registers the `/mcp` slash command: manage Model Context Protocol servers. */
export function registerMCPCommand(router: SlashCommandRouter, configDir?: string): void {
  router.register(
    'mcp',
    (ctx: SlashCommandContext): SlashCommandResult => {
      const [sub, ...rest] = ctx.args;

      if (!sub || sub === 'list') {
        const doc = MCPConfigStore.load(configDir);
        return { success: true, command: ctx.command, output: MCPConfigStore.formatList(doc), data: doc };
      }

      if (sub === 'add') {
        const parsed = parseAdd(rest);
        if ('error' in parsed) {
          return { success: false, command: ctx.command, output: `Usage error: ${parsed.error}`, error: parsed.error };
        }
        const path = MCPConfigStore.upsert(parsed, configDir);
        return {
          success: true,
          command: ctx.command,
          output: `Added MCP server "${parsed.name}" (${parsed.transport}) to ${path}.`,
          data: parsed
        };
      }

      if (sub === 'get') {
        const name = rest[0];
        if (!name) return { success: false, command: ctx.command, output: 'Usage: /mcp get <name>', error: 'Missing name' };
        const server = MCPConfigStore.load(configDir).mcpServers.find((s) => s.name === name);
        if (!server) return { success: false, command: ctx.command, output: `No server "${name}"`, error: 'Not found' };
        return { success: true, command: ctx.command, output: JSON.stringify(server, null, 2), data: server };
      }

      if (sub === 'remove' || sub === 'rm') {
        const name = rest[0];
        if (!name) return { success: false, command: ctx.command, output: 'Usage: /mcp remove <name>', error: 'Missing name' };
        if (!MCPConfigStore.remove(name, configDir)) {
          return { success: false, command: ctx.command, output: `No server "${name}"`, error: 'Not found' };
        }
        return { success: true, command: ctx.command, output: `Removed MCP server "${name}".` };
      }

      return {
        success: false,
        command: ctx.command,
        output: 'Usage: /mcp [list | add <name> [--sse|--http] -- <command> [args...] | get <name> | remove <name>]',
        error: `Unknown mcp subcommand: ${sub}`
      };
    },
    {
      description: 'List, add, inspect, or remove Model Context Protocol (MCP) servers',
      aliases: ['servers'],
      usage: '/mcp [list | add <name> -- <command> | get <name> | remove <name>]'
    }
  );
}
