const CACHE = "ennstal-connect-shell-v5";
const OFFLINE_SHELL = ["/manifest.webmanifest", "/ennstal-connect-logo-v2.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === "navigate";
  const isVersionedAsset = url.pathname.startsWith("/assets/") || /\.(css|js)$/i.test(url.pathname);

  /* HTML and application assets are network-first so a new deployment cannot be hidden by an old shell. */
  if (isNavigation || isVersionedAsset) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => response)
        .catch(() => caches.match(event.request).then((cached) => cached || (isNavigation ? caches.match("/") : undefined)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
