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

**Status:** not yet CERTAIN  

**Automated (preferred):**

```powershell
# From repo root — adjust path when test exists:
npx vitest run packages/cli/test/cli_integration.test.ts --reporter=verbose
```

**Manual (when a free/local model is configured):**

```powershell
# Example — replace with actual CLI flags as implemented:
# superagent -p "Read package.json and print the name field only"
```

**Pass criteria:** Agent issues a read-file tool call and returns the package name without crashing.

---

## CERTAIN-2 — Core tool loop error path

**Status:** not yet CERTAIN  

```powershell
npx vitest run packages/core --reporter=dot
# Target tests that assert tool failure is surfaced and loop continues or stops cleanly
```

---

## CERTAIN-3 — Desktop send message

**Status:** not yet CERTAIN (may be PROVISIONAL if only manual)

Manual: launch Desktop → connect free/local provider → send “ping” → receive assistant message.

---

## CERTAIN-4 — Web send message

**Status:** not yet CERTAIN  

```powershell
# After web server up:
# npm run dev --workspace=@superagent/web
# Open UI, send one message
```

---

## CERTAIN-5 — BYOK connect + list models

**Status:** not yet CERTAIN  

Prefer offline unit test that mocks provider HTTP and asserts models parse into registry shape.

---

## CERTAIN-6 — MCP list tools

**Status:** not yet CERTAIN  

```powershell
# CLI or unit test that lists tools from a mock MCP server
```

---

## Evidence log

| Date | Capability | Result | Command / note |
|------|------------|--------|----------------|
| — | — | — | — |
