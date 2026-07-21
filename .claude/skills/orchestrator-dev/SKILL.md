---
name: orchestrator-dev
description: Results-first development of SuperAgent model orchestration — task classifier, router, health/fallback, ensembling, modality bridge. Implements one routing improvement per cycle with offline tests. Research optional (max 1) when provider API shapes change.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "fallback-chains", "task-classifier", "free-tier-pool", "modality-bridge", "ensemble"]
---

# /orchestrator-dev — Multi-model routing that ships

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**North star:** `docs/FUTURE-PLAN.MD` mission points 1–2 + media modality routing  
**Code:** `packages/core/src/orchestrator/`, `packages/core/src/providers/`

## Why

SuperAgent’s differentiator is **not** being stuck on one model. This skill hardens routing, fallback, free/local preference, and modality bridging — with **tests**, not catalog essays.

## Priority order

1. Fallback + health when provider errors (locked / rate limit / down)  
2. Free/local pool selection correctness (`isFreeModel` agreement with UI)  
3. Task classifier accuracy on a fixed fixture set  
4. Modality bridge (image/video/audio → capable model)  
5. Ensemble / best-of-n only after 1–4 are tested  
6. Reasoning-effort normalization  

## Cycle

### 0) Orient

```powershell
Get-ChildItem packages/core/src/orchestrator
Get-Content .claude/auto-improve-log.log -Tail 60 -ErrorAction SilentlyContinue
```

Soft lock `orchestrator-dev`. Prefer offline synthetic cases (many `router-*.test.ts` already exist — extend them).

### 1) One focus → tests first or with code

Add/extend vitest cases under `packages/core/src/orchestrator/*test*` or `packages/core/test`.

### 2) Research (optional, max 1)

Only if a **connected** provider changed API/model IDs this month.

### 3) Implement + verify

```powershell
npx vitest run packages/core/src/orchestrator --reporter=dot *> .claude/tmp/orch-test.log
npm run build *> .claude/tmp/orch-build.log
```

Live calls optional (Ollama preferred). Commit prefix `orchestrator-dev:`.

### 4) Log

Tag `[orchestrator-dev]`. If `app-structure.log` exists, update the orchestrator section briefly; if not, skip creating large docs — log is enough.

## Guardrails

- Never make orchestrator itself require one provider.  
- Never paid live calls.  
- No three-search ritual.  
- No unconditional compact.  
