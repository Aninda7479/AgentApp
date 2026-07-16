# Improvement: Bound the usage log with a rolling window

**Date:** 2026-07-16
**Packages:** `core`
**Files touched:** `packages/core/src/storage/usage-tracker.ts`

## Summary
`UsageTracker.trackUsage()` is invoked on **every** agent turn (from
`AgentEngine.streamFromProvider`). Its implementation:

1. reads the entire `usage-log.json` from disk,
2. pushes one record,
3. rewrites the **entire** file back.

With no upper bound, the log grows forever: disk usage is unbounded and each
subsequent call reads + rewrites a larger file, so cost grows linearly with
session length. On a long-running desktop/web session this is a slow, silent
leak.

## Fix
Cap retained records to the most recent `MAX_RECORDS` (5000) before persisting:

```ts
private static readonly MAX_RECORDS = 5000;
// ...
records.push(newRecord);
if (records.length > UsageTracker.MAX_RECORDS) {
  records.splice(0, records.length - UsageTracker.MAX_RECORDS);
}
```

## Impact
- Disk usage and per-call rewrite cost now stay bounded regardless of how long
  the process runs.
- Aggregated summaries (`getSummary`) remain accurate for recent activity; the
  truncation only drops the oldest history, which is acceptable for a usage
  dashboard.

## Verification
- Pure array cap before the existing `writeFileSync`; no change to the record
  shape or the success/error path.
- `clearUsage()` is unaffected (still resets to `[]`).
