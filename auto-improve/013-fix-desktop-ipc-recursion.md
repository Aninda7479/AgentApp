# 013 — Fix desktop IPC handlers recursively calling themselves (startup crash)

- **Date:** 2026-07-15
- **Area:** Desktop main process (`packages/desktop/src/main.ts`)
- **Files:** `packages/desktop/src/main.ts`

## Problem

`safeHandle` / `safeOn` are the wrappers every one of the ~70 desktop IPC
handlers is registered through (they catch handler errors and forward them to
the renderer as toasts instead of white-screening). But the wrappers delegated
to **themselves** instead of Electron's `ipcMain`:

```ts
function safeHandle(channel, handler): void {
  safeHandle(channel, async (event, ...args) => {   // ← calls itself
    try { return await handler(event, ...args); }
    catch (err) { return { __ipcError: true, ... }; }
  });
}
```

Every top-level `safeHandle('agent-run', …)` call therefore triggered infinite
recursion → `RangeError: Maximum call stack size exceeded` → the desktop app
crashes on startup. Introduced in `v0.0.14 Minor Fixes` (git blame, line 49).

The **compiled `dist/main/main.js` is correct** (it uses `ipcMain.handle`
directly), so the currently-shipped app works — but anyone rebuilding from
source would produce a broken desktop. This was a latent, rebuild-triggered
regression.

## Change

- `safeHandle` now delegates to `ipcMain.handle(channel, …)`.
- `safeOn` now delegates to `ipcMain.on(channel, …)`.
- The try/catch → `IpcErrorEnvelope` safety behavior is preserved.

## Impact

- Rebuilding the desktop from source no longer crashes on startup; all IPC
  handlers register correctly and remain error-safe.

## Risk

- **Low.** The compiled dist already used exactly this `ipcMain.handle` /
  `ipcMain.on` pattern, so the fix restores the known-good behavior. `tsc
  --noEmit` on the desktop package passes (exit 0).
