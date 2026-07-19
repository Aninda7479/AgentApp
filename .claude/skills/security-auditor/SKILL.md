---
name: security-auditor
description: Proactively hunts and fixes security vulnerabilities in SuperAgent every 6 hours. Runs npm audit, searches for recent CVEs in the tech stack (Electron, Node.js, IPC), greps the codebase for injection patterns, fixes verified issues, and commits each fix as an isolated atomic commit. Never commits a fix that didn't also pass the full build+test suite.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "electron-ipc", "npm-deps", "xss", "injection"]
---

# /security-auditor — Proactive Security Scan & Fix Loop

## Purpose

Security debt compounds silently. This skill runs every 6 hours to catch it before users do.
It finds real, codebase-specific issues — not generic advice — and fixes them.

## Context & Memory Contract

**Compact at every `→ COMPACT` checkpoint, unconditionally.**
Before every compact: write current scan phase + any unfixed findings to TodoWrite.
`.claude/auto-improve-log.log`: `tail -n 150` only. Source files: `Grep` first, `Read` with `offset`/`limit`.

## Step 0 — Orient & Lock

```bash
LOCK=.claude/.auto-improve.lock
if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(date -r "$LOCK" +%s 2>/dev/null || echo 0) ))
  if [ "$age" -lt 540 ]; then echo "LOCK_HELD"; exit 2; fi
fi
printf '{"pid":%d,"started":"%s"}\n' "$$" "$(date -u +%FT%TZ)" > "$LOCK"
```

If LOCK_HELD: log skipped for lock contention, exit cleanly.

`tail -n 150 .claude/auto-improve-log.log` — check for recent `[security-auditor]` entries to
avoid re-fixing things already patched this week.

## Step 1 — npm Audit (Always First)

```bash
mkdir -p .claude/research-cache
npm audit --json > .claude/research-cache/npm-audit-$(date +%Y%m%d-%H%M).json 2>&1
# Show only critical/high findings
npm audit --audit-level=high 2>&1 | head -50
```

Parse the JSON for `critical` and `high` severity findings. List them. These are your primary work queue.

If `npm audit` exits 0 with no high/critical findings: note that and move to Step 2 (code patterns).

## Step 2 — Online Research (Mandatory — 3 Searches)

```bash
# Determine Electron version
ELECTRON_VER=$(node -e "console.log(require('./packages/desktop/node_modules/electron/package.json').version || 'unknown')" 2>/dev/null || echo "unknown")
NODE_VER=$(node --version)
```

**Required searches:**
1. `"Electron ${ELECTRON_VER} security advisory CVE $(date +%Y)"` — Electron-specific CVEs
2. `"Node.js IPC sandbox escape electron security 2026"` — runtime attack surface
3. `"npm <package-with-vuln> fix upgrade path 2026"` (use the top npm audit finding, or "electron contextIsolation best practices 2026" if audit is clean)

Write to `.claude/research-cache/$(date +%Y%m%d-%H%M)-security-auditor.md`:
```
RESEARCH LOG — [security-auditor] [DATE TIME]
npm audit: <count> critical, <count> high findings
Search 1: "<query>" → Source: <url> — Takeaway: <one line>
Search 2: "<query>" → Source: <url> — Takeaway: <one line>
Search 3: "<query>" → Source: <url> — Takeaway: <one line>
Decision: <fix priority order>
```

**→ COMPACT** (write findings list + step to TodoWrite)

## Step 3 — Code Pattern Scan

Run targeted greps for common injection and misuse patterns:

```bash
# IPC injection / shell injection
grep -rn "shell: true" packages/ --include="*.ts" --include="*.js" -l
grep -rn "exec\|execSync\|spawn" packages/ --include="*.ts" | grep -v "test\|spec\|node_modules"

# XSS vectors in renderer
grep -rn "innerHTML\|dangerouslySetInnerHTML\|eval(" packages/ --include="*.tsx" --include="*.ts" | grep -v "node_modules\|test"

# Unvalidated user input into file paths
grep -rn "join(.*req\|join(.*param\|join(.*user" packages/ --include="*.ts" | grep -v node_modules

# contextIsolation / nodeIntegration settings
grep -rn "nodeIntegration\|contextIsolation\|webSecurity" packages/desktop/src/ --include="*.ts"
```

For each match: read 10 lines of context (`Read` with `offset`/`limit`) to determine if it's
genuinely exploitable vs. a false positive. Note real findings.

## Step 4 — Fix One Issue at a Time

For each confirmed vulnerability (npm audit critical/high first, then code patterns):

1. Research the specific fix:
   - For npm dep: verify `npm update <package>` is safe (read changelog for breaking changes first)
   - For code pattern: verify the safe alternative from research sources
2. Implement the fix — one atomic change per finding
3. Run build + tests after each fix:
   ```bash
   npm run build > /tmp/sec-build.log 2>&1
   npm test > /tmp/sec-test.log 2>&1
   cat /tmp/sec-build.log | tail -10
   cat /tmp/sec-test.log | tail -10
   ```
4. If tests fail: revert the specific fix, log it as "attempted but blocked — <reason>", move to next finding
5. If tests pass: commit immediately (atomic commit per fix):
   ```
   security: fix <vulnerability name> in <package/file>
   
   Research: <source URL>
   Finding: <what was vulnerable and why>
   Fix: <what was changed>
   Verify: npm audit PASS + build PASS + tests PASS
   ```

**→ COMPACT** after every 2 fixes (security fixes can touch many files — keep context light)

## Step 5 — Verify Final State

After all fixes committed:
```bash
npm audit --audit-level=high 2>&1 | tail -5
npm run build > /tmp/sec-final-build.log 2>&1 && echo "BUILD OK"
npm test > /tmp/sec-final-test.log 2>&1 && echo "TESTS OK"
```

## Step 6 — Log

Append to `.claude/auto-improve-log.log`, tagged `[security-auditor]`:
```
## YYYY-MM-DD HH:MM — [security-auditor]
Researched: npm audit + 3 CVE searches (see research cache file)
Research file: .claude/research-cache/<filename>
Findings: <count critical>, <count high> npm audit; <count> code pattern issues
Fixed: <list of commit hashes + what each fixed>
Skipped: <list of issues that couldn't be safely fixed + reason>
Static verify: build PASS, tests PASS (or details of what failed)
Committed: <hashes | "not committed — reason">
Next priority queue: <unfixed issues for next cycle>
Open questions: <issues needing human decision e.g. breaking dependency upgrade>
```

Release lock: `rm -f .claude/.auto-improve.lock`

**→ COMPACT**

## Guardrails

- Never commit a fix that failed the build or tests — a broken build is worse than the vulnerability.
- Never update a major version of a dependency without checking the changelog for breaking changes.
- Never commit secrets or scan artifacts with real API keys.
- One commit per fix — no omnibus "fix everything" commits.
- Release the shared lock even on early exit.
