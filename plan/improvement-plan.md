# SuperAgent Improvement Plan

**Date:** 2026-07-21 (rewritten)  
**North star:** [`docs/FUTURE-PLAN.MD`](../docs/FUTURE-PLAN.MD)  
**Competitive detail (coding only):** [`claude-code-gap-analysis.md`](./claude-code-gap-analysis.md)

This plan is ordered for **results**: certainty first, then agent/CLI replacement, then 3D/video replacement. Industrial CAD/CAE is deferred.

---

## How to use this plan

1. Auto skills pull the top unchecked item in the **active phase**.
2. One PR / one skill cycle = one checkbox (or a vertical slice of it).
3. When a capability meets the CERTAIN definition in FUTURE-PLAN, check it **and** update the Certainty Register.
4. Do not start Phase N+1 work while Phase N has zero CERTAIN exits (exception: critical security fixes).

---

## Phase 0 — Reliability (move “None” → real CERTAIN rows)

### 0.1 Smoke matrix
- [x] CERTAIN-1: CLI chat turn + one tool call (read file) — mock or free/local model
- [x] CERTAIN-2: Core engine tool loop unit tests for tool success + tool error
- [ ] CERTAIN-3: Desktop send message end-to-end (manual script + automated if possible)
- [ ] CERTAIN-4: Web send message smoke
- [ ] CERTAIN-5: BYOK provider connect + list models (no network secret leakage)
- [ ] CERTAIN-6: MCP list/connect smoke
- [ ] Document smoke commands in `docs/DEVELOPMENT.md` or a new `docs/SMOKE.md`
- [ ] Update FUTURE-PLAN Certainty Register for each pass

### 0.2 Cross-surface consistency
- [ ] Same core engine path for CLI / Desktop / Web (no face re-implementation regressions)
- [ ] Shared error messages for offline / rate-limit / missing key
- [ ] One “doctor” command/path reports provider + MCP + storage health on all surfaces

**Phase 0 exit:** ≥5 CERTAIN rows; smoke doc exists.

---

## Phase 1 — Agent + CLI replacement

Targets: Antigravity Agent/CLI, Claude Desktop/Code, OpenAI Work/Codex.

### 1.1 Hooks system
- [ ] Events: `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`, `Stop`
- [ ] Handlers: command (shell) + HTTP
- [ ] Matchers: tool name / regex
- [ ] Project + global config paths (`.superagent/hooks.json`, user config)
- [ ] Tests + CERTAIN smoke (hook fires on tool use)

### 1.2 Checkpoints & rewind
- [ ] Auto-snapshot before agent file writes / turn
- [ ] Keep N recent checkpoints per session
- [ ] `/rewind` CLI + Desktop UI entry
- [ ] Restore: code / conversation / both
- [ ] Persist with session; tests + CERTAIN

### 1.3 Session management
- [ ] Session naming
- [ ] `--continue` / `--resume` picker
- [ ] `--fork-session`
- [ ] Transcript search
- [ ] Export + cleanup policy

### 1.4 Skills v2
- [ ] `$ARGUMENTS` / named args
- [ ] Dynamic `` !`command` `` injection
- [ ] `allowed-tools` / `disallowed-tools`
- [ ] Skill stacking; model override; `context: fork`
- [ ] Nested monorepo discovery

### 1.5 Subagents v2
- [ ] Frontmatter agents in `.superagent/agents/`
- [ ] Worktree isolation
- [ ] Nested subagents; @-mention
- [ ] Per-agent memory / MCP / hooks

### 1.6 Permissions & plan mode
- [ ] Plan mode (read-only explore → approve → execute)
- [ ] Permission rule syntax
- [ ] Workspace trust dialog (Desktop)

### 1.7 Code review depth
- [ ] Multi-agent `/code-review`
- [ ] GitHub PR comments when token present
- [ ] Severity classes + REVIEW.md

**Phase 1 exit:** Hooks + checkpoints + resume are CERTAIN on CLI; Desktop exposes the same behaviors.

---

## Phase 2 — 3D + Video replacement

Targets: Tripo3D.ai, HiggsField-class video tools.

### 2.1 Media adapter contract
- [ ] Single capability interface: create job → poll → download → gallery entry
- [ ] Cost/quota hooks for BYOK
- [ ] Orchestrator modality routing uses the contract

### 2.2 3D (Tripo-class)
- [ ] Provider A adapter (primary)
- [ ] Provider B adapter (fallback / open)
- [ ] Text-to-3D + image-to-3D
- [ ] GLB preview in Desktop Studio
- [ ] Export path + CERTAIN smoke

### 2.3 Video (HiggsField-class)
- [ ] Provider A + B adapters
- [ ] Text-to-video + image-to-video
- [ ] Job UI + gallery + export
- [ ] CERTAIN smoke on at least one free/local or documented paid-key path

**Phase 2 exit:** User can generate a 3D asset and a video without leaving SuperAgent, with provider choice.

---

## Phase 3 — GUI + distribution polish

- [ ] Atmosphere-dashboard tokens applied to Workspace, Settings, Studio, Tasks
- [ ] Mobile/responsive composer certainty
- [ ] Installer + auto-update smoke (Win first)
- [ ] Marketing site claims only CERTAIN features

---

## Phase 4 — Industrial (deferred)

ECAD / MCAD / CAE — Altium, SolidWorks, Ansys, NX, Creo, Nastran.

- [ ] Gate: Phase 0–2 exits met
- [ ] Exchange formats first (STEP, IGES, Gerber, netlist)
- [ ] Job runner adapters for simulation, not full UI clones

---

## Skill → phase ownership

| Skill | Owns |
|-------|------|
| `/reliability-gate` | Phase 0 certainty promotions |
| `/auto-improve` | Any top queue item; prefers Phase 0 then 1 |
| `/agent-parity` | Phase 1 coding-agent gaps |
| `/orchestrator-dev` | Multi-provider routing for A–D |
| `/media-capability` | Phase 2 3D/video |
| `/provider-scout` | New providers serving A–D |
| `/test-generator` | Tests that unlock CERTAIN |
| `/security-auditor` | Always-on; can interrupt any phase |
| `/dependency-guardian` | Always-on deps hygiene |
| `/art-director`, `/atmosphere-dashboard`, `/ux-critic` | Phase 3 GUI |

---

## Queue seed (copy into log when empty)

```
Next priority queue:
  1. [P0] CERTAIN-1 CLI chat+tool smoke + register
  2. [P0] Core engine tool-loop failure-path tests
  3. [P1] Hooks MVP PreToolUse/PostToolUse
  4. [P1] Checkpoints + rewind skeleton
  5. [P1] Session --continue/--resume
  6. [P2] 3D adapter contract + first provider
  7. [P2] Video job poller + second provider path
```
