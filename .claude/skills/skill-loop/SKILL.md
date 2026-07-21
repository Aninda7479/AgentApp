---
name: skill-loop
description: Thin orchestrator for SuperAgent auto-improvement. Does NOT implement product code. Each cycle picks the next worker skill from the queue, spawns an isolated subagent/subprocess to run that skill, reads only a small JSON result, updates the shared log, and exits. Put this skill in an outer loop (Task Scheduler / while loop / autodev) so the main chat never bloats with implementation context.
allowed-tools: Read, Grep, Bash, Write, TodoWrite
argument-hint: "[optional: once | round | skill-name]  e.g. once (default), round, reliability-gate, agent-parity"
---

# /skill-loop — Orchestrator only (workers do the work)

**You are a dispatcher, not a builder.**  
If you start editing `packages/**` product code, you have failed this skill.

**Contract:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**North star:** `docs/FUTURE-PLAN.MD`  
**Queue/log:** `.claude/auto-improve-log.log`  
**Worker results dir:** `.claude/loop/`

---

## Why this exists

Running `/auto-improve` (or other skills) **in the main chat** loads research, source files, build logs, and diffs into one context until the session dies.

This skill keeps the **main session tiny**:

1. Read queue (tail of log)  
2. Pick one worker skill  
3. Spawn **isolated** worker (fresh context)  
4. Read **only** `.claude/loop/result-*.json` (small)  
5. Append a short orchestrator line to the log  
6. **Exit** (outer loop restarts you clean)

---

## Absolute rules (main session)

| Do | Do not |
|----|--------|
| Read last ~80 lines of auto-improve-log | Read whole skill implementations into context |
| Spawn workers via script / Task / `claude -p` | Implement features yourself |
| Read result JSON only | `Read` large source trees "to help the worker" |
| Write orchestrator log lines | Paste worker transcripts into the log |
| Exit after 1 worker (default) or 1 round | Run infinite work inside one main context |

**Allowed tools in main:** Read, Grep, Bash, Write, TodoWrite — **no Edit** of product code.  
(Write is only for `.claude/loop/*` dispatch files and log appends.)

---

## Worker roster (who you may spawn)

| Worker skill | When to pick |
|--------------|--------------|
| `/reliability-gate` | Certainty Register empty or Phase 0 items open (DEFAULT if unsure) |
| `/auto-improve` | General backlog item from queue |
| `/agent-parity` | Phase 1 hooks/sessions/skills |
| `/orchestrator-dev` | Routing / fallback / free pool |
| `/media-capability` | 3D / video Phase 2 |
| `/provider-scout` | Need new provider |
| `/test-generator` | Need tests for CERTAIN or critical path |
| `/security-auditor` | Security debt / every Nth cycle |
| `/dependency-guardian` | Deps / audit (low frequency) |
| `/ux-critic` | Queue needs UX findings (observation only) |
| `/art-director` | Phase 3 visual (one page) |
| `/atmosphere-dashboard` | Token apply pass |

**Never spawn as top-level workers:** `/playwright-check`, `/playwright-audit` (those are nested under art/ux workers).  
**Never spawn:** `/skill-loop` (no recursion).

---

## Modes (`$ARGUMENTS`)

| Arg | Behavior |
|-----|----------|
| *(empty)* or `once` | Pick **one** worker → spawn → log → **exit** (best for outer loops) |
| `round` | Run up to **4** different workers sequentially (still one spawn each; only JSON in main). Then exit. |
| `<skill-name>` e.g. `reliability-gate` | Force that worker once (with or without leading `/`) |

---

## Step-by-step (every main invocation)

### Step 0 — Prep dirs (Bash)

```powershell
New-Item -ItemType Directory -Force -Path .claude/loop, .claude/tmp | Out-Null
```

### Step 1 — Orient (minimal reads only)

```powershell
Get-Content .claude/auto-improve-log.log -Tail 80 -ErrorAction SilentlyContinue
git status --short
git log --oneline -5
```

Optional one-liner phase check (do **not** load full FUTURE-PLAN unless queue is empty):

```powershell
Select-String -Path docs/FUTURE-PLAN.MD -Pattern "CERTAIN|Phase 0" | Select-Object -First 5
```

