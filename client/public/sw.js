const CACHE_PREFIX = 'pawzzle-web-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/logo.png',
  '/images/icons/logo-192.png',
  '/images/icons/logo-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(cacheNames
        .filter(cacheName => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
        .map(cacheName => caches.delete(cacheName))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request))
          || (await caches.match('/index.html'))
          || new Response('Pawzzle is temporarily unavailable offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          }))
    );
    return;
  }

  const cacheableDestinations = new Set(['style', 'script', 'image', 'font', 'manifest']);
  if (!cacheableDestinations.has(request.destination)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
