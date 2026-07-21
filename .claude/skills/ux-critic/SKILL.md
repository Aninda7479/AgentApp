---
name: ux-critic
description: Observation-only UX audit for SuperAgent. Produces ranked, actionable findings in auto-improve-log for implementers. Playwright via /playwright-audit subprocess only when available; otherwise static review of renderer flows. Never edits app code.
allowed-tools: Read, Grep, Glob, Bash, Write, TodoWrite
argument-hint: [optional flow, e.g. "first-time-setup", "provider-connect", "video-gen", "mobile"]
---

# /ux-critic — Actionable findings only

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**Does not edit product code.** Success = useful queue items, not screenshots theater.

## Cycle

### 0) Orient

Tail log for recent `[ux-critic]` personas. Soft lock only if needed for log write consistency.

### 1) Pick persona/flow

Rotate: first-run BYOK → send message → media gen → settings → mobile width → error paths.

### 2) Audit

**Preferred:** launch `/playwright-audit` subprocess if environment supports it; read JSON findings only.

**Fallback (always available):** static walkthrough via reading `packages/desktop/src/renderer` / web routes — document exact UI strings and missing states. Mark `Method: static`.

### 3) Log findings (required format)

```
## YYYY-MM-DD HH:MM — [ux-critic] <persona>
Method: playwright|static
Next priority queue:
  1. [HIGH] <file or screen> — <problem> — <concrete fix>
  2. [MEDIUM] ...
Open questions: ...
```

Weak: “feels clunky.”  
Strong: “Composer Send has no disabled+spinner state during runManager.isRunning — double-submit risk. Fix in Composer.tsx.”

## Guardrails

- Never call Playwright tools in this session.  
- Never fabricate browser results.  
- No mandatory web research.  
