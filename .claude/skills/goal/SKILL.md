---
name: goal
description: Autonomous research-and-improve loop for SuperAgent — reads the current codebase, researches current best practices online, ships small verified improvements to the model-orchestration layer, capability adapters (3D/image/video/audio/PDF/Office/code), and the React/Electron GUI, live-tests changes against already-connected free-tier models where possible, and commits to GitHub only when every check passes. Use for open-ended "keep improving the project" requests, not narrow single-task requests.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "routing-layer", "video-gen-adapter", "gui-polish", "gui-redesign"]
---

# /goal — Autonomous Research → Improve → Test → Commit Loop

Re-read this whole file every time you're invoked, including after `/clear` or `/compact` — it's the only thing guaranteed to survive a fresh context.

## Mission (the thing every change must serve)

SuperAgent is a provider-agnostic AI agent platform — CLI, Electron desktop GUI, and web/VPS GUI — built as an alternative to closed single-vendor tools (ChatGPT Work, Codex, Claude apps). Its selling points, in priority order:

1. **User controls the model/provider, and their data.** Nothing is hard-locked to one vendor. Any feature that only works with one provider's proprietary format, without an interchangeable path, works against the mission.
2. **Model orchestration, not single-model dependence.** Tasks are classified and routed to whichever model(s) are actually good at them — a vision-capable model reads images for a coding model that can't; trivial subtasks go to small/cheap models; hard subtasks can run on multiple strong models in parallel with results merged or best-of-n'd.
3. **One agent surface, many capabilities.** 3D gen/edit, image gen/edit, video gen/edit, audio gen/edit, PDF read/gen/edit, Office docs (Excel/Word/PowerPoint), and coding — each implemented as a pluggable capability adapter behind a common interface, not bolted on ad hoc.
4. **A GUI that doesn't feel like a hobby project.** It's competing visually with polished commercial apps, so consistency, hierarchy, and finish matter as much as function.

Every cycle below should visibly serve one of these four.

## Step 0 — Orient

