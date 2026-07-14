import { SettingsStorage, InternetAccessLevel } from '../storage/settings-store.js';

/**
 * Classification of a network operation, used to decide whether it is permitted
 * under the current {@link InternetAccessLevel}.
 *
 * - `api`    — the AI provider API call. Always allowed (the assistant must be
 *              able to answer). Never gated by this module.
 * - `web-fetch` — an agent-initiated HTTP fetch of an arbitrary URL.
 * - `browser`   — headless browser navigation to an external page.
 * - `mcp`       — connection to a remote (non-localhost) MCP server.
 * - `search`    — web search queries.
 * - `upload`    — publishing data to an external endpoint (webhook, share, etc).
 */
export type NetworkKind = 'api' | 'web-fetch' | 'browser' | 'mcp' | 'search' | 'upload';

/** Context describing a network operation the agent wants to perform. */
export interface NetworkRequestContext {
  kind: NetworkKind;
  /** Target URL when known (used for diagnostics + localhost exemption). */
  url?: string;
  /** HTTP method, e.g. GET/POST. Defaults to GET. */
  method?: string;
}

/** Thrown when a network operation is denied by the internet access policy. */
export class InternetAccessDeniedError extends Error {
  public readonly level: InternetAccessLevel;
  public readonly context: NetworkRequestContext;

  constructor(level: InternetAccessLevel, context: NetworkRequestContext) {
    const where = context.url ? ` → ${context.url}` : '';
    super(
      `Internet access denied (policy: "${level}") for ${context.kind}${where}. ` +
      `Adjust the "Internet Access" setting to allow this action.`
    );
    this.name = 'InternetAccessDeniedError';
    this.level = level;
    this.context = context;
  }
}

/** Returns the effective internet access level (defaults to `all`). */
export function getInternetAccessLevel(): InternetAccessLevel {
  const settings = SettingsStorage.loadSettings();
  return settings.internetAccess?.level ?? 'all';
}

/** True when the URL targets localhost / loopback (always exempt from the policy). */
function isLocalhost(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

/**
 * Decides whether a network operation may proceed under the current policy.
 *
 * Rules:
 *  - `all`        → always allowed.
 *  - `none`       → blocked, except localhost and the provider `api` kind.
 *  - `observation`→ allowed only for read-only GET/HEAD requests, plus
 *                   localhost and the provider `api` kind. Mutating methods
 *                   (POST/PUT/DELETE/PATCH) and `upload` are blocked.
 */
export function isNetworkAllowed(context: NetworkRequestContext): boolean {
  const level = getInternetAccessLevel();

  if (level === 'all') return true;

  // Provider API and loopback services are always permitted.
  if (context.kind === 'api') return true;
  if (isLocalhost(context.url)) return true;

  if (level === 'none') return false;

  // observation: read-only only.
  const method = (context.method ?? 'GET').toUpperCase();
  const readOnly = method === 'GET' || method === 'HEAD';
  if (!readOnly) return false;

  // Uploads and remote mutating services are never "observation".
  if (context.kind === 'upload') return false;

  return true;
}

/** Throws {@link InternetAccessDeniedError} when the operation is not allowed. */
export function enforceNetworkAllowed(context: NetworkRequestContext): void {
  if (!isNetworkAllowed(context)) {
    throw new InternetAccessDeniedError(getInternetAccessLevel(), context);
  }
}

/** Returns a friendly, user-facing explanation for the current level. */
export function describeInternetAccessLevel(level: InternetAccessLevel = getInternetAccessLevel()): string {
  switch (level) {
    case 'none':
      return 'No network access — the agent cannot reach the internet (only the AI provider API and local tools work).';
    case 'observation':
      return 'Observation only — the agent may read public web pages (GET) but cannot post, upload, or mutate remote state.';
    case 'all':
    default:
      return 'Full access — the agent may use the network freely (fetch, browse, search, and publish).';
  }
}
