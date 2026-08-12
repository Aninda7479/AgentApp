# SuperAgent installer — Core + CLI + Web (Server / HomeLab)
# Usage: irm https://aninda7479.github.io/AgentApp/install.ps1 | iex
#
# Downloads the self-contained standalone binary from GitHub Releases.
# Zero prerequisites required (no Node.js or npm needed).
$ErrorActionPreference = 'Stop'

Write-Host "SuperAgent installer — Core + CLI + Web" -ForegroundColor Cyan

# ── Fetch latest version ───────────────────────────────────────────────────
Write-Host "Checking latest release from GitHub..."
$api = "https://api.github.com/repos/Aninda7479/AgentApp/releases/latest"
$release = Invoke-RestMethod -Uri $api -Headers @{ "User-Agent" = "superagent-installer" }
$Version = $release.tag_name -replace '^v', ''
if (-not $Version) {
  Write-Error "Could not determine latest version from GitHub."
  exit 1
}
Write-Host "Latest version: v$Version"

# ── Download ───────────────────────────────────────────────────────────────
$Asset   = "superagent-cli-v$Version-windows-x64.zip"
$Url     = "https://github.com/Aninda7479/AgentApp/releases/download/v$Version/$Asset"
$BinDir  = "$env:USERPROFILE\.local\bin"
$Tmp     = [System.IO.Path]::GetTempFileName() + ".zip"

Write-Host "Downloading $Asset..."
Invoke-WebRequest -Uri $Url -OutFile $Tmp -UseBasicParsing

# ── Extract ────────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$TmpExtract = "$env:TEMP\superagent-extract-$(Get-Random)"
Expand-Archive -Path $Tmp -DestinationPath $TmpExtract -Force
Remove-Item $Tmp -Force

if (Test-Path "$TmpExtract\superagent.exe") {
  Copy-Item "$TmpExtract\superagent.exe" "$BinDir\superagent.exe" -Force
} elseif (Test-Path "$TmpExtract\superagent-cli.exe") {
  Copy-Item "$TmpExtract\superagent-cli.exe" "$BinDir\superagent.exe" -Force
}
Remove-Item $TmpExtract -Recurse -Force -ErrorAction SilentlyContinue

# ── Environment PATH setup ─────────────────────────────────────────────────
$UserPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
if ($UserPath -notlike "*$BinDir*") {
  [System.Environment]::SetEnvironmentVariable('Path', "$UserPath;$BinDir", 'User')
  $env:Path += ";$BinDir"
}

Write-Host ""
Write-Host "✓ Done! SuperAgent v$Version binary installed to $BinDir\superagent.exe" -ForegroundColor Green
Write-Host ""
Write-Host "Run SuperAgent directly:"
Write-Host "  superagent                       # interactive CLI (TUI)"
Write-Host "  superagent --serve               # web UI at http://localhost:14692"
Write-Host "  superagent --serve-port 8080     # web UI on a custom port"
Write-Host "  superagent update                # check / update to a newer release"

