# Improvement: Trajectory reader tolerates corrupt log lines

**Date:** 2026-07-16
**Packages:** `core`
**Files touched:** `packages/core/src/planner/trajectory.ts`

## Summary
`TrajectoryStore.readTrajectoryLogs()` read its JSONL log with:

```ts
const lines = content.split('\n').filter(line => line.trim().length > 0);
return lines.map(line => JSON.parse(line) as TrajectoryLogEntry);
```

A single malformed line (e.g. a partial write left behind when the process is
killed mid-log) makes `JSON.parse` throw. The surrounding `try/catch` only
special-cases `ENOENT` and re-throws everything else — so **one bad line loses
the entire session's trajectory**, even when 99% of entries are valid.

Sibling loaders (`media/cache.ts`, `media/video_manager.ts`) already skip
malformed files, so this also restores consistency across the codebase.

## Fix
Skip bad lines instead of aborting, and warn:

```ts
const entries: TrajectoryLogEntry[] = [];
let skipped = 0;
for (const line of lines) {
  try {
    entries.push(JSON.parse(line) as TrajectoryLogEntry);
  } catch {
    skipped++;
  }
}
if (skipped > 0) {
  console.warn(`[trajectory] Skipped ${skipped} malformed line(s) in ${filePath}`);
}
return entries;
```

## Impact
- A corrupt trajectory file no longer wipes the whole session history.
- Behavior unchanged for well-formed logs (common case).

## Verification
- Core typecheck passes.
- ENOENT still returns `[]`; other I/O errors still propagate.
