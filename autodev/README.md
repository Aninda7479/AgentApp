# SuperAgent Autonomous Auto-Improvement Drivers (`autodev/`)

This directory contains the drivers, pre-flight verification tools, and configuration for the SuperAgent autonomous self-improvement system.

**Product north star:** [`docs/FUTURE-PLAN.MD`](../docs/FUTURE-PLAN.MD)  
**Skill rules (results-first):** [`.claude/skills/_shared/RESULTS-CONTRACT.md`](../.claude/skills/_shared/RESULTS-CONTRACT.md)  
**Skill index:** [`.claude/skills/README.md`](../.claude/skills/README.md)  
**Operator guide:** [`Auto-Improve-Guide.md`](../Auto-Improve-Guide.md)

Recommended first skill: `/reliability-gate` (Certainty Register is empty until Phase 0 runs).

## Documentation & Setup Guides

Complete guides and documentation have been moved to [`docs/auto-improvement-system/`](../docs/auto-improvement-system/):

- **[Master System Guide](../docs/auto-improvement-system/README.md)** — Architecture, skills, Playwright isolation fix, pause/resume
- **[Windows Desktop & PC Setup Guide](../docs/auto-improvement-system/windows-desktop-setup.md)** — Windows Task Scheduler, Desktop Agent App, PowerShell setup
- **[VPS & Linux Setup Guide](../docs/auto-improvement-system/vps-linux-setup.md)** — Headless Linux, systemd service setup
- **[Branch & PR Review Workflow](../docs/auto-improvement-system/branch-pr-workflow.md)** — How to review auto-generated PRs
- **[Tools Verification Guide](../docs/auto-improvement-system/tools-verification.md)** — Pre-flight tool check details

---

## Directory Contents

| File | Purpose |
|------|---------|
| `run-auto-improve.ps1` | Windows PowerShell loop driver (Claude Code CLI) |
| `run-auto-improve.sh` | Linux/Bash loop driver (Claude Code CLI) |
| `run-auto-improve-superagent.ps1` | Windows PowerShell loop driver (SuperAgent CLI) |
| `run-auto-improve-superagent.sh` | Linux/Bash loop driver (SuperAgent CLI) |
| `verify-tools.ps1` | Pre-flight tool verification script (Windows) |
| `verify-tools.sh` | Pre-flight tool verification script (Linux) |
| `loop-config.json` | Schedule configuration & branch settings |
| `superagent-auto-improve.env.example` | Environment variable configuration template |
| `superagent-auto-improve@.service` | Systemd template service unit (Linux) |

---

## Quick Verification

Before running any driver, run pre-flight verification:

**Windows**:
```powershell
.\autodev\verify-tools.ps1
```

**Linux**:
```bash
./autodev/verify-tools.sh
```
