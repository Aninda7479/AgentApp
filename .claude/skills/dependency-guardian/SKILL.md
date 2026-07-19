---
name: dependency-guardian
description: Keeps all npm dependencies secure and up-to-date every 12 hours. Runs npm audit, researches breaking changes before updating anything, applies safe updates, runs the full build+test suite, and commits atomically. Never blindly updates major versions — always researches the changelog first.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional package name to focus on, e.g. "electron", "react", "ink"]
---

# /dependency-guardian — Dependency Security & Update Loop

## Purpose

Stale dependencies are the most common source of known vulnerabilities. This skill runs every 12
hours to keep all packages current, patching security issues before they're exploitable, and
keeping minor/patch versions fresh so major updates don't require giant jumps later.

## Context & Memory Contract

**Compact at every `→ COMPACT` checkpoint, unconditionally.**
Before every compact: write current package being updated + test status to TodoWrite.
`.claude/auto-improve-log.log`: `tail -n 150` only.

## Step 0 — Orient & Lock

```bash
LOCK=.claude/.auto-improve.lock
if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(date -r "$LOCK" +%s 2>/dev/null || echo 0) ))
  if [ "$age" -lt 540 ]; then echo "LOCK_HELD"; exit 2; fi
fi
printf '{"pid":%d,"started":"%s"}\n' "$$" "$(date -u +%FT%TZ)" > "$LOCK"
```

`tail -n 150 .claude/auto-improve-log.log` — check recent `[dependency-guardian]` entries to
see what was already updated this week. Avoid re-updating things touched in the last 7 days.

## Step 1 — Audit & Inventory

```bash
mkdir -p .claude/research-cache

# Full audit
npm audit --json > .claude/research-cache/dep-audit-$(date +%Y%m%d-%H%M).json 2>&1

# Show outdated packages (all workspaces)
npm outdated --workspaces 2>&1 | head -50

# Show audit summary
npm audit --audit-level=moderate 2>&1 | tail -10
```

Build a priority list:
1. **Critical/High npm audit findings** — fix these first, regardless of version jump
2. **Packages outdated by 3+ patch versions** — safe to update
3. **Packages outdated by 1 minor version** — safe after changelog check
4. **Major version jumps** — research only, don't auto-update, log as open question

## Step 2 — Online Research (Mandatory — 3 Searches)

Pick the top 1–2 packages from the priority list and research them:

**Required searches:**
1. `"<highest-priority-package> <current-version> to <target-version> breaking changes"` — changelog research
2. `"<package> security advisory fix 2026"` — verify the fix exists in the target version
3. Either `"npm audit fix --force risks 2026"` (if considering force-fix) or
   `"<second package> changelog migration guide"` (if a second package needs research)

Write to `.claude/research-cache/$(date +%Y%m%d-%H%M)-dependency-guardian.md`:
```
RESEARCH LOG — [dependency-guardian] [DATE TIME]
Audit: <N> critical, <N> high, <N> moderate findings
Packages selected for update: <list with current→target version>
Search 1: "<query>" → Source: <url> — Takeaway: <breaking changes yes/no, what>
Search 2: "<query>" → Source: <url> — Takeaway: <fix confirmed in target version>
Search 3: "<query>" → Source: <url> — Takeaway: <other finding>
Decision: <which updates are safe, which to skip, which need human>
```

**→ COMPACT** (write update list + step to TodoWrite)

## Step 3 — Apply Updates (One Package at a Time)

For each package confirmed safe to update:

```bash
# For security-critical npm audit fixes (patch/minor only):
npm audit fix > /tmp/dep-audit-fix.log 2>&1
cat /tmp/dep-audit-fix.log | tail -10

# For specific package update:
npm update <package-name> --workspace=<workspace> > /tmp/dep-update.log 2>&1
cat /tmp/dep-update.log | tail -5
```

**After EACH package update — run full build + tests before continuing to the next:**
```bash
npm run build > /tmp/dep-build.log 2>&1 && echo "BUILD OK" || echo "BUILD FAILED"
npm test > /tmp/dep-test.log 2>&1 && echo "TESTS OK" || echo "TESTS FAILED"
tail -15 /tmp/dep-build.log
tail -15 /tmp/dep-test.log
```

**If build or tests fail after update:**
1. Revert: `git checkout package.json package-lock.json packages/*/package.json packages/*/package-lock.json`
2. Log this package as "update blocked — build/test failure — needs manual review"
3. Move to the next package on the list

**→ COMPACT** after every 2 package updates

## Step 4 — Commit (After Each Successful Update)

Atomic commit per package (don't bundle multiple updates):
```bash
git add package-lock.json packages/*/package-lock.json package.json packages/*/package.json
git diff --staged --stat  # confirm only lock files and package.json staged
```

Commit message:
```
deps: update <package-name> <old-version> → <new-version>

Reason: <security fix | patch update | minor update>
Research: <changelog URL>
Breaking changes: none confirmed
Verify: build PASS + all tests PASS
```

Push after each commit. Don't accumulate multiple unverified updates.

## Step 5 — Final Audit

```bash
npm audit --audit-level=high 2>&1 | tail -5
```

If the audit still shows unfixed high/critical findings: log them as "requires manual intervention
— major version bump or no fix available" in the shared queue.

## Step 6 — Log

Append to `.claude/auto-improve-log.log`, tagged `[dependency-guardian]`:
```
## YYYY-MM-DD HH:MM — [dependency-guardian]
Researched: npm audit + 3 package changelog searches (see research cache)
Research file: .claude/research-cache/<filename>
Updated: <list of package@old → package@new>
Skipped: <list with reason — build failure | breaking change | major jump>
Open questions (human needed): <major version jumps + their risk assessment>
Audit after update: <N> critical, <N> high remaining
Committed: <hashes>
```

Release lock: `rm -f .claude/.auto-improve.lock`

**→ COMPACT**

## Guardrails

- Never force-update a major version without explicit human approval — log it as an open question.
- Always revert and log when a package update breaks the build or tests.
- Never use `npm audit fix --force` without first researching what breaking changes it introduces.
- One package per commit — no omnibus "update all deps" commits.
- Never update `electron` to a new major version without human review.
- Release the shared lock even on early exit.
