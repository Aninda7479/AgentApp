---
name: ux-critic
description: Synthetic-user UX and frontend audit for SuperAgent. Researches competitor UX online, writes a persona audit plan, then delegates ALL Playwright browser interaction to the /playwright-audit subprocess (max 5 turns, screenshot + element-find only, writes JSON findings). The main ux-critic session NEVER calls Playwright — this is the fix for the context-bloat crash. Observation only, never edits code. Logs ranked findings into the shared queue for /auto-improve to pick up.
allowed-tools: Read, Grep, Glob, Bash, Write, WebSearch, WebFetch, TodoWrite
argument-hint: [optional persona or flow, e.g. "first-time-setup", "mobile", "accessibility", "video-gen-flow"]
---

# /ux-critic — Synthetic User & Frontend Critic Loop

## Why This Exists

No real users yet means no natural signal for confusing flows, broken mobile layouts, or unclear copy.
This skill substitutes for that missing signal by planning a realistic user walkthrough, delegating
the actual browser interaction to an isolated subprocess (to prevent context crashes), and writing
specific, actionable findings into the shared queue for `/auto-improve` to fix.

**This skill never edits code.** It observes and reports. `/auto-improve` fixes.

## The Playwright Crash — Fixed

The previous version drove Playwright directly in this session. A single `browser_snapshot` on a
heavy page returns 50K–200K tokens of accessibility tree text. After a few calls, the 250K context
ceiling was hit, `/compact` itself failed (no tokens left to process the compact), and the chat
crashed. You had to start a new session every time.

**The fix**: All Playwright work is now done by `/playwright-audit` — a completely isolated
subprocess with `--max-turns 5`. That session has its own tiny context, takes screenshots, uses
`browser_find` only (never `browser_snapshot`), and writes a small JSON findings file. This session
reads only that JSON. No Playwright response ever lands in this context.

## Context Rule

**Compact at every `→ COMPACT` checkpoint, unconditionally.** Now that Playwright is gone from
this session, these checkpoints actually work. A session that research + plans + reads a small JSON
stays well under the 250K limit.

Before every compact: note current persona + step in TodoWrite.

**Source file and log rules:**
- `.claude/auto-improve-log.log`: always `tail -n 150`, never whole.
- Don't `Read` whole files — `Grep` first, `Read` with `offset`/`limit`.

## Step 0 — Orient

- `tail -n 150 .claude/auto-improve-log.log` — look for prior `[ux-critic]` entries to avoid
  re-testing the same persona back-to-back.
- Check if the dev server is running: `curl -sf http://localhost:3000/ > /dev/null 2>&1`
  If not running, start it: `npm run dev --workspace=@superagent/web > /tmp/ux-dev.log 2>&1 &`
  Wait a few seconds, then confirm: `sleep 4 && curl -sf http://localhost:3000/ > /dev/null`
- Acquire `.claude/.auto-improve.lock`. If held, log the skip and stop.

## Step 1 — Online Research (Mandatory — 3 Searches Required)

**This step is not optional.** Run all 3 searches before planning the persona walkthrough.

```bash
mkdir -p .claude/research-cache
```

Required searches (WebSearch, then WebFetch one top result):
1. `"AI coding assistant UX review 2026"` — what users find confusing in comparable tools
2. `"AI app onboarding design patterns first-time setup 2026"` — first-run UX research
3. `"electron desktop app accessibility WCAG checklist 2026"` — current a11y standards

Write to `.claude/research-cache/$(date +%Y%m%d-%H%M)-ux-critic.md`:
```
RESEARCH LOG — [ux-critic] [DATE TIME]
Search 1: "<exact query>" → Source: <url> — Takeaway: <one line>
Search 2: "<exact query>" → Source: <url> — Takeaway: <one line>
Search 3: "<exact query>" → Source: <url> — Takeaway: <one line>
Decision: <what specific things to look for this cycle, informed by research>
```

**→ COMPACT** (write persona + step to TodoWrite first)

## Step 2 — Pick a Persona and Flow

Use `$ARGUMENTS` if given. Otherwise rotate to the next untested combination:

