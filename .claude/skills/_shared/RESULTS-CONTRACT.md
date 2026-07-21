# Shared Results Contract (all SuperAgent skills)

**Read this before any skill cycle.** If a skill’s SKILL.md conflicts with this file, **this file wins**.

## Why skills were failing

1. Empty priority queue → aimless research.
2. Mandatory 3× WebSearch + WebFetch **before** any code → cycles expired with zero commits.
3. Forced `/compact` mid-implementation → lost the work state.
4. Live free-model tests treated as hard gates → no commit when keys/models missing.
5. Unix-only shell (`date -r`, `/tmp`, `head`, `jq`) on a **Windows** primary machine.
6. Shared lock aborting the whole cycle instead of coordinating.
7. Mission text not tied to [`docs/FUTURE-PLAN.MD`](../../../docs/FUTURE-PLAN.MD).

## Definition of a successful cycle

A cycle **succeeds** only if it does **at least one** of:

- **A.** Lands a commit that moves FUTURE-PLAN work forward (prefer Phase 0/1/2 order), **or**
- **B.** Promotes a capability to CERTAIN in `docs/FUTURE-PLAN.MD` with evidence, **or**
- **C.** Fixes a verified P0 security issue.

A cycle that only writes research markdown / log prose **fails**. Log it as `Committed: none — research-only (FAILED CYCLE)` and stop.

## Hard rules (every skill)

### 1. Results before research

1. Orient (git status, tail log, FUTURE-PLAN phase).
2. Pick **one** concrete deliverable (file-level).
3. Implement.
4. Verify (build + targeted tests).
5. Commit if green.
6. Log.

**Research is optional** unless you are touching an external API shape you have not verified this month. Cap: **one** WebSearch + optional one WebFetch. Never three mandatory searches.

### 2. Windows-first commands

Prefer PowerShell-safe commands. Examples:

```powershell
# logs
New-Item -ItemType Directory -Force -Path .claude/research-cache, .claude/tmp | Out-Null
npm run build *> .claude/tmp/build.log; Get-Content .claude/tmp/build.log -Tail 40

# date stamp
$ts = Get-Date -Format "yyyyMMdd-HHmm"

# lock age (seconds)
if (Test-Path .claude/.auto-improve.lock) {
  $age = [int]((Get-Date) - (Get-Item .claude/.auto-improve.lock).LastWriteTime).TotalSeconds
}
```

Do **not** require `date -r`, `head`, `tail`, `jq`, or `/tmp` paths.

### 3. Soft lock

```powershell
$LOCK = ".claude/.auto-improve.lock"
if (Test-Path $LOCK) {
  $age = [int]((Get-Date) - (Get-Item $LOCK).LastWriteTime).TotalSeconds
  if ($age -lt 1800) {
    # another cycle may be active — only abort if YOU need exclusive edit of same files
    Write-Host "LOCK_HELD age=${age}s — proceed only if non-conflicting; else exit"
  } else {
    Remove-Item $LOCK -Force  # stale
  }
}
"{`"pid`":$PID,`"started`":`"$((Get-Date).ToUniversalTime().ToString('o'))`",`"skill`":`"$SKILL`"}" |
  Set-Content $LOCK -Encoding utf8
# always release in finally:
# Remove-Item $LOCK -Force -ErrorAction SilentlyContinue
```

Default lock TTL: **30 minutes**. Stale locks are deleted. Do not exit solely because a lock file exists if you are read-only.

### 4. Verify gates (realistic)

| Gate | Required? |
|------|-----------|
| Targeted unit/integration tests for touched code | **Yes** when tests can run offline |
| `npm run build` (or package build) | **Yes** if you changed TS/TSX |
| Full monorepo `npm test` | Preferred; if too slow, run package tests + note |
| Live LLM call | **Optional** — only free/local; if unavailable, write `Live: SKIP` and still commit offline-proven work |
| Playwright / visual | Optional; never block a non-UI cycle |

### 5. No mid-cycle compact rituals

Do **not** instruct the model to “compact unconditionally” mid-edit. Compact only if the **host** is near context limits **after** a commit boundary.

Keep context small by: grepping first, reading slices, piping build logs to `.claude/tmp/`.

### 6. One focus, small diff

- One subsystem per cycle.
- Prefer < 400 lines changed unless generating tests.
- Match existing code style; no drive-by refactors.

### 7. Logging (mandatory on every exit)

Append to `.claude/auto-improve-log.log`:

```
## YYYY-MM-DD HH:MM — [<skill>] <focus>
Plan ref: docs/FUTURE-PLAN.MD Phase <N> / plan/improvement-plan.md <item>
Changed: <files>
Verify: build=<PASS|FAIL|SKIP> tests=<PASS|FAIL|SKIP> live=<PASS|SKIP>
Committed: <hash | none — reason>
CERTAIN: <promoted capability | none>
Next priority queue:
  1. ...
  2. ...
Open questions: <or none>
```

If the queue section would be empty, **re-seed** from `plan/improvement-plan.md` “Queue seed”.

### 8. Branch / PR policy

- Base branch: `agent-development` (unless user says otherwise).
- Prefer `skill/<skill>-YYYYMMDD-HHMM` branches for autonomous runs.
- Never force-push.
- Never commit secrets, `.env`, or API keys.

## Priority order when queue is empty

1. Phase 0 CERTAIN promotions  
2. Phase 1 hooks / checkpoints / sessions  
3. Phase 2 media adapters  
4. Phase 3 GUI  
5. Phase 4 industrial — **only** if human explicitly requests  

## Failed-cycle checklist

If you cannot commit:

1. Leave working tree clean or clearly document dirty files.
2. Release lock.
3. Log `Committed: none — <blocker>`.
4. Put a **more specific** next queue item (not the same vague one).
