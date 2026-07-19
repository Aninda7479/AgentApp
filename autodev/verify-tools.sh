#!/usr/bin/env bash
# verify-tools.sh — Pre-flight verification for the SuperAgent auto-improvement loop (Linux/VPS).
# Run BEFORE starting any loop or systemd timer to confirm all required tools are available.
# Exits 0 if all required checks pass, 1 if any required check fails.
set -euo pipefail

REPO_DIR="${1:-$(pwd)}"
cd "$REPO_DIR"

PASS=0; FAIL=0

check() {
  local name="$1"
  local required="${3:-true}"
  if eval "$2" > /tmp/verify-check.log 2>&1; then
    printf "  ✅ %s\n" "$name"
    ((PASS++)) || true
  else
    if [ "$required" = "true" ]; then
      printf "  ❌ %s — %s\n" "$name" "$(tail -1 /tmp/verify-check.log)"
      ((FAIL++)) || true
    else
      printf "  ⚠️  %s (optional) — %s\n" "$name" "$(tail -1 /tmp/verify-check.log)"
    fi
  fi
}

echo ""
echo "🔍 SuperAgent Auto-Loop Tool Verification"
echo "   Repo: $REPO_DIR"
echo ""

# 1. Node.js >= 18
check "node >= v18" '
  v=$(node --version | sed "s/v//")
  major=$(echo "$v" | cut -d. -f1)
  [ "$major" -ge 18 ]
'

# 2. npm build
check "npm run build (all workspaces)" '
  npm run build > /tmp/verify-build.log 2>&1
'

# 3. claude CLI available
check "claude CLI in PATH" 'command -v claude'

# 4. claude CLI authenticated
check "claude CLI authenticated" '
  echo "Say OK and nothing else." | claude --max-turns 1 --output-format json > /tmp/verify-claude.json 2>&1
  ! grep -q '"'"'is_error.*true'"'"' /tmp/verify-claude.json
'

# 5. gh CLI available
check "gh CLI in PATH" 'command -v gh'

# 6. gh CLI authenticated
check "gh CLI authenticated" 'gh auth status 2>&1 | grep -q "Logged in"'

# 7. git push access
check "git push access (dry run)" '
  git push --dry-run 2>&1 | grep -qv "Authentication failed\|Permission denied"
'

# 8. superagent CLI (optional)
check "superagent CLI in PATH" 'command -v superagent' "false"

# 9. Lock file system
check "lock file create/delete (.claude/.auto-improve.lock)" '
  LOCK=.claude/.auto-improve.lock
  mkdir -p .claude
  echo "test" > "$LOCK"
  cat "$LOCK" > /dev/null
  rm -f "$LOCK"
'

# 10. Branch create/delete
check "git branch create/delete" '
  BRANCH="verify-tools-test-$(date +%s)"
  git checkout -B "$BRANCH" > /dev/null 2>&1
  git checkout - > /dev/null 2>&1
  git branch -D "$BRANCH" > /dev/null 2>&1
'

# 11. research-cache dir writable
check "research-cache dir writable (.claude/research-cache)" '
  mkdir -p .claude/research-cache
  echo "test" > .claude/research-cache/verify-test.tmp
  rm -f .claude/research-cache/verify-test.tmp
'

# 12. WebSearch (real network)
check "WebSearch capability (online search test)" '
  result=$(echo "Use WebSearch to find current Node.js LTS version. Return only the version." \
    | claude --max-turns 2 --output-format json 2>&1)
  echo "$result" | grep -qv '"'"'is_error.*true'"'"'
'

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "  Fix the ❌ failures above before starting the loop."
  echo "  See docs/auto-improvement-system/tools-verification.md for help."
  echo ""
  exit 1
else
  echo ""
  echo "  All required checks passed! Ready to run the loop."
  echo "  Next step — run one manual cycle:"
  echo "    SKILL=/auto-improve ./autodev/run-auto-improve.sh"
  echo ""
  exit 0
fi
