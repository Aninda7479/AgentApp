#!/usr/bin/env bash
# run-auto-improve.sh — headless Claude Code driver for SuperAgent's
# .claude/skills/{auto-improve,orchestrator-dev,art-director,ux-critic}.
#
# Runs ONE cycle and exits. Scheduled via the accompanying systemd
# template unit + timers (or cron — see README.md). Never touches `main`;
# only ever commits/pushes to $BRANCH. Merging side branch -> main stays a
# manual PR decision by a human.
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override via environment (see superagent-auto-improve.env)
# ---------------------------------------------------------------------------
REPO_DIR="${REPO_DIR:?set REPO_DIR to the cloned AgentApp path, e.g. /opt/superagent/AgentApp}"
BRANCH="${BRANCH:-side-dev}"                 # NEVER set this to main
SKILL="${SKILL:-/auto-improve}"              # /auto-improve | /orchestrator-dev | /art-director | /ux-critic
MAX_TURNS="${MAX_TURNS:-40}"
MAX_BUDGET_USD="${MAX_BUDGET_USD:-2.00}"
ALLOWED_TOOLS="${ALLOWED_TOOLS:-Read,Grep,Glob,Edit,Write,Bash,WebSearch,WebFetch,TodoWrite}"
LOG_DIR="${LOG_DIR:-/var/log/superagent-auto-improve}"
PAUSE_FILE="${PAUSE_FILE:-$REPO_DIR/.claude/.auto-improve.pause}"

if [ "$BRANCH" = "main" ]; then
  echo "Refusing to run: BRANCH is set to main. Use a side branch." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
run_log="$LOG_DIR/${ts}_$(basename "$SKILL").json"
driver_log="$LOG_DIR/driver.log"

log() { echo "$ts [$SKILL] $*" >>"$driver_log"; }

# ---------------------------------------------------------------------------
# Kill switch — `touch` this file from anywhere to pause the whole loop
# without touching systemd/cron config.
# ---------------------------------------------------------------------------
if [ -f "$PAUSE_FILE" ]; then
  log "paused (found $PAUSE_FILE) — skipping cycle"
  exit 0
fi

cd "$REPO_DIR"

# ---------------------------------------------------------------------------
# Always operate on the side branch, never main. Create it from main on
# first run if it doesn't exist yet.
# ---------------------------------------------------------------------------
git fetch origin main "$BRANCH" 2>>"$driver_log" || true

if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git checkout -B "$BRANCH" "origin/$BRANCH"
else
  log "branch $BRANCH not found on origin — creating from main"
  git checkout -B "$BRANCH" origin/main
  git push -u origin "$BRANCH"
fi

# Bail rather than clobber if a human left uncommitted work here.
if [ -n "$(git status --porcelain)" ]; then
  log "working tree dirty before run — skipping cycle rather than risk overwriting local changes"
  exit 0
fi

# ---------------------------------------------------------------------------
# Self-serialize against any `superagent` CLI process touching the same
# tree (packages/cli/src/auto-improve-lock.ts reads this same env var).
# The skill's own Step0 lock file handles concurrent skill runs.
# ---------------------------------------------------------------------------
export AUTO_IMPROVE_RUN="vps-${ts}"

# ---------------------------------------------------------------------------
# One headless cycle. --max-turns / --max-budget-usd are the outer spend
# guard; the skill's own context-compaction checkpoints are the inner one.
# Verify current flag names with `claude -p --help` periodically — CLI
# flags do change between releases.
# ---------------------------------------------------------------------------
set +e
claude -p "$SKILL" \
  --allowedTools "$ALLOWED_TOOLS" \
  --permission-mode acceptEdits \
  --max-turns "$MAX_TURNS" \
  --max-budget-usd "$MAX_BUDGET_USD" \
  --output-format json \
  >"$run_log" 2>"$LOG_DIR/${ts}_$(basename "$SKILL").stderr.log"
exit_code=$?
set -e

cost="n/a"; turns="n/a"; is_error="n/a"
if command -v jq >/dev/null 2>&1 && [ -s "$run_log" ]; then
  cost=$(jq -r '.total_cost_usd // "n/a"' "$run_log" 2>/dev/null || echo "n/a")
  turns=$(jq -r '.num_turns // "n/a"' "$run_log" 2>/dev/null || echo "n/a")
  is_error=$(jq -r '.is_error // "n/a"' "$run_log" 2>/dev/null || echo "n/a")
fi

log "exit=$exit_code is_error=$is_error cost=\$${cost} turns=$turns log=$run_log"

# Never merge to main here. Review side-branch commits and open a PR
# yourself — see README.md.
exit 0
