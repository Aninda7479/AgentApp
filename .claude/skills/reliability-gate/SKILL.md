---
name: reliability-gate
description: Promotes SuperAgent capabilities from "partial" to CERTAIN per docs/FUTURE-PLAN.MD. Writes/runs smoke tests across Core/CLI/Desktop/Web, records evidence in the Certainty Register, and refuses vaporware claims. Use when reliability is low, "nothing is 100% sure", or Phase 0 work is needed.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite
argument-hint: [optional capability id, e.g. "cli-chat-tool", "desktop-send", "byok-connect", "mcp-list"]
---

# /reliability-gate — Make “100% sure it works” real

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**North star:** `docs/FUTURE-PLAN.MD` §0 Honesty gate + Certainty Register  
**Backlog:** `plan/improvement-plan.md` Phase 0

## Why this skill exists

FUTURE-PLAN currently says **none** of Core/App/CLI/Web is 100% proven. Other skills invent features while the base loop is still partial. This skill **only** hardens and certifies.

## CERTAIN checklist (all required)

For capability **C** on surface **S**:

1. Automated test exists (unit or integration) that fails if C breaks.  
2. Build passes for packages that implement C.  
3. Smoke procedure documented (command or short script under `docs/SMOKE.md` or package test).  
4. Smoke run this cycle: PASS, or SKIP with reason if hardware/GUI cannot run in this environment — then mark **PROVISIONAL** not CERTAIN.  
5. Row added/updated in FUTURE-PLAN Certainty Register.  
6. No known open P0 for C.

## Cycle

### 0) Orient

```powershell
Get-Content docs/FUTURE-PLAN.MD -TotalCount 80
Get-Content plan/improvement-plan.md -TotalCount 60
Get-Content .claude/auto-improve-log.log -Tail 60 -ErrorAction SilentlyContinue
git status
```

Soft lock, skill name `reliability-gate`.

### 1) Pick target

Default order if no `$ARGUMENTS`:

1. CLI chat + tool call (file read)  
2. Core tool-loop error path  
3. BYOK connect / list models  
4. MCP list tools  
5. Desktop send message (if Electron testable; else document manual smoke)  
6. Web send message  

### 2) Implement proof, not features

- Prefer tests in `packages/cli/test`, `packages/core/test`, `packages/web/test`, `packages/desktop/test`.  
- Use mocks for providers when no free key (offline CERTAIN still counts if the contract is real).  
- Add `docs/SMOKE.md` section with exact commands.  
- Fix product bugs **only** if they block the smoke; otherwise log for `/auto-improve`.

### 3) Verify

```powershell
New-Item -ItemType Directory -Force -Path .claude/tmp | Out-Null
npm run build *> .claude/tmp/rel-build.log
npx vitest run <your-test-files> --reporter=verbose *> .claude/tmp/rel-test.log
Get-Content .claude/tmp/rel-test.log -Tail 40
```

### 4) Register + commit

Update Certainty Register table in `docs/FUTURE-PLAN.MD`.

```text
reliability-gate: CERTAIN <capability> on <surfaces>

Evidence: <test path>; smoke: <command or SKIP>
Verify: build PASS; tests PASS
```

### 5) Log

Tag `[reliability-gate]`. Queue next Phase 0 item. Release lock.

## Guardrails

- Do **not** add product features outside the smoke path.  
- Do **not** mark CERTAIN without automated evidence.  
- Desktop GUI may be PROVISIONAL if only manual smoke is possible in CI-less env — say so honestly.  
- No research web crawls required.  
