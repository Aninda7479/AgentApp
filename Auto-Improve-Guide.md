# SuperAgent auto-improvement guide

Autonomous skills improve SuperAgent toward [`docs/FUTURE-PLAN.MD`](docs/FUTURE-PLAN.MD).  
They must follow [`.claude/skills/_shared/RESULTS-CONTRACT.md`](.claude/skills/_shared/RESULTS-CONTRACT.md).

## What changed (2026-07-21)

Previous skills often **produced zero commits**: mandatory triple web research, Unix-only shell, forced compact, hard live-LLM gates, and an empty priority queue.  

**Now:**

- Results before research (max 1 search when needed)  
- Windows-first commands (`.claude/tmp/` logs)  
- Soft 30-minute lock  
- Seeded queue in `.claude/auto-improve-log.log`  
- Phase 0 `/reliability-gate` before feature sprawl  
- Product pillars: agent/CLI replacement, Tripo-class 3D, HiggsField-class video  

## Step 1 — Pre-flight

```powershell
cd d:\Project\OpenSource\AgentApp
.\autodev\verify-tools.ps1
```

## Step 2 — Env

```powershell
Copy-Item autodev\superagent-auto-improve.env.example autodev\superagent-auto-improve.env
# Edit API keys / REPO_DIR / BASE_BRANCH=agent-development
```

## Step 3 — Recommended first cycles

```powershell
# 1) Make something CERTAIN
$env:SKILL = "/reliability-gate"
.\autodev\run-auto-improve.ps1

# 2) General backlog (hooks, etc. after Phase 0 starts filling)
$env:SKILL = "/auto-improve"
.\autodev\run-auto-improve.ps1

# 3) Coding-agent parity
$env:SKILL = "/agent-parity"
.\autodev\run-auto-improve.ps1

# 4) 3D / video
$env:SKILL = "/media-capability"
.\autodev\run-auto-improve.ps1
```

Or inside SuperAgent / Claude Code: run the same slash commands against this repo.

## Step 4 — Schedule (optional)

| Skill | Interval | Notes |
|-------|----------|-------|
| `/reliability-gate` | daily until 5 CERTAIN rows | Phase 0 |
| `/auto-improve` | 30–60 min | Queue-driven |
| `/agent-parity` | 2–4 h | Phase 1 |
| `/orchestrator-dev` | 4 h | Routing |
| `/media-capability` | 4–8 h | Phase 2 |
| `/test-generator` | 4 h | Critical paths |
| `/security-auditor` | 6 h | P0 interrupt |
| `/dependency-guardian` | 12 h | Patch/minor only |
| `/provider-scout` | 8 h | One provider |
| `/ux-critic` | 8 h | Findings only |
| `/art-director` | 8 h | One page |

Use Task Scheduler (Windows) or systemd (Linux) as before; set `SKILL` per task.

## Step 5 — Judge success

After each run check:

1. `git log -1` — did a real commit land?  
2. `.claude/auto-improve-log.log` — queue advanced?  
3. `docs/FUTURE-PLAN.MD` Certainty Register — any promotion?  

If the log gains research files but **no commits**, the cycle failed — fix environment (build errors, lock stuck >30m) rather than adding more process.

## SuperAgent CLI loop

```powershell
$env:SKILL = "/auto-improve"
.\autodev\run-auto-improve-superagent.ps1
```

## Related docs

- [`docs/FUTURE-PLAN.MD`](docs/FUTURE-PLAN.MD)  
- [`docs/SMOKE.md`](docs/SMOKE.md)  
- [`plan/improvement-plan.md`](plan/improvement-plan.md)  
- [`docs/auto-improvement-system/README.md`](docs/auto-improvement-system/README.md)  
