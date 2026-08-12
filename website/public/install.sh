#!/usr/bin/env sh
# SuperAgent installer — Core + CLI + Web (Server / HomeLab)
# Usage: curl -fsSL https://aninda7479.github.io/AgentApp/install.sh | sh
#
# Downloads the self-contained standalone binary from GitHub Releases.
# Zero prerequisites required (no Node.js or npm needed).
set -eu

REPO="Aninda7479/AgentApp"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "${CYAN}SuperAgent installer — Core + CLI + Web${NC}"

# ── Fetch latest version from GitHub ────────────────────────────────────────
echo "Checking latest release…"
LATEST_JSON=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")
VERSION=$(echo "$LATEST_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"v\?\([^"]*\)".*/\1/')
if [ -z "$VERSION" ]; then
  echo "${RED}Error: Could not fetch latest version from GitHub.${NC}" >&2
  exit 1
fi
echo "Latest version: v${VERSION}"

# ── Detect platform ──────────────────────────────────────────────────────────
OS=$(uname -s)
ARCH=$(uname -m)

if [ "$OS" = "Darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then
    ASSET="superagent-cli-v${VERSION}-macos-arm64.zip"
    EXT="zip"
  else
    ASSET="superagent-cli-v${VERSION}-macos-x64.zip"
    EXT="zip"
  fi
else
  if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ASSET="superagent-cli-v${VERSION}-linux-arm64.tar.gz"
    EXT="tar.gz"
  else
    ASSET="superagent-cli-v${VERSION}-linux-x64.tar.gz"
    EXT="tar.gz"
  fi
fi

URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
LAUNCHER_DIR="$HOME/.local/bin"
TARGET_BIN="$LAUNCHER_DIR/superagent"

# ── Download & Extract ──────────────────────────────────────────────────────
echo "Downloading ${ASSET}…"
TMP=$(mktemp -d)
curl -fsSL "$URL" -o "$TMP/$ASSET"

mkdir -p "$LAUNCHER_DIR"

if [ "$EXT" = "zip" ]; then
  unzip -q "$TMP/$ASSET" -d "$TMP/extracted"
  if [ -f "$TMP/extracted/superagent" ]; then
    mv "$TMP/extracted/superagent" "$TARGET_BIN"
  elif [ -f "$TMP/extracted/superagent-cli" ]; then
    mv "$TMP/extracted/superagent-cli" "$TARGET_BIN"
  fi
else
  tar -xzf "$TMP/$ASSET" -C "$TMP"
  if [ -f "$TMP/superagent" ]; then
    mv "$TMP/superagent" "$TARGET_BIN"
  elif [ -f "$TMP/superagent-cli" ]; then
    mv "$TMP/superagent-cli" "$TARGET_BIN"
  fi
fi
rm -rf "$TMP"
chmod +x "$TARGET_BIN"

# ── Update PATH in RC files if needed ────────────────────────────────────────
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
case ":$PATH:" in
  *":$LAUNCHER_DIR:"*) ;;
  *)
    for RC in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
      if [ -f "$RC" ] && ! grep -q '\.local/bin' "$RC"; then
        echo "" >> "$RC"
        echo "$PATH_LINE" >> "$RC"
      fi
    done
    ;;
esac

echo ""
echo "${GREEN}✓ Done! SuperAgent v${VERSION} binary installed to ${TARGET_BIN}${NC}"
echo ""
echo "Run SuperAgent directly:"
echo "    superagent                      # interactive CLI (TUI)"
echo "    superagent --serve              # web UI at http://localhost:14692"
echo "    superagent --serve-port 8080    # web UI on a custom port"
echo "    superagent update               # check / update to a newer release"

