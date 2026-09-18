/**
 * SuperAgent — Progressive Web App Service Worker
 * Handles offline app shell caching and installability criteria for port 1469.
 *
 * CRITICAL SAFETY:
 * - Never caches or intercepts WebSocket handshakes (/ws, /api/ws).
 * - Never caches dynamic REST API requests (/api/*).
 * - Implements Network-First for JS bundles and navigation to ensure zero stale agent state.
 */

const CACHE_NAME = 'superagent-pwa-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icon.svg',
  '/icon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-192-maskable.png',
  '/assets/icon-512-maskable.png',
  '/assets/apple-touch-icon.png',
  '/assets/icon-32.png',
  '/assets/icon-16.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.allSettled(
          PRECACHE_ASSETS.map(async (url) => {
            try {
              const res = await fetch(url);
              if (res.ok) {
                await cache.put(url, res);
              }
            } catch (err) {
              console.warn('[PWA-SW] Pre-cache skip for:', url, err);
            }
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith('superagent-pwa-') && cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
            return Promise.resolve();
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle standard HTTP/HTTPS GET requests
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  // 1. Never intercept or cache WebSocket handshakes, API endpoints, or IPC routes
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/api/ws')
  ) {
    return;
  }

  // 2. Navigation requests (HTML pages): Network-first with safe cache fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(req);
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, copy);
            });
          }
          return networkResponse;
        } catch {
          const cachedResponse =
            (await caches.match(req)) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'));
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response(
            '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SuperAgent Offline</title><style>body{margin:0;background:#090a0f;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:1rem;box-sizing:border-box;}div{background:#12131a;border:1px solid #27272a;border-radius:12px;padding:2rem;max-width:440px;}h2{margin-top:0;color:#38bdf8;}button{background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:500;cursor:pointer;margin-top:1rem;}</style></head><body><div><h2>SuperAgent Offline</h2><p>Could not connect to the SuperAgent daemon at localhost:1469.</p><button onclick="location.reload()">Retry Connection</button></div></body></html>',
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
          );
        }
      })()
    );
    return;
  }

  // 3. Static assets: Network-first with safe cache fallback for scripts
  const isCode = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isCode) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(req);
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, copy);
            });
          }
          return networkResponse;
        } catch {
          const cached = await caches.match(req);
          if (cached) {
            return cached;
          }
          return new Response('/* Resource offline */', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
              'Content-Type': url.pathname.endsWith('.css')
                ? 'text/css; charset=utf-8'
                : 'application/javascript; charset=utf-8',
            },
          });
        }
      })()
    );
  } else {
    // Images, icons, fonts, manifest: Cache-first / Stale-While-Revalidate with guaranteed Response
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match(req);
        if (cachedResponse) {
          fetch(req)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.ok) {
                const copy = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(req, copy);
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(req);
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, copy);
            });
          }
          return networkResponse;
        } catch {
          return new Response(null, {
            status: 503,
            statusText: 'Service Unavailable',
          });
        }
      })()
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
