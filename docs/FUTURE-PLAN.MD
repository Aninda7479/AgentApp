# SuperAgent Future Plan

**Last updated:** 2026-07-21  
**Owner north star:** One open-source agent surface that replaces locked-in commercial agents, CLIs, and media tools — without locking the user to a single vendor.

This file is the product roadmap. Skills (`.claude/skills/*`) and `plan/improvement-plan.md` must serve **this** document, not abstract “keep coding” loops.

---

## 0. Honesty gate — “100% sure it works”

### Status today

| Surface | Claim | Reality (2026-07-21) |
|---------|--------|----------------------|
| Core engine | Shared brain for all faces | Partially proven (tests exist; no full E2E matrix) |
| Desktop app | Full agent + GUI | Partial — polish and path coverage incomplete |
| CLI | Claude Code–class terminal agent | Partial — commands exist; depth gaps remain |
| Web | Same core via browser | Partial — fewer features than desktop |

**Currently 100% sure it works across Core + App + CLI + Web: none.**

### Definition of “100% sure”

A capability is **CERTAIN** only when **all** of the following pass:

1. **Unit/integration tests** cover the happy path + one failure path in `@superagent/core` (or the owning package).
2. **Static gate:** `npm run build` passes for core + the surface(s) that expose it.
3. **Live smoke** on that surface (Desktop and/or CLI and/or Web) with a free or local model when the feature needs an LLM; pure offline features need a scripted smoke instead.
4. **Logged** in this file’s **Certainty Register** with date + test command + smoke result.
5. **No known P0 bug** open for that capability.

Until then, list it under **Building** or **Planned**, never under CERTAIN.

### Certainty Register

| Capability | Surfaces | Status | Evidence | Next gate |
|------------|----------|--------|----------|-----------|
| *(empty)* | — | — | — | First CERTAIN target: **CLI chat turn + tool call (read file)** |

**Priority rule for all auto skills:** move one row from empty/partial → CERTAIN before inventing new product surface area, unless the cycle is explicitly scoped to a replacement pillar (3D/video/CLI parity).

---

## 1. Product pillars (what we are building)

### Pillar A — Agent replacement (coding + general agent)

**Replace / match:** Antigravity Agent, Claude Desktop, OpenAI (ChatGPT Work + Codex)

| Must-have | Why | SuperAgent home |
|-----------|-----|-----------------|
| Multi-step tool use with self-correction | Core agent loop | `packages/core` engine |
| Multi-provider BYOK + local models | Not locked to one vendor | orchestrator + providers |
| Project memory / instructions | Sticky project context | memory + storage |
| Permissions + plan mode | Safe autonomy | security + CLI/Desktop UI |
| Hooks (Pre/Post tool, session) | Extensibility | core (missing) |
| Checkpoints / rewind | Trust | core (missing) |
| Skills + subagents (advanced) | Power users | memory/skills + side agents |
| Session resume / fork / search | Multi-day work | storage + CLI + Desktop |

### Pillar B — CLI replacement

**Replace / match:** Antigravity CLI, Claude Code CLI, OpenAI CLI

| Must-have | Why |
|-----------|-----|
| Interactive TUI with slash commands | Daily driver |
| Headless / CI mode (`--print`, pipe) | Automation |
| Resume / continue sessions | Continuity |
| MCP attach | Ecosystem |
| Skills palette | Workflows |
| Diff / review / plan / verify commands | Dev lifecycle |
| Self-update | Distribution |

### Pillar C — 3D generation replacement

