# auto-improve — ongoing application improvements

Every improvement to the SuperAgent codebase is recorded here as a separate
markdown file, most-recent first. Each file documents *what* changed, *why* it
is an improvement, how it was *verified*, and the exact files touched.

## Log

| # | File | Improvement | Type |
|---|------|-------------|------|
| 06 | [05-remove-unused-logWarn.md](05-remove-unused-logWarn.md) | Remove unused `logWarn` export | Dead code |
| 05 | [06-remove-unused-BRAND_FAVICON.md](06-remove-unused-BRAND_FAVICON.md) | Remove unused `BRAND_FAVICON` export | Dead code |
| 04 | [04-remove-unused-shortcuts-settings.md](04-remove-unused-shortcuts-settings.md) | Remove unused `ShortcutsSettings.tsx` panel | Dead code |
| 03 | [03-remove-unused-servers-settings.md](03-remove-unused-servers-settings.md) | Remove unused `ServersSettings.tsx` panel | Dead code |
| 02 | [02-remove-dead-web-storage-barrel.md](02-remove-dead-web-storage-barrel.md) | Remove dead web `storage/index.ts` barrel | Dead code |
| 01 | [01-remove-dead-renderer-barrel.md](01-remove-dead-renderer-barrel.md) | Remove dead desktop `renderer/index.ts` barrel | Dead code |

## Verification approach
- Claims of "unused" were confirmed with `grep` across `packages/` (all
  extensions, including tests and `import()`/`require()`) — a symbol is only
  removed when it has **zero** non-definition references.
- Each package was re-typechecked with `tsc --noEmit` after edits (exit 0).
- The prior `Unused.md` / `knip-report.json` analyses were treated as *hints*,
  not gospel: `web/src/ipc-bridge.ts` was flagged as dead by those reports but is
  actually an `esbuild` entry point (`web/scripts/build.js`) loaded by
  `index.html`, so it was deliberately **kept**.

## Notes / non-changes
- The committed generated dumps (`research-cache.json`, `list.md`) are already
  untracked + gitignored; `awesome-mcp.md` is a *required input* to
  `gen-mcp-catalog.mjs` (the committed output `catalog-data.ts` depends on it),
  so it is correctly left tracked. No repo-hygiene change was needed.
