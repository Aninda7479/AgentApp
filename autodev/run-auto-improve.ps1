<#
.SYNOPSIS
    SuperAgent auto-improvement loop driver for Windows (PowerShell).
    Equivalent to run-auto-improve.sh but for Windows Desktop / Task Scheduler.

.DESCRIPTION
    Runs ONE skill cycle and exits. Creates a per-cycle dated branch
    (auto/YYYY-MM-DD-HHmm-<skill>), commits any changes, pushes, and
    opens a draft PR to agent-development via gh CLI.
    
    Never touches main. Branch -&gt; agent-development merge stays a human PR decision.

.EXAMPLE
    # Basic usage (reads env from .env file):
    .\run-auto-improve.ps1

    # Override specific values:
    $env:SKILL = "/security-auditor"
    $env:REPO_DIR = "D:\Project\OpenSource\AgentApp"
    .\run-auto-improve.ps1

.NOTES
    Prerequisites: node >= 18, claude CLI, gh CLI, git (all in PATH)
    Run .\verify-tools.ps1 first to confirm all tools are available.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Load .env file if it exists next to this script
# ---------------------------------------------------------------------------
$EnvFile = Join-Path $PSScriptRoot "superagent-auto-improve.env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#=][^=]*)=(.+)$') {
            $key = $Matches[1].Trim()
            # REPO_DIR is derived from this script's location; ignore any .env value for it
            if ($key -eq 'REPO_DIR') { return }
            $val = $Matches[2].Trim()
            # Strip an inline comment (first '#' outside of quotes)
            if ($val -notmatch '^[''"]') {
                $ci = $val.IndexOf('#')
                if ($ci -ge 0) { $val = $val.Substring(0, $ci) }
            }
            $val = $val.Trim().Trim('"').Trim("'")
            if (-not (Test-Path "env:$key")) {
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# REPO_DIR is auto-detected from this script's location (autodev/ -> repo root),
# so the loop works no matter where the repo is cloned. It only falls back to an
# explicit $env:REPO_DIR when the script is not run from inside the repo.
$RepoRoot = Split-Path $PSScriptRoot
if (Test-Path (Join-Path $RepoRoot ".git")) {
    $RepoDir = $RepoRoot
} else {
    $RepoDir = if ($env:REPO_DIR) { $env:REPO_DIR } else { throw "Run from inside the AgentApp repo, or set the REPO_DIR env var." }
}
$BaseBranch   = if ($env:BASE_BRANCH) { $env:BASE_BRANCH } else { "agent-development" }
$Skill        = if ($env:SKILL) { $env:SKILL } else { "/auto-improve" }
$BranchPrefix = if ($env:BRANCH_PREFIX) { $env:BRANCH_PREFIX } else { "auto" }
$LogDir       = if ($env:LOG_DIR) { $env:LOG_DIR } else { Join-Path $RepoDir "logs\auto-improve" }
$PauseFile    = if ($env:PAUSE_FILE) { $env:PAUSE_FILE } else { Join-Path $RepoDir ".claude\.auto-improve.pause" }
$AutoCreatePr = if ($env:AUTO_CREATE_PR) { $env:AUTO_CREATE_PR -ne "false" } else { $true }
$AllowedTools = if ($env:ALLOWED_TOOLS) { $env:ALLOWED_TOOLS } else { "Read,Grep,Glob,Edit,Write,Bash,WebSearch,WebFetch,TodoWrite" }
# No MAX_TURNS or MAX_BUDGET_USD - skills run until naturally complete.

if ($BaseBranch -eq "main") {
    Write-Error "Refusing to run: BASE_BRANCH is 'main'. Use 'agent-development' or a side branch."
    exit 1
}

# ---------------------------------------------------------------------------
# Setup logging
# ---------------------------------------------------------------------------
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$Ts        = (Get-Date -Format "yyyyMMddTHHmmssZ")
$SkillName = $Skill.TrimStart('/')
$CycleBranch = "$BranchPrefix/$(Get-Date -Format 'yyyy-MM-dd-HHmm')-$SkillName"
$RunLog    = Join-Path $LogDir "${Ts}_${SkillName}.json"
$StderrLog = Join-Path $LogDir "${Ts}_${SkillName}.stderr.log"
$DriverLog = Join-Path $LogDir "driver.log"

function Write-Log {
    param([string]$Msg)
    "$Ts [$SkillName] $Msg" | Tee-Object -FilePath $DriverLog -Append | Write-Host
}

# ---------------------------------------------------------------------------
# Kill switch
# ---------------------------------------------------------------------------
if (Test-Path $PauseFile) {
    Write-Log "paused (found $PauseFile) - skipping cycle"
    exit 0
}

# ---------------------------------------------------------------------------
# Change to repo dir
# ---------------------------------------------------------------------------
Set-Location $RepoDir

# ---------------------------------------------------------------------------
# Create required dirs
# ---------------------------------------------------------------------------
New-Item -ItemType Directory -Path ".claude\research-cache" -Force | Out-Null
New-Item -ItemType Directory -Path ".playwright" -Force | Out-Null

# ---------------------------------------------------------------------------
# Git helper: runs git without letting PowerShell treat its stderr / non-zero
# exit as a terminating NativeCommandError under $ErrorActionPreference = "Stop".
# Pass -StdOut ([ref]$var) to capture stdout (e.g. status / log output).
# ---------------------------------------------------------------------------
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]]$GitArgs)
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & git @GitArgs 2>> $DriverLog
        [PSCustomObject]@{ ExitCode = $LASTEXITCODE; Output = $out }
    } finally {
        $ErrorActionPreference = $prevEAP
    }
}

