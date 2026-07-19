---
name: art-director
description: Autonomous visual and copy redesign for SuperAgent — establishes and maintains a consistent original art direction (palette, motifs, iconography, motion, voice), then redesigns pages against it using hand-authored SVG/CSS assets and rewritten copy. Visual verification is delegated to the /playwright-check subprocess (max 5 turns, screenshot-only, writes JSON findings). The main art-director session NEVER calls Playwright directly — this is the fix for the context-bloat crash. Purely aesthetic; ux-critic owns functional bugs.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional page/component, e.g. "landing-page", "onboarding-flow", "icon-set"]
---

# /art-director — Autonomous Art Direction & Redesign Loop

## Division of Labor

- `/ux-critic` owns bugs, confusion, broken states, accessibility, and functional copy clarity.
- `/art-director` (this skill) owns palette, illustration, iconography, motion, layout rhythm, and brand voice.
- If you spot a functional bug while redesigning, log it under `[art-director]` as an open question for `/ux-critic`.
- **CRITICAL**: This skill never calls Playwright. Visual verification is done by a separate subprocess.

## Context Rule (the fix for the crashing)

**Compact at every `→ COMPACT` checkpoint, unconditionally.** This skill previously had Playwright in
its own session, which caused accessibility snapshots (50K–200K token text dumps) to land in context,
overflow the 250K ceiling, and crash the compact step itself. That architecture is gone.

**Playwright is now a subprocess.** The main session context is Playwright-free. A `→ COMPACT` now
actually works because the context stays manageable.

**What to do before every compact:** write current page name + step number + commit state to TodoWrite.

**Source file rules (still apply):**
- Don't `Read` a whole component/CSS file to orient — `Grep` first, then `Read` with `offset`/`limit`.
- Pipe build/lint output to a file; read only the failing region.
- `.claude/auto-improve-log.log`: always `tail -n 150`, never whole.
- `.claude/art-direction.md`: read in full once at orient, then only the section you're touching.

## Your Art Direction (`.claude/art-direction.md`)

On first run, if `.claude/art-direction.md` doesn't exist, create it from the seed below.
Treat that file — not this seed — as the source of truth. Changing it is a deliberate, logged decision.

**Seed direction — "layered atmosphere":**
A single focal disc (sun/moon) over horizontally layered, depth-suggesting bands, rendered flat.
- *Atmosphere mode* — soft gradient sky (sage/mint through cream to warm peach), layered silhouette
  "mountains" in desaturated blue-teal deepening to moss/forest green, used as section dividers.
- *Contour mode* — strict monochrome, ivory/cream ground, forms from concentric flowing linework.
- Shared rules: generous negative space, one clear focal element per composition, motion that evokes
  drifting or gently rising/settling — never snapping or bouncing.

## Step 0 — Orient

- Read `.claude/art-direction.md` in full (create from seed above if missing).
- `tail -n 150 .claude/auto-improve-log.log` — current queue, including anything ux-critic flagged aesthetic.
- Acquire `.claude/.auto-improve.lock` before editing code; if held, log the skip and stop.
- Check for `.claude/art-director-env.md` — cached environment info (dev server port, serve command).
  If it exists and the port still responds (`curl -sf http://localhost:PORT/ > /dev/null`), skip discovery.
  Only do full discovery if the file is missing or the port is dead; then update the file.

**→ COMPACT** (write page queue + step to TodoWrite first)

## Step 1 — Pick a Page

Use `$ARGUMENTS` if given, otherwise take the next untouched page/component from the queue.
Prefer breadth first — one honest pass over every major page before a second deep pass on any one.

## Step 2 — Online Research (Mandatory — 3 Searches Required)

**This step is not optional.** Run all 3 searches and write the research log to disk before Step 3.

```bash
# Write the research cache file before doing anything else:
mkdir -p .claude/research-cache
```

Required searches (use WebSearch, then WebFetch one top result):
1. `"AI app UI design trends 2026"` — current visual direction in the product category
2. `"react component design system spacing rhythm 2026"` — component pattern research
3. `"electron app UI redesign case study 2026"` — desktop-specific visual patterns

Write to `.claude/research-cache/$(date +%Y%m%d-%H%M)-art-director.md`:
```
RESEARCH LOG — [art-director] [DATE TIME]
Search 1: "<exact query>" → Source: <url> — Takeaway: <one line>
Search 2: "<exact query>" → Source: <url> — Takeaway: <one line>
Search 3: "<exact query>" → Source: <url> — Takeaway: <one line>
Decision: <what this research changes about the plan for this page>
```

Cross-check `.claude/art-direction.md` against research findings. If current direction contradicts
two or more sources, log that as an open question rather than silently updating direction.

**→ COMPACT**

