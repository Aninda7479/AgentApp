# Improvement: Harden brute-force rate limiter against X-Forwarded-For spoofing

**Date:** 2026-07-16
**Packages:** `web`
**Files touched:** `packages/web/src/auth.ts`

## Summary
The per-IP login rate limiter (`MAX_ATTEMPTS = 8`, then a 15-minute lockout)
relied on `clientIp()`, which took the **first** hop of `X-Forwarded-For`:

```ts
const fwd = req.headers['x-forwarded-for'];
if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
```

`X-Forwarded-For` is fully attacker-controlled. By sending
`X-Forwarded-For: 1.2.3.4` on every attempt, an attacker could present a
different "client IP" each time and **never trip the lockout**, defeating the
brute-force protection on any deployment not strictly firewalled.

## Fix
Only trust `X-Forwarded-For` when the connection itself comes from a trusted
reverse proxy (loopback / private range), and use the **last** (rightmost) hop
— the value the proxy appended — rather than the client-supplied leftmost one:

```ts
function clientIp(req: Request): string {
  const raw = req.socket.remoteAddress || 'unknown';
  const isPrivate = (ip: string) =>
    ip === '::1' || ip === '127.0.0.1' ||
    ip.startsWith('::ffff:127.') || ip.startsWith('10.') ||
    ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  if (isPrivate(raw)) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',').pop()!.trim();
  }
  return raw;
}
```

## Impact
- Behind a trusted proxy (nginx/caddy/Cloudflare tunnel on localhost), the
  correct client IP is still extracted.
- Direct connections (no proxy) keep using the socket address.
- An attacker can no longer spoof their way past the lockout.

## Security note
This is a defense-in-depth fix. For maximum safety, operators behind a proxy
should also pin the proxy's source IP; this change closes the trivial
client-side spoofing gap without requiring config changes.
