# SuperAgent Auto-Improvement System

SuperAgent improves itself. This directory explains how.

## What It Does

Every cycle, the loop:

1. **Researches** — runs 3 mandatory online searches (WebSearch + WebFetch), writes results to `.claude/research-cache/`
2. **Plans** — picks one improvement tied to SuperAgent's 4 mission points
3. **Implements** — edits the codebase
4. **Tests** — runs build + lint + optional live test
5. **Commits** — to a per-cycle branch `auto/YYYY-MM-DD-HHmm-<skill>`
6. **Pushes + PRs** — opens a draft PR targeting `agent-development` via `gh` CLI
7. **Loops** — repeats on schedule, forever, until the pause file appears

You review PRs and merge when satisfied. Nothing auto-merges to `main`.

---

## The 8 Skills (What Each One Does)

| Skill | Frequency | Purpose |
|-------|-----------|---------|
| `auto-improve` | every 30 min | General code quality, capability adapters, GUI polish |
| `orchestrator-dev` | every 2h | AI routing layer, provider registry, fallback chains |
| `art-director` | every 3h | Visual redesign, palette, motion, SVG illustration |
| `ux-critic` | every 2h | Synthetic UX walkthrough, persona testing, findings queue |
| `security-auditor` | every 6h | npm audit, CVE search, code pattern grep, fix vulnerabilities |
| `test-generator` | every 4h | Coverage analysis, write behavior tests for uncovered paths |
| `provider-scout` | every 8h | Research new AI providers, draft adapters, integrate |
| `dependency-guardian` | every 12h | Safe dependency updates, changelog research, atomic commits |

### The Playwright Fix

`art-director` and `ux-critic` previously crashed Claude Code sessions because Playwright
accessibility snapshots (50K–200K tokens each) overflowed the context window, making even
`/compact` fail. **This is fixed.**

Both skills now use a **two-phase architecture**:
- **Phase 1** (main session): Code research, edits, build verify — no Playwright at all
- **Phase 2** (subprocess): `claude -p /playwright-check` or `/playwright-audit` launches
  a **fresh isolated session** with `--max-turns 5`. It takes screenshots only (no `browser_snapshot`),
  writes a small JSON findings file, and exits. The main session reads only the JSON summary.

The main session context is Playwright-free forever. Context crashes are eliminated.

---

## Quick Start

### Windows (Desktop Agent App / PowerShell)

→ See [windows-desktop-setup.md](./windows-desktop-setup.md) for full instructions.

**TL;DR:**
```powershell
# 1. Verify all tools work
.\autodev\verify-tools.ps1

# 2. Configure env
Copy-Item autodev\superagent-auto-improve.env.example autodev\superagent-auto-improve.env
# Edit REPO_DIR and ANTHROPIC_API_KEY

# 3. One manual cycle
$env:REPO_DIR = "D:\Project\OpenSource\AgentApp"
$env:SKILL = "/auto-improve"
.\autodev\run-auto-improve.ps1

# 4. Check GitHub — a draft PR should appear on agent-development
```

### Linux / VPS (Headless)

→ See [vps-linux-setup.md](./vps-linux-setup.md) for full instructions.

**TL;DR:**
```bash
# 1. Verify tools
chmod +x autodev/verify-tools.sh && ./autodev/verify-tools.sh

# 2. Configure env
sudo cp autodev/superagent-auto-improve.env.example /etc/superagent-auto-improve.env
sudo chmod 600 /etc/superagent-auto-improve.env
# Edit REPO_DIR and ANTHROPIC_API_KEY

# 3. One manual cycle
SKILL=/auto-improve ./autodev/run-auto-improve.sh

# 4. Enable systemd timers (one per skill)
sudo systemctl enable --now superagent-auto-improve@auto-improve.timer
```

---

## How to Review Auto-PRs

→ See [branch-pr-workflow.md](./branch-pr-workflow.md) for the review guide.

**Key signals to look for in each PR:**
- ✅ Build/test CI comment on the PR (from the GitHub Actions workflow)
- ✅ "Researched:" section in the skill log has real URLs (not generic placeholders)
- ✅ Diff is scoped to the skill's stated focus (no unrelated changes)
- ✅ No API keys, `.env` contents, or personal paths in the diff
- ✅ Commit message names what was verified

---

## Pause / Resume

```bash
# Pause (any running cycle finishes; new ones skip until file is removed)
touch .claude/.auto-improve.pause

# Resume
rm .claude/.auto-improve.pause
```

---

## Monitor Progress

```bash
# Shared log (all 8 skills write here)
tail -f .claude/auto-improve-log.log

# Research cache (what each cycle looked up)
ls -lt .claude/research-cache/

# Per-cycle driver logs (Linux)
tail -f /var/log/superagent-auto-improve/driver.log
```

---

## File Structure

```
autodev/
├── run-auto-improve.sh            # Linux driver
├── run-auto-improve.ps1           # Windows driver
├── run-auto-improve-superagent.sh # SuperAgent CLI driver (self-hosting)
├── verify-tools.sh                # Linux pre-flight check
├── verify-tools.ps1               # Windows pre-flight check
├── loop-config.json               # Skill schedules and branch config
└── superagent-auto-improve.env.example

.claude/
├── auto-improve-log.log           # Shared memory across all 8 skills
├── research-cache/                # Per-cycle online research snapshots
├── skills/
│   ├── auto-improve/
│   ├── orchestrator-dev/
│   ├── art-director/              # Phase 1: code only (Playwright-free)
│   ├── ux-critic/                 # Phase 1: code only (Playwright-free)
│   ├── playwright-check/          # Phase 2: visual sub-session (max 5 turns)
│   ├── playwright-audit/          # Phase 2: UX audit sub-session (max 5 turns)
│   ├── security-auditor/
│   ├── test-generator/
│   ├── provider-scout/
│   └── dependency-guardian/

.github/workflows/
└── auto-loop-pr.yml               # CI: build+test on auto/* branches, post comment
```
