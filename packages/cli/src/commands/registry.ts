import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { registerCompactCommand, ContextMessage, CompactOptions } from './compact.js';
import { registerDiffCommand, DiffReviewer } from './diff.js';
import { registerReviewCommand, CodeReviewer } from './review.js';
import { registerSecurityReviewCommand } from './security.js';
import { registerExecSlashCommand } from './exec.js';
import { registerAttachCommand } from './attach.js';
import { registerExportCommand } from './export.js';
import { registerLastCommand } from './last.js';
import { ImageAttachment } from '@superagent/core';
import { registerMCPCommand } from './mcp.js';
import { registerConfigCommand } from './config.js';
import { registerCostCommand } from './cost.js';
import { registerMemoryCommand } from './memory.js';
import { registerGoalCommand } from './goal.js';
import { registerLoopCommand } from './loop.js';
import { registerSideCommand } from './side.js';
import { registerAgentCommand } from './agent.js';
import { registerHelpCommand } from './help.js';
import { registerBugCommand } from './bug.js';
import { registerVoiceCommand } from './voice.js';
import { registerPlanCommand, PlanGenerator } from './plan.js';
import { registerTasksCommand, TaskManager } from './tasks.js';
import { registerClearCommand } from './clear.js';
import { SessionContext, CLICommandResult } from '../types.js';
import { handleModelCommand } from './model.js';
import { handleStatusCommand } from './status.js';
import { handleThemeCommand } from './theme.js';
import { handleLearnCommand } from './learn.js';
import { handleInitCommand } from './init.js';
import { handleDoctorCommand } from './doctor.js';
import { handlePermissionsCommand } from './permissions.js';
import { handleBtwCommand } from './btw.js';
import { handleVerifyCommand } from './verify.js';
import { PermissionLevel } from '../shortcuts/permissions.js';


/** Converts a CLICommandResult into the router's SlashCommandResult shape. */
function toSlashResult(command: string, res: CLICommandResult): SlashCommandResult {
  return {
    success: res.success,
    command,
    output: res.message,
    data: res.data
  };
}

/** Dependencies required to wire every built-in slash command into a router. */
export interface SlashCommandDeps {
  /** Active session context (provider/model/theme/learnings). */
  session: SessionContext;
  /** Returns the current conversation messages for context compaction. */
  getMessages: () => ContextMessage[];
  /** Replaces conversation messages after context compaction. */
  setMessages: (messages: ContextMessage[]) => void;
  /** Shared diff reviewer used by the `/diff` command. */
  diffReviewer: DiffReviewer;
  /** Optional compaction tuning (keepRecentCount, summarizer, etc.). */
  compactOptions?: CompactOptions;
  /** Current TUI permission level. */
  permission: PermissionLevel;
  /** Sets the TUI permission level. */
  setPermission: (level: PermissionLevel) => void;
  /** Background task manager used by the `/tasks` command (a fresh one is created if omitted). */
  taskManager?: TaskManager;
  /**
   * Shared, mutable queue of image attachments for the `/attach` command. The
   * TUI merges these into the next message and clears the array. A fresh array
   * is created if omitted.
   */
  pendingAttachments?: ImageAttachment[];
  startLoop?: (prompt?: string, interval?: string) => string;
  stopLoop?: (id: string) => boolean;
  listLoops?: () => any[];
  clearLoops?: () => void;
}

/**
 * Builds a fully-wired {@link SlashCommandRouter} with every built-in slash
 * command described in the project docs: `/compact`, `/diff`, `/model`,
 * `/status`, `/theme`, `/learn`, and `/init`. The TUI (and any future UI)
 * can register this single router to expose the documented command surface.
 *
 * @param deps - session context plus message/diff hooks
 */
