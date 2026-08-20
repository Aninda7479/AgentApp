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

# 1. Primary: Extract version from web redirect (bypasses api.github.com 60 req/hr rate limits)
VERSION=$(curl -sI -H "User-Agent: SuperAgent-Installer" "https://github.com/${REPO}/releases/latest" 2>/dev/null | grep -i '^location:' | head -1 | tr -d '\r\n' | sed -e 's|.*/tag/||' -e 's|^v||' -e 's|^[ \t]*||' -e 's|[ \t]*$||')

# Validate version format (must start with digit)
case "$VERSION" in
  [0-9]*.[0-9]*) ;;
  *) VERSION="" ;;
esac

# 2. Fallback: Query GitHub API
LATEST_JSON=""
if [ -z "$VERSION" ]; then
  LATEST_JSON=$(curl -fsSL -H "User-Agent: SuperAgent-Installer" "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || echo "")
  VERSION=$(echo "$LATEST_JSON" | grep '"tag_name"' | head -1 | sed -e 's/.*"tag_name": *"[vV]\?\([^"]*\)".*/\1/' -e 's|^v||' || echo "")
  case "$VERSION" in
    [0-9]*.[0-9]*) ;;
    *) VERSION="" ;;
  esac
fi

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
    PLATFORM_KEY="macos-arm64"
    EXT="zip"
  else
    PLATFORM_KEY="macos-x64"
    EXT="zip"
  fi
else
  if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    PLATFORM_KEY="linux-arm64"
    EXT="tar.gz"
  else
    PLATFORM_KEY="linux-x64"
    EXT="tar.gz"
  fi
fi

