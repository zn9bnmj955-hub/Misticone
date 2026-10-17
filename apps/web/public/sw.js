/*
 * OrgaSport service worker.
 * Phase 2: keeps the last public tournament pages readable without network
 * (network first, cache as a fallback). Phase 5: push notifications (below).
 * TM2: the scoring table (/c/CODE/table) asks, once opened online, to keep
 * its page and every build file it loaded ("cache-page" message), so it can
 * be reloaded without network; its state and outbox come from localStorage.
 * T4: the teams page (/c/CODE/equipes) is kept too, and the live refreshes
 * (?fragment=1) are kept so that an offline reload shows the LAST draw: the
 * newest fragment replaces the #live block of the cached page (between
 * <div id="live" and the <!--/live--> marker written by render.ts).
 */
const CACHE = "terrain-v1";
const STATIC = "static-v1";
const TERRAIN = /^\/c\/[2-9A-HJKMNP-Z]{4,6}(\/affiche|\/table|\/equipes)?$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Build files: network first (the browser's HTTP cache already serves the
  // fingerprinted production files without network, and the dev server's
  // unversioned files are never served stale), this cache when offline.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.open(STATIC).then((cache) => cache.match(request)).then((hit) => hit || Response.error())),
    );
    return;
  }
  if (!TERRAIN.test(url.pathname)) return;
  // React Server Components payloads (client navigation, prefetch): never
  // answer them with a cached HTML page.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC")) return;
  // "Enregistrer pour hors ligne" downloads a file: never cached, never replayed.
  if (url.searchParams.has("enregistrer")) return;
  const isFragment = url.searchParams.has("fragment");
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
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
              .then((cache) =>
                cache
                  .match(request)
                  .then((hit) => hit || anyPageOf(cache, url.pathname))
                  .then((hit) => (hit ? withLastFragment(cache, url, hit) : null)),
              )
              .then((hit) => hit || new Response("Hors connexion", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })),
      ),
  );
});

/** Any cached version of this page (other ?vue=…), never a live fragment. */
function anyPageOf(cache, pathname) {
  return cache.keys(pathname, { ignoreSearch: true }).then((keys) => {
    const page = keys.find((key) => !new URL(key.url).searchParams.has("fragment"));
    return page ? cache.match(page) : undefined;
  });
}

/** Cached page + the newest live fragment kept for the same address (if newer). */
function withLastFragment(cache, url, page) {
  const key = url.pathname + url.search + (url.search ? "&" : "?") + "fragment=1";
  return cache.match(key).then((frag) => {
    if (!frag) return page;
    return Promise.all([page.clone().text(), frag.text()]).then(([body, live]) => {
      const start = body.indexOf('<div id="live"');
      const end = body.indexOf("<!--/live-->");
      if (start < 0 || end < start || live.indexOf('<div id="live"') !== 0) return page;
      const version = (text) => Number((/data-version="(\d+)"/.exec(text) || [])[1] || 0);
      if (version(live) < version(body.slice(start, end))) return page;
      const merged = body.slice(0, start) + live + body.slice(end).replace(/var OS_V=\d+/, "var OS_V=" + version(live));
      return new Response(merged, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    });
  });
}

// TM2: keep the page that is open right now (and its build files) for a
// reload without network. Only terrain pages and fingerprinted build files.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "cache-page" || !Array.isArray(data.urls)) return;
  const jobs = data.urls.slice(0, 200).map((raw) => {
    let url;
    try {
      url = new URL(raw, self.location.origin);
    } catch {
      return null;
    }
    if (url.origin !== self.location.origin) return null;
    const name = url.pathname.startsWith("/_next/static/") ? STATIC : TERRAIN.test(url.pathname) && !url.search ? CACHE : null;
    if (!name) return null;
    return caches.open(name).then((cache) =>
      fetch(url.href, { credentials: "same-origin" }).then((response) => {
        if (response.ok) return cache.put(url.href, response);
      }),
    );
  });
  event.waitUntil(
    Promise.all(jobs.map((job) => job && job.catch(() => undefined))).then(() => {
      if (event.source) event.source.postMessage({ type: "page-cached", path: data.path || null });
    }),
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
