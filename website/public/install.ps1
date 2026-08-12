# SuperAgent installer — Core + CLI + Web (Server / HomeLab)
# Usage: irm https://aninda7479.github.io/AgentApp/install.ps1 | iex
#
# Downloads the pre-built Windows server zip from GitHub Releases.
# Node.js >= 18 is required to run the server.
$ErrorActionPreference = 'Stop'

Write-Host "SuperAgent installer — Core + CLI + Web" -ForegroundColor Cyan

# ── Detect Node.js ─────────────────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js >= 18 is required. Download it from https://nodejs.org"
  exit 1
}
$NodeMajor = (node -v).TrimStart('v').Split('.')[0]
if ([int]$NodeMajor -lt 18) {
  Write-Error "Node.js >= 18 is required (found $(node -v))."
  exit 1
}

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
$Asset   = "superagent-server-v$Version-windows-x64.zip"
$Url     = "https://github.com/Aninda7479/AgentApp/releases/download/v$Version/$Asset"
$InstDir = "$env:USERPROFILE\.superagent-server"
$Tmp     = [System.IO.Path]::GetTempFileName() + ".zip"

Write-Host "Downloading $Asset..."
Invoke-WebRequest -Uri $Url -OutFile $Tmp -UseBasicParsing

# ── Extract ────────────────────────────────────────────────────────────────
if (Test-Path $InstDir) { Remove-Item $InstDir -Recurse -Force }
Write-Host "Extracting to $InstDir..."
Expand-Archive -Path $Tmp -DestinationPath "$InstDir-tmp" -Force
Remove-Item $Tmp -Force

# Flatten one level (archive contains superagent-server-vX.Y.Z-windows-x64\)
$Inner = Get-ChildItem "$InstDir-tmp" | Select-Object -First 1
if ($Inner -and (Test-Path "$($Inner.FullName)\cli")) {
  Move-Item $Inner.FullName $InstDir
} else {
  Move-Item "$InstDir-tmp" $InstDir
}
Remove-Item "$InstDir-tmp" -Recurse -Force -ErrorAction SilentlyContinue

# ── Create launcher batch file ─────────────────────────────────────────────
$BinDir  = "$env:USERPROFILE\.local\bin"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$Launcher = "$BinDir\superagent.cmd"
Set-Content -Path $Launcher -Value "@echo off`nnode `"$InstDir\cli\dist\bin\main.js`" %*"

Write-Host ""
Write-Host "✓ Done! SuperAgent v$Version installed to $InstDir" -ForegroundColor Green
Write-Host ""
Write-Host "Add to your PATH (run once, then restart your terminal):"
Write-Host "  [System.Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$BinDir', 'User')"
Write-Host ""
Write-Host "Then run:"
Write-Host "  superagent                       # interactive CLI (TUI)"
Write-Host "  superagent --serve               # web UI at http://localhost:14692"
Write-Host "  superagent --serve-port 8080     # web UI on a custom port"
Write-Host "  superagent update                # check / update to a newer release"
