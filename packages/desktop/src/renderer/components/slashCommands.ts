/**
 * Slash-command catalog for the desktop Composer.
 *
 * Mirrors the command surface exposed by the CLI's slash router
 * (packages/cli/src/commands/registry.ts) so the desktop and CLI stay
 * consistent, plus the data shapes used to surface skills and MCP servers
 * in the Composer's autocomplete popover.
 */

/** Visual grouping for a slash suggestion in the autocomplete list. */
export type SlashCategory = 'builtin' | 'skill' | 'mcp';

/** A single selectable entry in the `/` autocomplete popover. */
export interface SlashSuggestion {
  /** Unique key (command name, skill id, or `mcp:<server>`). */
  name: string;
  /** Human-readable label shown in the list, e.g. "/model". */
  label: string;
  /** Short description shown under the label. */
  description: string;
  /** Which group the entry belongs to. */
  category: SlashCategory;
  /** Text inserted into the composer when accepted (usually ends with a space). */
  insertText: string;
  /** Action key used by the App router for built-in commands. */
  action?: string;
  /** Optional usage hint, e.g. "/model [list | set <id>]". */
  usage?: string;
}

/** Static definition of a built-in command (mirrors the CLI registry). */
export interface BuiltinCommandDef {
  name: string;
  description: string;
  action: string;
  usage?: string;
}

/**
 * Built-in slash commands. Descriptions are kept in sync with
 * packages/cli/src/commands/registry.ts.
 */
export const BUILTIN_COMMANDS: BuiltinCommandDef[] = [
  { name: 'init', description: 'Generate project AGENTS.md and agent context', action: 'init', usage: '/init [--force]' },
  { name: 'doctor', description: 'Run setup checkup and configuration diagnostics', action: 'doctor', usage: '/doctor' },
  { name: 'model', description: 'List or switch AI models and providers', action: 'model', usage: '/model [list | set <id>]' },
  { name: 'status', description: 'Show session status and token usage meter', action: 'status', usage: '/status' },
  { name: 'theme', description: 'List or switch visual themes', action: 'theme', usage: '/theme [list | <name>]' },
  { name: 'learn', description: 'Self-improving skill loop: list, record insights, codify skills', action: 'learn' },
  { name: 'permissions', description: 'Show, set, or cycle tool execution permission levels', action: 'permissions', usage: '/permissions [set] [ask | auto | deny]' },
  { name: 'btw', description: 'Ask a side question without polluting the conversation', action: 'btw', usage: '/btw <question>' },
  { name: 'verify', description: 'Run workspace test suite or custom command validation', action: 'verify', usage: '/verify [command]' },
  { name: 'review', description: 'Review the current changes for correctness bugs', action: 'review' },
  { name: 'security', description: 'Review the current changes for security issues', action: 'security' },
  { name: 'plan', description: 'Generate an implementation plan', action: 'plan' },
  { name: 'tasks', description: 'Manage and inspect background tasks', action: 'tasks' },
  { name: 'clear', description: 'Clear the current conversation', action: 'clear' },
  { name: 'config', description: 'View or update configuration', action: 'config' },
  { name: 'cost', description: 'Show token cost and usage summary', action: 'cost' },
  { name: 'mcp', description: 'List or manage connected MCP servers and tools', action: 'mcp', usage: '/mcp [<server> [<tool> [args]]]' },
  { name: 'compact', description: 'Compact and summarize the conversation context', action: 'compact' },
  { name: 'diff', description: 'Show a diff of recent file changes', action: 'diff' },
  { name: 'help', description: 'Show this list of available slash commands', action: 'help' },
];

/** Converts the static built-in catalog into selectable suggestions. */
export function builtinSuggestions(): SlashSuggestion[] {
  return BUILTIN_COMMANDS.map((c) => ({
    name: c.name,
    label: `/${c.name}`,
    description: c.description,
    category: 'builtin' as const,
    insertText: `/${c.name} `,
    action: c.action,
    usage: c.usage,
  }));
}

/** A discovered skill (from a workspace `skills/` directory). */
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
}

/** Converts discovered skills into selectable suggestions. */
export function skillSuggestions(skills: SkillInfo[]): SlashSuggestion[] {
  return skills.map((s) => ({
    name: s.id,
    label: `/${s.id}`,
    description: s.description || `Run the "${s.name}" skill`,
    category: 'skill' as const,
    insertText: `/${s.id} `,
    action: 'skill',
  }));
}

/**
 * Converts configured MCP servers into selectable suggestions. When a server
 * exposes real tools (Phase 3), individual tools are listed too.
 */
export function mcpSuggestions(
  servers: { name: string; id: string; tools?: { name: string; description?: string }[] }[]
): SlashSuggestion[] {
  const out: SlashSuggestion[] = [];
  for (const srv of servers) {
    out.push({
      name: `mcp:${srv.name}`,
      label: `/mcp:${srv.name}`,
      description: srv.tools?.length
        ? `MCP server — ${srv.tools.length} tool(s)`
        : 'MCP server',
      category: 'mcp' as const,
      insertText: `/mcp:${srv.name} `,
      action: 'mcp',
    });
    if (srv.tools) {
      for (const tool of srv.tools) {
        out.push({
          name: `mcp:${srv.name}:${tool.name}`,
          label: `/mcp:${srv.name}:${tool.name}`,
          description: tool.description || `Tool from ${srv.name}`,
          category: 'mcp' as const,
          insertText: `/mcp:${srv.name}:${tool.name} `,
          action: 'mcp',
        });
      }
    }
  }
  return out;
}

/** Builds the full suggestion list from all sources. */
export function buildSuggestions(
  builtins: SlashSuggestion[],
  skills: SkillInfo[],
  servers: { name: string; id: string; tools?: { name: string; description?: string }[] }[]
): SlashSuggestion[] {
  return [...builtins, ...skillSuggestions(skills), ...mcpSuggestions(servers)];
}
