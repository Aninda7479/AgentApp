# 004 — Graceful cache reads in root scripts

- **Date:** 2026-07-15
- **Area:** Tooling robustness (`analyze-cache.mjs`, `peek.mjs`)
- **Files:** `analyze-cache.mjs`, `peek.mjs`

## Problem

Both scripts open `research-cache.json` with a bare `JSON.parse(readFileSync(...))`
and no `existsSync` check. If the cache is missing (research not yet run) or
corrupt (see #008), they crash with an unhelpful `SyntaxError`/`ENOENT` stack
instead of telling the user what to do.

## Change

- Added an `existsSync` guard that prints "run `node research-mcp.mjs` first" and
  exits `1` when the cache is absent.
- Wrapped the parse in `try/catch`; on corruption it prints a clear recover
  instruction and exits `1`.
- Imported `existsSync` from `fs`.

## Impact

- The research toolchain fails loudly and actionably instead of with a raw
  stack trace, making the dev loop easier to debug.

## Risk

- **Low.** Only error-path handling added; happy path is unchanged. `node --check`
  passes for both files.