## Step 3 — Redesign (Code Only — No Playwright)

- Rework layout, palette application, illustration/icon placement, and motion against `.claude/art-direction.md`.
- Use `Grep` + targeted `Read` with `offset`/`limit` — not whole-file reads.
- Rewrite this page's copy for voice and tone. If copy is actually confusing rather than just flat,
  note it for `/ux-critic` instead of fixing it yourself.
- Keep changes scoped to this page/component per cycle.
- Hand-authored SVG first for illustrations/icons. CSS/SVG-native for motion.

## Step 4 — Static Verify

Run build/lint, output piped to a file:
```bash
npm run build > /tmp/art-build.log 2>&1
cat /tmp/art-build.log | tail -20
```
Fix failures before proceeding. A redesign that breaks the build is a regression.

**→ COMPACT**

## Step 5 — Write Pending Check (Playwright Handoff)

Write `.playwright/pending-check.json` with what to visually verify:
```json
{
  "skill": "art-director",
  "page": "<page name>",
  "dev_url": "http://localhost:<PORT>",
  "viewport": {"width": 1280, "height": 800},
  "check_items": [
    "palette consistency with art-direction.md tokens",
    "spacing rhythm — nav, section, card padding",
    "motion feel — transitions are calm not snappy",
    "focal element clearly reads as primary"
  ],
  "timestamp": "<ISO timestamp>"
}
```

Ensure the dev server is running. If not, start it:
```bash
npm run dev --workspace=@superagent/web > /tmp/art-dev.log 2>&1 &
sleep 3
curl -sf http://localhost:3000/ > /dev/null || echo "Dev server not responding"
```

## Step 6 — Launch Playwright Sub-Session

Launch `/playwright-check` as a completely isolated subprocess with max 5 turns.
This session handles ALL Playwright work. The main art-director session does NOT receive
any Playwright output — only the small JSON findings file afterward.

```bash
FINDINGS_FILE=".playwright/findings-$(date +%s).json"
claude -p "/playwright-check" \
  --allowedTools "mcp__playwright__*,Write,Read" \
  --max-turns 5 \
  --output-format json \
  > ".playwright/check-subprocess-$(date +%s).log" 2>&1

# Find the most recent findings file (playwright-check writes it)
LATEST_FINDINGS=$(ls -t .playwright/findings-*.json 2>/dev/null | head -1)
```

If `claude` is not available in this environment, skip to Step 7 with `overall: "NOT_CHECKED"`.

## Step 7 — Read Findings + Decide

Read the findings JSON (small, no Playwright payloads):
```bash
cat "$LATEST_FINDINGS"
```

- If `overall: "PASS"`: proceed to Step 8 (commit).
- If `overall: "NEEDS_REVISION"` and `blocker_count > 0`: go back to Step 3 to fix the specific
  failing items listed in `findings[].note`. **Hard cap: one revision pass maximum.** After the
  second attempt, commit whatever state you're in and log remaining gaps.
- If subprocess failed or findings file missing: log as "visual check not completed — subprocess error"
  and proceed to commit with that note in the commit message.

**→ COMPACT**

## Step 8 — Commit

Only commit if Step 4 (build/lint) passed.
Check diff for anything unintended or sensitive. Stage only this page's files.
Write a real commit message: what changed, why (art direction mission point), and visual check result.
Commit, push to current branch, release lock.

Commit message format:
```
art-director: redesign <page> — palette + motion pass

Research: <3 source URLs from Step 2>
Verified: build PASS, visual check <PASS | NEEDS_REVISION — items noted>
Serves: Mission point 4 (GUI that doesn't feel like a hobby project)
```

## Step 9 — Log

Append to `.claude/auto-improve-log.log`, tagged `[art-director]`:
```
## YYYY-MM-DD — [art-director] <page/component>
Researched: <sources + one-line takeaways>
Changed: <files / behavior>
Why: <mission point served>
Static verify: <build/lint result>
Visual check: <PASS | NEEDS_REVISION — items | NOT_CHECKED — reason>
Committed: <hash + pushed, or "not committed — reason">
Next priority queue: <ordered list for next run>
Open questions: <anything for ux-critic or human decision>
```

**→ COMPACT** (Steps 8+9 together)

## Step 10 — Repeat or Stop

If session budget allows, repeat from Step 1 for the next page.
A page split across two loop ticks is fine — a crashed session is not.

## Guardrails

- Never call Playwright tools in this skill — use the subprocess (Step 6).
- Never reproduce a specific found image — synthesize original work.
- Never touch `.claude/art-direction.md` casually — evolving it is a deliberate, logged decision.
- Never fix functional bugs — log them for ux-critic.
- Respect the shared lock.
- Hard cap of one revision pass per page per cycle (Step 7).