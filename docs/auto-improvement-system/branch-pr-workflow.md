# Branch & PR Workflow — Human Review Guide

Every loop cycle creates a branch and draft PR. This doc explains how to review them efficiently.

---

## Branch Naming Convention

```
auto/<YYYY-MM-DD>-<HHmm>-<skill-name>
```

Examples:
```
auto/2026-07-20-0430-auto-improve
auto/2026-07-20-0600-security-auditor
auto/2026-07-20-0930-test-generator
```

The date+time tells you when the cycle ran. The skill name tells you what it did.

---

## PR Title & Target

- **Title**: `[AutoLoop] <skill-name> — YYYY-MM-DD`
- **Target branch**: `agent-development`
- **Draft**: Yes — you must explicitly mark it "Ready for review" or just merge directly
- **Label**: `auto-generated`

---

## Reading the PR Description

Every auto-generated PR has this structure:

```
## [AutoLoop] auto-improve — 2026-07-20

### Commits in This Cycle
<list of git commits from this cycle>

### Skill Log (latest entry)
Researched: <source URLs and one-line takeaways>
Changed: <which files / what behavior>
Why: <mission point served>
Static verify: build PASS / tests PASS
Live test: PASS against <model> | NOT LIVE-TESTED — reason
Committed: <hash>
Next priority queue: <what the next cycle should work on>
Open questions: <anything needing a human decision>

### Review Checklist
- [ ] Read the diff — changes look intentional
- [ ] Research sources are real URLs
- [ ] Build/test CI confirmed
- [ ] No secrets committed
- [ ] Merge → agent-development when satisfied
```

---

## What to Check (5-Minute Review)

### 1. CI Comment ✅
Look for the CI bot comment: `Auto-Loop CI Results`. Should show:
```
Build ✅ success
Tests ✅ success
```
If either is ❌: the loop committed broken code. **Do not merge**. Read the failure details.

### 2. Research Sources Are Real 🔍
In the Skill Log, `Researched:` should list actual URLs like:
- `https://nodejs.org/en/blog/release/v22.0.0` — real Node.js release notes
- `https://openrouter.ai/docs/models` — real provider docs

**Red flags (hallucination indicators)**:
- Generic placeholders: `"Best practices source"`, `"Research: TBD"`
- Non-existent domains: `research.ai-trends.io/2026-article`
- No URLs at all: just claims like "According to recent research..."

If research looks fabricated: the cycle may have skipped the research gate.
Check `.claude/research-cache/` — if no new file was created, the skill skipped Step 2.

### 3. Diff Is Scoped 📋
The diff should only contain files related to the stated focus. Red flags:
- Changes to files completely unrelated to the skill's domain
- Changes to `autodev/` or `.claude/skills/` (skills should not edit their own guardrails)
- Changes to `main` (impossible by design, but verify)

### 4. No Secrets 🔑
Scan the diff for:
- `sk-ant-`, `sk-proj-`, API key patterns
- `.env` file contents
- Personal file paths like `/Users/yourname/`
- Tokens of any kind

### 5. Commit Message Makes Sense 📝
Should state what changed, why (mission point), and how it was verified.
Generic messages like `"improvements"` or `"update"` without detail are a red flag.

---

## When to Merge

**Merge when:**
- CI is ✅ (build + tests pass)
- Research sources look real and relevant
- Diff is scoped and sensible
- No secrets in the diff

**Request another cycle when:**
- The improvement is in the right direction but incomplete
- Write feedback to `.claude/auto-improve-log.log`:
  ```
  ## YYYY-MM-DD — [human-note]
  Open questions: <your feedback for the next cycle to pick up>
  Next priority queue: <what to do next, in your words>
  ```
  The next cycle reads `tail -n 150` of this file, so your note will be seen.

**Close without merging when:**
- The change is actively wrong (broke expected behavior)
- Research was clearly hallucinated
- The skill went off-mission

---

## Finding All Auto-Loop PRs

```bash
# List all open auto-loop PRs
gh pr list --label auto-generated --base agent-development

# List closed/merged ones
gh pr list --label auto-generated --state merged
```

---

## Giving Feedback the Loop Picks Up

The loop reads `.claude/auto-improve-log.log` on every cycle. If you want to direct the next cycle,
append a note there:

```bash
cat >> .claude/auto-improve-log.log << 'EOF'

## 2026-07-20 — [human-review]
Open questions:
  - The routing fallback PR looks good but needs a test for the case where ALL providers are down.
    Next cycle: add a test in packages/core/test/orchestrator/ for total-provider-blackout scenario.
Next priority queue:
  1. Test coverage for fallback chains
  2. Provider scout: check if Mistral has a new free model this month
EOF
```

The next `auto-improve` or `test-generator` cycle will pick this up from the shared queue.

---

## Flow Diagram

```
Loop cycle runs
      ↓
Creates auto/YYYY-MM-DD-HHmm-<skill> branch
      ↓
Researches online (3 searches → .claude/research-cache/)
      ↓
Implements + builds + tests
      ↓
Commits to branch
      ↓
Pushes → GitHub
      ↓
gh pr create (draft) → agent-development
      ↓
GitHub Actions: build+test → posts CI comment
      ↓
[YOU] review PR
      ↓
Merge → agent-development ← YOUR GATE
      ↓
(Eventually) PR from agent-development → main is your decision
```
