/**
 * provider-health.ts — Provider-agnostic health monitor for the orchestrator.
 *
 * This is the runtime half of the "can't be banned out from under you" promise.
 * The router's capability gate (router.ts `resolveCandidatePool`) already refuses
 * to *select* a model whose `accessStatus` is locked/rate_limited/deprecated;
 * this module is what *sets* that status from real provider responses, so a
 * provider that gets banned, throttled, or taken down is automatically avoided
 * and the router reroutes — without any hard dependency on a single provider.
 *
 * Design notes:
 * - Error classification is provider-agnostic: every adapter in this repo throws
 *   `<PROVIDER> API error [<status>]: <body>`, so a status-code parser works for
 *   OpenAI / Anthropic / Gemini / Ollama / custom uniformly. Network failures
 *   (fetch rejection) carry no status and are treated as transient.
 * - The tracker is a module-level singleton so all OrchestratorRouter instances share
 *   one view of provider liveness. A `reset()` is exported for tests.
 * - Rate limits are cooldown-based (retried after a window); auth failures
 *   (locked) and deprecations are sticky until explicitly reset, because
 *   retrying them is pointless.
 */

import type { AccessStatus } from '../types/agent.js';
// RouterModel is defined in router.ts; type-only import avoids a runtime cycle
// with the value import router.ts makes of providerHealth.
import type { RouterModel } from './router.js';

/** How long a rate_limited provider is avoided before it is eligible again. */
const RATE_LIMIT_COOLDOWN_MS = 60_000;

/** Classifies a thrown provider error into an access status. */
export function classifyProviderError(err: unknown): AccessStatus {
  const message = err instanceof Error ? err.message : String(err);

  // Adapter errors embed the HTTP status in brackets: "OpenAI API error [429]: …".
  const match = message.match(/\[(\d{3})\]/);
  if (match) {
    const status = parseInt(match[1], 10);
    if (status === 401 || status === 403) return 'locked'; // auth/permission — sticky
    if (status === 404 || status === 410) return 'deprecated'; // gone — sticky
    if (status === 429) return 'rate_limited'; // cooldown, retry later
    if (status >= 500) return 'rate_limited'; // server-side outage — retry later
    // 4xx client errors other than the above are treated as transient
    return 'rate_limited';
  }

  // No status: network failure / timeout / DNS — transient, retry later.
  // Common substrings from fetch rejections make the intent explicit.
  if (/timeout|etimedout|econnrefused|enotfound|econnreset|network|fetch failed|aborted/i.test(message)) {
    return 'rate_limited';
  }

  // Unknown error shape — be conservative and retry later rather than stickying it.
  return 'rate_limited';
}

interface ProviderHealthState {
  status: AccessStatus;
  /** Epoch ms when a cooldown (rate_limit) expires; 0 when not cooling down. */
  cooldownUntil: number;
  consecutiveFailures: number;
}

/**
 * Richer per-provider health view for diagnostics/UI. `snapshot()` (below)
 * returns just the `AccessStatus` string for callers that only need a gate
 * signal; this carries the *why* so a GUI can tell the user "throttled for
 * 42s" vs "banned (auth failed — re-enter key)" instead of a flat label.
 */
export interface HealthDiagnosis {
  status: AccessStatus;
  /** Ms remaining on a rate_limit cooldown; 0 when not cooling down. */
  cooldownRemainingMs: number;
  /** How many failures in a row the provider has racked up. */
  consecutiveFailures: number;
}

export class ProviderHealthTracker {
  private states: Map<string, ProviderHealthState> = new Map();
  private now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  private ensure(provider: string): ProviderHealthState {
    let s = this.states.get(provider);
    if (!s) {
      s = { status: 'available', cooldownUntil: 0, consecutiveFailures: 0 };
      this.states.set(provider, s);
    }
    return s;
  }

  /** Returns the effective status, honouring rate-limit cooldown expiry. */
  public getStatus(provider: string): AccessStatus {
    const s = this.states.get(provider);
    if (!s) return 'available';
    if (s.status === 'rate_limited' && s.cooldownUntil > 0 && this.now() >= s.cooldownUntil) {
      // Cooldown elapsed — eligible again.
      s.status = 'available';
      s.cooldownUntil = 0;
      s.consecutiveFailures = 0;
    }
    return s.status;
  }

  public recordSuccess(provider: string): void {
    const s = this.ensure(provider);
    s.status = 'available';
    s.cooldownUntil = 0;
    s.consecutiveFailures = 0;
  }

  public recordFailure(provider: string, err: unknown): void {
    const status = classifyProviderError(err);
    const s = this.ensure(provider);
    s.consecutiveFailures += 1;
    if (status === 'rate_limited') {
      s.status = 'rate_limited';
      s.cooldownUntil = this.now() + RATE_LIMIT_COOLDOWN_MS;
    } else {
      // locked / deprecated are sticky — don't overwrite with a future success
      // unless recordSuccess is called explicitly.
      s.status = status;
      s.cooldownUntil = 0;
    }
  }

  /** Restores a provider to healthy (e.g. user re-entered a key, or on startup). */
  public reset(provider?: string): void {
    if (provider) {
      this.states.delete(provider);
    } else {
      this.states.clear();
    }
  }

  /** Snapshot of every tracked provider's state — for diagnostics/UI. */
  public snapshot(): Record<string, AccessStatus> {
    const out: Record<string, AccessStatus> = {};
    for (const [provider, s] of this.states) {
      out[provider] = this.getStatus(provider);
    }
    return out;
  }

  /**
   * Richer, UI-ready view of every tracked provider (or a single one). Returns
   * the status plus the *why* — how long a throttle has left, and how many
   * failures have stacked up — so a GUI can surface "banned" / "throttled for
   * 42s" with actionable detail instead of a flat label.
   */
  public getDiagnostics(provider?: string): Record<string, HealthDiagnosis> {
    const out: Record<string, HealthDiagnosis> = {};
    const entries = provider
      ? (() => { const s = this.states.get(provider); return s ? [[provider, s]] as const : []; })()
      : [...this.states.entries()];
    for (const [p, s] of entries) {
      const status = this.getStatus(p);
      const cooldownRemainingMs = s.cooldownUntil > 0 ? Math.max(0, s.cooldownUntil - this.now()) : 0;
      out[p] = { status, cooldownRemainingMs, consecutiveFailures: s.consecutiveFailures };
    }
    return out;
  }
}

/**
 * Shared singleton so all OrchestratorRouter instances agree on provider liveness.
 * Reset in tests between cases.
 */
export const providerHealth = new ProviderHealthTracker();

export function resetProviderHealth(): void {
  providerHealth.reset();
}

/**
 * Stamps live health onto a catalog of RouterModels so the static capability
 * gate (router.ts `resolveCandidatePool`) skips unhealthy providers. This is an
 * opt-in helper the engine/GUI calls before handing models to the router — it
 * keeps the router's selection logic pure and testable. An explicit non-available
 * status already on a model (user/registry override) is preserved.
 */
export function applyHealthToModels(models: RouterModel[]): RouterModel[] {
  return models.map((m) => {
    if (m.accessStatus && m.accessStatus !== 'available') return m; // explicit override wins
    const status = providerHealth.getStatus(m.providerId);
    return status === 'available' ? m : { ...m, accessStatus: status };
  });
}