### Step 2 — Pick worker

1. If `$ARGUMENTS` is a known skill name → use it.  
2. Else parse `Next priority queue` from the log tail.  
3. Map queue item → worker:
   - contains `CERTAIN` / `smoke` / `reliability` → `/reliability-gate`
   - contains `hook` / `checkpoint` / `session` / `rewind` / `skills v2` → `/agent-parity`
   - contains `3D` / `video` / `Tripo` / `Higgs` / `media` → `/media-capability`
   - contains `provider` / `adapter` → `/provider-scout` or `/orchestrator-dev`
   - contains `test` / `coverage` → `/test-generator`
   - contains `security` / `CVE` → `/security-auditor`
   - contains `deps` / `npm audit` → `/dependency-guardian`
   - contains `UX` / `[ux-critic]` → `/ux-critic`
   - contains `GUI` / `palette` / `redesign` → `/art-director`
   - else → `/auto-improve`
4. If Certainty Register still empty (log says `CERTAIN: none` recently) → **prefer `/reliability-gate`** over feature skills.

Rotation fairness (when queue is vague):

```
reliability-gate → auto-improve → agent-parity → orchestrator-dev →
test-generator → media-capability → security-auditor →
(provider-scout, dependency-guardian, ux-critic, art-director less often)
```

Skip a worker if the last log entry for that worker is `< 20 minutes` ago and was `success` (avoid thrash). Soft rule only.

Write TodoWrite: `worker=<name>`, `mode=<once|round>`, `step=spawn`.

### Step 3 — Write dispatch file

Write `.claude/loop/pending-worker.json` (overwrite each time):

```json
{
  "orchestrator": "skill-loop",
  "worker_skill": "/reliability-gate",
  "focus_hint": "CERTAIN-1 CLI chat+tool from queue item 1",
  "started_at": "ISO-8601",
  "result_glob": ".claude/loop/result-*.json",
  "rules": [
    "Read .claude/skills/_shared/RESULTS-CONTRACT.md",
    "Read and execute ONLY the worker SKILL.md for worker_skill",
    "One cycle only — then stop",
    "Before exit write .claude/loop/result-<unix>.json with the schema below",
    "Do not spawn skill-loop",
    "Windows-first shell; logs under .claude/tmp/"
  ]
}
```

### Step 4 — Spawn isolated worker (REQUIRED)

Pick **one** spawn method. Prefer A on Windows autodev; B if Task/subagent tool exists; C as fallback.

#### Method A — helper script (recommended, Windows)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/skill-loop/spawn-worker.ps1
```

The script runs a **fresh** `claude -p` (or SuperAgent) session with the worker prompt, max turns, and writes logs under `.claude/loop/`.

#### Method B — host Task / subagent tool

If your host exposes a Task/subagent tool, spawn **general-purpose** with prompt:

```text
You are a SuperAgent worker subagent. Fresh context.

1. Read .claude/loop/pending-worker.json
2. Read .claude/skills/_shared/RESULTS-CONTRACT.md (rules only)
3. Read .claude/skills/<worker>/SKILL.md and execute ONE full cycle
4. Before you finish, Write .claude/loop/result-<unix_ts>.json using the schema in skill-loop/SKILL.md
5. Do not call /skill-loop. Do not start extra workers.
```

Do **not** resume the worker into the main transcript. Wait for completion, then only Read the result JSON.

#### Method C — inline claude subprocess

```powershell
$ts = [int][double]::Parse((Get-Date -UFormat %s))
$prompt = @"
Read .claude/loop/pending-worker.json and execute that worker skill for ONE cycle.
Follow .claude/skills/_shared/RESULTS-CONTRACT.md.
Write result to .claude/loop/result-$ts.json then stop.
"@
$prompt | claude -p --permission-mode acceptEdits --allowedTools "Read,Grep,Glob,Edit,Write,Bash,WebSearch,WebFetch,TodoWrite" --output-format json *> ".claude/loop/worker-$ts.log"
```

If spawn fails (no `claude` in PATH): write a result JSON yourself with `"status":"skipped","summary":"spawn failed — no worker runtime"` and exit. **Do not** implement the worker in main.

### Step 5 — Read ONLY the result JSON

```powershell
Get-ChildItem .claude/loop/result-*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { Get-Content $_.FullName -Raw }
```

If missing after spawn: treat as `status: failed`.

**Do not** read `.claude/loop/worker-*.log` unless status is failed and you need a one-line error (then `Get-Content -Tail 20` only).

### Step 6 — Orchestrator log append

Append to `.claude/auto-improve-log.log`:

```
## YYYY-MM-DD HH:MM — [skill-loop] dispatched <worker>
Focus hint: <from pending-worker.json>
Worker status: <success|failed|skipped>
Committed: <from result>
Summary: <one line from result>
Result file: .claude/loop/result-<ts>.json
Next priority queue:
  <copy from result.next_queue if present, else keep previous top 5>