- Read `CLAUDE.md` / `README` / any architecture doc if present.
- `git log --oneline -20` and `git status` — understand recent trajectory and any uncommitted work before touching anything. If the working tree is dirty with unrelated changes, stop and flag it in the log rather than committing over someone else's in-progress work.
- Read `.claude/goal-log.md` (create it if it doesn't exist yet). This file is the memory that carries across invocations — treat its "next priority queue" and "open questions" as your starting point instead of re-discovering the project from scratch.
- Read the provider/model registry (wherever the project tags providers as connected and models as `free`/paid — e.g. a `providers.json`, `models.config.*`, or settings store). You'll need this in Step 6.
- Map the current structure: CLI package, Electron app, web app, shared orchestration core, capability adapters. Don't re-derive this every cycle — update your mental map, then move.

## Step 1 — Pick one focus

Use `$ARGUMENTS` if given. Recognized focuses include subsystem names (e.g. `routing-layer`, `image-gen-adapter`), `gui-polish` (default small-increment GUI work), and `gui-redesign` (see below). If `$ARGUMENTS` is empty, take the top item off the log's "next priority queue," or, if that's empty, find the single highest-leverage gap yourself.

- Prefer breadth before depth: touch every subsystem (orchestration core, each capability adapter, CLI, desktop GUI, web GUI) at least once before a second deep pass on any one of them.
- Small, reversible, verifiable increments only, one focus per cycle — *except* under `gui-redesign` mode, see below. A padding fix, a clearer error message, a missing loading/empty state, or a one-line copy improvement is a legitimate cycle on its own. Do not skip these while hunting only for "big" work — the instruction to chase even 1% improvements is explicit and intentional.

### Focus mode: `gui-redesign`

When invoked as `/goal gui-redesign` (or the queue explicitly calls for it), scope expands beyond incremental polish:

- Research current design systems and layout patterns from polished AI/SaaS products more deeply than a normal cycle (typography scale, spacing rhythm, color/theme tokens, component library conventions, motion/microinteractions, information hierarchy).
- You may touch multiple related components/screens in one session, but still land them as a *sequence* of small atomic commits (Step 7), each individually verified — never one giant unreviewable commit.
- Explicitly check and note in the log: dark/light theme parity, accessibility (WCAG contrast, keyboard nav, focus states), and visual consistency between the Electron desktop GUI and the web GUI (shared components should stay shared, not fork).
- Still bound by the mission: a redesign that makes the app prettier but harder to use, slower, or less consistent across desktop/web is a regression, not progress.

## Step 2 — Research (mandatory, real, cited — never from memory alone)

Treat anything about external APIs, SDKs, pricing, or UI conventions as possibly stale, even things you're confident about — this space moves fast. Actually search and fetch; don't simulate research.

Depending on the focus:

- **Orchestration/routing layer** — current routing/ensembling approaches (e.g. capability-aware routing, cost-aware model selection, mixture-of-agents / best-of-n patterns, semantic caching), and how comparable CLI agent tools structure multi-model tool-calling and vision fallback.
- **Capability adapters (3D/image/video/audio/PDF/Office)** — current leading APIs/SDKs for each, their capabilities, auth patterns, and rate/cost characteristics. Verify names and endpoints rather than recalling them.
- **GUI/UX (React)** — current patterns from polished AI/SaaS products: type scale, spacing rhythm, motion, empty/loading/error states, accessibility. Borrow principles, never a specific brand's proprietary assets or exact visual identity.
- **Electron desktop** — current packaging, auto-update, and security best practices (context isolation, IPC hardening) for the Electron/Node versions in use.

Rules:
- Cross-check at least two independent sources before committing to an approach; if they disagree, record the disagreement instead of silently picking one.
- Log every source actually used, with a one-line takeaway, in this cycle's log entry. Never invent a source, an API shape, or a library capability you haven't verified.

## Step 3 — Plan

Write a short numbered plan for this cycle via TodoWrite — typically 1–6 concrete edits. For each item, name which of the four mission points it serves.

## Step 4 — Implement

- Match the existing code's conventions; don't introduce a second pattern for a problem the codebase already solves once.
- New capability adapters go behind the existing adapter interface — never hard-code a single vendor as a requirement.
- Prefer additive, backward-compatible changes. If something is breaking, say so explicitly in the log and the commit message.
- No unjustified new dependencies — if you add one, note in the log why the researched alternative won.

## Step 5 — Verify (static)

- Discover and run the project's real build/lint/typecheck/test commands (from `package.json`, `pyproject.toml`, etc.) — don't guess at them. Fix failures before moving on. If they don't pass, do not proceed to Step 6 or 7 — loop back to Step 4 or, if genuinely stuck, log the failure as an open question and leave the change uncommitted.

## Step 6 — Verify (live, functional) — run the real code path, not just the GUI's idea of it

You cannot drive the Electron app or web GUI directly — you have no browser/UI automation. What you *can* do, and must do for any change touching orchestration or a capability adapter, is call the same script/module/function the GUI would call, directly, from the CLI (`node`, `python`, or however the project invokes it), and observe the real result.

- **Only use already-connected providers whose models are tagged `free`** in the registry read in Step 0. Never call a paid model or an unconfigured provider on your own initiative — that spends the user's money without permission. If no suitable free-tagged model is connected for this test, skip the live call and say so explicitly (don't fabricate a pass).
- For a multimodal/vision change specifically: generate or reuse a small local test image (create a trivial synthetic PNG in code, or use an existing fixture in the repo — don't fetch an external image over the network for this), then invoke the adapter/orchestration function that would normally receive it from the GUI, using a free-tagged vision-capable connected model. Confirm the full round trip — request built correctly, model call succeeds, response parsed correctly — and capture the real output, latency, and any error.
- For capabilities with no free tier currently connected (e.g. video/3D/audio may not have one), do a structured dry run instead: validate the function signature, the request payload shape, and error-handling paths without a live call, and clearly label this in the log as "not live-tested — no free model connected" rather than as a pass.
- Where you did get a live result, also trace (by reading the GUI code, not by running it) how that result would flow into the interface — which loading/error/success state it triggers, how it's rendered — and note that as a **prediction**, explicitly labeled as such, distinct from the confirmed backend result.
- A cycle that changes orchestration/adapter code but skips this step is incomplete — go back and do it before moving on.

## Step 7 — Commit (only when every step above actually passed)

- Only commit if: Step 5 (build/lint/tests) passed, and Step 6 either passed live or was explicitly and honestly logged as "not live-tested" for a documented reason (no free model available) — never commit something that failed a check you were able to run.
- Before staging, check the diff for anything that shouldn't ship: API keys, `.env` contents, tokens, personal paths, debug artifacts. Respect `.gitignore`; if something sensitive is about to be staged, stop and flag it in the log instead of committing.
- Stage only the files belonging to this cycle's focus — not unrelated changes sitting in the working tree.
- Write a real commit message: what changed, why (tie to a mission point), and a one-line note on how it was verified (e.g. "tested end-to-end against <free model name>").
- Commit, then push to the current branch's remote. If there's no remote configured or the push fails (auth, etc.), log that clearly and leave the commit local rather than stalling the cycle.
- Never force-push.

## Step 8 — Log and hand off

Append a dated entry to `.claude/goal-log.md`:

```
## YYYY-MM-DD — <focus area>
Researched: <sources + one-line takeaways>
Changed: <files / behavior>
Why: <which mission point this serves>
Static verify: <build/lint/test result>
Live test: <PASS against <model name> / NOT LIVE-TESTED — reason>
Predicted GUI behavior: <if applicable, and labeled as prediction>
Committed: <commit hash + pushed, or "not committed — reason">
Next priority queue: <ordered list for the next /goal run>
Open questions: <anything needing a human decision>
```

This log is the entire continuity mechanism. A `/goal` run in a brand-new context must be able to pick up exactly where the last one stopped by reading it — write it with that reader in mind.

## Step 9 — Repeat within the session

If turns/context budget remain and there's no blocking open question, go back to Step 1 with the next queue item. When you're nearing your context limit: stop between cycles (never mid-edit), make sure the log and queue are current, and close with a short human-readable summary of what changed and what got committed this session.

## Guardrails

- Never weaken the "user owns their data/keys" architecture to make a feature easier to ship.
- Never hard-lock a feature to one paid vendor's proprietary format when an interchangeable path is viable.
- Don't write integration code against a guessed API shape — verify via research or existing adapter code first.
- Never call a paid or unconfigured provider autonomously — live testing is restricted to already-connected, free-tagged models only.
- Never commit code that failed a check you were able to run, and never commit secrets.
- If truly blocked on something only the user can decide (e.g. which paid providers to support first), log it as an open question and move to the next queue item rather than stalling the cycle.