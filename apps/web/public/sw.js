/*
 * OrgaSport service worker.
 * Phase 2: keeps the last public tournament pages readable without network
 * (network first, cache as a fallback). Phase 5 adds push notifications.
 */
const CACHE = "terrain-v1";
const STATIC = "static-v1";
const TERRAIN = /^\/c\/[2-9A-HJKMNP-Z]{4,6}(\/affiche|\/table)?$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Fingerprinted build files never change: cache first (lets the scoring
  // table reload without network).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
    return;
  }
  if (!TERRAIN.test(url.pathname)) return;
  const isFragment = url.searchParams.has("fragment");
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !isFragment) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        isFragment
          ? new Response("", { status: 503 })
          : caches
          .open(CACHE)
          .then((cache) => cache.match(request).then((hit) => hit || cache.match(url.pathname, { ignoreSearch: true })))
              .then((hit) => hit || new Response("Hors connexion", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })),
      ),
  );
});
