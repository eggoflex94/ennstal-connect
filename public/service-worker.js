const CACHE = "ennstal-connect-shell-v7";
const OFFLINE_SHELL = ["/", "/manifest.webmanifest", "/ennstal-connect-logo-v2.png"];

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
  const isRoleIdentityAsset = /\/(?:role-star-(?:red|green|blue|member)|supporter-star)\.(?:svg|png)$/i.test(url.pathname);

  if (isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match("/"))
    );
    return;
  }

  if (isVersionedAsset || isRoleIdentityAsset) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
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

self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil((async () => {
    let data;
    try { data = event.data.json(); } catch { return; }
    const title = String(data.title || "Ennstal Connect").slice(0, 120);
    const body = String(data.body || "").slice(0, 300);
    const target = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/";
    await self.registration.showNotification(title, {
      body, icon: "/icon-orange-star-192.png", badge: "/icon-orange-star-192.png",
      tag: String(data.tag || "ec-community").slice(0, 80), data: { url: target }
    });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        await client.navigate(url.href);
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
