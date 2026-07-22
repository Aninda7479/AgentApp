<#
.SYNOPSIS
  Spawn an isolated Claude/SuperAgent worker for /skill-loop (Windows).

.DESCRIPTION
  Reads .claude/loop/pending-worker.json, launches a FRESH headless session
  that executes only that worker skill for one cycle, and requires the worker
  to write .claude/loop/result-*.json.

  The parent /skill-loop session should only read the result JSON — not this
  script's full worker log (unless debugging a failure; tail only).

.NOTES
  Run from repo root:
    powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/skill-loop/spawn-worker.ps1
#>

[CmdletBinding()]
param(
    # Override driver: claude | superagent | auto
    [ValidateSet("auto", "claude", "superagent")]
    [string]$Driver = "auto",

    # Soft cap so a stuck worker cannot run forever (0 = unlimited)
    [int]$MaxTurns = 80,

    [int]$TimeoutMinutes = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Resolve repo root (this script is at .claude/skills/skill-loop/)
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
Set-Location $RepoRoot

$LoopDir = Join-Path $RepoRoot ".claude\loop"
New-Item -ItemType Directory -Force -Path $LoopDir | Out-Null

$PendingPath = Join-Path $LoopDir "pending-worker.json"
if (-not (Test-Path $PendingPath)) {
    Write-Error "Missing $PendingPath — /skill-loop must write it before spawn."
    exit 2
}

$pending = Get-Content $PendingPath -Raw | ConvertFrom-Json
$workerSkill = [string]$pending.worker_skill
if (-not $workerSkill) { Write-Error "pending-worker.json missing worker_skill"; exit 2 }
if ($workerSkill -notmatch '^/') { $workerSkill = "/$workerSkill" }
if ($workerSkill -eq "/skill-loop") { Write-Error "Refusing to spawn skill-loop (no recursion)"; exit 2 }

$focus = [string]$pending.focus_hint
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$resultPath = Join-Path $LoopDir "result-$ts.json"
$workerLog = Join-Path $LoopDir "worker-$ts.log"
$stderrLog = Join-Path $LoopDir "worker-$ts.stderr.log"

# Resolve driver binary
function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

$use = $Driver
if ($use -eq "auto") {
    if (Test-Cmd "claude") { $use = "claude" }
    elseif (Test-Cmd "superagent") { $use = "superagent" }
    else {
        @{
            skill              = $workerSkill.TrimStart("/")
            status             = "skipped"
            committed          = "none"
            summary            = "spawn-worker: neither claude nor superagent CLI found in PATH"
            files_changed      = @()
            verify             = @{ build = "SKIP"; tests = "SKIP"; live = "SKIP" }
            certain_promoted   = $null
            next_queue         = @()
            open_questions     = @("Install Claude Code CLI or SuperAgent CLI for worker spawn")
            duration_minutes   = 0
        } | ConvertTo-Json -Depth 6 | Set-Content $resultPath -Encoding utf8
        Write-Host "SKIP: no worker CLI. Wrote $resultPath"
        exit 0
    }
}

$workerName = $workerSkill.TrimStart("/")
$skillFile = Join-Path $RepoRoot ".claude\skills\$workerName\SKILL.md"
if (-not (Test-Path $skillFile)) {
    Write-Error "Worker skill file not found: $skillFile"
    exit 2
}

# Prompt is self-contained so the worker session does not need the parent context.
$currentBranch = (git rev-parse --abbrev-ref HEAD 2>$null)
if (-not $currentBranch) { $currentBranch = "unknown" }

$prompt = @"
You are an isolated SuperAgent WORKER subagent. Fresh context. One cycle only.

DISPATCH:
- worker_skill: $workerSkill
- focus_hint: $focus
- result_path: $resultPath
- pending: .claude/loop/pending-worker.json
- current_git_branch: $currentBranch

MANDATORY STEPS:
1. Read .claude/skills/_shared/RESULTS-CONTRACT.md
2. Read .claude/skills/$workerName/SKILL.md and EXECUTE that skill for ONE full cycle (implement/verify/commit/log as that skill requires).
3. Prefer focus_hint when choosing the deliverable.
4. GIT: Stay on branch '$currentBranch'. Do NOT create a new branch, checkout main, or force-push. Commit on the current branch only (the outer autodev driver owns the branch/PR).
5. BEFORE you exit, Write the file exactly at:
   $resultPath
   using this JSON shape (valid JSON, no markdown fence):
{
  "skill": "$workerName",
  "status": "success|failed|skipped",
  "committed": "<hash or none>",
  "branch": "$currentBranch",
  "summary": "<one line>",
  "files_changed": [],
  "verify": { "build": "PASS|FAIL|SKIP", "tests": "PASS|FAIL|SKIP", "live": "PASS|SKIP" },
  "certain_promoted": null,
  "next_queue": ["..."],
  "open_questions": [],
  "duration_minutes": 0
}
6. status=success only if you committed, promoted CERTAIN, or fixed a P0 security issue.
7. Do NOT run /skill-loop. Do NOT spawn other top-level skills.
8. Windows-first: use PowerShell; put build logs under .claude/tmp/
"@

$promptFile = Join-Path $LoopDir "prompt-$ts.txt"
Set-Content -Path $promptFile -Value $prompt -Encoding utf8

Write-Host "spawn-worker: driver=$use skill=$workerSkill result=$resultPath"

$allowed = "Read,Grep,Glob,Edit,Write,Bash,WebSearch,WebFetch,TodoWrite"
$started = Get-Date

try {
    if ($use -eq "claude") {
        $argList = @(
            "-p", $prompt,
            "--permission-mode", "acceptEdits",
            "--allowedTools", $allowed,
            "--output-format", "json"
        )
        if ($MaxTurns -gt 0) {
            $argList += @("--max-turns", "$MaxTurns")
        }

        $p = Start-Process -FilePath "claude" `
            -ArgumentList $argList `
            -WorkingDirectory $RepoRoot `
            -RedirectStandardOutput $workerLog `
            -RedirectStandardError $stderrLog `
            -NoNewWindow `
            -PassThru

        $timeoutMs = [Math]::Max(1, $TimeoutMinutes) * 60 * 1000
        if (-not $p.WaitForExit($timeoutMs)) {
            try { $p.Kill() } catch {}
            throw "Worker timed out after $TimeoutMinutes minutes"
        }
        $exitCode = $p.ExitCode
    }
    else {
        # SuperAgent CLI: pipe prompt as user message if -p unsupported — try common shapes
        $saArgs = @("-p", $prompt, "--yes")
        $p = Start-Process -FilePath "superagent" `
            -ArgumentList $saArgs `
            -WorkingDirectory $RepoRoot `
            -RedirectStandardOutput $workerLog `
            -RedirectStandardError $stderrLog `
            -NoNewWindow `
            -PassThru
        $timeoutMs = [Math]::Max(1, $TimeoutMinutes) * 60 * 1000
        if (-not $p.WaitForExit($timeoutMs)) {
            try { $p.Kill() } catch {}
            throw "Worker timed out after $TimeoutMinutes minutes"
        }
        $exitCode = $p.ExitCode
    }
}
catch {
    $mins = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
    @{
        skill            = $workerName
        status           = "failed"
        committed        = "none"
        summary          = "spawn-worker exception: $($_.Exception.Message)"
        files_changed    = @()
        verify           = @{ build = "SKIP"; tests = "SKIP"; live = "SKIP" }
        certain_promoted = $null
        next_queue       = @()
        open_questions   = @($_.Exception.Message)
        duration_minutes = $mins
        worker_exit_code = -1
        worker_log       = $workerLog
    } | ConvertTo-Json -Depth 6 | Set-Content $resultPath -Encoding utf8
    Write-Host "FAILED: $($_.Exception.Message)"
    exit 1
}

$mins = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)

# If worker forgot to write result JSON, synthesize from exit code
if (-not (Test-Path $resultPath)) {
    $tail = ""
    if (Test-Path $workerLog) {
        $tail = (Get-Content $workerLog -Tail 5 -ErrorAction SilentlyContinue) -join " | "
    }
    $status = if ($exitCode -eq 0) { "failed" } else { "failed" }
    @{
        skill            = $workerName
        status           = $status
        committed        = "none"
        summary          = "Worker exited without result JSON (exit=$exitCode). Tail: $tail"
        files_changed    = @()
        verify           = @{ build = "SKIP"; tests = "SKIP"; live = "SKIP" }
        certain_promoted = $null
        next_queue       = @()
        open_questions   = @("Worker did not write $resultPath")
        duration_minutes = $mins
        worker_exit_code = $exitCode
        worker_log       = $workerLog
    } | ConvertTo-Json -Depth 6 | Set-Content $resultPath -Encoding utf8
    Write-Host "WARN: synthesized result JSON (worker omitted file)"
    exit 0
}

Write-Host "spawn-worker done: exit=$exitCode duration=${mins}m result=$resultPath"
exit 0
