// BYOC PWA Production Service Worker (v2.0.1)
const CACHE_NAME = 'byoc-cache-v3';

// Safe application shell assets only
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './icon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and http(s)
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // STRICT PRIVACY & CREDENTIAL SECURITY + DEV FRESHNESS:
  // Never cache external API queries, auth endpoints, AI streams, or Vite dev/source modules.
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('adzuna.com') ||
    url.hostname.includes('remotive.com') ||
    url.pathname.includes('/auth') ||
    url.pathname.includes('/credentials') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.tsx') ||
    url.searchParams.has('t')
  ) {
    return; // Pass directly to network with zero caching
  }

  // Network-first strategy for navigation documents to prevent stale application versions
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match('./index.html').then((cachedDoc) => cachedDoc || caches.match('./'))
        )
    );
    return;
  }

  // Stale-while-revalidate for static hashed build assets and icons only
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});
