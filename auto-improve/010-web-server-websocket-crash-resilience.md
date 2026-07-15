# 010 — Web server WebSocket crash resilience

- **Date:** 2026-07-15
- **Area:** Web server stability (`packages/web/src/server.ts`)
- **Files:** `packages/web/src/server.ts`

## Problem

Two unguarded spots could crash the whole web server from a routine network glitch:

1. **Unhandled socket `error` events.** `wss.on('connection', ...)` listened for
   `close` but never for `error`. A `WebSocket` that hits `ECONNRESET`,
   a TLS failure, or a mid-handshake drop emits an `'error'` event; with no
   listener, Node turns it into an **uncaught exception that kills the process**.
   On a LAN-exposed server (`HOST=0.0.0.0`) transient client disconnects are
   common, so this was a realistic availability bug.
2. **`broadcast()` could throw inside the agent event loop.** It called
   `JSON.stringify(payload)` and `ws.send(payload)` with no guard. A
   circular/malformed event payload (or a socket that died between the
   `readyState` check and `send`) would throw inside the `runAgentEngine`
   event callback — aborting the broadcast of every other client's events.

## Change

- Added `ws.on('error', ...)` in the connection handler: it logs, removes the
  socket from `connectedSockets`, and closes it — so a bad socket can no longer
  crash the server.
- Hardened `broadcast()`: the `JSON.stringify` is wrapped in `try/catch`
  (drops the message with a log instead of throwing), and each `ws.send` is
  wrapped in `try/catch` that cleans up dead sockets.

## Impact

- Transient client disconnects / network errors no longer take down the server.
- A single malformed event or dead socket can no longer interrupt event
  delivery to the other connected clients.

## Risk

- **Low.** Pure defensive listeners/guards; the happy path is byte-for-byte
  identical. No API or behavior change for healthy connections.
