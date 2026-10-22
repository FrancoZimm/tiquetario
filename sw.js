// Tiquetario — service worker
// Bump this version string whenever index.html (or any precached file) changes,
// so returning users get the new version instead of a stale cached copy.
const VERSION = 'v9';
const SHELL_CACHE = 'tiquetario-shell-' + VERSION;
const RUNTIME_CACHE = 'tiquetario-runtime-' + VERSION;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/icon-180.png',
];

// Cross-origin hosts we are allowed to runtime-cache (the CDN libraries and
// fonts the app loads on demand). Anything else cross-origin is left alone.
const RUNTIME_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'tessdata.projectnaptha.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((n) => n !== SHELL_CACHE && n !== RUNTIME_CACHE)
        .map((n) => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // App shell / same-origin: network-first for the HTML (so an online user
  // always gets the latest build), falling back to the cache when offline.
  if (isSameOrigin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/' ) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
      );
      return;
    }
    // Other same-origin assets (manifest, icons): cache-first, refresh in background.
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Allow-listed cross-origin CDN assets (fonts, Tesseract.js, jsPDF): these
  // URLs are versioned/immutable, so cache-first is safe and lets OCR/PDF
  // export keep working offline after the first successful load.
  if (RUNTIME_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
      })
    );
  }
  // Everything else (unlisted cross-origin) is left to the network untouched.
});
