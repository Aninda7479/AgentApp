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
