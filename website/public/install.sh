#!/usr/bin/env sh
# SuperAgent installer — Core + CLI + Web
# Usage: curl -fsSL https://<site>/install.sh | sh
set -eu

echo "SuperAgent installer — Core + CLI + Web"

# --- Prerequisite: Node.js >= 18 -------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js >= 18 is required. Get it at https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR=$(node -v | sed 's/^v//;s/\..*//')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js >= 18 is required (found $(node -v))." >&2
  exit 1
fi

# --- Install ---------------------------------------------------------------
echo "Installing @superagent/cli (pulls @superagent/core + web server) and @superagent/web…"
if npm install -g @superagent/cli @superagent/web; then
  :
else
  echo "" >&2
  echo "Global install failed — this is usually a permissions issue with npm's" >&2
  echo "global prefix. Retry with a user-owned prefix, e.g.:" >&2
  echo "  npm config set prefix ~/.npm-global && export PATH=\"\$HOME/.npm-global/bin:\$PATH\"" >&2
  echo "  npm install -g @superagent/cli @superagent/web" >&2
  exit 1
fi

echo ""
echo "✓ Done. Try:"
echo "    superagent              # interactive CLI (TUI)"
echo "    superagent --start-web  # local web UI at http://localhost:3000"
echo "    npx @superagent/web     # standalone web server (VPS / self-host)"
