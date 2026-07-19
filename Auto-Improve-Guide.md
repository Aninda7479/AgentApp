Here is the complete guide to set up and run the autonomous self-improvement system on your PC or VPS.

---

### Step 1: Run Pre-Flight Verification

Open PowerShell in the repo directory `d:\Project\OpenSource\AgentApp`:

```powershell
.\autodev\verify-tools.ps1
```

This verifies that `node`, `npm build`, `claude` CLI, `gh` CLI, `git push`, lock file permissions, and `WebSearch` capabilities are all working.

---

### Step 2: Configure Environment File

Create your local `.env` configuration file from the template:

```powershell
Copy-Item autodev\superagent-auto-improve.env.example autodev\superagent-auto-improve.env
```

Edit `autodev\superagent-auto-improve.env` to include your Anthropic API Key or token, and confirm the paths:

```env
REPO_DIR=d:\Project\OpenSource\AgentApp
BASE_BRANCH=agent-development
AUTO_CREATE_PR=true
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

---

### Step 3: Run Your First Test Cycle

Test a single cycle manually to confirm that the loop creates a branch, performs research, commits changes, and opens a draft PR:

```powershell
$env:SKILL = "/auto-improve"
.\autodev\run-auto-improve.ps1
```

Check GitHub: You will see a draft PR targeting `agent-development` with an auto-generated title like `[AutoLoop] auto-improve — 2026-07-19`.

---

### Step 4: Choose How to Schedule the Loop

#### Option A: On Your PC (Windows Task Scheduler)
Set up Task Scheduler to run the skills automatically in the background:

1. Open **Task Scheduler** → **Create Basic Task**.
2. **Name**: `SuperAgent AutoLoop - auto-improve`
3. **Trigger**: Repeat every 30 minutes.
4. **Action**: Start a program
   - **Program/script**: `powershell.exe`
   - **Add arguments**: `-ExecutionPolicy Bypass -File "d:\Project\OpenSource\AgentApp\autodev\run-auto-improve.ps1"`
   - **Start in**: `d:\Project\OpenSource\AgentApp`

You can repeat this for other skills (e.g. `/security-auditor` every 6 hours, `/test-generator` every 4 hours).

#### Option B: SuperAgent Desktop App
1. Launch the SuperAgent Desktop App.
2. Open Project: Select `d:\Project\OpenSource\AgentApp`.
3. In the agent setup, point it to `.claude/skills`.
4. Run commands such as `/auto-improve`, `/security-auditor`, or `/orchestrator-dev`.

#### Option C: Self-Hosting with SuperAgent CLI
To have SuperAgent use its own engine (`superagent` CLI) rather than the `claude` CLI:

```powershell
$env:SKILL = "/auto-improve"
.\autodev\run-auto-improve-superagent.ps1
```

#### Option D: On a VPS (Linux Headless)
Copy `autodev/superagent-auto-improve.env.example` to `/etc/superagent-auto-improve.env` and enable the systemd template service:

```bash
sudo systemctl enable --now superagent-auto-improve@auto-improve.service
```

---

### How the Everlasting Loop Works (Human-in-the-Loop Review)

1. **Autonomous Execution**: The loop runs `Research -> Plan -> Code -> Build/Test -> Commit -> Push`.
2. **Branch Isolation**: Every run pushes to a new side branch (`auto/YYYY-MM-DD-HHmm-<skill>`).
3. **Auto-PR**: A draft PR is automatically created on GitHub targeting `agent-development` containing:
   - What was changed and why.
   - Real, cited online research URLs.
   - Automated build & test status verification.
4. **Human Review**: You review the PR on GitHub and click **Merge** into `agent-development` when satisfied!

For full documentation and detailed guides, view `docs/auto-improvement-system/README.md`.