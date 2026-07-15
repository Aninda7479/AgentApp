# Fix `TerminalShellExecutor` hanging on Windows (`close` vs `exit`)

- **Date:** 2026-07-15
- **Type:** Bug fix
- **Category:** Correctness / test reliability

## Summary
`packages/core/test/sandbox.test.ts` had a failing test:
`should execute shell command and return output` timed out at 5000 ms.

Root cause is in `packages/core/src/sandbox/terminal.ts`. `execute()` resolved
the result only on the child process's **`close`** event. `close` fires only
after *every* stdio stream has closed. On Windows, `powershell.exe` (the default
shell) does **not** reliably close its stdout/stderr pipes on *normal*
termination, so `close` never fires and the promise hangs until the command
timeout kills the process (which finally closes the handles and triggers
`close`). That is why the *killed* command test (`Start-Sleep` → killed at 500 ms)
passed while the *normally-exiting* `echo` command hung: only the kill forced
`close`.

The failure reproduced **deterministically in isolation** (~5013 ms), so it was
not load-related flakiness — it is a genuine Windows hang.

## Change
Resolve on the child's **`exit`** event (which fires reliably when the process
terminates, after all stdout/stderr `data` events have already been delivered),
guarded by a `settled` flag to prevent a double resolve. `close` is retained as
a redundant safety net.

```ts
let settled = false;
const settle = (code: number | null) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  resolve({ /* …stdout/stderr captured so far… */ exitCode: code, timedOut });
};
child.on('exit', (code) => settle(code));
child.on('close', (code) => settle(code));
```

## Why it's an improvement
- Fixes a consistently-failing core test on Windows (`npm test` was red).
- Makes command execution resolve promptly on normal exit instead of waiting
  for the timeout/kill path — better latency and no spurious timeouts in real
  use on Windows.
- Behavior on Unix (`/bin/sh`) is unchanged (both `exit` and `close` fire).

## Cascading impact (consumers of the built `core`)
`cli` and `desktop` import `@superagent/core` from its **built `dist/`**, so the
`close`-based hang also broke their command-executing tests. The root
`npm test` (`core && cli && desktop`) short-circuited at `core`, so `cli`/`desktop`
never ran originally — both had hidden failures:
- `cli`: was **7 failed / 159 passed** (all `TerminalShellExecutor`-backed
  `/exec` tests timing out) → **166/166 after rebuilding `core`**.
- `desktop`: **90/90 passing** once the rebuilt `core` shipped this fix (and the
  parallel `v0.0.18` provider-timeout fix) to consumers.
Rebuilding `@superagent/core` is required for the fix to reach consumers
(`dist/` is gitignored, so CI regenerates it on build).

## Verification
- Reproduced the failure in isolation: `vitest run test/sandbox.test.ts -t "should execute shell command and return output"` → timed out at 5013 ms before the fix.
- After the fix: same test passes; full `sandbox.test.ts` suite → 13/13 pass.
- Rebuilt `@superagent/core`; `cli` suite → 166/166, `desktop` suite → 90/90.
- `tsc --noEmit` on `packages/core` → clean (no type errors).
- The fix only touches `sandbox/terminal.ts`; it does not affect `core/providers/*`
  (worked on by a parallel process) or any other module.

## Files changed
- `packages/core/src/sandbox/terminal.ts` — resolve on `exit` (guarded), keep
  `close` as safety net.
