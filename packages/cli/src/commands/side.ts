import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { getConfigDirectory } from '@superagent/core';

/** A single message in a side conversation. */
export interface SideMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/** An isolated side conversation that does not pollute the main context. */
export interface SideChat {
  name: string;
  messages: SideMessage[];
  createdAt: string;
  updatedAt: string;
}

/** On-disk document holding all side conversations. */
export interface SideChatDoc {
  sides: SideChat[];
}

/**
 * Manages isolated "side" conversations (ChatGPT Work's `/side` command): a
 * scratch space for quick, throwaway questions that must not pollute the
 * primary project context. Persisted to `.superagent/sides.json` and fully
 * deterministic/testable.
 */
export class SideChatManager {
  /** Resolves the sides.json path. */
  public static getPath(overrideDir?: string): string {
    const dir = overrideDir ?? getConfigDirectory();
    return join(dir, 'sides.json');
  }

  /** Loads the document (empty list when absent/invalid). */
  public static load(overrideDir?: string): SideChatDoc {
    const path = this.getPath(overrideDir);
    if (!existsSync(path)) return { sides: [] };
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<SideChatDoc>;
      return Array.isArray(parsed.sides) ? { sides: parsed.sides } : { sides: [] };
    } catch {
      return { sides: [] };
    }
  }

  /** Persists the document. */
  public static save(doc: SideChatDoc, overrideDir?: string): string {
    const dir = overrideDir ?? getConfigDirectory();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, 'sides.json');
    writeFileSync(path, JSON.stringify(doc, null, 2), 'utf8');
    return path;
  }

  /** Returns a side chat by name (creating it if missing). */
  public static getOrCreate(name: string, overrideDir?: string): SideChat {
    const doc = this.load(overrideDir);
    let side = doc.sides.find((s) => s.name === name);
    if (!side) {
      side = { name, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      doc.sides.push(side);
      this.save(doc, overrideDir);
    }
    return side;
  }

  /** Appends a message to a side chat. Returns the updated chat. */
  public static append(name: string, role: SideMessage['role'], content: string, overrideDir?: string): SideChat {
    const doc = this.load(overrideDir);
    let side = doc.sides.find((s) => s.name === name);
    if (!side) {
      side = { name, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      doc.sides.push(side);
    }
    side.messages.push({ role, content, timestamp: new Date().toISOString() });
    side.updatedAt = new Date().toISOString();
    this.save(doc, overrideDir);
    return side;
  }

  /** Removes a side chat by name. Returns true if it existed. */
  public static remove(name: string, overrideDir?: string): boolean {
    const doc = this.load(overrideDir);
    const next = doc.sides.filter((s) => s.name !== name);
    if (next.length === doc.sides.length) return false;
    doc.sides = next;
    this.save(doc, overrideDir);
    return true;
  }

  /** Renders a side chat (or the list of sides) as text. */
  public static format(chat: SideChat | SideChatDoc): string {
    if ('sides' in chat) {
      if (chat.sides.length === 0) return 'No side chats yet. Start one with /side <name> <message>';
      const lines = ['=== Side Chats ==='];
      for (const s of chat.sides) {
        lines.push(`- ${s.name}: ${s.messages.length} message(s)`);
      }
      return lines.join('\n');
    }
    const lines = [`=== Side Chat: ${chat.name} ===`];
    if (chat.messages.length === 0) lines.push('(empty)');
    for (const m of chat.messages) {
      lines.push(`[${m.role}] ${m.content}`);
    }
    return lines.join('\n');
  }
}

/** Registers the `/side` slash command: isolated scratch conversations. */
export function registerSideCommand(router: SlashCommandRouter): void {
  router.register(
    'side',
    (ctx: SlashCommandContext): SlashCommandResult => {
      const [name, ...rest] = ctx.args;
      if (!name) {
        return { success: true, command: ctx.command, output: SideChatManager.format(SideChatManager.load()) };
      }
      // Subcommand handling: /side remove <name> or /side list
      if ((name === 'remove' || name === 'rm') && rest[0]) {
        const ok = SideChatManager.remove(rest[0]);
        return ok
          ? { success: true, command: ctx.command, output: `Removed side "${rest[0]}".` }
          : { success: false, command: ctx.command, output: `No side "${rest[0]}".`, error: 'Not found' };
      }
      if (name === 'list') {
        return { success: true, command: ctx.command, output: SideChatManager.format(SideChatManager.load()) };
      }
      // /side <name> [message...] — view if no message, else append a user turn.
      if (rest.length === 0) {
        const side = SideChatManager.getOrCreate(name);
        return { success: true, command: ctx.command, output: SideChatManager.format(side) };
      }
      const updated = SideChatManager.append(name, 'user', rest.join(' '));
      return {
        success: true,
        command: ctx.command,
        output: `Added to side "${name}". Use /side ${name} again to view. (${updated.messages.length} message(s))`,
        data: updated
      };
    },
    {
      description: 'Launch an isolated side chat that does not pollute the main context',
      aliases: ['scratch'],
      usage: '/side [list | <name> [message] | remove <name>]'
    }
  );
}
