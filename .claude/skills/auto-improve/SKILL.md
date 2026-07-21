---
name: auto-improve
description: Results-first improvement loop for SuperAgent. Picks one item from docs/FUTURE-PLAN.MD / plan/improvement-plan.md, implements it, verifies (build + tests), commits, and logs. Research is optional (max 1 search). Use for open-ended "improve SuperAgent" requests. A cycle without a commit or CERTAIN promotion is a failed cycle.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "hooks-mvp", "certain-cli-smoke", "video-adapter", "gui-workspace"]
---

# /auto-improve — Ship one improvement

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**North star:** `docs/FUTURE-PLAN.MD`  
**Backlog:** `plan/improvement-plan.md`

## Mission (pick changes that serve these)

1. User controls model/provider and data (no single-vendor lock).
2. Orchestrate models by task — do not depend on one model.
3. One agent surface: coding + 3D + video + audio + Office — pluggable adapters.
4. GUI that feels commercial-grade.
5. **Reliability:** move capabilities into the FUTURE-PLAN Certainty Register.

**Replace targets (from FUTURE-PLAN):** coding agents (Antigravity / Claude / OpenAI), CLIs, Tripo3D-class 3D, HiggsField-class video. Industrial CAD later.

## Cycle (keep it short)

### 0) Orient (5 minutes max)

```powershell
git status
git log --oneline -15
Get-Content .claude/auto-improve-log.log -Tail 80 -ErrorAction SilentlyContinue
```

Read the top of `docs/FUTURE-PLAN.MD` (honesty gate + active phase) and the first unchecked Phase 0/1 item in `plan/improvement-plan.md`.

Acquire soft lock per RESULTS-CONTRACT (30 min TTL). Set `$SKILL = "auto-improve"`.

### 1) Pick ONE deliverable

Order of preference:

1. `$ARGUMENTS` if provided and valid  
2. Top item in log’s `Next priority queue`  
3. First unchecked Phase 0 item  
4. First unchecked Phase 1 item  
5. Only then Phase 2 media / Phase 3 GUI  

Write the choice to TodoWrite as a single checkbox list (3–6 concrete file edits max).

### 2) Research (OPTIONAL — skip by default)

Only if you need a current external API shape or competitor behavior you will implement **this cycle**:

- At most **one** WebSearch and one WebFetch.
- Write takeaway to `.claude/research-cache/<yyyyMMdd-HHmm>-auto-improve.md` (3–10 lines).
- Do **not** block implementation on research theater.

### 3) Implement

- Change core first when logic is shared; faces stay thin.
- Match existing style; no drive-by refactors.
- New providers/media go behind existing adapter patterns.

### 4) Verify

```powershell
New-Item -ItemType Directory -Force -Path .claude/tmp | Out-Null
npm run build *> .claude/tmp/ai-build.log
if ($LASTEXITCODE -ne 0) { Get-Content .claude/tmp/ai-build.log -Tail 50; throw "build failed" }
# Prefer package-scoped tests for speed:
npx vitest run packages/core/test packages/cli/test --reporter=dot *> .claude/tmp/ai-test.log
Get-Content .claude/tmp/ai-test.log -Tail 30
```

Live LLM: only free/local if already configured; otherwise `Live: SKIP` and still commit if offline verify passed.

### 5) Commit

Only if verify passed.

```text
auto-improve: <what> — FUTURE-PLAN Phase <N>

Why: <mission / replacement target>
Verify: build PASS; tests PASS|partial; live SKIP|PASS
```

Push if remote configured and policy allows; never force-push. Release lock.

### 6) Log (always)

Append to `.claude/auto-improve-log.log` using the RESULTS-CONTRACT template.  
If you promoted CERTAIN, also edit `docs/FUTURE-PLAN.MD` Certainty Register.

Re-seed queue from `plan/improvement-plan.md` if empty.

### 7) Stop or next

One solid commit beats three half-cycles. Only start a second focus if the first is committed and context is still healthy.

## Guardrails

- Never research-only cycles.
- Never paid API calls without user keys already present.
- Never secrets in commits.
- Never force-push.
- Never start Phase 4 industrial work unless the user explicitly asks.
- Windows-first shell; see RESULTS-CONTRACT.

## Anti-patterns (do not do these)

- Three mandatory web searches before coding  
- Unconditional compact mid-edit  
- Aborting solely because `.auto-improve.lock` exists for < 30 min without file conflict  
- “Improve the GUI” with no FUTURE-PLAN item  
- Large multi-subsystem PRs in one cycle  
