---
name: security-auditor
description: Finds and fixes real SuperAgent security issues (npm high/critical, Electron IPC, injection). One verified fix per cycle with build+tests. Can interrupt other phase work for P0s.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "electron-ipc", "npm-deps", "xss", "path-traversal"]
---

# /security-auditor — Fix real vulns

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`

## Cycle

### 0) Orient + soft lock `security-auditor`

### 1) Collect findings (offline first)

```powershell
New-Item -ItemType Directory -Force -Path .claude/tmp, .claude/research-cache | Out-Null
npm audit --audit-level=high *> .claude/tmp/npm-audit.txt
Get-Content .claude/tmp/npm-audit.txt -Tail 40
```

Grep code (use Grep tool, not Unix-only pipelines):

- `shell: true`, unsafe `exec`/`spawn`  
- `innerHTML` / `dangerouslySetInnerHTML` / `eval(`  
- `nodeIntegration` / `contextIsolation` / `webSecurity`  
- path joins with user input  

### 2) Research (optional, max 1)

Only for the single issue you will fix (CVE/changelog).

### 3) Fix ONE issue

- Atomic change  
- Build + tests must pass  
- Revert if red  

Commit: `security: fix <name>`. Tag `[security-auditor]`.

## Guardrails

- No omnibus security PR.  
- No major dep bumps without changelog confidence (else open question).  
- Never commit secrets or full audit JSON with env data.  
