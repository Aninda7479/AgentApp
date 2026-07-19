#!/usr/bin/env bash
# run-auto-improve.sh — headless Claude Code driver for SuperAgent's auto-improvement skills.
#
# Runs ONE cycle and exits. Scheduled via systemd template unit + timers (or cron).
# Creates a per-cycle dated branch (auto/YYYY-MM-DD-HHmm-<skill>), commits any changes
# to it, pushes, and opens a draft PR targeting agent-development via `gh`.
# Never touches main — merging side branch → agent-development stays a manual PR decision.
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override via environment (see superagent-auto-improve.env)
# ---------------------------------------------------------------------------
REPO_DIR="${REPO_DIR:?set REPO_DIR to the cloned AgentApp path, e.g. /opt/superagent/AgentApp}"
BASE_BRANCH="${BASE_BRANCH:-agent-development}"   # PR target — NEVER main
SKILL="${SKILL:-/auto-improve}"
BRANCH_PREFIX="${BRANCH_PREFIX:-auto}"
LOG_DIR="${LOG_DIR:-/var/log/superagent-auto-improve}"
PAUSE_FILE="${PAUSE_FILE:-$REPO_DIR/.claude/.auto-improve.pause}"
AUTO_CREATE_PR="${AUTO_CREATE_PR:-true}"
ALLOWED_TOOLS="${ALLOWED_TOOLS:-Read,Grep,Glob,Edit,Write,Bash,WebSearch,WebFetch,TodoWrite}"
# Note: No MAX_TURNS or MAX_BUDGET_USD — the skill runs until it finishes naturally.
# Use the PAUSE_FILE kill switch to stop a runaway: touch $PAUSE_FILE

if [ "$BASE_BRANCH" = "main" ]; then
  echo "Refusing to run: BASE_BRANCH is set to main. Use agent-development or a side branch." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
skill_name="$(basename "$SKILL")"
CYCLE_BRANCH="${BRANCH_PREFIX}/$(date -u +%Y-%m-%d-%H%M)-${skill_name}"

run_log="$LOG_DIR/${ts}_${skill_name}.json"
driver_log="$LOG_DIR/driver.log"

log() { echo "$ts [$skill_name] $*" >> "$driver_log"; }

# ---------------------------------------------------------------------------
# Kill switch
# ---------------------------------------------------------------------------
if [ -f "$PAUSE_FILE" ]; then
  log "paused (found $PAUSE_FILE) — skipping cycle"
  exit 0
fi

cd "$REPO_DIR"

# ---------------------------------------------------------------------------
# Create research-cache dir (skills write research logs here)
# ---------------------------------------------------------------------------
mkdir -p .claude/research-cache
mkdir -p .playwright

# ---------------------------------------------------------------------------
# Fetch latest from remote and create per-cycle branch from BASE_BRANCH
# ---------------------------------------------------------------------------
git fetch origin "$BASE_BRANCH" 2>>"$driver_log" || true

if git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
  git checkout -B "$CYCLE_BRANCH" "origin/$BASE_BRANCH"
else
  log "base branch $BASE_BRANCH not found on origin — creating from current HEAD"
  git checkout -B "$CYCLE_BRANCH"
fi

log "created cycle branch: $CYCLE_BRANCH"

# Bail if working tree is dirty with unrelated changes.
if [ -n "$(git status --porcelain)" ]; then
  log "working tree dirty before run — skipping cycle"
  exit 0
fi

# ---------------------------------------------------------------------------
# Self-serialize with the TypeScript lock
# ---------------------------------------------------------------------------
export AUTO_IMPROVE_RUN="vps-${ts}"

# ---------------------------------------------------------------------------
# One headless cycle — no budget/turn caps
# Skills run until they finish naturally; use the pause file to stop.
# ---------------------------------------------------------------------------
set +e
claude -p "$SKILL" \
  --allowedTools "$ALLOWED_TOOLS" \
  --permission-mode acceptEdits \
  --output-format json \
  > "$run_log" 2>"$LOG_DIR/${ts}_${skill_name}.stderr.log"
exit_code=$?
set -e

cost="n/a"; turns="n/a"; is_error="n/a"
if command -v jq >/dev/null 2>&1 && [ -s "$run_log" ]; then
  cost=$(jq -r '.total_cost_usd // "n/a"' "$run_log" 2>/dev/null || echo "n/a")
  turns=$(jq -r '.num_turns // "n/a"' "$run_log" 2>/dev/null || echo "n/a")
  is_error=$(jq -r '.is_error // "n/a"' "$run_log" 2>/dev/null || echo "n/a")
fi

log "exit=$exit_code is_error=$is_error cost=\$${cost} turns=$turns log=$run_log"

# ---------------------------------------------------------------------------
# Push branch (if anything was committed by the skill)
# ---------------------------------------------------------------------------
if git log "origin/$BASE_BRANCH..HEAD" --oneline 2>/dev/null | grep -q .; then
  git push -u origin "$CYCLE_BRANCH"
  log "pushed branch: $CYCLE_BRANCH"

  # -------------------------------------------------------------------------
  # Generate PR body from the skill's log entry
  # -------------------------------------------------------------------------
  LATEST_LOG=$(tail -n 60 .claude/auto-improve-log.log 2>/dev/null || echo "No log entry found")
  COMMITS=$(git log "origin/$BASE_BRANCH..HEAD" --oneline 2>/dev/null | head -10)
  
  cat > .claude/pr-body-latest.md << EOF
## [AutoLoop] ${skill_name} — $(date -u +%Y-%m-%d)

> Auto-generated by the SuperAgent self-improvement loop.
> Review the diff, confirm no secrets or regressions, then merge when satisfied.

### Commits in This Cycle
\`\`\`
${COMMITS}
\`\`\`

### Skill Log (latest entry)
\`\`\`
${LATEST_LOG}
\`\`\`

### Review Checklist
- [ ] Read the diff — changes look intentional
- [ ] Research sources cited in the log are real URLs (not hallucinated)
- [ ] Build/test status confirmed (see CI check below)
- [ ] No secrets, tokens, or personal paths committed
- [ ] Merge → \`agent-development\` when satisfied

*Branch: \`${CYCLE_BRANCH}\` → \`${BASE_BRANCH}\`*
*Runner log: \`${run_log}\`*
EOF

  # -------------------------------------------------------------------------
  # Create draft PR via gh CLI
  # -------------------------------------------------------------------------
  if [ "$AUTO_CREATE_PR" = "true" ] && command -v gh >/dev/null 2>&1; then
    set +e
    gh pr create \
      --draft \
      --base "$BASE_BRANCH" \
      --head "$CYCLE_BRANCH" \
      --title "[AutoLoop] ${skill_name} — $(date -u +%Y-%m-%d)" \
      --body-file .claude/pr-body-latest.md \
      --label "auto-generated" \
      2>>"$driver_log"
    pr_exit=$?
    set -e
    if [ $pr_exit -eq 0 ]; then
      log "draft PR created → $BASE_BRANCH"
    else
      log "gh pr create failed (exit $pr_exit) — branch pushed, create PR manually"
    fi
  else
    log "AUTO_CREATE_PR=false or gh not found — branch pushed, no PR created"
  fi
else
  log "no new commits on $CYCLE_BRANCH — nothing to push or PR"
  # Clean up the empty branch
  git checkout "$BASE_BRANCH" 2>/dev/null || true
  git branch -D "$CYCLE_BRANCH" 2>/dev/null || true
fi

exit 0
