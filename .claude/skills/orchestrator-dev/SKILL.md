---
name: orchestrator-dev
description: Autonomously develops, tests, and researches the Model Orchestrator — capability registry, task classifier, routing engine, ensembling logic, and fallback/health-monitoring. Researches EVERY cycle via 3 mandatory WebSearch/WebFetch calls (provider APIs change frequently). Reads app-structure.log as working memory, shares the lock with /auto-improve, logs into the shared queue. Research is not optional — provider API shapes must be verified, not recalled from memory.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "capability-registry", "task-classifier", "ensemble-synthesis", "provider:ollama", "fallback-chains"]
---

# /orchestrator-dev — Autonomous Model-Orchestration Builder

## Why This Exists

SuperAgent's whole point is not depending on one model for everything. The orchestrator routes tasks
to whichever model(s) are actually suited — by modality, specialty, speed, cost, and current
availability — and reroutes automatically when a provider goes down. This skill keeps building that system.

**Provider APIs change constantly.** Model names, endpoint formats, pricing, and capability flags
shift with every release. Research is mandatory every cycle because memory is always stale.

## Context & Memory Contract

**Compact at every `→ COMPACT` checkpoint — unconditionally.**
Before every compact: save focus + step + commit state to TodoWrite.

**What must stay on disk, never in context:**
- Every provider catalog/listing call: write to `.orchestrator/catalogs/<provider>-<date>.json`
  then extract only what you need with `jq` or `grep`.
- Every live test run: write transcript to `.orchestrator/test-runs/<focus>-<n>.log`.
- `.claude/auto-improve-log.log`: `tail -n 150` only, never whole.
- Source files: `Grep` first, then `Read` with `offset`/`limit`. Never load whole adapter files.
- `.claude/research-cache/<date>-orchestrator-dev.md`: write research results here, read back only what you need.

## Step 0 — Orient

- Read `app-structure.log` in full — your primary map of what's built.
- `tail -n 150 .claude/auto-improve-log.log` — current priority queue and any `/auto-improve` open items.
- **Acquire the shared lock** (`.claude/.auto-improve.lock`):
  ```bash
  LOCK=.claude/.auto-improve.lock
  if [ -f "$LOCK" ]; then
    age=$(( $(date +%s) - $(date -r "$LOCK" +%s 2>/dev/null || echo 0) ))
    if [ "$age" -lt 540 ]; then echo "LOCK_HELD"; exit 2; fi
  fi
  printf '{"pid":%d,"started":"%s"}\n' "$$" "$(date -u +%FT%TZ)" > "$LOCK"
  ```
  If LOCK_HELD: log cycle skipped for lock contention, stop.
- Read provider/model registry — which providers are connected, which models are tagged `free` or local.
- `git status` — if dirty with someone else's work, don't touch those files.

## Step 1 — Pick a Focus

Use `$ARGUMENTS` if given. Otherwise from `app-structure.log` gaps or shared queue. Priority order if fresh:
- Capability registry schema
- Task classifier
- Routing engine
- Modality bridging (vision fallback)
- Ensemble/synthesis engine
- Fallback and health monitoring ← highest priority (core mission: "can't be banned out from under you")
- Reasoning-effort normalization

## Step 2 — Online Research (MANDATORY — NON-NEGOTIABLE)

**You may not proceed to Step 3 (Plan) without completing all 3 searches and writing the log to disk.**

Provider APIs change with every release. Last-known shapes are wrong. Search and fetch — do not recall.

```bash
mkdir -p .claude/research-cache
```

**Run these 3 searches every cycle:**

1. `"<connected provider name> model list API response format $(date +%B\ %Y)"` — verify current catalog schema.
   WebSearch first, then WebFetch the docs page (limit: first 300 lines only).
   Write the raw catalog response (if you fetch it) to `.orchestrator/catalogs/<provider>-$(date +%Y%m%d).json`.
   
2. `"AI model routing ensemble synthesis technique 2026"` — current orchestration art.
   What are comparable systems (LangGraph, LiteLLM, DSPy routers) doing differently this month?
   
3. `"<provider> rate limit pricing tier changes $(date +%B\ %Y)"` — pricing/availability drift detection.
   Any model reclassified free→paid, any new free-tier model added?