# ---------------------------------------------------------------------------
# Fetch and create per-cycle branch from BASE_BRANCH
# ---------------------------------------------------------------------------
Write-Log "Fetching origin/$BaseBranch..."
Invoke-Git fetch origin $BaseBranch | Out-Null

$showRef = Invoke-Git show-ref --verify --quiet "refs/remotes/origin/$BaseBranch"
if ($showRef.ExitCode -eq 0) {
    Invoke-Git checkout -B $CycleBranch "origin/$BaseBranch" | Out-Null
} else {
    Write-Log "Base branch $BaseBranch not found on origin - branching from current HEAD"
    Invoke-Git checkout -B $CycleBranch | Out-Null
}

Write-Log "Created cycle branch: $CycleBranch"

# Check for dirty working tree
$status = Invoke-Git status --porcelain
$dirty = $status.Output
if ($dirty) {
    Write-Log "Working tree dirty before run - skipping cycle to avoid overwriting local changes"
    exit 0
}

# ---------------------------------------------------------------------------
# Self-serialize
# ---------------------------------------------------------------------------
$env:AUTO_IMPROVE_RUN = "win-$Ts"

# ---------------------------------------------------------------------------
# Run Claude Code headlessly - no budget/turn caps
# ---------------------------------------------------------------------------
Write-Log "Starting skill: $Skill"

$claudeArgs = @(
    "-p", $Skill,
    "--allowedTools", $AllowedTools,
    "--permission-mode", "acceptEdits",
    "--output-format", "json"
)

$proc = Start-Process -FilePath "claude" `
    -ArgumentList $claudeArgs `
    -RedirectStandardOutput $RunLog `
    -RedirectStandardError $StderrLog `
    -NoNewWindow `
    -Wait `
    -PassThru

$ExitCode = $proc.ExitCode

# Parse JSON output for logging
$Cost = "n/a"; $Turns = "n/a"; $IsError = "n/a"
if ((Test-Path $RunLog) -and (Get-Item $RunLog).Length -gt 0) {
    try {
        $runData = Get-Content $RunLog -Raw | ConvertFrom-Json -ErrorAction Stop
        $Cost    = if ($null -ne $runData.total_cost_usd) { $runData.total_cost_usd } else { "n/a" }
        $Turns   = if ($null -ne $runData.num_turns) { $runData.num_turns } else { "n/a" }
        $IsError = if ($null -ne $runData.is_error) { $runData.is_error } else { "n/a" }
    } catch { }
}

Write-Log "exit=$ExitCode is_error=$IsError cost=`$$Cost turns=$Turns log=$RunLog"

# ---------------------------------------------------------------------------
# Push branch if anything was committed
# ---------------------------------------------------------------------------
$log = Invoke-Git log "origin/$BaseBranch..HEAD" --oneline
$newCommits = $log.Output
if ($newCommits) {
    Invoke-Git push -u origin $CycleBranch | Out-Null
    Write-Log "Pushed branch: $CycleBranch"

    # -----------------------------------------------------------------------
    # Generate PR body
    # -----------------------------------------------------------------------
    $LatestLog = (Get-Content ".claude\auto-improve-log.log" -Tail 60 -ErrorAction SilentlyContinue) -join "`n"
    if (-not $LatestLog) { $LatestLog = "No log entry found" }
    $Commits = $newCommits | Select-Object -First 10 | Out-String

    $PrBody = @"
## [AutoLoop] $SkillName - $(Get-Date -Format 'yyyy-MM-dd')

> Auto-generated by the SuperAgent self-improvement loop.
> Review the diff, confirm no secrets or regressions, then merge when satisfied.

### Commits in This Cycle
``````
$Commits
``````

### Skill Log (latest entry)
``````
$LatestLog
``````

### Review Checklist
- [ ] Read the diff - changes look intentional
- [ ] Research sources cited in the log are real URLs (not hallucinated)
- [ ] Build/test status confirmed (see CI check below)
- [ ] No secrets, tokens, or personal paths committed
- [ ] Merge -&gt; ``$BaseBranch`` when satisfied

*Branch: ``$CycleBranch`` -&gt; ``$BaseBranch``*
*Runner log: ``$RunLog``*
"@
    $PrBodyFile = ".claude\pr-body-latest.md"
    $PrBody | Set-Content -Path $PrBodyFile -Encoding UTF8

    # -----------------------------------------------------------------------
    # Create draft PR via gh CLI
    # -----------------------------------------------------------------------
    if ($AutoCreatePr) {
        $ghAvailable = Get-Command "gh" -ErrorAction SilentlyContinue
        if ($ghAvailable) {
            Write-Log "Creating draft PR -&gt; $BaseBranch..."
            try {
                gh pr create `
                    --draft `
                    --base $BaseBranch `
                    --head $CycleBranch `
                    --title "[AutoLoop] $SkillName - $(Get-Date -Format 'yyyy-MM-dd')" `
                    --body-file $PrBodyFile `
                    --label "auto-generated" 2>> $DriverLog

                Write-Log "Draft PR created -&gt; $BaseBranch"
            } catch {
                Write-Log "gh pr create failed: $($_.Exception.Message) - branch pushed, create PR manually"
            }
        } else {
            Write-Log "gh CLI not found - branch pushed, create PR manually"
        }
    } else {
        Write-Log "AUTO_CREATE_PR=false - branch pushed, no PR created"
    }
} else {
    Write-Log "No new commits on $CycleBranch - cleaning up empty branch"
    Invoke-Git checkout $BaseBranch | Out-Null
    Invoke-Git branch -D $CycleBranch | Out-Null
}

Write-Log "Cycle complete."
exit 0
