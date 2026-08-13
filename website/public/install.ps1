# SuperAgent installer — Core + CLI + Web (Server / HomeLab)
# Usage: irm https://aninda7479.github.io/AgentApp/install.ps1 | iex
#
# Downloads the self-contained standalone binary from GitHub Releases.
# Zero prerequisites required (no Node.js or npm needed).
$ErrorActionPreference = 'Stop'

Write-Host "SuperAgent installer — Core + CLI + Web" -ForegroundColor Cyan

# ── Fetch latest version ───────────────────────────────────────────────────
Write-Host "Checking latest release from GitHub..."
$Repo = "Aninda7479/AgentApp"
$Version = ""

# 1. Primary: Extract version from web redirect (bypasses api.github.com 60 req/hr rate limits)
try {
  $req = [System.Net.WebRequest]::Create("https://github.com/$Repo/releases/latest")
  $req.Method = "HEAD"
  $req.UserAgent = "SuperAgent-Installer"
  $resp = $req.GetResponse()
  $location = $resp.ResponseUri.AbsoluteUri
  $resp.Close()
  if ($location -match '/tag/v?([^/]+)$') {
    $Version = $Matches[1]
  }
} catch {
  $Version = ""
}

# 2. Fallback: Query GitHub API
if (-not $Version) {
  try {
    $api = "https://api.github.com/repos/$Repo/releases/latest"
    $release = Invoke-RestMethod -Uri $api -Headers @{ "User-Agent" = "SuperAgent-Installer" }
    $Version = $release.tag_name -replace '^v', ''
  } catch {
    $Version = ""
  }
}

if (-not $Version) {
  Write-Error "Could not determine latest version from GitHub."
  exit 1
}
Write-Host "Latest version: v$Version"

$BinDir = "$env:USERPROFILE\.local\bin"
$TargetBin = "$BinDir\superagent.exe"

# ── Check if already installed & up to date ──────────────────────────────────
$InstalledVer = ""
if (Get-Command superagent -ErrorAction SilentlyContinue) {
  try { $InstalledVer = (superagent --version 2>$null) } catch {}
} elseif (Test-Path $TargetBin) {
  try { $InstalledVer = (& $TargetBin --version 2>$null) } catch {}
}

if ($InstalledVer) {
  $match = [regex]::Match($InstalledVer, '(\d+\.\d+\.\d+)')
  if ($match.Success) { $InstalledVer = $match.Groups[1].Value }
}

if ($InstalledVer -and $InstalledVer -eq $Version) {
  if ($env:FORCE -ne "1") {
    Write-Host ""
    Write-Host "✓ SuperAgent v$Version is already installed and up to date at $TargetBin" -ForegroundColor Green
    Write-Host ""
    Write-Host "To force reinstall, run:"
    Write-Host "  `$env:FORCE='1'; irm https://aninda7479.github.io/AgentApp/install.ps1 | iex"
    Write-Host ""
    exit 0
  }
}

# ── Download ───────────────────────────────────────────────────────────────
$Asset   = "superagent-cli-v$Version-windows-x64.zip"
$Url     = "https://github.com/$Repo/releases/download/v$Version/$Asset"
$Tmp     = [System.IO.Path]::GetTempFileName() + ".zip"

Write-Host "Downloading $Asset..."
Invoke-WebRequest -Uri $Url -OutFile $Tmp -UseBasicParsing

# ── Extract ────────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$TmpExtract = "$env:TEMP\superagent-extract-$(Get-Random)"
Expand-Archive -Path $Tmp -DestinationPath $TmpExtract -Force
Remove-Item $Tmp -Force

if (Test-Path "$TmpExtract\superagent.exe") {
  Copy-Item "$TmpExtract\superagent.exe" "$TargetBin" -Force
} elseif (Test-Path "$TmpExtract\superagent-cli.exe") {
  Copy-Item "$TmpExtract\superagent-cli.exe" "$TargetBin" -Force
}
Remove-Item $TmpExtract -Recurse -Force -ErrorAction SilentlyContinue

# ── Environment PATH setup ─────────────────────────────────────────────────
$UserPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
if ($UserPath -notlike "*$BinDir*") {
  [System.Environment]::SetEnvironmentVariable('Path', "$UserPath;$BinDir", 'User')
}
if ($env:Path -notlike "*$BinDir*") {
  $env:Path += ";$BinDir"
}

Write-Host ""
Write-Host "✓ Done! SuperAgent v$Version binary installed to $TargetBin" -ForegroundColor Green
Write-Host ""
Write-Host "Run SuperAgent directly:"
Write-Host "  superagent                       # interactive CLI (TUI)"
Write-Host "  superagent --serve               # web UI at http://localhost:14692"
Write-Host "  superagent --serve-port 8080     # web UI on a custom port"
Write-Host "  superagent update                # check / update to a newer release"

