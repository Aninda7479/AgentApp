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
import { hasCapableProvider, type MediaCapability } from './capabilities';

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
  startLoop?: (prompt?: string, interval?: string) => string;
  stopLoop?: (id: string) => boolean;
  listLoops?: () => any[];
  clearLoops?: () => void;
  runLoopX?: (prompt: string, count: number) => void;
  /** Pre-fills the composer with a (usually sample-prompt) seed for capability commands. */
  seedComposer?: (text: string) => void;
  /** Whether the dedicated 3D Studio surface is enabled (gates the `/3d` routing). */
  is3dEnabled?: boolean;
}

/**
 * Result of dispatching a slash command. `consumed` is true when the input was
 * handled as a command (so the caller should not also send it as a normal prompt).
 * `keepComposer` is true for "prompt-seed" commands (e.g. /image) that pre-fill the
 * composer with an editable prompt — the caller must NOT clear the composer in that
 * case, or the seed (the user's only feedback) is wiped on the spot.
 */
export interface SlashResult {
  consumed: boolean;
  keepComposer?: boolean;
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
  static async dispatch(ctx: AppContext, parsed: { cmd: string; args: string[]; rawArgs: string }, options: ComposerOptions, deps: SlashDeps): Promise<SlashResult> {
    const { cmd, args } = parsed;

    // Skills are addressed by id, e.g. "/graphify".
    const skill = deps.skills.find((s) => s.id.toLowerCase() === cmd);
    if (skill) {
      const composed = `Skill: ${skill.name}\n${skill.description}\n\nUser request: ${parsed.rawArgs}`;
      await deps.sendPrompt(composed, options);
      return { consumed: true };
    }

    switch (cmd) {
      case 'init':
        deps.openConfigureProject();
        return { consumed: true };
      case 'doctor':
        deps.openDoctor();
        return { consumed: true };
      case 'clear':
        ctx.setActiveChatId('draft-chat');
        ctx.setTrajectorySteps([]);
        ctx.triggerToast('Conversation cleared');
        return { consumed: true };
      case 'mcp': {
        if (args.length === 0) {
          ctx.setActiveTab('mcp');
          return { consumed: true };
        }
        const [serverName, toolName, ...rest] = args;
        const server = ctx.getMcpServers().find((s) => s.name.toLowerCase() === serverName.toLowerCase());
        if (!server) {
          ctx.triggerToast(`Unknown MCP server: ${serverName}`, 'error');
          return { consumed: true };
        }
        if (!toolName) {
          ctx.setActiveTab('mcp');
          ctx.triggerToast(`Server "${server.name}" exposes ${server.toolsCount} tool(s)`);
          return { consumed: true };
        }
        const argStr = rest.join(' ');
        let parsedArgs: Record<string, any> = {};
        if (argStr) {
          try {
            parsedArgs = JSON.parse(argStr);
          } catch {
            ctx.triggerToast('MCP tool args must be valid JSON', 'error');
            return { consumed: true };
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
        return { consumed: true };
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
        return { consumed: true };
      }
      case 'status': {
        const prov = ctx.getConnectedProviders().find((p) => p.apiKey)?.name || 'none';
        ctx.triggerToast(`Provider: ${prov} | Model: ${options.model} | MCP: ${ctx.getMcpServers().filter((s) => s.enabled).length}`);
        return { consumed: true };
      }
      case 'theme': {
        const t = args[0];
        if (t === 'light' || t === 'dark') ctx.setThemeMode(t as any);
        else ctx.setThemeMode(ctx.getThemeMode() === 'light' ? 'dark' : 'light');
        return { consumed: true };
      }
      case 'help': {
        const helpText = BUILTIN_COMMANDS.map((c) => `/${c.name} — ${c.description}`).join('\n');
        const step = StepFactory.helpStep(BUILTIN_COMMANDS.map((c) => ({ name: c.name, description: c.description })));
        ctx.setTrajectorySteps((prev) => [...prev, step]);
        if (!ctx.getActiveChatId()) ctx.setActiveChatId('draft-chat');
        return { consumed: true };
      }
      case 'review':
      case 'diff':
        ctx.setActiveTab('diff');
        return { consumed: true };
      case 'config':
        ctx.setActiveTab('settings');
        return { consumed: true };
      case 'compact':
        ctx.triggerToast('Context compaction runs automatically during long sessions');
        return { consumed: true };
      case 'loop': {
        if (!deps.startLoop || !deps.stopLoop || !deps.listLoops || !deps.clearLoops) {
          ctx.triggerToast('Loop feature is not supported in this environment', 'error');
          return { consumed: true };
        }
        
        if (args[0] === 'list' || args[0] === 'status') {
          const tasks = deps.listLoops();
          if (tasks.length === 0) {
            ctx.triggerToast('No active loop tasks running');
            return { consumed: true };
          }
          const lines = ['=== Active Loop Tasks ==='];
          for (const t of tasks) {
            lines.push(`ID: ${t.id} | Interval: ${t.interval} | Prompt: "${t.prompt}" | Next Run: ${t.nextRunAt}`);
          }
          const step = StepFactory.helpStep([{ name: 'Active Loop Tasks', description: lines.join('\n') }]);
          ctx.setTrajectorySteps((prev) => [...prev, step]);
          if (!ctx.getActiveChatId()) ctx.setActiveChatId('draft-chat');
          return { consumed: true };
        }

        if (args[0] === 'stop' || args[0] === 'cancel') {
          const id = args[1];
          if (!id) {
            ctx.triggerToast('Please specify the loop task ID to stop: /loop stop <id>', 'error');
            return { consumed: true };
          }
          const stopped = deps.stopLoop(id);
          if (stopped) {
            ctx.triggerToast(`Stopped loop task: ${id}`);
          } else {
            ctx.triggerToast(`Loop task ID not found: ${id}`, 'error');
          }
          return { consumed: true };
        }

        if (args[0] === 'clear') {
          deps.clearLoops();
          ctx.triggerToast('All active loop tasks stopped');
          return { consumed: true };
        }

        let interval: string | undefined = undefined;
        let prompt: string | undefined = undefined;

        if (args[0] && /^\d+[smhd]$/i.test(args[0])) {
          interval = args[0];
          prompt = parsed.rawArgs.substring(interval.length).trim() || undefined;
        } else {
          prompt = parsed.rawArgs.trim() || undefined;
        }

        try {
          const taskId = deps.startLoop(prompt, interval);
          const tasks = deps.listLoops();
          const t = tasks.find(x => x.id === taskId);
          ctx.triggerToast(`Loop started. ID: ${taskId}`);
          
          const step = StepFactory.helpStep([{
            name: 'Loop Started',
            description: `Task ID: ${taskId}\nInterval: ${t?.interval || interval || '10m'}\nPrompt: "${t?.prompt || prompt || 'Default maintenance'}"\nNext Run: ${t?.nextRunAt}`
          }]);
          ctx.setTrajectorySteps((prev) => [...prev, step]);
          if (!ctx.getActiveChatId()) ctx.setActiveChatId('draft-chat');
        } catch (err) {
          ctx.triggerToast(`Failed to start loop: ${(err as Error).message}`, 'error');
        }
        return { consumed: true };
      }
      case 'loop-x': {
        const count = parseInt(args[0], 10);
        const prompt = args.slice(1).join(' ');
        if (isNaN(count) || count <= 0 || !prompt) {
          ctx.triggerToast('Usage: /loop-x [number of runs] [prompt]', 'error');
          return { consumed: true };
        }

        if (deps.runLoopX) {
          deps.runLoopX(prompt, count);
        } else {
          ctx.triggerToast('Loop-X feature is not supported in this environment', 'error');
        }
        return { consumed: true };
      }
      case 'learn':
      case 'permissions':
      case 'btw':
      case 'verify':
      case 'plan':
      case 'tasks':
      case 'cost':
      case 'security':
        ctx.triggerToast(`"/${cmd}" is handled by the agent — ask as a normal request (desktop UI support coming soon)`);
        return { consumed: true };
      case 'image':
      case 'video':
      case 'audio':
      case 'pdf': {
        // Capability commands need a provider that can actually run them. If
        // none is connected, fail loudly with an actionable path instead of
        // seeding the composer and letting the call silently drop at send time.
        const cap = cmd as MediaCapability;
        if (!hasCapableProvider(ctx, cap)) {
          ctx.triggerToast(
            `No ${cap}-capable provider connected. Add one in Settings → Providers to use /${cmd}.`,
            'error'
          );
          ctx.setActiveTab('settings');
          ctx.setSettingsCategory('providers');
          return { consumed: true };
        }
        // Prompt-seed commands: pre-fill the composer with an editable sample
        // prompt (including any args the user typed) so they can finish and send
        // intentionally. No auto-send — keeps the user in control of the call.
        const verb =
          cmd === 'image' ? 'Generate an image of'
          : cmd === 'video' ? 'Generate a video of'
          : cmd === 'audio' ? 'Generate audio of'
          : 'Create a PDF about';
        const seed = `${verb}${parsed.rawArgs ? ` ${parsed.rawArgs}` : ' '}`;
        deps.seedComposer?.(seed);
        return { consumed: true, keepComposer: true };
      }
      case '3d': {
        // 3D needs the Studio feature enabled AND a usable provider. Without
        // both, point the user at the right settings instead of a silent no-op.
        if (!hasCapableProvider(ctx, '3d', { is3dEnabled: deps.is3dEnabled })) {
          ctx.triggerToast(
            '3D generation isn’t available yet. Enable 3D Model Gen in Settings and connect a 3D-capable provider.',
            'error'
          );
          ctx.setActiveTab('settings');
          ctx.setSettingsCategory('3d');
          return { consumed: true };
        }
        if (deps.is3dEnabled) {
          ctx.setActiveTab('studio');
          ctx.triggerToast('Opened the 3D Studio — describe a model to generate');
          return { consumed: true };
        }
        deps.seedComposer?.(`Generate a 3D model of${parsed.rawArgs ? ` ${parsed.rawArgs}` : ' '}`);
        ctx.triggerToast('Tip: enable 3D Model Gen in Settings to open the dedicated Studio');
        return { consumed: true, keepComposer: true };
      }
      default:
        ctx.triggerToast(`Unknown command: /${cmd}`, 'error');
        return { consumed: true };
    }
  }
}
