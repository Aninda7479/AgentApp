#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function findDotnet() {
  // 1. Try directly if on PATH
  try {
    const probe = spawnSync('dotnet', ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) return 'dotnet';
  } catch (_) {}

  // 2. Candidate paths
  const candidates = [];
  if (process.platform === 'win32') {
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'dotnet', 'dotnet.exe'));
    }
    if (process.env.USERPROFILE) {
      candidates.push(path.join(process.env.USERPROFILE, '.dotnet', 'dotnet.exe'));
      candidates.push(path.join(process.env.USERPROFILE, 'AppData', 'Local', 'dotnet', 'dotnet.exe'));
    }
    if (process.env['ProgramFiles']) {
      candidates.push(path.join(process.env['ProgramFiles'], 'dotnet', 'dotnet.exe'));
    }
    candidates.push('C:\\Program Files\\dotnet\\dotnet.exe');
  } else {
    if (process.env.HOME) {
      candidates.push(path.join(process.env.HOME, '.dotnet', 'dotnet'));
    }
    candidates.push('/usr/local/share/dotnet/dotnet');
    candidates.push('/usr/share/dotnet/dotnet');
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const dotnetBin = findDotnet();
if (!dotnetBin) {
  console.error('\x1b[31m[error] .NET SDK (dotnet) was not found on your system.\x1b[0m');
  console.error('Please install .NET 8 SDK from: https://dotnet.microsoft.com/download/dotnet/8.0');
  console.error('Or install via winget: winget install Microsoft.DotNet.SDK.8');
  process.exit(1);
}

// Ensure parent dir of dotnetBin is in process.env.PATH so sub-processes (msbuild, sdk) find it
const dotnetDir = path.dirname(dotnetBin);
if (dotnetDir && dotnetDir !== '.') {
  const delim = process.platform === 'win32' ? ';' : ':';
  process.env.PATH = `${dotnetDir}${delim}${process.env.PATH || ''}`;
}

const args = process.argv.slice(2);
const res = spawnSync(dotnetBin, args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(res.status ?? (res.error ? 1 : 0));
