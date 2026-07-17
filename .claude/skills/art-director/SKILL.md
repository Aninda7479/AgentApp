---
name: art-director
description: Autonomous visual and copy redesign for SuperAgent — establishes and maintains a consistent original art direction (palette, motifs, iconography, motion, voice), then redesigns pages against it using hand-authored SVG/CSS assets and rewritten copy, self-critiquing via Playwright screenshots until each page holds up. Purely aesthetic — ux-critic owns bugs and functional UX, this owns look, feel, and voice.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite, Playwright MCP tools
argument-hint: [optional page/component, e.g. "landing-page", "onboarding-flow", "icon-set"]
---

# /art-director — Autonomous Art Direction & Redesign Loop

## Division of labor (read this first)

- `/ux-critic` owns bugs, confusion, broken states, accessibility, and functional copy clarity — anything that blocks or confuses a user.
- `/art-director` (this skill) owns whether the app looks and feels considered — palette, illustration, iconography, motion, layout rhythm, and whether the words sound like a real brand instead of placeholder text.
- If you spot a functional bug while redesigning, log it under `[art-director]` as an open question for `/ux-critic`/`/auto-improve` rather than fixing it yourself. Stay in your lane, same as the other skills do.

**Context budget (read this before any step):** this skill self-polices a hard **250K-token ceiling** — the leading cause of mid-run crashes. Read the **Context-window discipline** section below and honor its `/compact` triggers on *every* step, not just at the end. When in doubt whether something belongs in context, it belongs on disk.

## Your art direction (maintained in `.claude/art-direction.md`, not appended)

On first run, if `.claude/art-direction.md` doesn't exist, create it from the seed below — then treat that file, not this seed, as the source of truth from then on. It can evolve (Step 2), but changing it is a deliberate, logged decision with a one-line rationale, never incidental drift. A design system that's different every cycle is worse than one that's merely good and consistent.

**Seed direction — "layered atmosphere":**
A single focal disc (sun/moon) over horizontally layered, depth-suggesting bands, rendered flat with no photographic texture. Two coherent palette modes, not a compromise between them:
- *Atmosphere mode* (primary) — soft gradient sky (sage/mint through cream to warm peach), layered silhouette "mountains" in desaturated blue-teal deepening to moss/forest green, used as section dividers and backgrounds, never as busy decoration behind text.
- *Contour mode* (alt, for dark or print-style contexts) — strict monochrome, ivory/cream ground, forms built from concentric flowing linework instead of flat fills. Mid-century poster energy, bold and graphic.
Shared rules regardless of mode: generous negative space, one clear focal element per composition, calm/contemplative over busy/techy, motion that evokes drifting or gently rising/settling rather than snapping or bouncing.

This is a mood to synthesize into something original, not a specific image to copy. Never reproduce a found reference directly — build your own shapes, gradients, and line work that live in this world.

## Building blocks

