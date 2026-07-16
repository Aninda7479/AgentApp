# Improvement: Avoid double file load in `/agent list`

**Date:** 2026-07-16
**Packages:** `cli`
**Files touched:** `packages/cli/src/commands/agent.ts`

## Summary
The `/agent list` subcommand evaluated `AgentRegistry.load()` **twice** in a
single expression:

```ts
output: AgentRegistry.format(AgentRegistry.load()), data: AgentRegistry.load()
```

`load()` reads `agents.json` from disk (and on the very first invocation it
seeds the file, then the second call re-reads the freshly written file). The
duplicate call is pure waste — a redundant synchronous disk read on every
`/agent list`.

## Fix
Load once and reuse the result:

```ts
if (!sub || sub === 'list') {
  const doc = AgentRegistry.load();
  return { success: true, command: ctx.command, output: AgentRegistry.format(doc), data: doc };
}
```

## Impact
- Removes a redundant disk read from a commonly-used command.
- No behavior change; `output` and `data` are identical to before.

## Verification
- `output`/`data` are produced from the same `doc` instance, so they stay
  consistent (which is strictly better than two independent loads that could
  theoretically disagree).
