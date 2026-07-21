#!/usr/bin/env bash
# Isolated worker spawn for /skill-loop (Linux/macOS).
# Run from repo root: bash .claude/skills/skill-loop/spawn-worker.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
mkdir -p .claude/loop

PENDING=".claude/loop/pending-worker.json"
if [[ ! -f "$PENDING" ]]; then
  echo "Missing $PENDING" >&2
  exit 2
fi

# Prefer python/node for JSON; fallback to grep
WORKER=$(node -e "const j=require('./.claude/loop/pending-worker.json'); process.stdout.write(j.worker_skill||'')" 2>/dev/null || true)
FOCUS=$(node -e "const j=require('./.claude/loop/pending-worker.json'); process.stdout.write(j.focus_hint||'')" 2>/dev/null || true)

if [[ -z "${WORKER}" ]]; then
  echo "Could not parse worker_skill from pending-worker.json" >&2
  exit 2
fi
[[ "$WORKER" != /* ]] && WORKER="/$WORKER"
[[ "$WORKER" == "/skill-loop" ]] && { echo "No recursion"; exit 2; }

NAME="${WORKER#/}"
TS=$(date +%s)
RESULT=".claude/loop/result-${TS}.json"
LOG=".claude/loop/worker-${TS}.log"

if ! command -v claude >/dev/null 2>&1; then
  cat > "$RESULT" <<EOF
{"skill":"$NAME","status":"skipped","committed":"none","summary":"claude CLI not found","files_changed":[],"verify":{"build":"SKIP","tests":"SKIP","live":"SKIP"},"certain_promoted":null,"next_queue":[],"open_questions":["install claude CLI"],"duration_minutes":0}
EOF
  exit 0
fi

PROMPT="You are an isolated SuperAgent WORKER. One cycle only.
Read .claude/skills/_shared/RESULTS-CONTRACT.md then .claude/skills/${NAME}/SKILL.md and execute ONE cycle.
focus_hint: ${FOCUS}
Write result JSON to ${RESULT} then stop. Do not run /skill-loop."

claude -p "$PROMPT" \
  --permission-mode acceptEdits \
  --allowedTools "Read,Grep,Glob,Edit,Write,Bash,WebSearch,WebFetch,TodoWrite" \
  --max-turns 80 \
  --output-format json \
  >"$LOG" 2>".claude/loop/worker-${TS}.stderr.log" || true

if [[ ! -f "$RESULT" ]]; then
  cat > "$RESULT" <<EOF
{"skill":"$NAME","status":"failed","committed":"none","summary":"Worker exited without result JSON","files_changed":[],"verify":{"build":"SKIP","tests":"SKIP","live":"SKIP"},"certain_promoted":null,"next_queue":[],"open_questions":["missing result file"],"duration_minutes":0,"worker_log":"$LOG"}
EOF
fi

echo "done result=$RESULT"
