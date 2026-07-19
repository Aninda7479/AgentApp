import { ReasoningEffort } from '../types/agent.js';
import { resolveProviderFamily } from '../providers/provider-meta.js';
import type { TaskDifficulty } from './task-classifier.js';

/**
 * Reasoning-effort normalization — the P1 orchestration piece that makes a
 * single internal "effort" knob work across every provider despite each one
 * exposing "thinking" differently:
 *
 *   - OpenAI / OpenAI-compatible reasoners (DeepSeek, …) : `reasoning_effort`
 *     accepts the tokens `low` | `medium` | `high`.
 *   - Anthropic (extended thinking)                       : `thinking`
 *     `{ type: 'enabled', budget_tokens }` — a token budget, no named tiers.
 *     Extended thinking also REQUIRES `temperature` 1.0.
 *   - Gemini (2.5 Flash, …)                               : `generationConfig
 *     .thinkingConfig.thinkingBudget` — a token budget.
 *   - Ollama (served via the OpenAI-compatible adapter)   : `reasoning_effort`.
 *
 * The provider-specific glue is kept behind the `resolveProviderFamily` boundary
 * (the same one the adapter factory uses) so no code path is tied to a single
 * provider — adding a provider is still a one-line change in provider-meta.ts.
 */

/** Canonical tier order, used to snap a requested effort to the nearest level a model actually advertises. */
const EFFORT_ORDER: ReasoningEffort[] = ['low', 'medium', 'high'];

/** Anthropic extended-thinking budget ceilings per tier (clamped to < max_tokens by the caller). */
const ANTHROPIC_BUDGET: Record<ReasoningEffort, number> = {
  low: 2000,
  medium: 4000,
  high: 8000
};

/** Gemini thinking-budget ceilings per tier (tokens spent on the thinking trace). */
const GEMINI_BUDGET: Record<ReasoningEffort, number> = {
  low: 1024,
  medium: 4096,
  high: 8192
};

/**
 * Picks the concrete level token for a model from its advertised
 * `reasoningEffortLevels`. Returns the requested tier when advertised, otherwise
 * the nearest available level (walking outward from it), or `null` when the model
 * advertises no reasoning-effort levels at all (i.e. it cannot reason on demand).
 *
 * Use this at the routing/UI layer to (a) decide whether a model supports an
 * adjustable effort and (b) translate the internal tier into the exact token the
 * model's provider expects, so `getReasoningRequestParams` downstream lines up.
 */
export function normalizeReasoningEffort(
  effort: ReasoningEffort,
  levels?: string[]
): string | null {
  if (!levels || levels.length === 0) return null;
  if (levels.includes(effort)) return effort;

  const idx = EFFORT_ORDER.indexOf(effort);
  for (let d = 1; d < EFFORT_ORDER.length; d++) {
    const up = EFFORT_ORDER[Math.min(idx + d, EFFORT_ORDER.length - 1)];
    if (levels.includes(up)) return up;
    const down = EFFORT_ORDER[Math.max(idx - d, 0)];
    if (levels.includes(down)) return down;
  }
  // No exact or nearby match (e.g. a model advertising only a bespoke token) —
  // fall back to its first advertised level rather than silently dropping effort.
  return levels[0];
}

/**
 * Builds the provider-specific request-param blob for an effort tier, keyed by
 * the resolved provider family. Returns `null` when the family exposes no
 * reasoning control (so callers can no-op safely).
 *
 * @param provider  the raw provider id (resolved to a family internally).
 * @param effort     canonical effort tier.
 * @param maxTokens  the request's max output tokens, used to clamp the Anthropic
 *                   budget strictly below `max_tokens` (the API rejects >=).
 */
export function getReasoningRequestParams(
  provider: string,
  effort: ReasoningEffort,
  maxTokens?: number
): Record<string, unknown> | null {
  const family = resolveProviderFamily(provider);

  switch (family) {
    case 'anthropic': {
      const desired = ANTHROPIC_BUDGET[effort];
      const budget = maxTokens ? Math.max(1024, Math.min(desired, maxTokens - 1)) : desired;
      return { thinking: { type: 'enabled', budget_tokens: budget } };
    }
    case 'gemini': {
      return {
        generationConfig: {
          thinkingConfig: { thinkingBudget: GEMINI_BUDGET[effort], includeThoughts: false }
        }
      };
    }
    case 'openai':
    case 'ollama':
      return { reasoning_effort: effort };
    default:
      return null;
  }
}

/**
 * Merges a provider's reasoning params into an adapter payload in place. Handles
 * the three distinct wire shapes:
 *   - flat params (OpenAI/Ollama): `payload.reasoning_effort = …`
 *   - Anthropic: `payload.thinking = …` and `payload.temperature = 1` (required)
 *   - Gemini: deep-merge into the existing `payload.generationConfig`
 *
 * No-op when `effort` is unset or the provider has no reasoning control.
 */
export function applyReasoningEffort(
  payload: Record<string, unknown>,
  provider: string,
  effort: ReasoningEffort | undefined,
  maxTokens?: number
): void {
  if (!effort) return;
  const family = resolveProviderFamily(provider);
  const params = getReasoningRequestParams(provider, effort, maxTokens);
  if (!params) return;

  for (const [key, value] of Object.entries(params)) {
    if (family === 'gemini' && key === 'generationConfig' && isRecord(value)) {
      const existing = isRecord(payload.generationConfig) ? payload.generationConfig : {};
      payload.generationConfig = { ...existing, ...value };
    } else {
      payload[key] = value;
    }
  }

  // Anthropic extended thinking mandates temperature 1.0 regardless of the
  // caller's setting; setting it here (not in getReasoningRequestParams) keeps
  // the pure param builder focused on shape, not side constraints.
  if (family === 'anthropic') {
    payload.temperature = 1;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Difficulty-driven reasoning-effort cascade (mission: "escalate from small to
 * large only when needed"). Maps a task's estimated {@link TaskDifficulty} onto
 * a reasoning-effort tier — but ONLY when no explicit effort is already set
 * (`base`). An explicit caller effort always wins, so this never downgrades or
 * silently overrides a deliberate choice; it only *adds* effort for hard tasks
 * that would otherwise run at the default and under-think.
 *
 *   - base set          → base (caller wins)
 *   - difficulty `high` → 'high'
 *   - difficulty `medium` → 'medium'
 *   - difficulty `low`  → undefined (no escalation; preserve cost/latency)
 */
export function deriveReasoningEffortFromDifficulty(
  difficulty: TaskDifficulty,
  base?: ReasoningEffort
): ReasoningEffort | undefined {
  if (base) return base;
  if (difficulty === 'high') return 'high';
  if (difficulty === 'medium') return 'medium';
  return undefined;
}

/**
 * Difficulty-driven ensemble-breadth cascade. For a high-difficulty task we
 * widen the parallel-multi-model (best-of-N / ensemble) candidate set so the
 * synthesis step merges more independent perspectives (quality + bias-
 * resistance). It NEVER reduces an explicit `baseCount` the caller chose — it
 * only escalates upward when the task is hard, matching the "escalate only
 * when needed" principle.
 */
export function candidateCountForDifficulty(
  difficulty: TaskDifficulty,
  baseCount: number = 2
): number {
  if (difficulty === 'high') return Math.max(baseCount, 3);
  return baseCount;
}
