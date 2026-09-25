const CACHE_NAME = "ovelha-battle-missao-2-v4";
const CORE_FILES = ["./", "./index.html", "./css/style.css?v=0.4.0", "./js/app.js?v=0.4.0", "./js/game.js?v=0.4.0", "./js/content.js?v=0.4.0", "./js/story.js?v=0.4.0", "./data/game.json", "./manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES);
    const data = await (await cache.match("./data/game.json")).json();
    const paths = new Set();
    const visit = value => {
      if (typeof value === "string" && value.startsWith("assets/") && /\.(png|webp|jpg|jpeg|svg)$/i.test(value)) paths.add(value);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(data);
    await Promise.allSettled([...paths].map(path => cache.add(path)));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("ovelha-battle-missao-2-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, { cache: "no-cache" });
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      return new Response("Recurso indisponível sem conexão.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
