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
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[PWA-SW] Pre-cache partial warning:', err);
        });
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

  // 2. Navigation requests (HTML pages): Network-first with cache fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, copy);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(req);
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 3. Static assets: Network-first with cache fallback for scripts; Stale-While-Revalidate for images/fonts
  const isCode = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isCode) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, copy);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(req))
    );
  } else {
    // Images, icons, fonts, manifest: Cache-first / Stale-While-Revalidate
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(req, copy);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