export function buildSlashCommandRouter(deps: SlashCommandDeps): SlashCommandRouter {
  const { session, getMessages, setMessages, diffReviewer, compactOptions, permission, setPermission } = deps;
  const taskManager = deps.taskManager ?? new TaskManager();
  const pendingAttachments = deps.pendingAttachments ?? [];
  const router = new SlashCommandRouter();

  registerCompactCommand(router, getMessages, setMessages, compactOptions);
  registerDiffCommand(router, diffReviewer);
  registerPlanCommand(router);
  registerReviewCommand(router, { diffReviewer });
  registerSecurityReviewCommand(router);
  registerMCPCommand(router);
  registerConfigCommand(router);
  registerCostCommand(router, session);
  registerMemoryCommand(router, session);
  registerGoalCommand(router);
  registerLoopCommand(router, {
    startLoop: deps.startLoop,
    stopLoop: deps.stopLoop,
    listLoops: deps.listLoops,
    clearLoops: deps.clearLoops
  });
  registerSideCommand(router);
  registerAgentCommand(router);
  registerHelpCommand(router);
  registerBugCommand(router);
  registerVoiceCommand(router);
  registerTasksCommand(router, taskManager);
  registerClearCommand(router, getMessages, setMessages);
  registerExportCommand(router, { getMessages });
  registerLastCommand(router, { getMessages });
  registerExecSlashCommand(router, { permission });
  registerAttachCommand(router, { pendingAttachments });

  router.register(
    'model',
    (ctx: SlashCommandContext) => toSlashResult('model', handleModelCommand(ctx.args, session)),
    {
      description: 'List or switch AI models and providers',
      aliases: ['m'],
      usage: '/model [list | set <id> | provider <p>]'
    }
  );

  router.register(
    'status',
    (ctx: SlashCommandContext) => toSlashResult('status', handleStatusCommand(ctx.args, session)),
    {
      description: 'Show session status and token usage meter',
      aliases: ['stat'],
      usage: '/status'
    }
  );

  router.register(
    'theme',
    (ctx: SlashCommandContext) => toSlashResult('theme', handleThemeCommand(ctx.args, session)),
    {
      description: 'List or switch terminal visual themes',
      aliases: ['t'],
      usage: '/theme [list | <name>]'
    }
  );

  router.register(
    'learn',
    async (ctx: SlashCommandContext) => toSlashResult('learn', await handleLearnCommand(ctx.args, session)),
    {
      description: 'Self-improving skill loop: list, record insights, codify skills',
      aliases: ['l'],
      usage: '/learn [list | auto | insight <topic> <lesson> | skill <name> <instructions>]'
    }
  );

  router.register(
    'init',
    async (ctx: SlashCommandContext) => toSlashResult('init', await handleInitCommand(ctx.args)),
    {
      description: 'Generate project AGENTS.md and agent context',
      aliases: ['i'],
      usage: '/init [--force]'
    }
  );

  router.register(
    'doctor',
    (ctx: SlashCommandContext) => toSlashResult('doctor', handleDoctorCommand(ctx.args, session)),
    {
      description: 'Run setup checkup and configuration diagnostics',
      aliases: ['diag', 'check'],
      usage: '/doctor'
    }
  );

  router.register(
    'permissions',
    (ctx: SlashCommandContext) => toSlashResult('permissions', handlePermissionsCommand(ctx.args, permission, setPermission)),
    {
      description: 'Show, set, or cycle tool execution permission levels',
      aliases: ['perm', 'permission'],
      usage: '/permissions [set] [ask | auto | deny]'
    }
  );

  router.register(
    'btw',
    async (ctx: SlashCommandContext) => toSlashResult('btw', await handleBtwCommand(ctx.args, session)),
    {
      description: 'Ask a side question without polluting the main conversation history',
      aliases: ['bytheway'],
      usage: '/btw <question>'
    }
  );

  router.register(
    'verify',
    async (ctx: SlashCommandContext) => toSlashResult('verify', await handleVerifyCommand(ctx.args)),
    {
      description: 'Run workspace test suite or custom command validation',
      aliases: ['test', 'check-changes'],
      usage: '/verify [command]'
    }
  );

  return router;
}

/**
 * Renders a human-readable help listing of every command registered on a
 * router (including the special /help, /clear, /exit controls).
 * @param router - a router built via {@link buildSlashCommandRouter}
 */
export function formatSlashCommandHelp(router: SlashCommandRouter): string {
  const lines: string[] = ['**Available Slash Commands:**'];
  for (const def of router.getCommands()) {
    const aliases = def.metadata.aliases?.length
      ? ` (aliases: ${def.metadata.aliases.map((a) => `/${a}`).join(', ')})`
      : '';
    lines.push(`- **/${def.name}**${aliases}: ${def.metadata.description}`);
  }
  lines.push('');
  lines.push('Other controls: **/help** (this list), **/clear** (clear chat), **/exit** (quit).');
  lines.push('Shortcuts: [Tab] Queue turn | [Shift+Tab] Cycle permission | [Ctrl+O] Toggle verbose.');
  return lines.join('\n');
}
