// Service worker routing + cache rules (public/sw.js), evaluated in a sandbox with a fake `self`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ORIGIN = "https://wendapply.ch";
const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const listeners = {};
const ctx = { URL, Request: class {}, Response: class {}, caches: {}, fetch: () => {}, self: { location: { origin: ORIGIN }, addEventListener: (t, f) => { listeners[t] = f; } } };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const route = (url, o = {}) => ctx.swRoute({ url, method: o.method ?? "GET", mode: o.mode ?? "no-cors", destination: o.destination ?? "", headers: new Headers(o.headers ?? {}) }, ORIGIN);
const res = (o = {}) => ({ status: o.status ?? 200, type: o.type ?? "basic", headers: new Headers(o.headers ?? {}) });

test("keeps the push and notificationclick handlers and adds fetch/message", () => {
  for (const t of ["push", "notificationclick", "install", "activate", "fetch", "message"]) assert.equal(typeof listeners[t], "function", t);
  assert.match(src, /const SW_VERSION = "v\d+"/);
});
test("never touches cross-origin requests (Supabase, auth, functions)", () => {
  assert.equal(route("https://bhwreehwirrloxagyypi.supabase.co/rest/v1/applications?select=*"), null);
  assert.equal(route("https://bhwreehwirrloxagyypi.supabase.co/auth/v1/token", { method: "POST" }), null);
  assert.equal(route("https://bhwreehwirrloxagyypi.supabase.co/storage/v1/object/public/avatars/a.png", { destination: "image" }), null);
  assert.equal(route("https://bhwreehwirrloxagyypi.supabase.co/functions/v1/x"), null);
  assert.equal(route("https://fonts.gstatic.com/s/x.woff2", { destination: "font" }), null);
});
test("skips api, auth, non-GET, range and RSC requests", () => {
  assert.equal(route(`${ORIGIN}/api/reminders/push`), null);
  assert.equal(route(`${ORIGIN}/api/ics/feed/abc`, { mode: "navigate" }), null);
  assert.equal(route(`${ORIGIN}/auth/callback?code=1`, { mode: "navigate" }), null);
  assert.equal(route(`${ORIGIN}/dashboard`, { method: "POST", mode: "navigate" }), null);
  assert.equal(route(`${ORIGIN}/landing/a.webp`, { headers: { range: "bytes=0-1" } }), null);
  assert.equal(route(`${ORIGIN}/dashboard?_rsc=abc`), null);
  assert.equal(route(`${ORIGIN}/dashboard`, { headers: { RSC: "1" } }), null);
  assert.equal(route(`${ORIGIN}/sw.js`), null);
});
test("routes static chunks, assets and navigations", () => {
  assert.equal(route(`${ORIGIN}/_next/static/chunks/app.js`), "static");
  assert.equal(route(`${ORIGIN}/_next/static/media/font.woff2`, { destination: "font" }), "static");
  assert.equal(route(`${ORIGIN}/icons/icon-192.png`), "asset");
  assert.equal(route(`${ORIGIN}/_next/image?url=%2Flanding%2Fa.webp&w=640&q=75`, { destination: "image" }), "asset");
  assert.equal(route(`${ORIGIN}/dashboard?source=pwa`, { mode: "navigate" }), "page");
  assert.equal(route(`${ORIGIN}/manifest.webmanifest`), null);
});
test("only stores plain 200 same-origin responses without no-store/private/Set-Cookie", () => {
  assert.equal(ctx.swCacheable(res()), true);
  assert.equal(ctx.swCacheable(res({ headers: { "cache-control": "public, max-age=31536000, immutable" } })), true);
  assert.equal(ctx.swCacheable(res({ headers: { "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate" } })), false);
  assert.equal(ctx.swCacheable(res({ headers: { "set-cookie": "a=b" } })), false);
  assert.equal(ctx.swCacheable(res({ status: 404 })), false);
  assert.equal(ctx.swCacheable(res({ type: "opaque", status: 0 })), false);
  assert.equal(ctx.swCacheable(res({ type: "cors" })), false);
});
