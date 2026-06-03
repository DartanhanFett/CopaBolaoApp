// CopaBolão service worker — minimal offline cache.
// Strategy:
//  - Static assets (HTML, JS, CSS, icons): cache-first, fall back to network.
//  - API requests (/api/*): always network (don't cache live scores/predictions).
// Bumping CACHE_VERSION invalidates the old cache on next page load.

const CACHE_VERSION = "copabolao-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache API or auth — these are live data.
  if (url.pathname.startsWith("/api/")) return;
  // Vite dev server sockets / HMR — leave alone.
  if (url.pathname.startsWith("/@") || url.pathname.startsWith("/node_modules/")) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Cache successful same-origin responses for next time.
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match("/")); // offline fallback to the SPA shell
    })
  );
});
