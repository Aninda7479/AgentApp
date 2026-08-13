# SuperAgent Uninstaller for Windows PowerShell
# Usage: irm https://aninda7479.github.io/AgentApp/uninstall.ps1 | iex

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "SuperAgent CLI Uninstaller (Standalone CLI)" -ForegroundColor Cyan
Write-Host "Note: This script uninstalls the CLI binary ($env:USERPROFILE\.local\bin\superagent.exe)." -ForegroundColor Gray
Write-Host "Desktop GUI apps (.msi) are uninstalled via Windows Installed Apps settings." -ForegroundColor Gray
Write-Host "--------------------------------------------------------------------------------"

function Prompt-YesNo ($Message, $DefaultYes = $true) {
  $defaultStr = if ($DefaultYes) { "[Y/n]" } else { "[y/N]" }
  Write-Host "$Message $defaultStr: " -NoNewline -ForegroundColor Yellow
  $response = Read-Host
  if ([string]::IsNullOrWhiteSpace($response)) { return $DefaultYes }
  if ($response -match '^[yY]') { return $true }
  if ($response -match '^[nN]') { return $false }
  return $DefaultYes
}

$BinDir = "$env:USERPROFILE\.local\bin"
$TargetBin = "$BinDir\superagent.exe"
$DataDir = "$env:USERPROFILE\.superagent"

# 1. Remove binary executable
if (Prompt-YesNo "Do you want to remove the SuperAgent binary executable?" $true) {
  $removed = $false
  if (Test-Path $TargetBin) {
    Remove-Item -Force $TargetBin
    Write-Host "✓ Removed executable at $TargetBin" -ForegroundColor Green
    $removed = $true
  }
  $cmdBin = (Get-Command superagent -ErrorAction SilentlyContinue).Path
  if ($cmdBin -and (Test-Path $cmdBin) -and ($cmdBin -ne $TargetBin)) {
    Remove-Item -Force $cmdBin
    Write-Host "✓ Removed executable at $cmdBin" -ForegroundColor Green
    $removed = $true
  }
  if (-not $removed) {
    Write-Host "No installed binary found to remove."
  }
}

# 2. Remove from User PATH
if (Prompt-YesNo "Do you want to remove $BinDir from your Environment PATH?" $true) {
  $UserPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  if ($UserPath -like "*$BinDir*") {
    $newPath = ($UserPath -split ';' | Where-Object { $_ -and $_ -ne $BinDir }) -join ';'
    [System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host "✓ Removed $BinDir from User Environment PATH" -ForegroundColor Green
  }
  if ($env:Path -like "*$BinDir*") {
    $env:Path = ($env:Path -split ';' | Where-Object { $_ -and $_ -ne $BinDir }) -join ';'
    Write-Host "✓ Removed $BinDir from active session PATH" -ForegroundColor Green
  }
}

# 3. Remove Data Directory
if (Test-Path $DataDir) {
  if (Prompt-YesNo "Do you want to delete the configuration and data directory ($DataDir)?" $false) {
    Remove-Item -Recurse -Force $DataDir
    Write-Host "✓ Deleted data directory $DataDir" -ForegroundColor Green
  } else {
    Write-Host "Kept data directory at $DataDir"
  }
}

Write-Host ""
Write-Host "✓ SuperAgent uninstallation completed." -ForegroundColor Green
