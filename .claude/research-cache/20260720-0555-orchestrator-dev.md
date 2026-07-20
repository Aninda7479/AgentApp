RESEARCH LOG — [orchestrator-dev] 2026-07-20 05:55 UTC
Focus: Make routing SELECTION honor live provider health (close the selection↔fallback disconnect). Highest-priority mission piece ("can't be banned out from under you").

Search 1: "OpenAI Anthropic Gemini reasoning effort API parameter reasoning_effort thinking budget_tokens thinkingConfig 2026"
→ Source: Pydantic docs cross-provider translation table (via web search aggregate)
— Takeaway: 2026 drift confirmed — OpenAI `reasoning_effort` now also has none/minimal/xhigh/max; Anthropic REMOVED `thinking:{type:'enabled',budget_tokens}` on Opus 4.7/4.8 & Sonnet 5 (now `anthropic_thinking:{type:'adaptive'}` + `anthropic_effort`); Gemini 3+ uses `thinkingLevel` not `thinkingBudget`. BUT our catalog (models.ts) still lists legacy models (claude-3.7/3.5/3-opus, gemini-2.5-flash) for which the CURRENT normalization is still correct → Focus B is future drift, NOT a current bug. Logged as next priority.

Search 2: "LLM model routing fallback health monitoring ensemble synthesis techniques 2026"
→ Source: vLLM Semantic Router (arXiv:2603.04444), Redis "LLM Router Architecture Best Practices 2026", kaman.ai routing infra article
— Takeaway: 2026 best practice is LATENCY/HEALTH-AWARE ADAPTIVE ROUTING — "adaptive routing that responds to real-time backend performance degradation" and passive per-request health signals feeding routing. Circuit-breaker pattern (closed/open/half-open). This VALIDATES closing the gap: our router's selection layer (routeModelForTask/resolveCandidatePool) reads ONLY the static `accessStatus` field and ignores the live `providerHealth` singleton, while the fallback loop already consults it. Selection should match the fallback loop.

Search 3: "OpenAI Anthropic Gemini API pricing rate limit tier changes July 2026"
→ Source: byteiota.com (Anthropic July 2026 tiers), winbuzzer.com (OpenAI GPT-5.6), ai.google.dev pricing
— Takeaway: Anthropic consolidated 4→3 tiers (Start/Build/Scale), rate limits raised, key expiry Jul 24; Gemini 2.0 Flash deprecated Jun 1 2026; rate-limit/churn is constant → reinforces needing robust automatic fallback (already present via providerHealth). No catalog model-ID change strictly required this cycle beyond noting 2.0 Flash is gone.

Decision: Tackle Focus A this cycle — make `resolveCandidatePool` (used by both routeModelForTask and selectCandidateModels) also consult the live `providerHealth.getStatus(providerId)` so selection deprioritizes/avoids runtime-degraded providers, exactly mirroring the fallback loop and eliminating the documented "opt-in applyHealthToModels" disconnect. Additive + backward-compatible (static accessStatus still honored; new behavior only triggers when runtime health is recorded). Focus B (reasoning-effort 2026 drift) deferred until the catalog is refreshed to 2026 model versions — logged as next priority / open question.
