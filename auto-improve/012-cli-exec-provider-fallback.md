# Let `exec` honor the user's saved provider (dead fallback fix)

- **Date:** 2026-07-15
- **Type:** Bug fix (dead fallback made live)
- **Category:** Correctness / UX

## Summary
In `packages/cli/src/bin/exec.ts`, the `exec` subcommand registered
`--provider` with a hard-coded commander default of `'openai'`:

```ts
.option('--provider <provider>', 'Specify AI provider override', 'openai')
```

This default **always wins**, so the intended fallback on line 71 was dead:

```ts
const provider =
  options.provider || savedSettings.lastUsedModel?.provider || 'openai';
```

Because `options.provider` is never `undefined` (commander supplies `'openai'`),
`settings.lastUsedModel?.provider` could never be reached — a user who had
selected a different last-used provider in Settings would silently get `openai`
every time they ran `exec` without `--provider`.

## Change
Removed the `'openai'` default from the `exec` command's `--provider` option so
the resolution order on line 71 works as written: explicit flag → saved
last-used provider → `openai`.

## Why it's an improvement
- Restores the evidently-intended behavior: `exec` now respects the user's
  saved provider preference instead of always forcing `openai`.
- Removes a misleading dead branch (the fallback that could never execute).
- No behavior change for users who pass `--provider` or who have `openai` saved.

## Verification
- Root cause: commander's third `.option()` arg is the default value, so
  `options.provider` was `'openai'` even when the flag was omitted, preempting
  the `savedSettings` fallback.
- `cli/test/exec.test.ts` exercises the *slash* `/exec` command
  (`handleExecCommand`), not `executeScript` — unaffected.
- `cli/test/cli_shell.test.ts:38` (`expect(options.provider).toBe('openai')`)
  governs the **main** program's `parseCliArguments`, not the `exec` subcommand
  — unaffected.
- `tsc --noEmit` on `packages/cli` → exit 0.

## Files changed
- `packages/cli/src/bin/exec.ts` — dropped the `'openai'` default on `--provider`.
