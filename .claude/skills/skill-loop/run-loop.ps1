<#
.SYNOPSIS
  Outer loop driver for /skill-loop — restarts a thin orchestrator each cycle.

.DESCRIPTION
  Each iteration starts a FRESH main session for /skill-loop only.
  That session spawns worker subagents; implementation context dies with the worker.
  This script never keeps multi-cycle chat history.

.EXAMPLE
  # Infinite (Ctrl+C to stop)
  .\.claude\skills\skill-loop\run-loop.ps1

  # Ten orchestrator cycles, 3 minutes between
  .\.claude\skills\skill-loop\run-loop.ps1 -Iterations 10 -SleepSeconds 180

  # Full round of up to 4 workers per orchestrator session
  .\.claude\skills\skill-loop\run-loop.ps1 -Mode round -Iterations 5
#>

[CmdletBinding()]
param(
    # 0 = infinite
    [int]$Iterations = 0,

    [ValidateSet("once", "round")]
    [string]$Mode = "once",

    [int]$SleepSeconds = 120,

    # If true, use autodev branch/PR machinery; else bare claude -p /skill-loop
    [switch]$UseAutodev = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
Set-Location $RepoRoot

$PauseFile = Join-Path $RepoRoot ".claude\.auto-improve.pause"
$LogDir = Join-Path $RepoRoot "logs\skill-loop"
New-Item -ItemType Directory -Force -Path $LogDir, (Join-Path $RepoRoot ".claude\loop") | Out-Null

function Write-LoopLog([string]$Msg) {
    $line = "$(Get-Date -Format o) $Msg"
    Add-Content -Path (Join-Path $LogDir "outer.log") -Value $line
    Write-Host $line
}

Write-LoopLog "skill-loop outer start mode=$Mode iterations=$Iterations useAutodev=$UseAutodev"

$n = 0
while ($true) {
    $n++
    if ($Iterations -gt 0 -and $n -gt $Iterations) {
        Write-LoopLog "Reached $Iterations iterations — stop"
        break
    }

    if (Test-Path $PauseFile) {
        Write-LoopLog "Paused ($PauseFile) — sleep 60s"
        Start-Sleep -Seconds 60
        $n--  # don't count pause waits if finite iterations
        continue
    }

    Write-LoopLog "=== outer cycle $n ==="

    if ($UseAutodev -and (Test-Path (Join-Path $RepoRoot "autodev\run-auto-improve.ps1"))) {
        $env:SKILL = "/skill-loop"
        # Pass mode via env for future prompt injection; skill also reads $ARGUMENTS from user
        $env:SKILL_LOOP_MODE = $Mode
        try {
            & (Join-Path $RepoRoot "autodev\run-auto-improve.ps1")
        }
        catch {
            Write-LoopLog "autodev error: $($_.Exception.Message)"
        }
    }
    else {
        if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
            Write-LoopLog "FATAL: claude CLI not found and UseAutodev path unavailable"
            exit 1
        }
        $arg = if ($Mode -eq "round") { "/skill-loop round" } else { "/skill-loop once" }
        $out = Join-Path $LogDir ("main-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
        $claudeArgs = @(
            "-p", $arg,
            "--permission-mode", "acceptEdits",
            "--allowedTools", "Read,Grep,Bash,Write,TodoWrite",
            "--output-format", "json"
        )
        # Main orchestrator should stay short-lived
        $claudeArgs += @("--max-turns", "25")
        $p = Start-Process -FilePath "claude" -ArgumentList $claudeArgs `
            -WorkingDirectory $RepoRoot `
            -RedirectStandardOutput $out `
            -RedirectStandardError (Join-Path $LogDir "main-stderr.log") `
            -NoNewWindow -PassThru
        $null = $p.WaitForExit(45 * 60 * 1000)
        if (-not $p.HasExited) {
            try { $p.Kill() } catch {}
            Write-LoopLog "Main skill-loop timed out (45m)"
        }
        else {
            Write-LoopLog "Main exit=$($p.ExitCode) log=$out"
        }
    }

    Write-LoopLog "Sleep ${SleepSeconds}s before next outer cycle"
    Start-Sleep -Seconds $SleepSeconds
}

Write-LoopLog "skill-loop outer finished"
