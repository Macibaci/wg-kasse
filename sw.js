// Hält die App-Dateien für den Offline-Start bereit. Daten laufen über Firebase.
const CACHE = "kasse-v1";
const FILES = ["./", "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest", "icon-192.png", "icon-180.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Netzwerk zuerst (damit Updates sofort ankommen), sonst Cache.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
