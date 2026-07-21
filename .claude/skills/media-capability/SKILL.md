---
name: media-capability
description: Builds multi-provider 3D and video generation toward replacing Tripo3D.ai and HiggsField-class tools. Extends packages/core media adapters, gallery/job polling, Desktop Studio wiring. One provider path or one UX slice per cycle with tests.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebSearch, WebFetch, TodoWrite
argument-hint: [optional focus, e.g. "3d-adapter", "video-poller", "gallery", "studio-export", "provider:tripo-like"]
---

# /media-capability — 3D + video replacement

**First read:** `.claude/skills/_shared/RESULTS-CONTRACT.md`  
**North star:** `docs/FUTURE-PLAN.MD` Pillars C + D  
**Backlog:** `plan/improvement-plan.md` Phase 2  
**Code home:** `packages/core/src/media/`, Desktop Studio under `packages/desktop/src/renderer/pages/Studio/`

## Goals

| Replace | SuperAgent answer |
|---------|-------------------|
| Tripo3D.ai | ≥2 providers behind one 3D job API; GLB preview/export |
| HiggsField-class video | ≥2 providers; job poll + gallery + export |

Always multi-provider. Never hard-lock a media feature to one paid SaaS.

## Priority order

1. Unified job contract (create → poll → download → gallery) if incomplete  
2. First real 3D provider adapter + mock for offline tests  
3. Second 3D provider or open fallback  
4. Video provider A + poller robustness  
5. Video provider B  
6. Desktop Studio generate → preview → export path  
7. Orchestrator modality routing for media tasks  

## Cycle

### 0) Orient

```powershell
Get-ChildItem packages/core/src/media
Get-Content .claude/auto-improve-log.log -Tail 60 -ErrorAction SilentlyContinue
```

Grep: `video_manager|tripo|glb|image-to-video|text-to-3d`. Soft lock `media-capability`.

### 1) Pick one slice

Examples of good cycle sizes:

- Add adapter method + unit test with mocked HTTP  
- Fix poller timeout/retry bug + test  
- Wire export button to existing core API  
- Register models in provider catalog as free/paid correctly  

### 2) Research (optional, max 1)

Only when adding/changing a provider HTTP API — WebFetch official docs; cache under `.claude/research-cache/`.

### 3) Implement

- Prefer extending existing `video.ts`, `image.ts`, `threed` tools, gallery, poller.  
- Offline tests with `vi.mock` / fixtures — do not require paid keys for CI.  
- Live test only free tier if user already configured.

### 4) Verify + commit + log

Prefix: `media-capability:`. Tag `[media-capability]`. Check Phase 2 boxes when warranted.

## Guardrails

- No ECAD/MCAD.  
- No inventing endpoints.  
- No research-only cycles.  
- Do not claim “Tripo replacement complete” until FUTURE-PLAN CERTAIN criteria for 3D are met.  
