---
name: test-generator
description: Finds untested code paths and generates vitest tests for them every 4 hours. Runs coverage analysis, researches testing patterns for the specific module under test, writes tests that actually exercise real behavior (not trivial snapshot tests), and commits only when all new tests pass. Grows the test suite systematically toward 80%+ coverage.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus module, e.g. "orchestrator", "providers/ai-engine", "storage/conversation-store"]
---

# /test-generator — Coverage Gap → Write Tests Loop

## Purpose

653 tests is a start. But coverage decays as features are added faster than tests. This skill
runs every 4 hours to find the lowest-coverage files and write tests that actually exercise
real behavior — not trivial snapshot or import-check tests that give false coverage confidence.

## Context & Memory Contract

**Compact at every `→ COMPACT` checkpoint, unconditionally.**
Before every compact: write current target file + tests-written count to TodoWrite.
`.claude/auto-improve-log.log`: `tail -n 150` only.
Source files: `Grep` first, `Read` with `offset`/`limit`. Never load a whole source file to orient.

## Step 0 — Orient & Lock

```bash
LOCK=.claude/.auto-improve.lock
if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(date -r "$LOCK" +%s 2>/dev/null || echo 0) ))
  if [ "$age" -lt 540 ]; then echo "LOCK_HELD"; exit 2; fi
fi
printf '{"pid":%d,"started":"%s"}\n' "$$" "$(date -u +%FT%TZ)" > "$LOCK"
```

`tail -n 150 .claude/auto-improve-log.log` — check recent `[test-generator]` entries to avoid
re-testing what was already covered last cycle.

## Step 1 — Run Coverage Analysis

```bash
mkdir -p .claude/research-cache
# Run with JSON reporter — redirect output to disk
npx vitest run --coverage --reporter=json \
  > .claude/research-cache/coverage-$(date +%Y%m%d-%H%M).json 2>&1

# Show summary (small)
npx vitest run --coverage --reporter=verbose 2>&1 | grep -E "^(packages|src)" | head -40
```

Parse the coverage output to find the top 3 files with the lowest line coverage percentage.
These are your candidates. Pick the one with the most code (lines) that is under 70% coverage —
bigger untested files give more test value per cycle.

If `$ARGUMENTS` is given, use that module instead.

## Step 2 — Online Research (Mandatory — 3 Searches)

**Required searches:**
1. `"vitest typescript unit testing patterns 2026"` — current test idioms for this stack
2. `"<target module name> testing strategy mocking"` — domain-specific test approaches
   (e.g. "AI provider adapter unit testing mock" or "electron IPC unit test vitest")
3. `"how to test <specific pattern in target file>"` — e.g. "how to test async retry logic vitest"

Write to `.claude/research-cache/$(date +%Y%m%d-%H%M)-test-generator.md`:
```
RESEARCH LOG — [test-generator] [DATE TIME]
Target file: <path>
Current coverage: <X>%
Search 1: "<query>" → Source: <url> — Takeaway: <one line>
Search 2: "<query>" → Source: <url> — Takeaway: <one line>
Search 3: "<query>" → Source: <url> — Takeaway: <one line>
Test strategy: <what types of tests to write, what to mock>
```

**→ COMPACT** (write target file + step to TodoWrite)

## Step 3 — Analyze Target File

```bash
# Read only relevant sections of the target file
grep -n "export\|function\|class\|async" <target-file> | head -40
```

Use `Read` with `offset`/`limit` to read specific functions — not the whole file.

Understand:
- What does this module export?
- What are the main code paths (happy path, error path, edge cases)?
- What dependencies does it have that need mocking?
- What behaviors are currently NOT tested?

Look at the existing test file (if any) to see what's already covered:
```bash
ls packages/*/test/**/*<module-name>* 2>/dev/null
```

## Step 4 — Write Tests

Create or extend the test file following the project's test conventions:
- Location: `packages/<pkg>/test/<module-name>.test.ts` (mirror `src/` structure)
- Use `vitest` (`describe`, `it`, `expect`, `vi.mock`)
- Write **behavior tests**, not implementation tests:
  - ✅ "it('returns null when the file does not exist')"
  - ✅ "it('retries 3 times before throwing on network error')"
  - ❌ "it('calls readFileSync once')" — tests implementation, not behavior
- Each test should exercise one specific code path
- Mock only external I/O and network calls — not internal logic

Aim for 5–10 new tests per cycle covering the most impactful uncovered paths.

## Step 5 — Run Tests

```bash
npx vitest run packages/<pkg>/test/<module-name>.test.ts > /tmp/test-gen-run.log 2>&1
echo "Exit: $?"
tail -30 /tmp/test-gen-run.log
```

**If any new test fails:**
1. Read the failure message
2. Fix either the test (if the test is wrong) or the source code (if there's a bug — log it)
3. Rerun
4. If you can't fix it in 2 attempts, delete that specific failing test and log it as an open question

**Do not commit failing tests.**

**→ COMPACT**

## Step 6 — Verify No Regression

Run the full test suite to confirm nothing is broken:
```bash
npm test > /tmp/test-gen-full.log 2>&1
echo "Exit: $?"
tail -20 /tmp/test-gen-full.log
```

If regressions: investigate and fix before committing.

## Step 7 — Commit

```bash
git add packages/<pkg>/test/<module-name>.test.ts
git diff --staged --stat  # confirm only test file staged
```

Commit message:
```
test: add <N> tests for <module-name> — <X>% → <Y>% coverage

Coverage target: <file path>
Tests added: <list of what was tested>
Research: <test pattern source URL>
Verify: all N tests PASS, full suite regression PASS
```

Push. Release lock: `rm -f .claude/.auto-improve.lock`

## Step 8 — Log

Append to `.claude/auto-improve-log.log`, tagged `[test-generator]`:
```
## YYYY-MM-DD HH:MM — [test-generator]
Researched: 3 test pattern sources (see research cache)
Research file: .claude/research-cache/<filename>
Target: <file path> — <before>% → <after>% coverage
Tests added: <count> new tests covering: <list of behaviors>
All pass: YES / NO (details)
Committed: <hash | "not committed — reason">
Next priority queue: <next lowest-coverage files>
Open questions: <tests that couldn't be written — why>
```

Release lock if not already released. **→ COMPACT**

## Guardrails

- Never commit a failing test.
- Never write a test that only confirms implementation details (not behavior).
- Never lower existing coverage by deleting tests.
- One test file per cycle — don't spread thin across many files.
- Release the shared lock even on early exit.
