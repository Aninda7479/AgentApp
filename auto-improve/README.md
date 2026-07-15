# Auto-Improve Log

Continuous, low-risk improvements to the SuperAgent application, each recorded as
a separate Markdown file so progress is reviewable and revertible.

Every entry follows this shape:

- **Problem** — what was suboptimal (with evidence: file, line, size).
- **Change** — what was done.
- **Impact** — the measurable or qualitative benefit.
- **Risk** — why it's safe (verification performed).

## Entries

| # | Title | Area | Impact |
|---|-------|------|--------|
| 01 | Remove dead desktop renderer barrel | desktop | Less dead code |
| 02 | Remove dead web storage barrel | web | Less dead code |
| 03 | Remove unused MCP Servers settings panel | desktop | Less dead code |
| 04 | Remove unused Shortcuts settings panel | desktop | Less dead code |
| 05 | Remove unused `logWarn` export | desktop | Less dead code |
| 06 | Remove unused `BRAND_FAVICON` export | desktop | Less dead code |
| 07 | Untrack 9.7 MB generated data dumps | repo / Docker | Smaller clone + image |
| 08 | Add network timeout + atomic cache to research-mcp.mjs | tooling | No more hangs / corrupt cache |
| 09 | Graceful cache reads in root scripts | tooling | Actionable errors |
| 10 | Web server WebSocket crash resilience | web | No more crashes on disconnect |
| 11 | Graceful missing-input guard in gen-mcp-catalog.mjs | tooling | Actionable error + documents #007 |

## Verification approach

- Claims of "unused" were confirmed with `grep` across `packages/` (all
  extensions, including tests and `import()`/`require()`) — a symbol is only
  removed when it has **zero** non-definition references.
- The web package was re-typechecked with `tsc --noEmit` after edits (exit 0).
- The prior `Unused.md` analysis was treated as a *hint*, not gospel:
  `web/src/ipc-bridge.ts` was flagged as dead by that report but is actually an
  `esbuild` entry point (`web/scripts/build.js`) loaded by `index.html`, so it
  was deliberately **kept**.

## Note on the untracked data dumps (#007)

`research-cache.json`, `list.md`, and `awesome-mcp.md` are regenerable
intermediates, not build outputs. The committed `catalog-data.ts` (produced by
`gen-mcp-catalog.mjs` from `awesome-mcp.md`) is the real artifact, so the app
works on a fresh clone without them. To regenerate the catalog you fetch
`awesome-mcp.md` first — `gen-mcp-catalog.mjs` now fails with a clear message
when it is missing (see #11). This trades a 1.13 MB permanent repo/Docker bloat
for a one-line fetch on the rare catalog-regeneration path.

