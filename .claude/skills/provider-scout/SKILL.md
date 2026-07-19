---
name: provider-scout
description: Scouts for new AI providers and models to integrate into SuperAgent every 8 hours. Researches what's newly released or newly popular, checks if the provider is already in the registry, drafts a capability adapter if it's new, tests it against the provider's free tier, and commits. Serves SuperAgent's core mission of not being locked to one vendor.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional provider name to research, e.g. "mistral", "groq", "together-ai", "ollama"]
---

# /provider-scout — New AI Provider Research & Integration Loop

## Purpose

SuperAgent's mission is provider-agnostic. Every month, new capable models and API-compatible
providers appear. This skill ensures SuperAgent keeps expanding its provider coverage so users
always have choices — and so no single provider can hold the app hostage.

## Context & Memory Contract

**Compact at every `→ COMPACT` checkpoint, unconditionally.**
Before every compact: write current provider candidate + integration step to TodoWrite.
`.claude/auto-improve-log.log`: `tail -n 150` only. Never load whole adapter files — `Grep` + `Read` with offset/limit.

## Step 0 — Orient & Lock

```bash
LOCK=.claude/.auto-improve.lock
if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(date -r "$LOCK" +%s 2>/dev/null || echo 0) ))
  if [ "$age" -lt 540 ]; then echo "LOCK_HELD"; exit 2; fi
fi
printf '{"pid":%d,"started":"%s"}\n' "$$" "$(date -u +%FT%TZ)" > "$LOCK"
```

`tail -n 150 .claude/auto-improve-log.log` — check recent `[provider-scout]` entries to see what
providers were already researched or integrated this week. Avoid duplicate work.

Read the provider/model registry to see what's currently connected:
```bash
# Find the registry — could be providers.json, models.config.*, or a TypeScript map
find packages/core/src -name "*.ts" | xargs grep -l "provider\|registry" 2>/dev/null | head -5
```

## Step 1 — Online Research (Mandatory — 3 Searches)

**Required searches:**
1. `"new AI model API released free tier $(date +%B\ %Y)"` — what just launched this month
2. `"OpenAI compatible API provider 2026 not listed"` — providers easy to integrate (same API shape)
3. Either `"<provider from $ARGUMENTS> API authentication endpoints 2026"` (if given) or
   `"fastest AI inference API provider free tier 2026"` — performance-competitive alternatives

Write to `.claude/research-cache/$(date +%Y%m%d-%H%M)-provider-scout.md`:
```
RESEARCH LOG — [provider-scout] [DATE TIME]
Search 1: "<query>" → Source: <url> — Takeaway: <one line>
Search 2: "<query>" → Source: <url> — Takeaway: <one line>
Search 3: "<query>" → Source: <url> — Takeaway: <one line>
Candidates: <list of providers found that are NOT already in the registry>
Selected: <which one to attempt this cycle, and why>
```

**→ COMPACT** (write selected provider + step to TodoWrite)

## Step 2 — Evaluate Candidate

For the selected provider candidate, fetch its API documentation:
```bash
# WebFetch the provider's API docs (limit to first 200 lines)
```

Determine:
- **API compatibility**: Is it OpenAI-compatible (`/v1/chat/completions` format)? Or a custom format?
- **Authentication**: API key in header? OAuth? Custom?
- **Free tier**: Does it have a free tier or free-credits model?
- **Model list**: What models does it expose? Any that SuperAgent doesn't currently offer?
- **Modalities**: Text only? Vision? Audio? Multi-modal?
- **Existing support**: Is there already a SuperAgent adapter for this provider?

If already supported: log the research, note any new models to add to the registry, and stop.
If not supported: proceed to Step 3.

## Step 3 — Draft the Adapter

Look at 2 existing adapters to understand the interface pattern:
```bash
ls packages/core/src/providers/ | head -10
# Read just the exports and class signature of 2 adapters
grep -n "export\|class\|implements\|interface" packages/core/src/providers/<existing>.ts | head -30
```

Draft the new provider adapter in `packages/core/src/providers/<provider-name>.ts`:
- Implement the same interface as existing adapters
- Handle the provider's authentication
- Map provider-specific model IDs to the standard SuperAgent format
- Include error handling for rate limits and auth failures
- If OpenAI-compatible: inherit from the OpenAI adapter base class — don't duplicate logic

Also register the new provider in the registry file.

## Step 4 — Static Verify

```bash
npm run build > /tmp/scout-build.log 2>&1
echo "Exit: $?"
tail -20 /tmp/scout-build.log
```

Fix any TypeScript errors before proceeding.

## Step 5 — Live Test (Free Tier Only)

**Only if the provider has a verifiable free tier.**

```bash
# Write a minimal test script (don't paste output into context)
cat > /tmp/scout-test.js << 'EOF'
// Minimal test: one text request, check response structure
EOF
node /tmp/scout-test.js > /tmp/scout-live.log 2>&1
tail -10 /tmp/scout-live.log
```

If no free tier: log "NOT LIVE-TESTED — no free tier confirmed" and proceed to commit with that note.
Never spend the user's money on a test call.

**→ COMPACT**

## Step 6 — Commit

```bash
git add packages/core/src/providers/<provider-name>.ts
git add packages/core/src/providers/registry.ts  # or wherever the registry lives
git diff --staged --stat
```

Commit message:
```
providers: add <ProviderName> adapter

Research: <source URL for API docs>
API: <OpenAI-compatible | custom format>
Free tier: <yes — model names | no | unverified>
Models added: <list>
Modalities: <text | vision | audio | etc.>
Static verify: build PASS
Live test: <PASS with <model> | NOT LIVE-TESTED — no free tier>
```

Push. Release lock.

## Step 7 — Log

Append to `.claude/auto-improve-log.log`, tagged `[provider-scout]`:
```
## YYYY-MM-DD HH:MM — [provider-scout]
Researched: 3 provider searches (see research cache)
Research file: .claude/research-cache/<filename>
Provider added: <name> — <API compatibility> — <modalities>
Models registered: <list>
Free tier: <yes | no | unverified>
Static verify: build PASS
Live test: <result>
Committed: <hash | "not committed — reason">
Next priority queue: <other candidates to investigate>
Open questions: <providers needing paid keys to test — flag for human>
```

Release lock if not already released. **→ COMPACT**

## Guardrails

- Never call a paid provider without the user's explicit API key being configured.
- Never hard-code a provider as "required" — always behind the adapter interface.
- Never invent an API endpoint or auth format — always verify via WebFetch docs.
- One provider per cycle — don't try to add multiple at once.
- If a provider requires OAuth flow that needs a browser: log it as an open question for the human.
- Release the shared lock even on early exit.
