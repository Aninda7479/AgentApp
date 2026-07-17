---
name: orchestrator-dev
description: Autonomously develops, tests, and researches the Model Orchestrator — the capability registry, task classifier, routing engine, ensembling logic, and fallback/health-monitoring that let SuperAgent route across multiple connected providers instead of depending on one model. Reads app-structure.log as working memory, shares the code-edit lock with /auto-improve, and logs into the same queue.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "capability-registry", "task-classifier", "ensemble-synthesis", "provider:ollama", "fallback-chains"]
---

# /orchestrator-dev — Autonomous Model-Orchestration Builder

## Why this exists

The whole point of SuperAgent is not depending on one smartest model for everything — because that model can be banned, deprecated, rate-limited, or have new guardrails added, and because combining several models can produce better, less biased results than any single one. The orchestrator is the system that makes that real: given a task, it picks the model(s) actually suited to it — by modality (text/image/video/audio/3D in and out), specialty (coding, translation, 3D design, etc.), speed vs. intelligence, adjustable reasoning effort, cost, and current availability (free/paid/local/locked/rate-limited/banned) — routing to one model when that's enough, running several in parallel and merging results when the task calls for it, and rerouting automatically when a provider stops working. This skill's job is to keep building and proving out that system, not just talking about it.

## Context-window discipline (read first)

**Self-police a hard ~250K-token ceiling — the leading cause of mid-run crashes.** You hit that ceiling and the harness stops you mid-edit, exactly what this rewrite fixes. The fix is to run `/compact` on a *trigger*, every cycle, not just at the end. Everything in your working context below is discardable the moment its durable on-disk output is written.

### What must live on disk, never in context
- **Every provider catalog/listing call writes the full raw response to disk**, never straight into context: `.orchestrator/catalogs/<provider>-<date>.json`. Then extract only what you need (id, modalities, pricing, context length, tags) with `jq`/`grep` into a small working summary. Don't `cat` a full catalog file.
- **Every live test run writes its transcript to disk**: `.orchestrator/test-runs/<focus>-<n>.log`. Summarize the outcome in a couple of lines in your own working context; don't paste a full model response back into context unless you're actively debugging that specific output.
- **Read `.claude/auto-improve-log.log` by tail, not whole** (`tail -n 150`) — same rule as `/ux-critic`, same file, same reason.
- **`app-structure.log` is different: keep it small enough to read whole.** It's maintained state, not a growing log — if it's crept past a page or two, that's a signal to prune/consolidate it this cycle, not to start paginating through it.

### `/compact` triggers — run them, don't wait for the end
- **After finishing each focus area** (post Steps 7–9), run `/compact` before rotating to the next focus. Don't carry a full round of catalog exploration and test transcripts forward — this is the single most effective guard against the ceiling.
- **Hard rule: if you have done > ~15 heavy tool calls since the last `/compact`, run `/compact` immediately.** Heavy = any catalog fetch, any Read of a large file, any build/lint/test run, any provider API call.
- **If any single tool result looks large** (a raw catalog slipped in, a 1000+ line read, a full test log), run `/compact` immediately rather than continuing. A runaway snapshot can overshoot the ceiling before auto-summarization kicks in.
- **At the end of the run, `/compact` once more** — after the final focus or when you stop because you're out of budget.

## Step 0 — Orient

