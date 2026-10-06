// Service worker mínimo: cachea la "cáscara" de la app. El veredicto NUNCA se sirve desde caché
// (un pronóstico viejo podría engañar): /api siempre va a la red.
const CACHE = 'hg-shell-v5';
const SHELL = ['/', '/index.html', '/app.js', '/engine.js', '/styles.css', '/car-shield.js', '/manifest.webmanifest', '/icon.svg', '/apple-touch-icon.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo la interfaz propia; los datos (Open-Meteo, otro dominio) y /api van siempre a la red.
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r ?? caches.match('/index.html'))));
});
