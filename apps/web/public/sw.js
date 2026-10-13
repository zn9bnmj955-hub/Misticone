/*
 * OrgaSport service worker.
 * Phase 2: keeps the last public tournament pages readable without network
 * (network first, cache as a fallback). Phase 5: push notifications (below).
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

// ---------------------------------------------------------------------------
// Phase 5: push notifications ("À vous ! Terrain 12 · 15 h 40 …").
// Payload sent by src/lib/notifications/server.ts: { title, body, url, tag }
// where tag = "<kind>:<url>" (e.g. "your_turn:/c/7KQ2?equipe=14").
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const tag = typeof data.tag === "string" ? data.tag : "orgasport";
  const urgent = tag.indexOf("your_turn:") === 0;
  const url = typeof data.url === "string" && data.url.charAt(0) === "/" ? data.url : "/accueil";
  event.waitUntil(
    self.registration.showNotification(data.title || "OrgaSport", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag,
      // A new "your turn" (e.g. venue changed) must buzz again even with the same tag.
      renotify: urgent,
      requireInteraction: urgent,
      vibrate: urgent ? [200, 100, 200, 100, 400] : [120],
      data: { url },
      lang: "fr",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/accueil", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Same page already open: bring it to the front.
      for (const client of list) {
        const open = new URL(client.url);
        if (open.pathname === target.pathname && open.search === target.search && "focus" in client) return client.focus();
      }
      // Same tournament open in another view: reuse that tab.
      for (const client of list) {
        if (new URL(client.url).pathname === target.pathname && "navigate" in client) return client
            .navigate(target.href)
            .then((c) => (c || client).focus())
            .catch(() => self.clients.openWindow(target.href));
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
