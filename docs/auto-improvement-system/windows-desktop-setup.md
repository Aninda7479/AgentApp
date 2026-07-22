# Windows Desktop Setup Guide

Run the autonomous self-improvement loop on your Windows PC using:
- **Claude Code CLI** (primary driver — runs `/skill-loop` as headless `claude -p`, which spawns worker skills in isolated sessions)
- **SuperAgent Desktop App** (monitor while the loop runs in the background)
- **Windows Task Scheduler** (trigger one skill per task, staggered by schedule)

---

## Prerequisites

Install all of these before running `verify-tools.ps1`:

### 1. Node.js ≥ 18
Download from [nodejs.org](https://nodejs.org) (LTS recommended).
Confirm: `node --version` → `v20.x` or similar.

### 2. Claude Code CLI
```powershell
npm install -g @anthropic-ai/claude-code
claude --version
```

### 3. GitHub CLI (`gh`)
Download from [cli.github.com](https://cli.github.com) or:
```powershell
winget install GitHub.cli
```

### 4. Git (with credentials configured)
Confirm: `git remote -v` shows your AgentApp remote.
Confirm push access: `git push --dry-run`

### 5. Build the project once first
```powershell
cd D:\Project\OpenSource\AgentApp
npm install
npm run build
```
Must succeed before the loop can run.

---

## Step 1: Authenticate

### Claude Code
```powershell
# Interactive auth — run once
claude login
# OR set your API key in the env file (Step 2)
```

### GitHub CLI
```powershell
gh auth login
# Choose: GitHub.com → HTTPS → authenticate via browser
gh auth status   # confirm: Logged in to github.com
```

---

## Step 2: Configure the Env File

```powershell
Copy-Item autodev\superagent-auto-improve.env.example autodev\superagent-auto-improve.env
```

Open `autodev\superagent-auto-improve.env` and set:
```
REPO_DIR=D:\Project\OpenSource\AgentApp
ANTHROPIC_API_KEY=sk-ant-your-key-here
BASE_BRANCH=agent-development
AUTO_CREATE_PR=true
```

> ⚠️ Keep this file out of git. It's already in `.gitignore`. Never commit it.

---

## Step 3: Run Pre-Flight Verification

```powershell
cd D:\Project\OpenSource\AgentApp
.\autodev\verify-tools.ps1
```

Expected output — all green:
```
✅ node >= v18
✅ npm run build (all workspaces)
✅ claude CLI in PATH
✅ claude CLI authenticated (ping test)
✅ gh CLI in PATH
✅ gh CLI authenticated
✅ git push access (dry run)
✅ lock file create/delete
✅ git branch create/delete (dry run)
✅ research-cache dir writable
✅ WebSearch capability (online search test)
```

Fix any ❌ failures before proceeding.
See [tools-verification.md](./tools-verification.md) for troubleshooting help.

---

## Step 4: One Manual Cycle (Confirm End-to-End)

```powershell
$env:REPO_DIR = "D:\Project\OpenSource\AgentApp"
$env:SKILL    = "/auto-improve"
.\autodev\run-auto-improve.ps1
```

This runs one `auto-improve` cycle. Watch the console. When it finishes:

1. Open GitHub → `Aninda7479/AgentApp` → **Pull Requests**
2. You should see a draft PR titled `[AutoLoop] auto-improve — <today's date>`
3. Open `.claude\auto-improve-log.log` — should have a new entry with research sources
4. Open `.claude\research-cache\` — should have a new `.md` file with cited URLs

If the PR appeared and the log has real URLs: **the system is working.**

---

## Step 5: Set Up Windows Task Scheduler

Open Task Scheduler and create one task per skill. Here's the pattern:

**Task name**: `SuperAgent AutoLoop — auto-improve`  
**Trigger**: Daily, repeat every 30 minutes, indefinitely  
**Action**:
- Program: `powershell.exe`
- Arguments: `-NonInteractive -File "D:\Project\OpenSource\AgentApp\autodev\run-auto-improve.ps1"`
- Start in: `D:\Project\OpenSource\AgentApp`

**Environment variables** (set in task's Advanced → Environment):
```
REPO_DIR=D:\Project\OpenSource\AgentApp
SKILL=/auto-improve
ANTHROPIC_API_KEY=sk-ant-your-key
AUTO_CREATE_PR=true
```

**Repeat this for each skill** with different intervals from `loop-config.json`:

| Task Name | SKILL | Repeat Interval |
|-----------|-------|-----------------|
| SuperAgent AutoLoop — auto-improve | `/auto-improve` | 30 min |
| SuperAgent AutoLoop — orchestrator-dev | `/orchestrator-dev` | 2h |
| SuperAgent AutoLoop — art-director | `/art-director` | 3h |
| SuperAgent AutoLoop — ux-critic | `/ux-critic` | 2h |
| SuperAgent AutoLoop — security-auditor | `/security-auditor` | 6h |
| SuperAgent AutoLoop — test-generator | `/test-generator` | 4h |
| SuperAgent AutoLoop — provider-scout | `/provider-scout` | 8h |
| SuperAgent AutoLoop — dependency-guardian | `/dependency-guardian` | 12h |

**Stagger start times** by 5 minutes between skills to avoid lock contention.

---

## Step 6: Using the Desktop Agent App

While the loop runs in the background via Task Scheduler:

1. Open the SuperAgent Desktop App
2. File → Open Project → `D:\Project\OpenSource\AgentApp`
3. In the Agent panel: the skills appear as available agents
4. You can **manually trigger a skill cycle** from the app as well as via Task Scheduler
5. Watch `.claude\auto-improve-log.log` in the built-in file viewer to monitor progress

---

## Step 7: Monitor

```powershell
# Watch the shared log (all 8 skills write here)
Get-Content .claude\auto-improve-log.log -Tail 30 -Wait

# Watch driver logs
Get-Content logs\auto-improve\driver.log -Tail 20 -Wait

# List recent research cache files
Get-ChildItem .claude\research-cache | Sort-Object LastWriteTime -Descending | Select-Object -First 10

# Check open PRs
gh pr list --label auto-generated
```

---

## Pause / Resume

```powershell
# Pause (current cycle finishes; new cycles skip)
New-Item -ItemType File .claude\.auto-improve.pause

# Resume
Remove-Item .claude\.auto-improve.pause
```

---

## Reviewing PRs

See [branch-pr-workflow.md](./branch-pr-workflow.md) for the full review guide.

Quick checklist:
1. Open the PR on GitHub
2. Check the CI comment — build ✅ and tests ✅
3. Read the "Skill Log" section — research sources should be real URLs
4. Review the diff — changes should match the stated focus
5. Confirm no secrets in the diff
6. Merge when satisfied → `agent-development`
