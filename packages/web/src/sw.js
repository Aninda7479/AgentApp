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

  // Simple fetch pass-through for static PWA assets with safety catch
  e.respondWith(
    fetch(e.request).catch((err) => {
      console.warn('[PWA SW] Static asset fetch failed:', e.request.url, err);
      return Response.error();
    })
  );
});

