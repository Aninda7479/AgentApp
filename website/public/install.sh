#!/usr/bin/env sh
# SuperAgent installer — Core + CLI + Web (Server / HomeLab)
# Usage: curl -fsSL https://aninda7479.github.io/AgentApp/install.sh | sh
#
# Downloads the pre-built server tarball from GitHub Releases.
# Node.js >= 18 is still required to run the server.
set -eu

REPO="Aninda7479/AgentApp"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "${CYAN}SuperAgent installer — Core + CLI + Web${NC}"

# ── Detect Node.js ──────────────────────────────────────────────────────────
if ! command -v node > /dev/null 2>&1; then
  echo "${RED}Error: Node.js >= 18 is required. Get it at https://nodejs.org${NC}" >&2
  exit 1
fi
NODE_MAJOR=$(node -v | sed 's/^v//;s/\..*//')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "${RED}Error: Node.js >= 18 is required (found $(node -v)).${NC}" >&2
  exit 1
fi

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
    ASSET="superagent-server-v${VERSION}-macos-arm64.zip"
    EXT="zip"
  else
    # Intel mac — use linux-x64 bundle (Node.js is cross-platform)
    ASSET="superagent-server-v${VERSION}-linux-x64.tar.gz"
    EXT="tar.gz"
  fi
else
  # Linux (and anything else)
  ASSET="superagent-server-v${VERSION}-linux-x64.tar.gz"
  EXT="tar.gz"
fi

URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
INSTALL_DIR="$HOME/.superagent-server"

# ── Download ────────────────────────────────────────────────────────────────
echo "Downloading ${ASSET}…"
TMP=$(mktemp -d)
curl -fsSL "$URL" -o "$TMP/$ASSET"

# ── Extract ─────────────────────────────────────────────────────────────────
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
if [ "$EXT" = "zip" ]; then
  unzip -q "$TMP/$ASSET" -d "$INSTALL_DIR"
  # Flatten one level if needed
  INNER=$(ls "$INSTALL_DIR" | head -1)
  if [ -d "$INSTALL_DIR/$INNER/cli" ]; then
    mv "$INSTALL_DIR/$INNER"/* "$INSTALL_DIR/"
    rmdir "$INSTALL_DIR/$INNER" 2>/dev/null || true
  fi
else
  tar -xzf "$TMP/$ASSET" -C "$INSTALL_DIR" --strip-components=1
fi
rm -rf "$TMP"

# ── Create launcher script ───────────────────────────────────────────────────
LAUNCHER_DIR="$HOME/.local/bin"
mkdir -p "$LAUNCHER_DIR"
cat > "$LAUNCHER_DIR/superagent" << SCRIPT
#!/usr/bin/env sh
exec node "$INSTALL_DIR/cli/dist/bin/main.js" "\$@"
SCRIPT
chmod +x "$LAUNCHER_DIR/superagent"

echo ""
echo "${GREEN}✓ Done! SuperAgent v${VERSION} installed to ${INSTALL_DIR}${NC}"
echo ""
echo "Make sure ${LAUNCHER_DIR} is in your PATH:"
echo '  export PATH="$HOME/.local/bin:$PATH"   # add to ~/.bashrc or ~/.zshrc'
echo ""
echo "Then run:"
echo "    superagent                      # interactive CLI (TUI)"
echo "    superagent --serve              # web UI at http://localhost:14692"
echo "    superagent --serve-port 8080    # web UI on a custom port"
echo "    superagent update               # check / update to a newer release"
