#!/usr/bin/env bash
# run-auto-improve-superagent.sh — Alternative loop driver that uses the
# SuperAgent CLI (superagent binary) instead of claude CLI.
#
# This makes the system self-hosting: SuperAgent improves itself using its own engine.
# Falls back to claude CLI if superagent binary is not found.
#
# Same branch/lock/PR logic as run-auto-improve.sh.
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REPO_DIR="${REPO_DIR:?set REPO_DIR to the AgentApp repo path}"
BASE_BRANCH="${BASE_BRANCH:-agent-development}"
SKILL="${SKILL:-/auto-improve}"
BRANCH_PREFIX="${BRANCH_PREFIX:-auto}"
LOG_DIR="${LOG_DIR:-/var/log/superagent-auto-improve}"
PAUSE_FILE="${PAUSE_FILE:-$REPO_DIR/.claude/.auto-improve.pause}"
AUTO_CREATE_PR="${AUTO_CREATE_PR:-true}"
# Provider/model for the SuperAgent CLI to use
SA_PROVIDER="${SA_PROVIDER:-anthropic}"
SA_MODEL="${SA_MODEL:-claude-opus-4-5}"

if [ "$BASE_BRANCH" = "main" ]; then
  echo "Refusing: BASE_BRANCH=main. Use agent-development or a side branch." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
skill_name="$(basename "$SKILL")"
CYCLE_BRANCH="${BRANCH_PREFIX}/$(date -u +%Y-%m-%d-%H%M)-${skill_name}-sa"

run_log="$LOG_DIR/${ts}_${skill_name}_sa.log"
driver_log="$LOG_DIR/driver-sa.log"

log() { echo "$ts [SA:$skill_name] $*" >> "$driver_log"; }

if [ -f "$PAUSE_FILE" ]; then
  log "paused (found $PAUSE_FILE) — skipping cycle"
  exit 0
fi

cd "$REPO_DIR"
mkdir -p .claude/research-cache .playwright

git fetch origin "$BASE_BRANCH" 2>>"$driver_log" || true
if git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
  git checkout -B "$CYCLE_BRANCH" "origin/$BASE_BRANCH"
else
  git checkout -B "$CYCLE_BRANCH"
fi
log "created cycle branch: $CYCLE_BRANCH"

if [ -n "$(git status --porcelain)" ]; then
  log "working tree dirty — skipping"
  exit 0
fi

export AUTO_IMPROVE_RUN="sa-${ts}"

# ---------------------------------------------------------------------------
# Choose driver: superagent CLI or fall back to claude CLI
# ---------------------------------------------------------------------------
# Build the skill prompt from the SKILL.md file
SKILL_MD="$REPO_DIR/.claude/skills/${skill_name}/SKILL.md"
if [ ! -f "$SKILL_MD" ]; then
  log "SKILL.md not found at $SKILL_MD — cannot run via SuperAgent CLI"
  exit 1
fi

set +e
if command -v superagent >/dev/null 2>&1; then
  log "Running via SuperAgent CLI (provider=$SA_PROVIDER model=$SA_MODEL)"
  superagent \
    --provider "$SA_PROVIDER" \
    --model "$SA_MODEL" \
    -p "$SKILL" \
    >> "$run_log" 2>&1
  exit_code=$?
  log "SuperAgent CLI exit: $exit_code"
elif command -v claude >/dev/null 2>&1; then
  log "superagent not found — falling back to claude CLI"
  claude -p "$SKILL" \
    --allowedTools "Read,Grep,Glob,Edit,Write,Bash,WebSearch,WebFetch,TodoWrite" \
    --permission-mode acceptEdits \
    --output-format json \
    >> "$run_log" 2>&1
  exit_code=$?
  log "claude CLI fallback exit: $exit_code"
else
  log "ERROR: Neither superagent nor claude found in PATH"
  exit 1
fi
set -e

# ---------------------------------------------------------------------------
# Push + PR (same logic as run-auto-improve.sh)
# ---------------------------------------------------------------------------
if git log "origin/$BASE_BRANCH..HEAD" --oneline 2>/dev/null | grep -q .; then
  git push -u origin "$CYCLE_BRANCH"
  log "pushed: $CYCLE_BRANCH"

  LATEST_LOG=$(tail -n 60 .claude/auto-improve-log.log 2>/dev/null || echo "No log entry")
  COMMITS=$(git log "origin/$BASE_BRANCH..HEAD" --oneline 2>/dev/null | head -10)

  cat > .claude/pr-body-latest.md << EOF
## [AutoLoop:SA] ${skill_name} — $(date -u +%Y-%m-%d)

> Run by SuperAgent CLI (self-hosting: the app improved itself).
> Provider: ${SA_PROVIDER} / Model: ${SA_MODEL}

### Commits
\`\`\`
${COMMITS}
\`\`\`

### Skill Log
\`\`\`
${LATEST_LOG}
\`\`\`

### Review Checklist
- [ ] Diff looks intentional
- [ ] Research sources are real URLs
- [ ] No secrets committed
- [ ] Merge → \`${BASE_BRANCH}\` when satisfied
EOF

  if [ "$AUTO_CREATE_PR" = "true" ] && command -v gh >/dev/null 2>&1; then
    gh pr create \
      --draft \
      --base "$BASE_BRANCH" \
      --head "$CYCLE_BRANCH" \
      --title "[AutoLoop:SA] ${skill_name} — $(date -u +%Y-%m-%d)" \
      --body-file .claude/pr-body-latest.md \
      --label "auto-generated" \
      2>>"$driver_log" || log "gh pr create failed — branch pushed, create PR manually"
    log "draft PR created → $BASE_BRANCH"
  fi
else
  log "no new commits — nothing to push"
  git checkout "$BASE_BRANCH" 2>/dev/null || true
  git branch -D "$CYCLE_BRANCH" 2>/dev/null || true
fi

exit 0
