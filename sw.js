const CACHE = "amps-library-v142";
const ASSETS = [
  "./",
  "./amps-reader/amps-reader.html",
  "./index.html",
  "./manifest.json",
  "./sw.js",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

function isMutable(url) {
  const p = new URL(url).pathname;
  return p.endsWith(".html") || p.endsWith(".js") || p.endsWith(".json") || p.endsWith("/");
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (isMutable(e.request.url)) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r?.status === 200) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});
