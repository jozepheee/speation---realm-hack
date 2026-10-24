// Cache only the public fallback board and immutable build assets, never API data.
const CACHE = 'speation-public-board-v3';
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  for (const board of ['/quick-words', '/ml/quick-words', '/hi/quick-words']) {
    const response = await fetch(board, { cache: 'reload' });
    if (!response.ok) continue;
    await cache.put(board, response.clone());
    const html = await response.text();
    const paths = [...html.matchAll(/(?:src|href)="([^"\s]+)"/g)].map(match => match[1]).filter(path => path.startsWith('/_next/static/'));
    await Promise.allSettled([...new Set(paths)].map(path => cache.add(path)));
  }
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key !== CACHE && (key.startsWith('speation-public-board-') || key.startsWith('neuronudge-public-board-'))).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(?:ml\/|hi\/)?quick-words$/.test(url.pathname) && event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(async response => { if (response.ok) (await caches.open(CACHE)).put(url.pathname, response.clone()); return response; })
      .catch(() => caches.match(url.pathname)));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(async response => {
      if (response.ok) (await caches.open(CACHE)).put(event.request, response.clone()); return response;
    })));
  }
});