Open questions: <from result or none>
```

If worker succeeded and left a good `next_queue`, prefer that. If empty, re-seed from `plan/improvement-plan.md` queue seed (Grep the seed block only — don't load whole file into a long plan).

### Step 7 — Round mode?

- If mode is `once` → **STOP. End the main session.**  
- If mode is `round` and workers run this session `< 4` → go to Step 2 with a **different** worker; else STOP.

### Step 8 — Exit checklist

- [ ] No product code edited by main  
- [ ] At least one spawn attempted  
- [ ] Result JSON handled  
- [ ] Log appended  
- [ ] TodoWrite marked complete  

Main session final message to user/host: **≤ 10 lines** (worker, status, commit hash, next queue top).

---

## Result JSON schema (workers MUST write this)

Path: `.claude/loop/result-<unix_ts>.json`

```json
{
  "skill": "reliability-gate",
  "status": "success",
  "committed": "abc1234",
  "branch": "auto/2026-07-21-1200-reliability-gate",
  "summary": "Added CLI tool-loop smoke test; not yet CERTAIN",
  "files_changed": ["packages/cli/test/foo.test.ts", "docs/SMOKE.md"],
  "verify": {
    "build": "PASS",
    "tests": "PASS",
    "live": "SKIP"
  },
  "certain_promoted": null,
  "next_queue": [
    "Core engine tool-loop failure-path tests",
    "BYOK connect smoke"
  ],
  "open_questions": [],
  "duration_minutes": 12
}
```

`status` enum: `success` | `failed` | `skipped`  
`success` requires a commit **or** CERTAIN promotion **or** P0 security fix (same as RESULTS-CONTRACT).

---

## Outer loop (you set this — skill runs once per iteration)

### PowerShell (Task Scheduler / terminal)

```powershell
# From repo root — forever until pause file
while ($true) {
  if (Test-Path .claude/.auto-improve.pause) { Start-Sleep 60; continue }
  $env:SKILL = "/skill-loop"
  # optional: $env:SKILL_ARGS = "once"   # or "round"
  .\autodev\run-auto-improve.ps1
  Start-Sleep -Seconds 120
}
```

### Using skill-loop's own runner

```powershell
.\.claude\skills\skill-loop\run-loop.ps1 -Iterations 0
# -Iterations 0 = infinite; -Iterations 10 = ten orchestrator cycles
```

### Claude Code / SuperAgent chat

```
/skill-loop
```

or schedule:

```
/skill-loop once
```

Each chat message/session should end after one cycle so context resets when the outer driver starts a new `claude -p /skill-loop`.

---

## Guardrails

- **Main never implements.** Spawn or skip.  
- **No nested skill-loop.**  
- **No Playwright in main.**  
- **No reading full worker transcripts.**  
- **One worker default** keeps outer-loop + context healthy.  
- If lock held (`RESULTS-CONTRACT` soft lock) and worker is write-heavy, still spawn — workers coordinate; main does not wait 30 minutes idle.  
- If three consecutive workers return `failed`, append open question `skill-loop: 3 failures — human check build/env` and exit round early.

---

## Success criteria for THIS skill

| Main did… | Outcome |
|-----------|---------|
| Spawned worker + logged result | **Success** (even if worker failed — failure is recorded) |
| Implemented code in packages/ | **Failure of skill-loop** |
| Only chatted / planned with no spawn | **Failure** |
