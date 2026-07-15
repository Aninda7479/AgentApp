# 011 — Graceful missing-input guard in gen-mcp-catalog.mjs

- **Date:** 2026-07-15
- **Area:** Tooling robustness (`gen-mcp-catalog.mjs`)
- **Files:** `gen-mcp-catalog.mjs`

## Problem

`gen-mcp-catalog.mjs` parses `awesome-mcp.md` into the catalog source
(`packages/core/src/integrations/catalog-data.ts`). As part of #007,
`awesome-mcp.md` was intentionally removed from git tracking (it's a ~1.13 MB
regenerable input, not a build output). The committed `catalog-data.ts` still
ships, so the app works on a fresh clone — but regenerating the catalog now
requires fetching `awesome-mcp.md` first.

The script opened it with a bare `readFileSync('awesome-mcp.md', ...)`, so on a
fresh checkout (where the file is absent) it crashed with a cryptic `ENOENT`
stack instead of explaining the dependency.

## Change

- Added an `existsSync` guard that prints a clear "fetch awesome-mcp.md first"
  instruction and exits `1` when the input is missing.
- Added a comment documenting that `awesome-mcp.md` is a deliberately-untracked
  generated input and how to obtain it.

## Impact

- The catalog-regeneration workflow fails loudly and actionably rather than with
  a raw `ENOENT`, and the #007 repo-hygiene decision is now self-documenting at
  the only call site that depends on the untracked file.

## Risk

- **Low.** Only an error-path guard + comment added; the happy path is unchanged.
  `node --check` passes.
