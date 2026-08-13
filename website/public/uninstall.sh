#!/usr/bin/env sh
# SuperAgent uninstaller — Core + CLI + Web
# Usage: curl -fsSL https://aninda7479.github.io/AgentApp/uninstall.sh | sh
set -eu

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "${CYAN}SuperAgent Uninstaller${NC}"
echo "----------------------------------------"

prompt_yes_no() {
  msg="$1"
  def="$2"
  if [ -t 0 ]; then
    TTY_DEV="/dev/stdin"
  elif [ -e "/dev/tty" ]; then
    TTY_DEV="/dev/tty"
  else
    TTY_DEV=""
  fi

  if [ -n "$TTY_DEV" ]; then
    if [ "$def" = "Y" ]; then
      printf "${YELLOW}%s [Y/n]: ${NC}" "$msg"
    else
      printf "${YELLOW}%s [y/N]: ${NC}" "$msg"
    fi
    read -r ans < "$TTY_DEV" || ans=""
    case "$ans" in
      [yY][eE][sS]|[yY]) return 0 ;;
      [nN][oO]|[nN]) return 1 ;;
      "") [ "$def" = "Y" ] && return 0 || return 1 ;;
      *) [ "$def" = "Y" ] && return 0 || return 1 ;;
    esac
  else
    [ "$def" = "Y" ] && return 0 || return 1
  fi
}

# 1. Binary Removal
if prompt_yes_no "Do you want to remove the SuperAgent binary executable?" "Y"; then
  REMOVED_BIN=0
  for BIN in "$HOME/.local/bin/superagent" "/usr/local/bin/superagent"; do
    if [ -f "$BIN" ]; then
      if [ -w "$BIN" ] || [ -w "$(dirname "$BIN")" ]; then
        rm -f "$BIN"
        echo "${GREEN}✓ Removed binary at ${BIN}${NC}"
        REMOVED_BIN=1
      else
        echo "${RED}Permission denied: Unable to remove ${BIN}. Try with sudo.${NC}"
      fi
    fi
  done
  if [ "$REMOVED_BIN" -eq 0 ]; then
    echo "No binary found to remove."
  fi
fi

# 2. PATH Removal
if prompt_yes_no "Do you want to remove ~/.local/bin from PATH in shell configs (.bashrc, .zshrc, .profile)?" "Y"; then
  for RC in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [ -f "$RC" ] && grep -q '\.local/bin' "$RC"; then
      TMP_RC=$(mktemp)
      grep -v '\.local/bin' "$RC" > "$TMP_RC" || true
      mv "$TMP_RC" "$RC"
      echo "${GREEN}✓ Removed PATH line from ${RC}${NC}"
    fi
  done
fi

# 3. Data Directory Removal
DATA_DIR="$HOME/.superagent"
if [ -d "$DATA_DIR" ]; then
  if prompt_yes_no "Do you want to delete the configuration and data directory (~/.superagent)?" "N"; then
    rm -rf "$DATA_DIR"
    echo "${GREEN}✓ Deleted data directory ${DATA_DIR}${NC}"
  else
    echo "Kept data directory at ${DATA_DIR}"
  fi
fi

echo ""
echo "${GREEN}✓ SuperAgent uninstallation completed.${NC}"
