/**
 * `SlashRouter` — parses and dispatches leading-slash commands in the composer.
 * `parse` turns "/cmd arg1 arg2" into `{ cmd, args, rawArgs }`; `dispatch` runs
 * the matching branch, performing UI navigation, IPC calls, or forwarding to the
 * agent via the injected `sendPrompt`. Returns `true` when the input was
 * consumed as a command (so the caller does not also send it as a normal prompt).
 */
import type { AppContext, ComposerOptions } from './types';
import type { SkillInfo } from '../components/slashCommands';
import { BUILTIN_COMMANDS } from '../components/slashCommands';
import { StepFactory } from './steps';
import { SettingsService } from './settings';

/** Extra capabilities the router needs that aren't part of the core `AppContext`. */
export interface SlashDeps {
  /** Discovered workspace skills (for `/<skillId>` routing). */
  skills: SkillInfo[];
  /** Forwards a (possibly composed) prompt to the agent/simulation. */
  sendPrompt: (raw: string, options: ComposerOptions) => Promise<void>;
  /** Opens the "configure project" modal. */
  openConfigureProject: () => void;
  /** Opens the diagnostics ("doctor") modal. */
  openDoctor: () => void;
  /** Opens the search modal. */
  openSearch: () => void;
  /** Opens the keyboard-shortcuts modal. */
  openShortcuts: () => void;
  /** Opens the create-project modal. */
  openCreateProject: () => void;
}

export class SlashRouter {
  /** Splits a raw "/cmd ..." string into its command, args, and joined raw args. */
  static parse(raw: string): { cmd: string; args: string[]; rawArgs: string } {
    const body = raw.replace(/^\//, '').trim();
    const parts = body.length ? body.split(/\s+/) : [];
    const cmd = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    const rawArgs = args.join(' ');
    return { cmd, args, rawArgs };
  }

  /**
   * Dispatches a parsed slash command. `options` is the composer's current
   * options (used for `/status`, `/model set`, skill forwarding, etc.).
   */
  static async dispatch(ctx: AppContext, parsed: { cmd: string; args: string[]; rawArgs: string }, options: ComposerOptions, deps: SlashDeps): Promise<boolean> {
    const { cmd, args } = parsed;

    // Skills are addressed by id, e.g. "/graphify".
    const skill = deps.skills.find((s) => s.id.toLowerCase() === cmd);
    if (skill) {
      const composed = `Skill: ${skill.name}\n${skill.description}\n\nUser request: ${parsed.rawArgs}`;
      await deps.sendPrompt(composed, options);
      return true;
    }

    switch (cmd) {
      case 'init':
        deps.openConfigureProject();
        return true;
      case 'doctor':
        deps.openDoctor();
        return true;
      case 'clear':
        ctx.setActiveChatId('draft-chat');
        ctx.setTrajectorySteps([]);
        ctx.triggerToast('Conversation cleared');
        return true;
      case 'mcp': {
        if (args.length === 0) {
          ctx.setActiveTab('mcp');
          return true;
        }
        const [serverName, toolName, ...rest] = args;
        const server = ctx.getMcpServers().find((s) => s.name.toLowerCase() === serverName.toLowerCase());
        if (!server) {
          ctx.triggerToast(`Unknown MCP server: ${serverName}`, 'error');
          return true;
        }
        if (!toolName) {
          ctx.setActiveTab('mcp');
          ctx.triggerToast(`Server "${server.name}" exposes ${server.toolsCount} tool(s)`);
          return true;
        }
        const argStr = rest.join(' ');
        let parsedArgs: Record<string, any> = {};
        if (argStr) {
          try {
            parsedArgs = JSON.parse(argStr);
          } catch {
            ctx.triggerToast('MCP tool args must be valid JSON', 'error');
            return true;
          }
        }
        try {
          const res = await ctx.ipc?.invoke('mcp-call', { id: server.id, tool: toolName, args: parsedArgs });
          const resultText = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
          const step = StepFactory.mcpResultStep(server.name, toolName, resultText);
          ctx.setTrajectorySteps((prev) => [...prev, step]);
          if (!ctx.getActiveChatId()) ctx.setActiveChatId('draft-chat');
        } catch (err: unknown) {
          ctx.triggerToast(`MCP call failed: ${(err as Error).message}`, 'error');
        }
        return true;
      }
      case 'model': {
        const enabled = ctx.getModelsCatalog().filter((m) => m.enabled).map((m) => m.name);
        if (args[0] === 'set' && args[1]) {
          const name = args[1];
          if (enabled.includes(name)) {
            SettingsService.persistLastUsedModel(ctx, name);
            ctx.triggerToast(`Model set to ${name}`);
          } else {
            ctx.triggerToast(`Unknown model: ${name}`, 'error');
          }
        } else {
          ctx.triggerToast(`Models: ${enabled.slice(0, 8).join(', ')}${enabled.length > 8 ? '…' : ''}`);
        }
        return true;
      }
      case 'status': {
        const prov = ctx.getConnectedProviders().find((p) => p.apiKey)?.name || 'none';
        ctx.triggerToast(`Provider: ${prov} | Model: ${options.model} | MCP: ${ctx.getMcpServers().filter((s) => s.enabled).length}`);
        return true;
      }
      case 'theme': {
        const t = args[0];
        if (t === 'light' || t === 'dark') ctx.setThemeMode(t as any);
        else ctx.setThemeMode(ctx.getThemeMode() === 'light' ? 'dark' : 'light');
        return true;
      }
      case 'help': {
        const helpText = BUILTIN_COMMANDS.map((c) => `/${c.name} — ${c.description}`).join('\n');
        const step = StepFactory.helpStep(BUILTIN_COMMANDS.map((c) => ({ name: c.name, description: c.description })));
        ctx.setTrajectorySteps((prev) => [...prev, step]);
        if (!ctx.getActiveChatId()) ctx.setActiveChatId('draft-chat');
        return true;
      }
      case 'review':
      case 'diff':
        ctx.setActiveTab('diff');
        return true;
      case 'config':
        ctx.setActiveTab('settings');
        return true;
      case 'compact':
        ctx.triggerToast('Context compaction runs automatically during long sessions');
        return true;
      case 'learn':
      case 'permissions':
      case 'btw':
      case 'verify':
      case 'plan':
      case 'tasks':
      case 'cost':
      case 'security':
        ctx.triggerToast(`"/${cmd}" is handled by the agent — ask as a normal request (desktop UI support coming soon)`);
        return true;
      default:
        ctx.triggerToast(`Unknown command: /${cmd}`, 'error');
        return true;
    }
  }
}
