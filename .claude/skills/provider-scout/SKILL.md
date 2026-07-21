---
name: provider-scout
description: Adds one new AI provider or model family to SuperAgent when it advances multi-vendor coverage (chat, image, video, or 3D). Drafts adapter behind existing interfaces, offline-tests it, registers models. Skips duplicate research of already-integrated providers.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional provider, e.g. "groq", "mistral", "together", "fal", "replicate"]
---

# /provider-scout — One provider per cycle

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**North star:** FUTURE-PLAN multi-provider metrics (chat/image/video/3D counts)

## Cycle

### 0) Orient

```powershell
Get-ChildItem packages/core/src/providers
Get-Content .claude/auto-improve-log.log -Tail 80 -ErrorAction SilentlyContinue
```

List providers already present. Soft lock `provider-scout`.

### 1) Choose candidate

- Prefer `$ARGUMENTS`  
- Else prefer gaps: video/3D providers if Phase 2 active; else fast OpenAI-compatible chat with free tier  
- Skip if last log already scouted same provider this week  

### 2) Research (required for NEW provider only — max 1 fetch)

WebFetch official API docs (auth + chat completions or media endpoint). Cache short notes in `.claude/research-cache/`.

### 3) Implement

- OpenAI-compatible → extend existing openai/custom path; do not duplicate.  
- Register in models/provider meta.  
- Unit test with mocked fetch.  

### 4) Verify + commit + log

Live free-tier only if key exists; else `Live: SKIP`.  
Prefix: `providers: add <Name>`. Tag `[provider-scout]`.

## Guardrails

- One provider per cycle.  
- No OAuth browser flows without human.  
- No secrets.  
- Prefer adapters that serve FUTURE-PLAN pillars A–D.  
