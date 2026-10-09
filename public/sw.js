// BEGIN BUILD CONFIG
// Filled by scripts/web-assets.mjs; no worker is registered in Expo dev mode.
const SHELL = "./";
const PRECACHE = [];
const CACHE_PREFIX = "felipe-lais:unbuilt:";
const CACHE = CACHE_PREFIX + "shell-v1";
// END BUILD CONFIG

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SHELL)) return;
  // Navigations are never stored, including /c/<code>. Offline uses only the public shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(CACHE).then((cache) => cache.match(SHELL)),
      ),
    );
    return;
  }
  // Only generated public assets may use the cache. No Supabase/API or private URLs.
  if (url.search || !PRECACHE.includes(url.pathname)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.match(request).then((cached) => cached || fetch(request)),
      ),
  );
});
