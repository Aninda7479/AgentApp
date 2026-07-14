import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { getConfigDirectory } from '@superagent/core';

/** A selectable agent/tool persona the session can switch between. */
export interface AgentEntry {
  id: string;
  name: string;
  description: string;
  /** Optional connector/transport the agent is backed by. */
  backend?: string;
}

/** On-disk document holding the agent catalog and the active selection. */
export interface AgentDoc {
  agents: AgentEntry[];
  active: string | null;
}

/** The built-in agent catalog (Codex/ChatGPT `/agent` style personas). */
export const DEFAULT_AGENTS: AgentEntry[] = [
  { id: 'general', name: 'General Assistant', description: 'Default balanced agent for coding and Q&A.', backend: 'core' },
  { id: 'coder', name: 'Coder', description: 'Focused on repository engineering, diffs, and tests.', backend: 'core' },
  { id: 'researcher', name: 'Researcher', description: 'Web research and document synthesis.', backend: 'core' },
  { id: 'reviewer', name: 'Reviewer', description: 'Security and code-review oriented agent.', backend: 'core' }
];

/**
 * Manages the catalog of selectable agents and the currently active one
 * (maps to the Codex/ChatGPT Work `/agent` slash command). The catalog is
 * seeded with sensible defaults but can be extended; the active selection is
 * persisted to `.superagent/agents.json`.
 */
export class AgentRegistry {
  /** Resolves the agents.json path. */
  public static getPath(overrideDir?: string): string {
    const dir = overrideDir ?? getConfigDirectory();
    return join(dir, 'agents.json');
  }

  /** Loads the document, seeding defaults when absent. */
  public static load(overrideDir?: string): AgentDoc {
    const path = this.getPath(overrideDir);
    if (!existsSync(path)) {
      const seeded: AgentDoc = { agents: DEFAULT_AGENTS, active: 'general' };
      this.save(seeded, overrideDir);
      return seeded;
    }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AgentDoc>;
      return {
        agents: Array.isArray(parsed.agents) && parsed.agents.length ? parsed.agents : DEFAULT_AGENTS,
        active: parsed.active ?? null
      };
    } catch {
      return { agents: DEFAULT_AGENTS, active: 'general' };
    }
  }

  /** Persists the document. */
  public static save(doc: AgentDoc, overrideDir?: string): string {
    const dir = overrideDir ?? getConfigDirectory();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, 'agents.json');
    writeFileSync(path, JSON.stringify(doc, null, 2), 'utf8');
    return path;
  }

  /** Sets the active agent by id. Returns the updated doc, or null if unknown. */
  public static setActive(id: string, overrideDir?: string): AgentDoc | null {
    const doc = this.load(overrideDir);
    if (!doc.agents.some((a) => a.id === id)) return null;
    doc.active = id;
    this.save(doc, overrideDir);
    return doc;
  }

  /** Renders the agent list with the active marker. */
  public static format(doc: AgentDoc): string {
    const lines = ['=== Agents ==='];
    for (const a of doc.agents) {
      const marker = a.id === doc.active ? '*' : ' ';
      const back = a.backend ? ` [${a.backend}]` : '';
      lines.push(`${marker} ${a.id}: ${a.name} — ${a.description}${back}`);
    }
    lines.push('');
    lines.push(`Active: ${doc.active ?? '(none)'}`);
    return lines.join('\n');
  }
}

/** Registers the `/agent` slash command: list/switch active agent personas. */
export function registerAgentCommand(router: SlashCommandRouter): void {
  router.register(
    'agent',
    (ctx: SlashCommandContext): SlashCommandResult => {
      const [sub, ...rest] = ctx.args;

      if (!sub || sub === 'list') {
        return { success: true, command: ctx.command, output: AgentRegistry.format(AgentRegistry.load()), data: AgentRegistry.load() };
      }
      if (sub === 'set' || sub === 'use') {
        const id = rest[0];
        if (!id) return { success: false, command: ctx.command, output: 'Usage: /agent set <id>', error: 'Missing id' };
        const doc = AgentRegistry.setActive(id);
        if (!doc) return { success: false, command: ctx.command, output: `Unknown agent "${id}"`, error: 'Not found' };
        return { success: true, command: ctx.command, output: `Active agent is now "${id}".\n${AgentRegistry.format(doc)}`, data: doc };
      }
      // bare id => switch
      const doc = AgentRegistry.setActive(sub);
      if (!doc) {
        return { success: false, command: ctx.command, output: `Unknown agent "${sub}"`, error: 'Not found' };
      }
      return { success: true, command: ctx.command, output: `Active agent is now "${sub}".`, data: doc };
    },
    {
      description: 'List or switch between active agent personas',
      aliases: ['agents'],
      usage: '/agent [list | set <id>]'
    }
  );
}
