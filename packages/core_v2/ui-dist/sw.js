self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Do not intercept API requests, WebSocket handshakes, or non-GET methods.
  // Returning without calling e.respondWith lets the browser handle the network request natively.
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
    return;
  }

  // For SPA navigation requests (e.g. /settings/models), attempt network fetch and fallback to /index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => {
        return fetch('/index.html');
      })
    );
    return;
  }
});

