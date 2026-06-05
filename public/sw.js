const CACHE_NAME = 'fame-cache-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/fame-icon.svg'
];

function isolatedHeaders(headers) {
  const next = new Headers(headers);
  next.set('Cross-Origin-Opener-Policy', 'same-origin');
  next.set('Cross-Origin-Embedder-Policy', 'require-corp');
  next.set('Cross-Origin-Resource-Policy', 'same-origin');
  return next;
}

async function withIsolation(response) {
  if (!response) return response;
  const headers = isolatedHeaders(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => undefined)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return withIsolation(cached);
      return fetch(event.request).then(async (response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return withIsolation(response);
      });
    })
  );
});
