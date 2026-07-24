# Structural Flaw Report — "Faces vs. Core" Separation

**Audit date:** 2026-07-18
**Scope:** `packages/core`, `packages/cli`, `packages/desktop`, `packages/web`
**Principle under test:** *Core (`@superagent/core`) is the body and brain — all processing, state, and management. CLI, Desktop, and Web are only faces (thin transport/UI).*

---

## TL;DR Verdict

| Package | Role | Verdict |
|---------|------|---------|
| `core` | Brain/body | ✅ Correct — owns engine, providers, orchestrator, memory, MCP, media, sandbox, storage |
| `cli` | Face | ✅ **PASS** — delegates everything to `@superagent/core`, never re-implements the engine |
| `desktop` | Face | ✅ **PASS** — delegates engine, partner store, and conversation store to Core |
| `web` | Face | ✅ **PASS** — delegates engine, partner store, and conversation store to Core |

**Status:** All Tier 1 and Tier 2 structural duplications and architectural flaws have been resolved.

---

## Critical Findings (Tier 1)

### F1 — Agent engine triplicated (the brain lives in the faces) [RESOLVED]
*   **Resolution:** Consolidated `AgentEngine`, `MultiAgentManager`, tool definitions, context gauge tracking, and auto-compaction logic into [core/src/providers/ai-engine.ts](file:///d:/Projects/OpenSource/AgentApp/packages/core/src/providers/ai-engine.ts).
*   **Delegates:**
*   [desktop/src/main/ai-engine.ts](file:///d:/Projects/OpenSource/AgentApp/packages/desktop/src/main/ai-engine.ts) delegates entirely to Core.
*   [web/src/ai-engine.ts](file:///d:/Projects/OpenSource/AgentApp/packages/web/src/ai-engine.ts) delegates entirely to Core.
*   **Impact:** A single unified implementation runs everywhere. Safety guards, sandbox hooks, and token management are updated in one place.

---

### F2 — Conversation store duplicated across faces [RESOLVED]
*   **Resolution:** Moved all conversation store persistence structures, storage paths, and the robust file fallback recovery mechanism into `@superagent/core` under `packages/core/src/storage/`:
    *   [core/src/storage/conversation-types.ts](file:///d:/Projects/OpenSource/AgentApp/packages/core/src/storage/conversation-types.ts) (consolidated schema/types)
    *   [core/src/storage/conversation-paths.ts](file:///d:/Projects/OpenSource/AgentApp/packages/core/src/storage/conversation-paths.ts) (consolidated path sanitization and filesystem locations)
    *   [core/src/storage/conversation-store.ts](file:///d:/Projects/OpenSource/AgentApp/packages/core/src/storage/conversation-store.ts) (consolidated CRUD operations and atomic backup restores)
*   **Delegates:**
    *   [desktop/src/main/storage/types.ts](file:///d:/Projects/OpenSource/AgentApp/packages/desktop/src/main/storage/types.ts), [paths.ts](file:///d:/Projects/OpenSource/AgentApp/packages/desktop/src/main/storage/paths.ts), and [conversation-store.ts](file:///d:/Projects/OpenSource/AgentApp/packages/desktop/src/main/storage/conversation-store.ts) now re-export from Core.
    *   [web/src/storage/types.ts](file:///d:/Projects/OpenSource/AgentApp/packages/web/src/storage/types.ts), [paths.ts](file:///d:/Projects/OpenSource/AgentApp/packages/web/src/storage/paths.ts), and [conversation-store.ts](file:///d:/Projects/OpenSource/AgentApp/packages/web/src/storage/conversation-store.ts) now re-export from Core.
*   **Impact:** Schema and file I/O operations are centralized, ensuring data consistency and safety across both presentation layers.

---

## High Findings (Tier 2)

### F3 — Partner/pet store duplicated [RESOLVED]
*   **Resolution:** Moved companion validating and listing logic into [core/src/integrations/partner-store.ts](file:///d:/Projects/OpenSource/AgentApp/packages/core/src/integrations/partner-store.ts).
*   **Delegates:**
    *   [desktop/src/main/partner-store.ts](file:///d:/Projects/OpenSource/AgentApp/packages/desktop/src/main/partner-store.ts) delegates to Core, keeping only the relative companion GLB folder path.
    *   [web/src/partner-store.ts](file:///d:/Projects/OpenSource/AgentApp/packages/web/src/partner-store.ts) delegates directly to Core.

---

## Medium Findings (Tier 3 — borderline adapters)

### F4 — `desktop/src/main/mcp-manager.ts` (107 lines) [RESOLVED (Dependencies)]
*   **Status:** Retained as a face adapter since it only wraps IPC connectivity for electron main processes, but now cleanly imports types from `@superagent/core` instead of a duplicated engine.

### F5 — `desktop/src/main/skills.ts` (255 lines) [PASS]
*   **Status:** Retained as a face adapter for Electron-specific local file import dialog configurations.

---

## Verification Results

*   **Build Status:** ✅ Successful across all packages.
*   **Test Suite Status:** ✅ **All 653 tests pass successfully.**
