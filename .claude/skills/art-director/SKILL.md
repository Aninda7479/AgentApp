---
name: art-director
description: Visual redesign for SuperAgent Desktop/Web pages against .claude/art-direction.md and atmosphere-dashboard tokens. One page per cycle; build must pass. Playwright verification optional via /playwright-check; never block commit on missing browser. Does not fix functional bugs (queue for auto-improve).
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite
argument-hint: [optional page, e.g. "workspace", "settings-providers", "empty-state", "studio"]
---

# /art-director — One page visual pass

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**Design system:** `.claude/skills/atmosphere-dashboard/SKILL.md` + `.claude/art-direction.md`  
**Phase:** FUTURE-PLAN Phase 3 (OK earlier for empty states if Phase 0 not starved)

## Cycle

### 0) Orient

Read art-direction (create only if missing — prefer atmosphere-dashboard tokens). Soft lock `art-director`.

### 1) Pick one page/component

Prefer Workspace, Settings, Studio, EmptyState — product surfaces over marketing.

### 2) Redesign in code

- Structure tokens first, atmosphere only in quiet zones  
- No Playwright in this session  
- No functional logic rewrites  

### 3) Verify

```powershell
npm run build *> .claude/tmp/art-build.log
Get-Content .claude/tmp/art-build.log -Tail 30
```

Optional: write `.playwright/pending-check.json` and run `/playwright-check` **if** `claude` + browser available; else `Visual: SKIP`.

### 4) Commit + log

Prefix: `art-director:`. Tag `[art-director]`. Queue functional bugs for `/auto-improve`.

## Guardrails

- Research web searches **not required** (design system is local).  
- No unconditional compact.  
- Hard cap one page per cycle.  
