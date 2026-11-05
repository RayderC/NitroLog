// Network first: always try for fresh pages, and fall back to the last copy when offline.
// API calls are never cached, so vehicle data can't go stale or outlive a sign-out.
const CACHE = "nitrolog-v3";
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Router fetches get a new ?_rsc= value each time, so saving them would grow the cache forever.
  if (url.searchParams.has("_rsc")) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        // Skip redirects: a signed-out redirect to /login mustn't be saved as the copy of that page.
        if (res.ok && !res.redirected && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") return (await caches.match("/offline.html")) ?? Response.error();
        return Response.error();
      }),
  );
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* Fall back to the default text below. */ }
  event.waitUntil(self.registration.showNotification(data.title || "NitroLog", {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  // Only ever open a page on this site, whatever the payload says.
  const url = new URL(event.notification.data?.url || "/", self.location.origin);
  const target = url.origin === self.location.origin ? url.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) if ("focus" in c) { c.navigate(target); return c.focus(); }
      return self.clients.openWindow(target);
    }),
  );
});
