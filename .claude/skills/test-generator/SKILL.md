---
name: test-generator
description: Writes behavior-focused vitest tests for SuperAgent modules that unlock CERTAIN promotions or protect Phase 0/1/2 code. One module per cycle; commit only when new tests pass. Prefer FUTURE-PLAN critical paths over random coverage chasing.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite
argument-hint: [optional module, e.g. "orchestrator/router", "providers/ai-engine", "storage/conversation-store", "cli engine"]
---

# /test-generator — Tests that unlock certainty

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**Prefer targets that serve:** Phase 0 smokes, engine tool loop, orchestrator, storage, media jobs, hooks (when present).

## Cycle

### 0) Orient

```powershell
Get-Content .claude/auto-improve-log.log -Tail 50 -ErrorAction SilentlyContinue
# Prefer modules named in FUTURE-PLAN Phase 0/1 over lowest-coverage trivia
```

Soft lock `test-generator`.

### 1) Pick module

1. `$ARGUMENTS`  
2. Untested path blocking a CERTAIN promotion  
3. Recently changed core files without tests  
4. Only then generic low coverage  

### 2) Write 5–10 behavior tests

- Location: mirror package conventions (`packages/*/test` or colocated `*.test.ts`)  
- Mock network/fs only  
- No snapshot-only fluff  
- No research web searches required  

### 3) Run + commit

```powershell
npx vitest run <test-file> --reporter=verbose *> .claude/tmp/tg.log
# fix until green; drop individual tests that cannot pass after 2 attempts and log why
```

Prefix: `test:`. Tag `[test-generator]`.

## Guardrails

- Never commit failing tests.  
- One primary file per cycle.  
- If you find a product bug, fix only if tiny; else queue for `/auto-improve`.  
