<#
.SYNOPSIS
    Pre-flight verification for the SuperAgent auto-improvement loop (Windows).
    Run this BEFORE starting any loop to confirm all required tools are available.

.DESCRIPTION
    Checks node, npm build, claude CLI + auth, gh CLI auth, git push access,
    superagent CLI (optional), lock file system, and WebSearch capability.
    Prints ✅ / ❌ for each check and exits with code 0 (all pass) or 1 (any fail).

.EXAMPLE
    .\verify-tools.ps1
    .\verify-tools.ps1 -RepoDir "D:\Project\OpenSource\AgentApp"
#>

param(
    [string]$RepoDir = (Get-Location).Path
)

$pass = 0; $fail = 0

function Check {
    param([string]$Name, [scriptblock]$Test, [bool]$Required = $true)
    try {
        $result = & $Test
        if ($result -is [bool] -and -not $result) { throw "returned false" }
        Write-Host "  ✅ $Name" -ForegroundColor Green
        $script:pass++
    } catch {
        $tag = if ($Required) { "❌" } else { "⚠️ (optional)" }
        Write-Host "  $tag $Name — $($_.Exception.Message)" -ForegroundColor $(if ($Required) { "Red" } else { "Yellow" })
        if ($Required) { $script:fail++ }
    }
}

Write-Host "`n🔍 SuperAgent Auto-Loop Tool Verification" -ForegroundColor Cyan
Write-Host "   Repo: $RepoDir`n"

Set-Location $RepoDir

# 1. Node.js version >= 18
Check "node >= v18" {
    $v = (node --version 2>&1).ToString().TrimStart('v')
    if ([int]($v.Split('.')[0]) -lt 18) { throw "node $v < 18" }
    $true
}

# 2. npm build passes
Check "npm run build (all workspaces)" {
    $out = npm run build 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "build failed — run 'npm run build' to see errors" }
    $true
}

# 3. claude CLI available
Check "claude CLI in PATH" {
    $null = Get-Command "claude" -ErrorAction Stop
    $true
}

# 4. claude CLI authenticated
Check "claude CLI authenticated (ping test)" {
    $result = echo "Say the word OK and nothing else" | claude --max-turns 1 --output-format json 2>&1
    if ($result -match '"is_error":true') { throw "claude returned is_error:true" }
    $true
}

# 5. gh CLI available
Check "gh CLI in PATH" {
    $null = Get-Command "gh" -ErrorAction Stop
    $true
}

# 6. gh CLI authenticated
Check "gh CLI authenticated" {
    $status = gh auth status 2>&1 | Out-String
    if ($status -notmatch "Logged in") { throw "gh not authenticated — run 'gh auth login'" }
    $true
}

# 7. git push access (dry run)
Check "git push access (dry run)" {
    $result = git push --dry-run 2>&1 | Out-String
    if ($result -match "Authentication failed|Permission denied|remote: error") {
        throw "git push auth failed — check your credentials"
    }
    $true
}

# 8. superagent CLI (optional)
Check "superagent CLI in PATH" {
    $null = Get-Command "superagent" -ErrorAction Stop
    $true
} -Required $false

# 9. Lock file system
Check "lock file create/delete (.claude/.auto-improve.lock)" {
    $lockPath = Join-Path $RepoDir ".claude\.auto-improve.lock"
    $testContent = '{"test":true}'
    Set-Content -Path $lockPath -Value $testContent -ErrorAction Stop
    $read = Get-Content $lockPath -ErrorAction Stop
    Remove-Item $lockPath -ErrorAction Stop
    if ($read -ne $testContent) { throw "lock file read-back mismatch" }
    $true
}

# 10. Branch creation (dry run)
Check "git branch create/delete (dry run)" {
    $testBranch = "verify-tools-test-$(Get-Date -Format 'HHmmss')"
    git checkout -B $testBranch 2>$null
    git checkout - 2>$null
    git branch -D $testBranch 2>$null
    $true
}

# 11. research-cache dir writable
Check "research-cache dir writable (.claude/research-cache)" {
    $dir = Join-Path $RepoDir ".claude\research-cache"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $test = Join-Path $dir "verify-test.tmp"
    Set-Content -Path $test -Value "test" -ErrorAction Stop
    Remove-Item $test -ErrorAction Stop
    $true
}

# 12. WebSearch via claude (real network check)
Check "WebSearch capability (online search test)" {
    $result = echo "Use WebSearch to find the current Node.js LTS version. Return only the version number." |
        claude --max-turns 2 --output-format json 2>&1 | Out-String
    if ($result -match '"is_error":true') { throw "WebSearch test returned error" }
    if ($result -notmatch "v\d+\.\d+|\d+\.\d+\.\d+") { throw "No version number found in response" }
    $true
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Results: $pass passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })

if ($fail -gt 0) {
    Write-Host "`n  Fix the ❌ failures above before starting the loop." -ForegroundColor Red
    Write-Host "  See docs\auto-improvement-system\tools-verification.md for help.`n"
    exit 1
} else {
    Write-Host "`n  All required checks passed! Ready to run the loop." -ForegroundColor Green
    Write-Host "  Next step: run one manual cycle to confirm end-to-end:"
    Write-Host "    `$env:SKILL='/auto-improve'; .\autodev\run-auto-improve.ps1`n"
    exit 0
}