- Read `app-structure.log` in full — this is your primary map of what's already built and how it works. Trust it over re-deriving the codebase from scratch.
- `tail -n 150 .claude/auto-improve-log.log` for recent cycles and the current priority queue (including anything `/ux-critic` or `/auto-improve` left open that's orchestrator-relevant).
- **Acquire the shared lock** (`.claude/.auto-improve.lock`) before touching any code — the same lock `/auto-improve` and the background committer use. If it's held, don't wait or spin: log that this cycle was skipped for lock contention and stop.
- Read the provider/model registry to see which providers are actually connected right now, and which models are tagged `free` or are local (Ollama local counts as zero-cost regardless of tag — see Step 6).
- `git status` — if the tree is dirty with someone else's uncommitted work, don't touch those files.

## Step 1 — Pick a focus

Use `$ARGUMENTS` if given. Otherwise take it from `app-structure.log`'s noted gaps or the shared queue. Candidate areas, roughly in build order if starting fresh:

- **Capability registry** — schema and population per connected provider. If one doesn't exist yet, a reasonable starting shape (adapt to whatever's already there, don't replace working code):
  `{ id, provider, input_modalities[], output_modalities[], specialties[], speed_tier, intelligence_tier, cost_per_1k_tokens, supports_variable_reasoning_effort, reasoning_effort_levels[], context_window, access_status (available/locked/rate_limited/deprecated), is_local, moderation_level }`
- **Task classifier** — given an incoming request, determine required modality, rough difficulty, domain/specialty, and whether cost or latency should dominate the choice.
- **Routing engine** — single-best-fit selection for straightforward tasks.
- **Modality bridging** — auto-insert a vision/transcription model ahead of a model that can't read the input modality directly, and make that handoff visible/logged, not silent.
- **Ensemble/synthesis engine** — run multiple models in parallel on a task and merge/vote/best-of-n the results, for tasks where quality or bias-resistance matters more than speed.
- **Fallback and health monitoring** — detect an unavailable, rate-limited, or newly-restricted provider and reroute automatically rather than hard-failing. This is the piece that most directly delivers the "can't be banned out from under you" promise — treat it as high priority.
- **Reasoning-effort normalization** — providers expose "thinking effort" differently; a consistent internal parameter that maps onto whatever each provider actually supports.

## Step 2 — Research (mandatory, real, cited)

- Each connected provider's actual model-listing/metadata API (OpenRouter, Ollama local/cloud, Nvidia, and any others) — verify current fields rather than assuming last-known shapes; these catalogs change often.
- Current routing/ensembling approaches: capability-aware and cost-aware routing, model cascades (escalate from small to large only when needed), mixture-of-agents/best-of-n synthesis, semantic caching.
- How each connected provider currently exposes a reasoning-effort or "thinking" parameter, since this isn't standardized across providers and changes with new model releases.
- Where relevant, each provider's published moderation/content-policy metadata for its models — this is just one more registry field (alongside cost, speed, locked status) for informed routing, not a focus in itself.

Cross-check at least two sources before committing to an approach. Log every source used with a one-line takeaway. Never invent a provider API shape you haven't verified.

## Step 3 — Plan

TodoWrite, 1–6 concrete edits, each tied to which part of the mission it serves (reduces single-provider dependency / improves result quality via ensembling / cuts cost or latency via smarter routing / improves resilience to a provider going down).

## Step 4 — Implement

- Extend the existing adapter/provider-interface boundary — never add a code path that only works for one specific provider unless it's genuinely provider-specific glue behind that interface.
- Additive and backward-compatible by default; note explicitly in the log if something is breaking.
- No unjustified new dependencies.

## Step 5 — Verify (static)

Run the project's real build/lint/typecheck/test commands. For the classifier and router specifically, build out a small suite of synthetic task cases with expected routing outcomes if one doesn't exist yet — this is the most cheaply-testable part of the whole system since it needs no external calls. Don't proceed past a failing check.

## Step 6 — Verify (live)

- **Prefer local models (Ollama local) for live testing** — genuinely zero-cost and zero-risk, safe to exercise as often as you want.
- **Cloud free-tier models are fair game but use sparingly** — they can share rate limits with the user's paid usage even when tagged free. Never call a paid or unconfigured provider on your own initiative.
- Concrete tests worth running each cycle where relevant to the focus:
  - Route an image-input task through the orchestrator and confirm it correctly bridges to a vision-capable free/local model.
  - Route a deliberately hard/ambiguous task and confirm ensemble logic triggers if it's implemented.
  - Simulate a provider being unreachable (bad endpoint, forced timeout) and confirm the fallback path reroutes instead of hard-failing — this is the test that actually validates the core "why."
- Write full transcripts to `.orchestrator/test-runs/`, never fabricate a pass, and log clearly when something was a dry run instead of a live call.

## Step 7 — Commit (only when everything above passed)

Same gate as `/auto-improve`: only commit if static and live checks passed (or live was honestly logged as not-possible with a reason). Check the diff for API keys/`.env`/tokens before staging. Write a commit message naming what was verified. Push; never force-push. Release the lock after commit (or after logging, if nothing was committed) — always release it before this cycle ends, even on an early exit.

## Step 8 — Update `app-structure.log`

Edit the relevant section in place (don't append a new dated entry — this file is current state, not history): which providers are integrated, which orchestration pieces exist and which don't yet, the current registry schema, and known gaps. Keep the whole file concise enough to read in one shot next cycle.

## Step 9 — Log the cycle

Append to `.claude/auto-improve-log.log`, same shared format, tagged `[orchestrator-dev]`:

```
## YYYY-MM-DD — [orchestrator-dev] <focus>
Researched: <sources + takeaways>
Changed: <files / behavior>
Why: <which mission point this serves>
Static verify: <result>
Live test: <PASS against <model> / NOT LIVE-TESTED — reason>
Committed: <hash + pushed, or "not committed — reason">
Next priority queue: <ordered list for the next run>
Open questions: <anything needing a human decision>
```

## Step 10 — Compact, then repeat

**Run `/compact` now.** After finishing this focus area (post Steps 7–9: committed, logged, `app-structure.log` updated), run `/compact` to shed this focus's context before the next one. This is mandatory, not optional — the same rule `/auto-improve` and `/ux-critic` enforce every cycle. The durable output is the commits, the `.claude/auto-improve-log.log` entry, and `app-structure.log`; everything else in working context (catalog summaries, test transcripts, the catalog files themselves) is discardable once those are written. Never carry a full focus's worth of exploration forward.

If session budget remains and the lock is free, move to the next focus and repeat from Step 1.

**If you sense context pressure mid-work** — re-reading files you just read, results feeling heavy, or approaching the ceiling — stop *between* steps (never mid-edit or mid-commit), run `/compact`, make sure `app-structure.log` and the queue are current, then resume. A compact keeps the run alive; an overshoot stops it. Do not push past the ceiling.

**When the run ends** (final focus done, or stopping because you're out of budget), run `/compact` once more to compress whatever remains before handing control back.

## Guardrails

- Never let the orchestrator's own implementation quietly become dependent on one provider being present — that defeats the entire point of building it.
- Never call a paid or unconfigured provider autonomously.
- Never commit code that failed a check you were able to run, and never commit secrets.
- Never hold the shared lock longer than necessary, and always release it before the cycle ends.
- If genuinely blocked on a human decision (e.g. which paid providers to prioritize wiring up first), log it as an open question and stop rather than guessing.