// WendApply service worker: Web Push + offline support.
// To ship a new caching version bump SW_VERSION (old caches are deleted on activate). See docs/pwa/README.md.
const SW_VERSION = "v1";
const PRECACHE = `wendapply-precache-${SW_VERSION}`;
const STATIC_CACHE = `wendapply-static-${SW_VERSION}`;
const ASSET_CACHE = `wendapply-assets-${SW_VERSION}`;
const PAGE_CACHE = `wendapply-pages-${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"];
const LIMITS = { [STATIC_CACHE]: 150, [ASSET_CACHE]: 60, [PAGE_CACHE]: 25 };
const ASSET_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;

/**
 * Pure routing decision (unit-tested in tests/pwa-sw.test.mjs).
 * Returns "static" | "asset" | "page" | null. null = do not touch the request (browser handles it normally).
 */
function swRoute(req, origin) {
  if (!req || req.method !== "GET") return null;
  let url;
  try { url = new URL(req.url); } catch { return null; }
  if (url.origin !== origin) return null; // never cross-origin (Supabase, auth providers, CDNs, ...)
  const p = url.pathname;
  if (p.startsWith("/api/") || p === "/api" || p.startsWith("/auth/") || p === "/auth") return null;
  if (p === "/sw.js") return null;
  const header = (name) => (req.headers && typeof req.headers.get === "function" ? req.headers.get(name) : null);
  if (header("range")) return null;
  if (p.startsWith("/_next/static/")) return "static";
  if (req.mode === "navigate") return "page";
  // RSC payloads / data requests are user-specific and change often: let Next handle them.
  if (url.searchParams.has("_rsc") || header("rsc") || header("next-router-state-tree")) return null;
  if (req.destination === "image" || req.destination === "font" || ASSET_EXT.test(p) || p.startsWith("/_next/image")) return "asset";
  return null;
}

/** Only store plain, successful, same-origin responses that are allowed to be stored. */
function swCacheable(res) {
  if (!res || res.status !== 200 || res.type !== "basic") return false;
  const cc = (res.headers.get("cache-control") || "").toLowerCase();
  if (cc.includes("no-store") || cc.includes("private")) return false;
  if (res.headers.get("set-cookie")) return false;
  if ((res.headers.get("vary") || "").trim() === "*") return false;
  return true;
}

async function trimCache(name) {
  const max = LIMITS[name];
  if (!max) return;
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (swCacheable(res)) { await cache.put(request, res.clone()); trimCache(name); }
  return res;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(request);
    if (swCacheable(res)) { await cache.put(request, res.clone()); trimCache(PAGE_CACHE); }
    return res;
  } catch {
    return (await cache.match(request)) || (await caches.match(OFFLINE_URL)) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("install", (event) => {
    // No automatic skipWaiting: the app shows "Update verfügbar" and posts SKIP_WAITING (first install activates immediately anyway).
    event.waitUntil(caches.open(PRECACHE).then((c) => c.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: "reload" })))));
  });
  self.addEventListener("activate", (event) => {
    const keep = new Set([PRECACHE, STATIC_CACHE, ASSET_CACHE, PAGE_CACHE]);
    event.waitUntil(caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("wendapply-") && !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()));
  });
  self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
    if (event.data && event.data.type === "GET_VERSION" && event.ports && event.ports[0]) event.ports[0].postMessage(SW_VERSION);
  });
  self.addEventListener("fetch", (event) => {
    const route = swRoute(event.request, self.location.origin);
    if (route === "static") event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    else if (route === "asset") event.respondWith(cacheFirst(event.request, ASSET_CACHE));
    else if (route === "page") event.respondWith(networkFirstPage(event.request));
  });
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* plain text */ }
  event.waitUntil(self.registration.showNotification(data.title || "WendApply", { body: data.body || "", icon: "/icon.png", badge: "/icon.png", data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard" } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