- **Illustration/icons: hand-authored SVG first.** This aesthetic is inherently vector — layered mountain silhouettes, wave/contour line patterns, a sun/moon disc, simple bird-flock marks — all well suited to SVG written directly in code: original, free, git-trackable, reusable as themeable components (feed palette values in, don't hardcode them per-use).
- **Motion: CSS/SVG-native.** Prefer CSS transitions/keyframes or SVG `<animate>`/`animateTransform` over adding an animation dependency the project doesn't already have. If it already uses Framer Motion or similar, use what's there.
- **Richer raster imagery: only via SuperAgent's own image-gen adapter, once connected, and only a free/local model** — same rule `/orchestrator-dev` and `/auto-improve` follow, never a paid provider on your own initiative. Until a free/local image model is connected, stay in hand-authored SVG territory — it's also the stronger fit for this style anyway.
- **Icon sets** — if the project already has one (Lucide, Phosphor, Heroicons, etc.), restyle/extend it to match rather than introducing a second icon system.

## Context-window discipline — HARD BUDGET: keep working context ≤ 250K tokens

This skill drives a live browser via the Playwright MCP server `/ux-critic` already set up. MCP returns full accessibility snapshots, console dumps, and page trees as text. One raw `browser_snapshot` on a heavy page is 50K–200K tokens; string several together and you overshoot the ~250K ceiling and crash the API call mid-work. The harness summarizes near the limit, but a single runaway result can overshoot it before summarization kicks in — so this skill self-polices:

- **HARD BUDGET.** Treat 250K as a hard ceiling and stay well under it. Before every tool call that could return a large payload, ask: "does this need to be in context, or can it live on disk?" When in doubt, put it on disk.
- **Never let a Playwright payload land raw.** Every `browser_snapshot`, `browser_take_screenshot`, and `browser_console_messages` call MUST pass an explicit `filename` under `.playwright/` so the server writes it to disk and returns only a tiny path string. A snapshot that arrives as text (no `filename`) is a failure — re-run it with a `filename`.
- **Locate with `browser_find` (text/regex), not full snapshots.** `browser_find` returns only matching nodes plus a few lines of context — orders of magnitude smaller than a full `browser_snapshot`. Find the element, then act on the returned `target`. Only fetch a full snapshot when you genuinely need the whole tree, and always with a `filename`.
- **Read everything else in slices.** When you must inspect a saved snapshot, a source file, or the log, use the Read tool with `offset`/`limit` to pull only the region you need. Never Read a whole snapshot or a whole large component into context.
- **Keep the design system and findings on disk, not in your head.** `.claude/art-direction.md` is the source of truth — read it in full once at orient, then only the section you touch. `.claude/auto-improve-log.log` is read with `tail -n 150`, never whole. Append each change the moment you make it so you don't carry a mental list forward.
- **Use TodoWrite for the page queue.** Track "pages done / pages remaining" in the todo list (on disk), not as a growing block of context.
- **Compact on a hard cadence — every time, not just at the end:**
  - After finishing each page/component (Step 8) — `/compact` before rotating to the next.
  - **If you have done > ~15 heavy tool calls since the last `/compact`, `/compact` immediately.** Heavy = any MCP call, any Read of a large file, any build/lint/test run.
  - **If any single tool result looks large** (a raw artifact slipped in, a 1000+ line read, a full test log), `/compact` immediately rather than continuing.
  - **If you sense creeping context pressure mid-page, stop and `/compact` immediately — don't wait for a hard count to trip.** Signs: re-reading files you just opened, results feeling heavy, or simply approaching the 250K ceiling. This is the *active* guard that prevents a mid-work stop. Always stop at a clean step boundary (never mid-edit or mid-commit), run `/compact`, then resume from Step 3/4. A compact keeps the run alive; an overshoot stops it.
  - At the end of the run, `/compact` once more.
- **Never carry a page's screenshots/snapshots forward into the next page.** The log entry and the on-disk files are the durable output; the in-context artifacts are discardable once those are written.

## Step 0 — Orient

- Read `.claude/art-direction.md` in full (create it from the seed above if missing).
- `tail -n 150 .claude/auto-improve-log.log` for the current queue, including anything `/ux-critic` flagged as aesthetic rather than functional — those are yours to pick up.
- Acquire `.claude/.auto-improve.lock` before editing code; if held, log the skip and stop.
- Confirm the dev server and Playwright MCP are available; if not, stop and say so rather than guessing at a result.

## Step 1 — Pick a page or component

Use `$ARGUMENTS` if given, otherwise take the next untouched page/component, or one flagged in the queue as needing an aesthetic pass. Prefer breadth first — one honest pass over every major page before a second deep pass on any single one.

## Step 2 — Look, then decide

- Screenshot the current state (to disk, per the discipline above) before changing anything — this is your before/after evidence.
- Periodically (not every cycle) research current design trends the way `/auto-improve` does for its GUI work, and consider whether `.claude/art-direction.md` should evolve. Any change to it gets a deliberate edit with a logged one-line rationale.

## Step 3 — Redesign

- Rework layout, palette application, illustration/icon placement, and motion against `.claude/art-direction.md`.
- Rewrite this page's copy — headlines, button labels, empty/error state wording, onboarding text — for voice and tone, not for functional clarity. If copy is actually confusing rather than just flat, note it for `/ux-critic` instead of only prettifying it.
- Keep changes scoped to this page/component per cycle — don't let "redesign" become "rewrite the whole app in one sitting."

## Step 4 — Self-critique until it holds up

Screenshot the result (desktop and mobile viewport) and check it against a concrete list, not a vibe:
- Does it read as the same app as every other redesigned page (palette, motif, type rhythm all consistent)?
- Is there one clear focal point, or is it busy?
- Does motion feel calm and intentional, or gratuitous?
- Does the copy sound like it belongs to a considered brand, or like placeholder text?

If it doesn't hold up, go back to Step 3. Don't move on while telling yourself it's "good enough" without being able to say specifically why it passes.

## Step 5 — Verify nothing broke (keep output on disk)

Run build/lint/tests. A redesign that breaks the build or introduces a layout bug is a regression regardless of how it looks — fix or revert before continuing.
- Capture **only failures** into context. Pipe output to a file (e.g. `.playwright/build-<page>.log`) and Read only the failing region with `offset`/`limit`, or read its tail. Never paste a full build/lint/test log into context.
- If the run is green, a one-line "passed" note is enough — no full output needed.
- This is a heavy call — it counts toward the 15-call `/compact` trigger in Context-window discipline.

## Step 6 — Commit

Same gate as the other skills: only commit if Step 5 passed. Check the diff for anything unintended. Commit with a message noting what changed and why, push, release the lock.

## Step 7 — Log

Append to `.claude/auto-improve-log.log`, tagged `[art-director]`, same shared format (Researched/Changed/Why/Verified/Next priority queue/Open questions). Note any functional issues spotted for `/ux-critic` under Open questions rather than fixing them yourself.

## Step 8 — Compact, then repeat

**Run `/compact` now** — before rotating to the next page/component and again at the end of the run. This is mandatory, not optional: the single biggest cause of context-window crashes in this skill is a long session that never compacts between pages. The log entry and the on-disk screenshots are the durable output; everything in working context from this page is discardable once they're written. Never carry a full page's worth of snapshots forward.

If you feel context pressure *mid-page* — not just between pages — stop at a clean step boundary (never mid-edit or mid-commit), run `/compact`, then resume from Step 3/4. A compact keeps the run alive; an overshoot stops it. If session budget allows, repeat from Step 1 for the next untouched page/component.

**When the run ends** — final page done, or stopping because you're out of budget — run `/compact` one final time to compress whatever remains before handing control back. `.claude/art-direction.md` and the `[art-director]` log entry are the durable memory; the screenshots/snapshots on disk are the durable evidence. Everything else in working context is discardable once those are settled.

## Guardrails

- Never reproduce a specific found image or illustration — synthesize original work in the established direction.
- Never touch `.claude/art-direction.md` casually — evolving it is a deliberate, logged, infrequent decision.
- Never fix functional bugs here — log them for `/ux-critic`/`/auto-improve` instead.
- Never call a paid image-gen provider on your own initiative.
- Respect the shared lock, same as `/orchestrator-dev` and `/auto-improve`.