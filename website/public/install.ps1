# SuperAgent installer — Core + CLI + Web
# Usage: irm https://<site>/install.ps1 | iex
$ErrorActionPreference = 'Stop'

Write-Host "SuperAgent installer — Core + CLI + Web" -ForegroundColor Cyan

# --- Prerequisite: Node.js >= 18 -------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js >= 18 is required. Download it from https://nodejs.org"
  exit 1
}
$NodeMajor = (node -v).TrimStart('v').Split('.')[0]
if ([int]$NodeMajor -lt 18) {
  Write-Error "Node.js >= 18 is required (found $(node -v))."
  exit 1
}

# --- Install ---------------------------------------------------------------
Write-Host "Installing @superagent/cli (pulls @superagent/core + web server) and @superagent/web globally…"
npm install -g @superagent/cli @superagent/web
if ($LASTEXITCODE -ne 0) {
  Write-Error "Global install failed. If this is a permission error, run your shell as Administrator and retry, or set a user-owned npm prefix."
  exit 1
}

Write-Host ""
Write-Host "Done. Run:" -ForegroundColor Green
Write-Host "  superagent               # interactive CLI (TUI)"
Write-Host "  superagent --start-web   # local web UI at http://localhost:3000"
Write-Host "  npx @superagent/web      # standalone web server (VPS / self-host)"