ASSET="superagent-cli-v${VERSION}-${PLATFORM_KEY}.${EXT}"
URL=""
if [ -n "$LATEST_JSON" ]; then
  URL=$(echo "$LATEST_JSON" | grep '"browser_download_url"' | grep "$PLATFORM_KEY" | head -1 | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/')
fi

if [ -z "$URL" ]; then
  URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"
fi

if [ -w "/usr/local/bin" ]; then
  LAUNCHER_DIR="/usr/local/bin"
else
  LAUNCHER_DIR="$HOME/.local/bin"
fi
TARGET_BIN="$LAUNCHER_DIR/superagent"

# ── Check if already installed & up to date ──────────────────────────────────
INSTALLED_VER=""
if command -v superagent >/dev/null 2>&1; then
  INSTALLED_VER=$(superagent --version 2>/dev/null || echo "")
elif [ -x "$TARGET_BIN" ]; then
  INSTALLED_VER=$("$TARGET_BIN" --version 2>/dev/null || echo "")
fi
INSTALLED_VER=$(echo "$INSTALLED_VER" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")

if [ -n "$INSTALLED_VER" ] && [ "$INSTALLED_VER" = "$VERSION" ]; then
  if [ "${FORCE:-0}" != "1" ]; then
    echo ""
    echo "${GREEN}✓ SuperAgent v${VERSION} is already installed and up to date at ${TARGET_BIN}${NC}"
    echo ""
    echo "To force reinstall, run:"
    echo "    curl -fsSL https://aninda7479.github.io/AgentApp/install.sh | FORCE=1 sh"
    echo ""
    exit 0
  fi
fi

# ── Download & Extract ──────────────────────────────────────────────────────
TMP=$(mktemp -d)
START_TIME=$(date +%s 2>/dev/null || echo 0)

# Fetch total file size from Content-Length header
TOTAL_BYTES=$(curl -sIL "$URL" | grep -i '^content-length:' | tail -1 | awk '{print $2}' | tr -d '\r\n')
case "$TOTAL_BYTES" in
  ''|*[!0-9]*) TOTAL_BYTES=0 ;;
esac

curl -fsSL "$URL" -o "$TMP/$ASSET" &
CURL_PID=$!

while kill -0 "$CURL_PID" 2>/dev/null; do
  CURR_BYTES=0
  if [ -f "$TMP/$ASSET" ]; then
    CURR_BYTES=$(wc -c < "$TMP/$ASSET" 2>/dev/null || echo 0)
    CURR_BYTES=$(echo "$CURR_BYTES" | tr -d ' ')
  fi

  if [ "$TOTAL_BYTES" -gt 0 ]; then
    PCT=$(( CURR_BYTES * 100 / TOTAL_BYTES ))
    [ "$PCT" -gt 100 ] && PCT=100
    HASHES=$(( PCT / 10 ))
    DASHES=$(( 10 - HASHES ))

    BAR=""
    i=0
    while [ "$i" -lt "$HASHES" ]; do BAR="${BAR}#"; i=$((i+1)); done
    i=0
    while [ "$i" -lt "$DASHES" ]; do BAR="${BAR}-"; i=$((i+1)); done

    CURR_MB=$(awk "BEGIN {printf \"%.1f\", $CURR_BYTES/1048576}" 2>/dev/null || echo "$((CURR_BYTES / 1048576))")
    TOTAL_MB=$(awk "BEGIN {printf \"%.1f\", $TOTAL_BYTES/1048576}" 2>/dev/null || echo "$((TOTAL_BYTES / 1048576))")

    printf "\rDownloading: ${CYAN}[%s] %3d%%${NC} (%s MB / %s MB)" "$BAR" "$PCT" "$CURR_MB" "$TOTAL_MB"
  else
    CURR_MB=$(awk "BEGIN {printf \"%.1f\", $CURR_BYTES/1048576}" 2>/dev/null || echo "$((CURR_BYTES / 1048576))")
    printf "\rDownloading: ${CYAN}%s MB${NC}..." "$CURR_MB"
  fi

  sleep 0.1 2>/dev/null || sleep 1
done

wait "$CURL_PID"
CURL_EXIT=$?
printf "\r\033[K"

if [ $CURL_EXIT -ne 0 ]; then
  echo "${RED}Error: Download failed for ${URL}${NC}" >&2
  exit 1
fi

END_TIME=$(date +%s 2>/dev/null || echo 0)
ELAPSED=$((END_TIME - START_TIME))

if [ -f "$TMP/$ASSET" ] && command -v du >/dev/null 2>&1; then
  SIZE_KB=$(du -k "$TMP/$ASSET" | cut -f1)
  if [ -n "$SIZE_KB" ] && [ "$SIZE_KB" -gt 0 ]; then
    SIZE_MB=$(awk "BEGIN {printf \"%.1f\", $SIZE_KB/1024}" 2>/dev/null || echo "$((SIZE_KB / 1024))")
    echo "${GREEN}✓ Downloaded [##########] 100%% (${SIZE_MB} MB) in ${ELAPSED}s${NC}"
  fi
fi

mkdir -p "$LAUNCHER_DIR"
EXTRACTED_DIR="$TMP/extracted"
mkdir -p "$EXTRACTED_DIR"

if [ "$EXT" = "zip" ]; then
  unzip -q "$TMP/$ASSET" -d "$EXTRACTED_DIR"
else
  tar -xzf "$TMP/$ASSET" -C "$EXTRACTED_DIR"
fi

if [ -f "$EXTRACTED_DIR/superagent" ]; then
  mv "$EXTRACTED_DIR/superagent" "$TARGET_BIN"
elif [ -f "$EXTRACTED_DIR/superagent-cli" ]; then
  mv "$EXTRACTED_DIR/superagent-cli" "$TARGET_BIN"
fi

if [ -d "$EXTRACTED_DIR/node_modules" ]; then
  mkdir -p "$LAUNCHER_DIR/node_modules"
  cp -r "$EXTRACTED_DIR/node_modules"/* "$LAUNCHER_DIR/node_modules/" 2>/dev/null || true
fi

rm -rf "$TMP"
chmod +x "$TARGET_BIN"

if [ "$OS" = "Darwin" ]; then
  xattr -d com.apple.quarantine "$TARGET_BIN" 2>/dev/null || true
  xattr -cr "$TARGET_BIN" 2>/dev/null || true
fi

# ── Update PATH in RC files if needed ────────────────────────────────────────
PATH_ADDED=0
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
case ":$PATH:" in
  *":$LAUNCHER_DIR:"*) ;;
  *)
    RC_FOUND=0
    for RC in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
      if [ -f "$RC" ]; then
        RC_FOUND=1
        if ! grep -q '\.local/bin' "$RC"; then
          echo "" >> "$RC"
          echo "$PATH_LINE" >> "$RC"
          PATH_ADDED=1
        fi
      fi
    done
    if [ "$RC_FOUND" -eq 0 ]; then
      if [ "$OS" = "Darwin" ]; then
        echo "$PATH_LINE" >> "$HOME/.zshrc"
      else
        echo "$PATH_LINE" >> "$HOME/.bashrc"
      fi
      PATH_ADDED=1
    fi
    ;;
esac

echo ""
echo "${GREEN}✓ Done! SuperAgent v${VERSION} binary installed to ${TARGET_BIN}${NC}"
echo ""

case ":$PATH:" in
  *":$LAUNCHER_DIR:"*) ;;
  *)
    if [ "$OS" = "Darwin" ]; then
      echo "${CYAN}Note: Please update your current terminal's PATH by running:${NC}"
      echo "    source ~/.zshrc"
      echo ""
    else
      echo "${CYAN}Note: Please update your current terminal's PATH by running:${NC}"
      echo "    source ~/.bashrc"
      echo ""
    fi
    ;;
esac

echo "Run SuperAgent directly:"
echo "    superagent                      # interactive CLI (TUI)"
echo "    superagent --serve              # web UI at http://localhost:1469"
echo "    superagent --serve-port 8080    # web UI on a custom port"
echo "    superagent update               # check / update to a newer release"

