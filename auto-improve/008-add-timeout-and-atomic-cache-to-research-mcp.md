# 003 — Harden research-mcp.mjs (fetch timeout + atomic cache)

- **Date:** 2026-07-15
- **Area:** Tooling robustness (`research-mcp.mjs`)
- **Files:** `research-mcp.mjs`

## Problem

The background MCP-catalog research script had two robustness gaps:

1. **No network timeout.** `fetchOne` awaited `fetch()` with no `AbortController`.
   A single slow or black-holed host (connection opens but never responds) would
   hang that worker — and with `CONCURRENCY = 6` workers draining the queue, one
   stuck fetch could stall the entire batch indefinitely with no progress.
2. **Crash on corrupt cache.** The 8 MB `research-cache.json` was loaded with a
   bare `JSON.parse(readFileSync(...))`. If the process was killed mid-write
   (the cache is saved every 200 repos), the file could be truncated, the next
   run would throw on parse, and the whole script would die — losing the cache.
3. **Non-atomic cache write.** `writeFileSync` directly to the cache file meant a
   crash mid-write left a half-written, unparseable file (the root cause of #2).

## Change

- Added a `FETCH_TIMEOUT_MS` guard (default 15 s, overridable via
  `RESEARCH_TIMEOUT_MS`) using `AbortController` + `clearTimeout` in a `finally`
  so timers never leak.
- Wrapped the cache load in `try/catch`; on corruption it warns and starts with
  an empty cache instead of crashing.
- Made `saveCache()` atomic: serialize to `research-cache.json.tmp` then
  `renameSync` over the target, so a crash can never leave a partial cache.
- Imported `renameSync` from `fs`.

## Impact

- A hung host now times out after 15 s and the run continues (with a retry),
  instead of stalling the batch.
- The research pass is resilient to interruptions: corrupt/partial caches are
  recovered automatically, and in-progress writes can no longer corrupt the cache.

## Risk

- **Low.** Pure additions/guards in a standalone dev tool; behavior is identical
  on healthy networks. `node --check` passes.
