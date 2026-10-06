// Service worker mínimo: cachea la "cáscara" de la app. El veredicto NUNCA se sirve desde caché
// (un pronóstico viejo podría engañar): /api y Open-Meteo siempre van a la red.
const CACHE = 'hg-shell-v10';
const SHELL = [
  '/', '/index.html', '/app.js', '/day-labels.js', '/engine.js', '/styles.css', '/car-shield.js', '/manifest.webmanifest',
  '/icon.svg', '/icon-192.png', '/icon-512.png', '/favicon.ico', '/apple-touch-icon.png',
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo la interfaz propia; los datos (Open-Meteo, otro dominio) y /api van siempre a la red.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Red primero; con red, se guarda la copia nueva para que sin conexión abra la última versión.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r ?? caches.match('/index.html'))),
  );
});