**Replace / match:** [Tripo3D.ai](https://www.tripo3d.ai)

| Must-have | Why |
|-----------|-----|
| Text-to-3D and image-to-3D adapters | Product claim |
| Pluggable providers (not one SaaS) | Mission: no vendor lock |
| Preview in Desktop Studio + export (GLB/OBJ) | User value |
| Quota / cost transparency | BYOK honesty |
| Partner/pet pipeline can consume generated assets | Existing 3D companion story |

### Pillar D — Video generation replacement

**Replace / match:** HiggsField (and similar)

| Must-have | Why |
|-----------|-----|
| Text-to-video / image-to-video adapters | Product claim |
| Multi-provider routing (free/local when possible) | Orchestration mission |
| Job polling, gallery, export | Usable product |
| Desktop + Web media viewers | Surfaces |

### Pillar E — Future industrial (not current focus)

**Category:** ECAD, MCAD, CAE  
**Industry apps (long horizon):** Altium Designer, SolidWorks, Ansys Icepak, Ansys Fluent, Siemens NX, PTC Creo, Nastran

Rules for this pillar:

- **Do not** start ECAD/MCAD work until Pillars A–D each have ≥1 CERTAIN capability on Core+CLI or Core+Desktop.
- When started: adapters + file formats first (STEP, Gerber, etc.), not full CAD clones.
- Prefer open kernels / exchange formats over reverse-engineering proprietary UIs.

---

## 2. Competitive map (build against outcomes, not brand names)

| Competitor class | Their strength | SuperAgent answer |
|------------------|----------------|-------------------|
| Claude Code / Antigravity CLI | Deep coding agent UX | Pillar B + hooks/checkpoints/skills |
| Claude Desktop / ChatGPT Work | Polished multi-modal chat app | Pillar A + Desktop GUI certainty |
| OpenAI Codex | Code-focused agent | Orchestrated multi-model coding routes |
| Tripo3D | Easy 3D gen | Pillar C multi-provider 3D |
| HiggsField | Video gen UX | Pillar D multi-provider video |
| SolidWorks / Ansys / Altium | Domain depth | Pillar E (later) via adapters |

---

## 3. Execution phases

### Phase 0 — Reliability foundation (NOW)

**Goal:** Stop shipping “everything is partial.” Get **one full path CERTAIN**.

1. Pick **CERTAIN-1**: CLI single-turn chat with one tool call (file read) on free/local model **or** offline mock provider.
2. Automate smoke: `packages/cli` integration test + documented manual command.
3. Register in Certainty Register.
4. Repeat for: Desktop send-message, Web send-message, provider connect BYOK, MCP list tools.

**Exit:** ≥5 CERTAIN rows spanning Core+CLI and Core+Desktop.

### Phase 1 — Agent + CLI parity (replace coding agents)

Order (results first):

1. Hooks MVP (`PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`)
2. Checkpoints + `/rewind`
3. Session continue/resume/fork + transcript search
4. Skills v2 (args, tool allowlists, stacking)
5. Subagents frontmatter + worktree isolation
6. Plan mode + permission rules
7. `/code-review` multi-agent depth

### Phase 2 — Media replacement (3D + video)

1. Normalize media adapter interface (already partially in `packages/core/src/media`)
2. Tripo-class: at least **two** 3D providers behind one API (one free/open if possible)
3. HiggsField-class: at least **two** video providers; job status + gallery
4. Desktop Studio: generate → preview → export without leaving the app
5. Orchestrator routes media tasks by modality + cost

### Phase 3 — Polish + distribution

1. GUI certainty (Workspace, Settings, Studio) via atmosphere-dashboard tokens
2. Installers + auto-update smoke matrix (Win/macOS/Linux)
3. Website + docs match CERTAIN capabilities only (no vaporware claims)

### Phase 4 — Industrial adapters (future)

Only after Phase 0–2 exit criteria. Start with geometry/exchange + simulation job runners, not full UI clones.

---

## 4. What every skill must optimize for

| Rank | Outcome |
|------|---------|
| 1 | **Ship working code** that moves a capability toward CERTAIN |
| 2 | **Prove it** (build + targeted tests; live smoke when possible) |
| 3 | **Log evidence** (auto-improve-log + Certainty Register when warranted) |
| 4 | Research only when it unblocks a real API/design decision |

Research is a **tool**, not a ritual. A cycle that only writes research files and no product code is a **failed cycle**.

---

## 5. Anti-goals (explicit)

- Cloning Claude Code feature-for-feature before SuperAgent’s own agent loop is CERTAIN on all surfaces.
- Claiming Tripo3D/HiggsField replacement without multi-provider adapters + export path.
- ECAD/MCAD work before coding + media pillars are real.
- Skill cycles that: take the lock, write research markdown, compact thrice, and commit nothing.
- Unix-only automation that fails on Windows (primary dev machine).

---

## 6. Success metrics (quarterly)

| Metric | Target |
|--------|--------|
| CERTAIN capabilities | ≥15 spanning Core/CLI/Desktop/Web |
| Provider lock-in | ≥3 cloud + 1 local path for chat; ≥2 for image; ≥2 for video; ≥2 for 3D |
| CLI parity score vs Claude Code gap list | Phase 1 items 1–5 done |
| Auto-skill hit rate | ≥70% of skill runs produce a commit or a documented CERTAIN promotion |
| “Currently 100% sure” section | Non-empty within 30 days of this plan |

---

## 7. Living documents

| Document | Role |
|----------|------|
| **This file** | Product truth — pillars, certainty, phases |
| `plan/improvement-plan.md` | Engineering backlog ordered by this plan |
| `plan/claude-code-gap-analysis.md` | Competitive detail for Pillar A/B only |
| `.claude/auto-improve-log.log` | Shared queue + cycle evidence |
| `.claude/skills/*/SKILL.md` | How agents execute cycles toward this plan |

When documents conflict, **this file wins**.