- **First-time setup** — non-technical user connecting first provider, sending first message.
- **Power user / orchestration** — testing multi-model routing, uploading image to text-only model.
- **Each capability** — 3D gen, image gen, video gen, audio gen, PDF, Office file — one at a time.
- **Mobile / narrow viewport** — 375×667.
- **Keyboard-only / accessibility** — tab order, focus states, screen-reader labels.
- **Error paths** — disconnect provider mid-task, submit empty form, upload oversized file, go offline.

Use the research from Step 1 to prioritize which pain points to probe for this persona.

## Step 3 — Write Pending Audit (Playwright Handoff)

Write `.playwright/pending-audit.json` describing what the subprocess should do:
```json
{
  "skill": "ux-critic",
  "persona": "<persona name>",
  "flow_description": "<what this user is trying to do>",
  "dev_url": "http://localhost:3000",
  "steps": [
    "Navigate to app",
    "Find and click Connect Provider",
    "Fill in API key field",
    "Click Connect",
    "Type a message and send"
  ],
  "look_for": [
    "missing loading indicators",
    "unclear button labels",
    "console errors during flow",
    "broken focus states"
  ],
  "timestamp": "<ISO timestamp>"
}
```

## Step 4 — Launch Playwright Sub-Session

Launch `/playwright-audit` as a completely isolated subprocess with max 5 turns.
The main ux-critic session does NOT receive any Playwright output — only the small JSON findings
file written by the subprocess.

```bash
claude -p "/playwright-audit" \
  --allowedTools "mcp__playwright__*,Write,Read" \
  --max-turns 5 \
  --output-format json \
  > ".playwright/audit-subprocess-$(date +%s).log" 2>&1

# Find the most recent audit findings file
LATEST_AUDIT=$(ls -t .playwright/audit-*.json 2>/dev/null | head -1)
```

If `claude` is not available, log "Playwright audit not completed — claude subprocess unavailable"
and proceed to Step 5 with that note. Never fabricate a walkthrough.

## Step 5 — Read Findings + Critique

Read the audit findings JSON (small, no Playwright payloads):
```bash
cat "$LATEST_AUDIT"
```

Interpret each finding as a specific reviewer would — not a cheerleader:

**Weak**: "The upload flow feels clunky."  
**Useful**: "After clicking Upload, there's no loading indicator for ~2s. A first-time user gets no
signal anything happened and is likely to click Upload again. Fix: add spinner + disabled state."

Rank findings by how likely they are to actually block or confuse a real user, not by how easy
they'd be to fix. Note what's genuinely fine too — don't manufacture problems to look productive.

Also read any `console_errors` from the findings file and note which ones are actual bugs vs. noise.

**→ COMPACT**

## Step 6 — Log Into Shared Queue (No Code Edits)

Append to `.claude/auto-improve-log.log`, tagged so `/auto-improve` can pick it up:
```
## YYYY-MM-DD — [ux-critic] <persona/flow>
Researched: <3 sources + one-line takeaways>
Persona tested: <persona name> — <flow completion status from findings JSON>
Changed: none — observation only
Why: GUI quality / compensates for no real user feedback yet
Playwright audit: <PASS | NEEDS_FIXES | NOT_COMPLETED — reason>
Screenshots: <paths from findings JSON>
Next priority queue:
  1. [HIGH] <most impactful finding — exact description + actionable fix>
  2. [HIGH] <second finding>
  3. [MEDIUM] <etc.>
Open questions: <anything needing a human call, e.g. desktop-shell testing gap>
```

**Write findings to the queue immediately after getting them.** Do not accumulate a mental list.

**→ COMPACT**

## Step 7 — Repeat

If session budget allows, go to Step 1 for the next untested persona/flow.

## Guardrails

- **Never call Playwright tools in this skill.** Use the subprocess (Step 4).
- Never edit application code — even for something trivial.
- Never fabricate a walkthrough if the subprocess failed — log it honestly.
- Never carry a full session's worth of findings forward mentally — write them immediately.
- Respect the shared lock.
