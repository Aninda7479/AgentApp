# Improvement: MCP tool registry no longer orphans tools on unregister

**Date:** 2026-07-16
**Packages:** `core`
**Files touched:** `packages/core/src/mcp/registry.ts`

## Summary
`MCPToolRegistry.unregisterServer()` removed a server's tools by matching a
name prefix:

```ts
for (const [toolName] of Array.from(this.tools.entries())) {
  if (toolName.startsWith(`${serverName}_`)) {
    this.tools.delete(toolName);
  }
}
```

But `discoverTools` registers tools **without** a prefix when
`prefixToolName` is `false` (and the option defaults can be overridden by
callers). In that case the tool names are just the bare MCP tool names, so the
prefix check never matches: unregistering a server left all its tools in the
registry. Those orphaned tools then resolve to a `client` whose server was
closed — calling them throws from the SDK and they keep showing up in the
agent's available-tool list.

## Fix
Track tool→server ownership explicitly and clean up by owner, independent of
naming:

```ts
private toolOwners: Map<string, string> = new Map();
// in discoverTools:
this.tools.set(registeredName, toolDef);
this.toolOwners.set(registeredName, sName);
// in unregisterServer:
for (const [toolName, owner] of Array.from(this.toolOwners.entries())) {
  if (owner === serverName) {
    this.tools.delete(toolName);
    this.toolOwners.delete(toolName);
  }
}
```

## Impact
- Unregistering a server now always removes its tools, whether or not names
  are prefixed.
- Prevents calls to disconnected MCP servers and stale tool listings.

## Verification
- Core typecheck passes.
- Behavior unchanged for the default (prefixed) path; only the unprefixed
  unregister path is corrected.
