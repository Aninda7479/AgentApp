# SuperAgent agent skills

Skills live under `.claude/skills/<name>/SKILL.md` and are used by Claude Code, SuperAgent, or the autodev loop.

## Read first

| File | Role |
|------|------|
| [`_shared/RESULTS-CONTRACT.md`](./_shared/RESULTS-CONTRACT.md) | **Why cycles failed before + hard rules for every skill** |
| [`docs/FUTURE-PLAN.MD`](../../docs/FUTURE-PLAN.MD) | Product north star + Certainty Register |
| [`plan/improvement-plan.md`](../../plan/improvement-plan.md) | Ordered backlog |
| [`auto-improve-log.log`](../auto-improve-log.log) | Shared queue + evidence |

## Skill map

| Skill | When to run | Phase |
|-------|-------------|-------|
| `/reliability-gate` | Nothing is CERTAIN; need smokes | 0 |
| `/auto-improve` | General “improve the product” | 0→3 |
| `/agent-parity` | Hooks, rewind, sessions, skills v2 | 1 |
| `/orchestrator-dev` | Routing, fallback, free pool | A–D |
| `/media-capability` | 3D / video replacement | 2 |
| `/provider-scout` | Add one provider | A–D |
| `/test-generator` | Tests for CERTAIN / critical paths | any |
| `/security-auditor` | Vulns | always |
| `/dependency-guardian` | Safe deps | always |
| `/art-director` | Visual redesign one page | 3 |
| `/atmosphere-dashboard` | Apply design tokens | 3 |
| `/ux-critic` | Findings only (no code) | 3 |
| `/playwright-check` | Subprocess for art-director | — |
| `/playwright-audit` | Subprocess for ux-critic | — |

## Success definition

A skill run **succeeds** only if it commits working code, promotes CERTAIN, or fixes a P0 security issue.  
Research-only runs are **failed cycles** (see RESULTS-CONTRACT).
