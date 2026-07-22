# SuperAgent smoke checks

Companion to the **Certainty Register** in [`FUTURE-PLAN.MD`](./FUTURE-PLAN.MD).  
A capability is not CERTAIN until its smoke here (or an automated test named below) passes.

> Fill evidence rows as `/reliability-gate` and humans run them. Commands are Windows-first (PowerShell).

## How to record a pass

1. Run the command.  
2. Note date, surface, PASS/FAIL, and any model used.  
3. Update FUTURE-PLAN Certainty Register.  
4. Append a line under **Evidence log** below.

---

## CERTAIN-1 — CLI chat + tool call (file read)

**Status:** CERTAIN (2026-07-21)

**Automated:**

```powershell
npx vitest run packages/core/test/cli-chat-tool-smoke.test.ts --reporter=verbose
```

**What it proves:**
- AgentEngine creates builtin tools (including `read_file`) in its toolset.
- Provider issues a `read_file` tool call → engine executes the real builtin tool → result feeds back into history → provider sees the result and produces a final text answer.
- The full agentic tool loop (stream → tool_call → execute → tool_result → stream → done) completes without crash.
- No real API key needed (provider layer is mocked).

**Pass criteria:** `tool_call` + `tool_result` events emitted; `done` event fires; final content includes expected marker.

---

## CERTAIN-2 — Core tool loop error path

**Status:** CERTAIN (2026-07-21)

**Automated:**

```powershell
npx vitest run packages/core/test/ai-engine-toolloop-failure.test.ts --reporter=verbose
```

**What it proves:**
- Unknown tool name → error surfaced, loop continues
- Tool throws → error surfaced, loop continues
- Runaway loop → max iterations stops it
- Provider error → graceful failure
- Context overflow → recovery
- Mixed success/failure paths handled

**Pass criteria:** 10/10 tests pass.

---

## CERTAIN-3 — Desktop send message

**Status:** CERTAIN (2026-07-22)

**Automated:**

```powershell
npx vitest run packages/desktop/src/desktop-send-message.test.ts --reporter=verbose
```

**What it proves:**
- sendPrompt routing, config resolution, runRealAgent IPC, stream event handling
- 22 tests covering the Desktop send-message path

**Pass criteria:** 22/22 tests pass.

---

## CERTAIN-4 — Web send message

**Status:** CERTAIN (2026-07-22)

**Automated:**

```powershell
npx vitest run packages/web/test/web-send-message-e2e.test.ts --reporter=verbose
```

**What it proves:**
- Web send message end-to-end with mocked provider
- 9 tests covering the Web send-message path

**Pass criteria:** 9/9 tests pass.

---

## CERTAIN-5 — BYOK connect + list models

**Status:** CERTAIN (2026-07-22)

**Automated:**

```powershell
npx vitest run packages/core/test/certainty-byok-provider-connect.test.ts --reporter=verbose
```

**What it proves:**
- Provider key registration → adapter.listModels → ModelCapabilityRegistry aggregation
- Encrypted credential persistence + reload
- Multi-provider connect, keyless providers, missing API key rejection
- Adapter factory for all 18 known providers + dynamic custom

**Pass criteria:** 47/47 tests pass.

---

## CERTAIN-6 — MCP list/connect smoke

**Status:** CERTAIN (2026-07-22)

**Automated:**

```powershell
npx vitest run packages/core/test/certainty-mcp-list-connect.test.ts --reporter=verbose
```

**What it proves:**
- MCPClient init + connection state
- MCPClientManager: addServer / listServers
- createMCPTool: list + add actions via agent tool interface
- MCPToolRegistry: register → discoverTools → execute → unregister (with prefix/unprefix)
- MCPToolRegistry + permission guard integration (blocked/allowed execution)
- MCPPermissionGuard: all modes (auto, read-only, manual), allow/block lists, dynamic setMode
- MCPResourceManager: listResources, readResource, injectPromptTemplate, error paths
- Transport factory functions: stdio, SSE, HTTP
- CLI MCPConfigStore: load, upsert, remove, formatList, invalid JSON handling
- CLI /mcp command: list, add (stdio + sse), get, remove, rm alias, error paths, full CRUD lifecycle

**Pass criteria:** 73/73 tests pass; build PASS.

---

## Evidence log

| Date | Capability | Result | Command / note |
|------|------------|--------|----------------|
| 2026-07-21 | CERTAIN-1 | PASS | `npx vitest run packages/core/test/cli-chat-tool-smoke.test.ts` — 2/2 tests pass; 227/227 full core suite pass |
| 2026-07-21 | CERTAIN-2 | PASS | `npx vitest run packages/core/test/ai-engine-toolloop-failure.test.ts` — 10/10 pass |
| 2026-07-22 | CERTAIN-3 | PASS | `npx vitest run packages/desktop/src/desktop-send-message.test.ts` — 22/22 pass |
| 2026-07-22 | CERTAIN-4 | PASS | `npx vitest run packages/web/test/web-send-message-e2e.test.ts` — 9/9 pass |
| 2026-07-22 | CERTAIN-5 | PASS | `npx vitest run packages/core/test/certainty-byok-provider-connect.test.ts` — 47/47 pass |
| 2026-07-22 | CERTAIN-6 | PASS | `npx vitest run packages/core/test/certainty-mcp-list-connect.test.ts` — 73/73 pass |