Write results to `.claude/research-cache/$(date +%Y%m%d-%H%M)-orchestrator-dev.md`:
```
RESEARCH LOG — [orchestrator-dev] [DATE TIME]
Focus: <focus area>
Search 1: "<exact query>" → Source: <url> — Takeaway: <one line — current API shape or change>
Search 2: "<exact query>" → Source: <url> — Takeaway: <one line — routing technique finding>
Search 3: "<exact query>" → Source: <url> — Takeaway: <one line — pricing/availability finding>
Decision: <how this changes the plan — what to build vs. what to update>
```

Cross-check at least 2 sources before committing to an approach. Never invent a provider API shape.

**→ COMPACT** (write focus + step + research file path to TodoWrite)

## Step 3 — Plan

TodoWrite: 1–6 concrete edits, each tied to which part of the mission it serves:
- Reduces single-provider dependency
- Improves result quality via ensembling
- Cuts cost/latency via smarter routing
- Improves resilience to a provider going down

## Step 4 — Implement

- Extend existing adapter/provider interface — never add a path that only works for one specific provider.
- Additive and backward-compatible by default; note explicitly if something is breaking.
- No unjustified new dependencies.

## Step 5 — Verify (Static)

```bash
npm run build > /tmp/orch-build.log 2>&1
echo "Exit: $?"
tail -30 /tmp/orch-build.log
```

For the classifier and router: build a small suite of synthetic task cases with expected routing
outcomes if one doesn't exist yet. This is the cheapest test to write — needs no external calls.

Do not proceed past a failing check.

## Step 6 — Verify (Live)

- **Prefer local models (Ollama local)** — zero cost, zero risk.
- **Cloud free-tier models** — use sparingly (may share rate limits with user's paid usage).
- Never call a paid or unconfigured provider.

Key tests per focus:
- Route an image-input task → confirm it bridges to a vision-capable free/local model.
- Route a hard/ambiguous task → confirm ensemble logic triggers if implemented.
- Simulate a provider being unreachable (bad endpoint, forced timeout) → confirm fallback reroutes.

Write transcript to `.orchestrator/test-runs/<focus>-<timestamp>.log` — never paste into context.
```bash
node test-orch.js > .orchestrator/test-runs/$(date +%s).log 2>&1
tail -15 .orchestrator/test-runs/$(date +%s).log
```

**→ COMPACT**

## Step 7 — Commit

Same gate as `/auto-improve`: only if static and live checks passed (or live honestly documented).
Check diff for API keys/tokens. Write commit message citing research + verification.
Push. Never force-push. Release the lock.

Commit message format:
```
orchestrator-dev: <what changed> — <mission point>

Research: <source URLs from Step 2>
Focus: <focus area>
Static verify: build PASS
Live test: <PASS against <model> | NOT LIVE-TESTED — reason>
```

## Step 8 — Update `app-structure.log`

Edit the relevant section in place (not append — this is current state, not history):
- Which providers are integrated
- Which orchestration pieces exist vs. don't exist yet
- Current registry schema
- Known gaps

Keep the whole file concise enough to read in one shot next cycle.

## Step 9 — Log the Cycle

Append to `.claude/auto-improve-log.log`, tagged `[orchestrator-dev]`:
```
## YYYY-MM-DD HH:MM — [orchestrator-dev] <focus>
Researched: <3 sources + one-line takeaways>
Research file: .claude/research-cache/<filename>
Changed: <files / behavior>
Why: <mission point served>
Static verify: <result>
Live test: <PASS against <model> | NOT LIVE-TESTED — reason>
Committed: <hash + pushed | "not committed — reason">
Next priority queue: <ordered list>
Open questions: <human decisions needed>
```

**→ COMPACT**

## Step 10 — Compact, Then Repeat

Run `/compact` now. After finishing a focus area (committed, logged, app-structure.log updated),
compact to shed context before the next focus. If session budget remains, move to the next focus.

## Guardrails

- Never let the orchestrator itself become dependent on one provider being present — that defeats everything.
- Never call a paid or unconfigured provider autonomously.
- Never commit code that failed a check you were able to run.
- Never commit secrets.
- Always release the shared lock before this cycle ends, even on early exit.
- If blocked on a human decision, log it and stop rather than guessing.
