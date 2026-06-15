const CACHE_NAME = 'pipe-master-v30-79-55-original-verified-star-mark';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './questions.js',
  './theory.js',
  './sw.js',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && (k.startsWith('pipe-master') || k.includes('pipe')))
        .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isAppCoreRequest(req){
  const url = new URL(req.url);
  return req.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/theory.js')
    || url.pathname.endsWith('/questions.js')
    || url.pathname.endsWith('/sw.js')
    || url.pathname.endsWith('/manifest.json');
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  if (isAppCoreRequest(e.request)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone)).catch(() => null);
        return res;
      }).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone)).catch(() => null);
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});

// v30.77: 2019-1 restore verified add cache refresh
