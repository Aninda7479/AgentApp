---
name: auto-improve
description: Autonomous research-and-improve loop for SuperAgent — researches online EVERY cycle (3 mandatory searches written to disk before any planning), picks one high-leverage improvement tied to the mission, implements it, verifies statically and live, and commits to a per-cycle dated branch with an auto-PR to agent-development. Use for open-ended "keep improving the project" requests. Research is not optional — a cycle without 3 cited real sources is incomplete.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "routing-layer", "video-gen-adapter", "gui-polish", "gui-redesign"]
---

# /auto-improve — Autonomous Research → Improve → Test → Commit Loop

Re-read this whole file every time you're invoked, including after `/clear` or `/compact`.

## Mission (every change must serve one of these)

1. **User controls model/provider and data.** Nothing locked to one vendor.
2. **Model orchestration, not single-model dependence.** Route tasks to whichever model(s) are good at them.
3. **One agent surface, many capabilities.** 3D, image, video, audio, PDF, Office, coding — pluggable adapters.
4. **A GUI that doesn't feel like a hobby project.** Competing visually with polished commercial apps.

## Context & Memory Contract

**Compact at every `→ COMPACT` checkpoint — unconditionally, like a step in the recipe.**
If unsure whether to compact: compact anyway. A compact you didn't need wastes a little.
A compact you skipped costs the entire run.

**Before every compact:** write focus + step + commit state to TodoWrite.

**Avoid large context sources:**
- Redirect build/lint/test output to files: `npm run build > /tmp/ai-build.log 2>&1`; read only the tail.
- `Grep` before `Read` — never load a whole source file to orient.
- WebFetch: take the one-line takeaway; discard the raw page.
- `.claude/auto-improve-log.log`: `tail -n 150` only, never whole.
- Research cache files: write them to disk, read back only what you need.

## Step 0 — Orient

**Acquire the lock first (before any edits):**
```bash
LOCK=.claude/.auto-improve.lock
if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(date -r "$LOCK" +%s 2>/dev/null || echo 0) ))
  if [ "$age" -lt 540 ]; then echo "LOCK_HELD"; exit 2; fi
fi
printf '{"pid":%d,"started":"%s"}\n' "$$" "$(date -u +%FT%TZ)" > "$LOCK"
```
If LOCK_HELD: abort. If acquired: release at end with `rm -f "$LOCK"`.

Then:
- `git log --oneline -20` and `git status` — understand trajectory and dirty state.
- `tail -n 150 .claude/auto-improve-log.log` — read shared queue and resume state.
- Read provider/model registry to see which models are tagged `free`.
- Map current structure briefly (don't re-derive from scratch each cycle — use the log's last "structure note").

## Step 1 — Pick One Focus

Use `$ARGUMENTS` if given. Otherwise take the top item from the log's "next priority queue."
If queue is empty, find the single highest-leverage gap yourself.

- Prefer breadth before depth: touch every subsystem at least once before a second pass.
- Small, reversible, verifiable increments. A one-line fix is a legitimate cycle.

## Step 2 — Online Research (MANDATORY — NON-NEGOTIABLE)

**This step is never optional. You may not proceed to Step 3 (Plan) without completing it.**

Research prevents you from implementing based on stale memory (API shapes change, best practices
evolve monthly in AI tooling). Actually search and fetch — do not simulate research from memory.

```bash
# Create research cache dir
mkdir -p .claude/research-cache
```

**Run these 3 searches every cycle:**

1. `"AI agent open source <focus area> improvements $(date +%B\ %Y)"` — what comparable tools are shipping
2. `"<focus area from Step 1> best practices 2026"` — current art for this specific domain
3. `"site:github.com/Aninda7479/AgentApp issues OR discussions"` (or WebFetch the Issues tab) — community reports

For each search: use `WebSearch` to get URLs, then `WebFetch` the most relevant result.
Read only the first 200 lines of any fetched page — never paste full content into context.

Write the research log **to disk** before reading it back:
```bash
cat > .claude/research-cache/$(date +%Y%m%d-%H%M)-auto-improve.md << 'EOF'
RESEARCH LOG — [auto-improve] [DATE TIME]
Focus: <focus area>
Search 1: "<exact query>" → Source: <url> — Takeaway: <one line>
Search 2: "<exact query>" → Source: <url> — Takeaway: <one line>
Search 3: "<exact query>" → Source: <url> — Takeaway: <one line>
Decision: <what this research changed about the plan>
EOF
```

Cross-check at least 2 independent sources before committing to an approach.
Never invent a source, API shape, or library capability you haven't verified.

**→ COMPACT** (write focus + step + research file path to TodoWrite first)

## Step 3 — Plan

Write a short numbered plan via TodoWrite — typically 1–6 concrete edits.
For each item, name which mission point it serves.
Cite the research file from Step 2 as the basis.

## Step 4 — Implement

- Match existing code conventions.
- New capability adapters go behind the existing adapter interface.
- Prefer additive, backward-compatible changes. If breaking, say so explicitly in the log.
- No unjustified new dependencies — if adding one, log why it won over alternatives.

## Step 5 — Verify (Static)

```bash
npm run build > /tmp/ai-build.log 2>&1
echo "Exit: $?"
tail -30 /tmp/ai-build.log
```

Run lint and typecheck if available. Fix failures before Step 6. Do not proceed past a failing check.

## Step 6 — Verify (Live)

- **Only use already-connected providers whose models are tagged `free`** in the registry.
- Never call a paid or unconfigured provider.
- If no free-tagged model is connected for this test: skip live call, say so explicitly.
- Redirect live test output to disk:
  ```bash
  node test-script.js > /tmp/ai-live-test.log 2>&1
  tail -20 /tmp/ai-live-test.log
  ```
- Do not fabricate a pass.

**→ COMPACT**

## Step 7 — Commit

Only commit if Steps 5 and 6 passed (or Step 6 was honestly documented as not-possible with reason).

- Check diff for API keys, `.env` contents, tokens, personal paths.
- Stage only files from this cycle's focus.
- Write a real commit message:
  ```
  auto-improve: <what changed> — <mission point served>
  
  Research: <source URLs from Step 2>
  Static verify: build/lint PASS
  Live test: <PASS against <model> | NOT LIVE-TESTED — <reason>>
  ```
- Commit, then push. Never force-push. Release the lock.

## Step 8 — Log and Hand Off

Append to `.claude/auto-improve-log.log`:
```
## YYYY-MM-DD HH:MM — [auto-improve] <focus area>
Researched: <3 sources + one-line takeaways>
Research file: .claude/research-cache/<filename>
Changed: <files / behavior>
Why: <mission point served>
Static verify: <build/lint/test result>
Live test: <PASS against <model name> | NOT LIVE-TESTED — reason>
Committed: <hash + pushed | "not committed — reason">
Next priority queue: <ordered list for next /auto-improve run>
Open questions: <anything needing a human decision>
```

**→ COMPACT** (post Steps 7–8)

## Step 9 — Repeat Within Session

If turns/context budget remain and no blocking open question, go back to Step 1 with the next queue item.
Stop between cycles, never mid-edit.

## Guardrails

- Never weaken "user owns their data/keys" to make a feature easier.
- Never hard-lock a feature to one paid vendor when an interchangeable path is viable.
- Don't write integration code against a guessed API shape — verify via research first.
- Never call a paid or unconfigured provider autonomously.
- Never commit code that failed a check you were able to run.
- Never commit secrets.
- If truly blocked on a human decision, log it as an open question and move on.
