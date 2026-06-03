// CopaBolão service worker — minimal offline cache.
// Strategy:
//  - HTML / SPA shell: NETWORK-FIRST (fall back to cache only when offline).
//    Critical for production: ensures CSP changes / new JS bundles propagate
//    immediately. Cache-first on the shell is what caused our infamous "old CSP
//    keeps blocking Supabase" bug.
//  - JS/CSS/icons (hashed by Vite): cache-first (filename change = cache miss).
//  - API requests (/api/*): always network (don't cache live scores/predictions).
// Bump CACHE_VERSION whenever you want to nuke all caches across all clients.

const CACHE_VERSION = "copabolao-v3";
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

  // Only intercept same-origin requests. Letting the SW pass through external
  // hosts (DiceBear, flagcdn, Supabase) means the browser handles them directly
  // under page CSP — no SW-as-fetcher CSP weirdness.
  if (url.origin !== self.location.origin) return;

  // Never cache API or auth — these are live data.
  if (url.pathname.startsWith("/api/")) return;
  // Vite dev server sockets / HMR — leave alone.
  if (url.pathname.startsWith("/@") || url.pathname.startsWith("/node_modules/")) return;

  // HTML / SPA shell goes network-first. The shell carries the CSP header and
  // the <script src="...hashed.js"> reference, so a stale shell freezes the app
  // on an old build. We accept a tiny latency hit for correctness.
  const isShell =
    req.mode === "navigate" ||
    req.headers.get("accept")?.includes("text/html") ||
    url.pathname === "/";
  if (isShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Everything else (hashed JS/CSS/icons): cache-first, populate on miss.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match("/"));
    })
  );
});

