---
name: dependency-guardian
description: Safely updates SuperAgent npm dependencies — security patches and minor/patch bumps only after changelog check. One package per cycle; revert on build/test failure. Never auto-major Electron.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional package name]
---

# /dependency-guardian — Safe updates

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`

## Cycle

### 0) Soft lock `dependency-guardian`

### 1) Inventory

```powershell
npm audit --audit-level=high *> .claude/tmp/dep-audit.txt
npm outdated --workspaces *> .claude/tmp/outdated.txt
Get-Content .claude/tmp/dep-audit.txt -Tail 20
Get-Content .claude/tmp/outdated.txt -TotalCount 40
```

Priority: critical/high audit → patch outdated → minor (after check) → major = human open question only.

### 2) Research (max 1) for the chosen package

Breaking changes yes/no.

### 3) Update one package → build → test → commit or revert

Prefix: `deps:`. Tag `[dependency-guardian]`.

## Guardrails

- Never `npm audit fix --force` blindly.  
- Never major-bump `electron` without human.  
- Windows-first logs under `.claude/tmp/`.  
