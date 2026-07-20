<#
.SYNOPSIS
    SuperAgent Auto-Improvement Loop driver using SuperAgent CLI (Windows PowerShell).
    Runs SuperAgent CLI directly for self-hosting autonomous improvement.

.DESCRIPTION
    Runs ONE skill cycle using the `superagent` CLI binary.
    Creates a per-cycle dated branch (auto/YYYY-MM-DD-HHmm-<skill>-sa),
    commits changes, pushes to remote, and creates a draft PR via `gh` CLI.
    Falls back to `claude` CLI if `superagent` CLI is not found.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Load .env file if present
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
$SaProvider   = if ($env:SA_PROVIDER) { $env:SA_PROVIDER } else { "anthropic" }
$SaModel      = if ($env:SA_MODEL) { $env:SA_MODEL } else { "claude-opus-4-5" }

if ($BaseBranch -eq "main") {
    Write-Error "Refusing to run: BASE_BRANCH is 'main'. Use 'agent-development' or a side branch."
    exit 1
}

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$Ts          = (Get-Date -Format "yyyyMMddTHHmmssZ")
$SkillName   = $Skill.TrimStart('/')
$CycleBranch = "$BranchPrefix/$(Get-Date -Format 'yyyy-MM-dd-HHmm')-${SkillName}-sa"
$RunLog      = Join-Path $LogDir "${Ts}_${SkillName}_sa.log"
$DriverLog   = Join-Path $LogDir "driver-sa.log"

function Write-Log {
    param([string]$Msg)
    "$Ts [SA:$SkillName] $Msg" | Tee-Object -FilePath $DriverLog -Append | Write-Host
}

if (Test-Path $PauseFile) {
    Write-Log "paused (found $PauseFile) - skipping cycle"
    exit 0
}

Set-Location $RepoDir
New-Item -ItemType Directory -Path ".claude\research-cache" -Force | Out-Null
New-Item -ItemType Directory -Path ".playwright" -Force | Out-Null

# Git helper: runs git without letting PowerShell treat its stderr / non-zero
# exit as a terminating NativeCommandError under $ErrorActionPreference = "Stop".
# Pass -StdOut ([ref]$var) to capture stdout (e.g. status / log output).
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

Invoke-Git fetch origin $BaseBranch | Out-Null

$showRef = Invoke-Git show-ref --verify --quiet "refs/remotes/origin/$BaseBranch"
if ($showRef.ExitCode -eq 0) {
    Invoke-Git checkout -B $CycleBranch "origin/$BaseBranch" | Out-Null
} else {
    Invoke-Git checkout -B $CycleBranch | Out-Null
}

$status = Invoke-Git status --porcelain
$dirty = $status.Output
if ($dirty) {
    Write-Log "Working tree dirty - skipping cycle"
    exit 0
}

$env:AUTO_IMPROVE_RUN = "win-sa-$Ts"

$saCmd = Get-Command "superagent" -ErrorAction SilentlyContinue
if ($saCmd) {
    Write-Log "Running via SuperAgent CLI (provider=$SaProvider, model=$SaModel)"
    & superagent --provider $SaProvider --model $SaModel -p $Skill *>&1 | Tee-Object -FilePath $RunLog
} else {
    Write-Log "superagent CLI not found - falling back to claude CLI"
    & claude -p $Skill --allowedTools "Read,Grep,Glob,Edit,Write,Bash,WebSearch,WebFetch,TodoWrite" --permission-mode acceptEdits --output-format json *>&1 | Tee-Object -FilePath $RunLog
}

$log = Invoke-Git log "origin/$BaseBranch..HEAD" --oneline
$newCommits = $log.Output
if ($newCommits) {
    Invoke-Git push -u origin $CycleBranch | Out-Null
    Write-Log "Pushed branch: $CycleBranch"

    $LatestLog = (Get-Content ".claude\auto-improve-log.log" -Tail 60 -ErrorAction SilentlyContinue) -join "`n"
    if (-not $LatestLog) { $LatestLog = "No log entry found" }
    $Commits = $newCommits | Select-Object -First 10 | Out-String

    $PrBody = @"
## [AutoLoop:SA] $SkillName - $(Get-Date -Format 'yyyy-MM-dd')

> Run by SuperAgent CLI (self-hosting autonomous improvement).
> Provider: $SaProvider | Model: $SaModel

### Commits
``````
$Commits
``````

### Skill Log
``````
$LatestLog
``````

### Review Checklist
- [ ] Read diff
- [ ] Research sources verified
- [ ] No secrets committed
- [ ] Merge -&gt; ``$BaseBranch`` when satisfied
"@
    $PrBodyFile = ".claude\pr-body-latest.md"
    $PrBody | Set-Content -Path $PrBodyFile -Encoding UTF8

    if ($AutoCreatePr -and (Get-Command "gh" -ErrorAction SilentlyContinue)) {
        try {
            gh pr create --draft --base $BaseBranch --head $CycleBranch --title "[AutoLoop:SA] $SkillName - $(Get-Date -Format 'yyyy-MM-dd')" --body-file $PrBodyFile --label "auto-generated" 2>> $DriverLog
            Write-Log "Draft PR created -&gt; $BaseBranch"
        } catch {
            Write-Log "gh pr create failed - branch pushed"
        }
    }
} else {
    Write-Log "No new commits - cleaning up branch"
    Invoke-Git checkout $BaseBranch | Out-Null
    Invoke-Git branch -D $CycleBranch | Out-Null
}

Write-Log "Cycle complete."
exit 0
