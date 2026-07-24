# SuperAgent Auto-Improvement System

SuperAgent improves itself. This directory explains how.

## Architecture (2026-07 rewrite)

```
┌─────────────────────────────────────────────────────────────┐
│  OUTER LOOP (Task Scheduler / run-loop.ps1 / while)         │
│  Fresh process every iteration — no growing chat history    │
└──────────────────────────┬──────────────────────────────────┘
                           │ claude -p "/skill-loop once"
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  MAIN: /skill-loop  (thin dispatcher)                       │
│  • tail queue log                                           │
│  • pick worker skill                                        │
│  • write .claude/loop/pending-worker.json                   │
│  • spawn-worker.ps1  →  isolated claude -p                  │
│  • read ONLY .claude/loop/result-*.json                     │
│  • append orchestrator line to auto-improve-log.log         │
│  • EXIT  (context discarded)                                │
└──────────────────────────┬──────────────────────────────────┘
                           │ fresh context
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  WORKER: /reliability-gate | /auto-improve | /agent-parity   │
│          /media-capability | /orchestrator-dev | …          │
│  • implements one FUTURE-PLAN item                          │
│  • build + tests                                            │
│  • commit                                                   │
│  • write result JSON                                        │
│  • EXIT                                                     │
└─────────────────────────────────────────────────────────────┘
```

**Why:** Running heavy skills in one long main chat bloats context until the session dies.  
`/skill-loop` never implements product code; workers die with their context.

**North star:** [`docs/FUTURE-PLAN.MD`](../FUTURE-PLAN.MD)  
**Results rules:** [`.claude/skills/_shared/RESULTS-CONTRACT.md`](../../.claude/skills/_shared/RESULTS-CONTRACT.md)  
**Orchestrator skill:** [`.claude/skills/skill-loop/SKILL.md`](../../.claude/skills/skill-loop/SKILL.md)

---

## What each cycle does

1. **Outer loop** starts a fresh `/skill-loop` session  
2. **Dispatcher** picks the next worker from `.claude/auto-improve-log.log`  
3. **Worker** (isolated) researches only if needed, implements, verifies, commits  
4. **Result JSON** returns to dispatcher (small)  
5. **Branch/PR** via `autodev/run-auto-improve.ps1` when commits exist  
6. Sleep → repeat until pause file  

Research is **optional** (max 1 search). A cycle that only writes research is a **failed cycle**.

---

## Skills

### Loop (put this on the schedule)

| Skill | Role |
|-------|------|
| **`/skill-loop`** | Thin orchestrator — only skill you need in Task Scheduler |

### Workers (spawned by skill-loop)

| Skill | Phase | Purpose |
|-------|-------|---------|
| `/reliability-gate` | 0 | Promote capabilities to CERTAIN |
| `/auto-improve` | 0–3 | General backlog item |
| `/agent-parity` | 1 | Hooks, rewind, sessions, skills v2 |
| `/orchestrator-dev` | — | Routing, fallback, free pool |
| `/media-capability` | 2 | 3D / video multi-provider |
| `/provider-scout` | — | One new provider |
| `/test-generator` | — | Behavior tests |
| `/security-auditor` | always | Vulns |
| `/dependency-guardian` | always | Safe deps |
| `/art-director` | 3 | One page visual |
| `/atmosphere-dashboard` | 3 | Design tokens |
| `/ux-critic` | 3 | Findings only |

Nested only: `/playwright-check`, `/playwright-audit` (under art/ux workers).

---

## Quick Start

### Windows — recommended

```powershell
cd D:\Project\OpenSource\AgentApp

# 1. Verify tools
.\autodev\verify-tools.ps1

# 2. Env
Copy-Item autodev\superagent-auto-improve.env.example autodev\superagent-auto-improve.env
# Edit keys; set SKILL=/skill-loop

# 3. Commit or stash local work first (driver skips if tree is dirty)

# 4a. Outer loop (infinite)
.\.claude\skills\skill-loop\run-loop.ps1

# 4b. One orchestrator cycle (branch + draft PR)
$env:SKILL = "/skill-loop"
.\autodev\run-auto-improve.ps1
```

### Pause / resume

```powershell
# Pause
New-Item -ItemType File -Force .claude\.auto-improve.pause

# Resume
Remove-Item .claude\.auto-improve.pause -Force
```

### Linux / VPS

```bash
./autodev/verify-tools.sh
export SKILL=/skill-loop
./autodev/run-auto-improve.sh
# or: bash .claude/skills/skill-loop/spawn-worker.sh  (from inside skill-loop)
```

---

## Files

| Path | Purpose |
|------|---------|
| `autodev/run-auto-improve.ps1` | One cycle: branch → skill → push/PR |
| `.claude/skills/skill-loop/run-loop.ps1` | Outer forever-loop |
| `.claude/skills/skill-loop/spawn-worker.ps1` | Isolated worker process |
| `.claude/loop/pending-worker.json` | Dispatch (runtime) |
| `.claude/loop/result-*.json` | Worker outcome (runtime) |
| `.claude/auto-improve-log.log` | Shared queue + evidence |
| `docs/SMOKE.md` | Certainty smokes |
| `docs/FUTURE-PLAN.MD` | Product plan |

---

## More guides

- [Windows Desktop setup](./windows-desktop-setup.md)
- [VPS / Linux](./vps-linux-setup.md)
- [Branch & PR workflow](./branch-pr-workflow.md)
- [Tools verification](./tools-verification.md)
- [Operator guide](./auto-improve-guide.md)
