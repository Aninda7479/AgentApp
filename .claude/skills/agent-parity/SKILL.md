---
name: agent-parity
description: Builds coding-agent parity features SuperAgent needs to replace Antigravity/Claude/OpenAI agents and CLIs — hooks, checkpoints/rewind, session resume, skills v2, subagents, plan mode. Implements one Phase 1 item per cycle with tests. Use when improving agent/CLI depth.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "hooks", "checkpoints", "sessions", "skills-v2", "subagents", "plan-mode"]
---

# /agent-parity — Replace locked-in coding agents

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**North star:** `docs/FUTURE-PLAN.MD` Pillars A + B  
**Backlog:** `plan/improvement-plan.md` Phase 1  
**Detail:** `plan/claude-code-gap-analysis.md` (reference only — do not boil the ocean)

## Priority order (do in this order unless `$ARGUMENTS` overrides)

1. Hooks MVP (`PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`)  
2. Checkpoints + rewind  
3. Session continue / resume / fork  
4. Skills v2 (args, allowlists, stacking)  
5. Subagents frontmatter + worktree isolation  
6. Plan mode + permission rules  
7. Code-review depth  

**Gate:** If Phase 0 has zero CERTAIN rows, prefer `/reliability-gate` or a tiny CERTAIN-enabling fix first — unless user forced a Phase 1 focus.

## Cycle

### 0) Orient

```powershell
git log --oneline -15
Get-Content .claude/auto-improve-log.log -Tail 80 -ErrorAction SilentlyContinue
# Find existing hooks/session/skill code
```

Grep before inventing:

```text
PreToolUse|checkpoint|rewind|SkillStore|side.?agent|plan mode
```

Soft lock, skill `agent-parity`.

### 1) Design slice

Write 3–6 TodoWrite items that ship a **vertical slice**:

- Core types + implementation  
- One CLI command or flag wired  
- Tests  
- Optional thin Desktop hook only if trivial  

Avoid “design doc only” cycles.

### 2) Research (optional, max 1)

Only if implementing a public API/config format (e.g. hooks.json schema). Prefer existing SuperAgent config style over cloning Claude’s file names blindly — use `.superagent/` when introducing new paths.

### 3) Implement in core first

Faces (CLI/Desktop/Web) must call core — no second engine.

### 4) Verify + commit + log

Same as RESULTS-CONTRACT. Commit message prefix: `agent-parity:`.

Tag log `[agent-parity]`. Update Phase 1 checkboxes in `plan/improvement-plan.md` when done.

## Guardrails

- One Phase 1 checkbox per cycle.  
- No plugin marketplace / cloud routines until hooks + sessions exist.  
- No industrial CAD.  
- Windows-first.  
