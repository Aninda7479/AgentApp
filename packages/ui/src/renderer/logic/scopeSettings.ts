import type {
  StoredChat,
  StoredProject,
  AgentScopeSettings,
  InheritableSandbox,
  InheritableApproval,
  InheritableInternet
} from '../types';
import type { InternetAccessLevel } from '../pages/Settings/types';

/** Engine permission modes the resolver can produce (mirrors core's `PermissionMode`). */
type ResolvedPermissionMode = 'full-autonomy' | 'auto-approve-edits' | 'deny-all';

/**
 * Resolves a Project/Chat's effective sandbox + internet settings by walking the
 * scope chain Chat → Project → Global. A scope value of `undefined` or
 * `'inherit'` falls through to the parent scope; only a concrete value overrides.
 *
 * This is the single source of truth for "what mode does this run use" so the
 * composer's live toggles and the new settings pages stay consistent.
 */
export interface ResolvedScope {
  /** True → full system access (no project-root path scoping for files). */
  unsandboxed: boolean;
  /** Effective approval choice (always / ask / never). */
  approval: 'always' | 'ask' | 'never';
  /** Effective internet-access level. */
  internet: InternetAccessLevel;
}

/** Fallback approval used only when every scope is unset (mirrors the composer default). */
const DEFAULT_APPROVAL: InheritableApproval = 'ask';
const DEFAULT_INTERNET: InternetAccessLevel = 'all';

/** Maps the composer/settings approval choice to an engine `PermissionMode`. */
export function approvalToPermissionMode(
  approval: 'always' | 'ask' | 'never',
  unsandboxed: boolean
): ResolvedPermissionMode {
  // Full-access (unsandboxed) + "always" is the only path to full autonomy;
  // "always" under a sandboxed scope still honors the project-root path scope
  // (it only means "auto-approve commands", not "escape the sandbox").
  if (approval === 'always' && unsandboxed) return 'full-autonomy';
  if (approval === 'always') return 'auto-approve-edits';
  if (approval === 'never') return 'deny-all';
  return 'auto-approve-edits';
}

/**
 * Reads one inheritable field from a scope, treating `'inherit'` exactly
 * like "unset" so the `?? ` chain below falls through to the next
 * (more-global) scope. Only a concrete value survives.
 */
function pick<T extends string>(value: T | undefined): T | undefined {
  return value && value !== 'inherit' ? value : undefined;
}

function firstDefinedSandbox(scope?: AgentScopeSettings): InheritableSandbox | undefined {
  return pick(scope?.sandbox);
}

function firstDefinedApproval(scope?: AgentScopeSettings): InheritableApproval | undefined {
  return pick(scope?.approval);
}

function firstDefinedInternet(scope?: AgentScopeSettings): InheritableInternet | undefined {
  return pick(scope?.internet);
}

/**
 * Resolves effective settings for a concrete run.
 *
 * @param chat      The active chat (bottom of the precedence chain, wins).
 * @param project   The active project (middle of the chain).
 * @param globals   Global fallbacks (top of the chain): the persisted
 *                   full-access flag and internet level, plus the user's live
 *                   unsandboxed override from the composer sandbox badge.
 */
export function resolveScopeSettings(args: {
  chat?: StoredChat | null;
  project?: StoredProject | null;
  globalUnsandboxed: boolean;
  globalInternet: InternetAccessLevel;
}): ResolvedScope {
  const { chat, project, globalUnsandboxed, globalInternet } = args;

  const sandbox = (firstDefinedSandbox(chat?.settings) ??
    firstDefinedSandbox(project?.settings) ??
    (globalUnsandboxed ? 'full-access' : 'sandboxed')) as InheritableSandbox;

  const approval = (firstDefinedApproval(chat?.settings) ??
    firstDefinedApproval(project?.settings) ??
    DEFAULT_APPROVAL) as InheritableApproval;

  const internet = (firstDefinedInternet(chat?.settings) ??
    firstDefinedInternet(project?.settings) ??
    globalInternet ??
    DEFAULT_INTERNET) as InternetAccessLevel;

  return {
    // 'full-access' is the only concrete sandbox value that turns off scoping;
    // 'sandboxed' / 'inherit' keep the sandbox on.
    unsandboxed: sandbox === 'full-access',
    approval: (approval === 'always' || approval === 'never' ? approval : 'ask'),
    internet
  };
}
