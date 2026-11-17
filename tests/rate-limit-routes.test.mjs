// Route rate limits (lib/api-rate-limit.ts + the API routes) with the shared limiter mocked in memory
// (setRateLimitRpc(memoryRateLimitRpc())), and the client-side text helper (lib/rate-limit-text.ts).
// SQL side (RPC wrappers): tests/rate-limit-rpcs.test.mjs.
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { register } from "node:module";
import Stripe from "stripe";

register("./helpers/alias-hooks.mjs", import.meta.url);

const rl = await import("../lib/rate-limit/index.ts");
const api = await import("../lib/api-rate-limit.ts");
const text = await import("../lib/rate-limit-text.ts");

const ENV = { ...process.env };
let mem;
beforeEach(() => {
  process.env = { ...ENV };
  for (const k of Object.keys(process.env)) if (k.startsWith("RATE_LIMIT_")) delete process.env[k];
  mem = rl.memoryRateLimitRpc();
  rl.setRateLimitRpc(mem);
});

const ip = (addr) => ({ "x-nf-client-connection-ip": addr });
async function expect429(res, re = /./) {
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get("retry-after")) >= 1, "Retry-After");
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.error, "rate_limited");
  assert.match(body.message, re);
  assert.match(body.message, /Versuche es (in|morgen)/);
  assert.ok(body.retryAfter >= 1);
}

// ---------------------------------------------------------------- lib/api-rate-limit.ts
test("config: defaults, env overrides 'limit' and 'limit/window', invalid values keep the default, kill switch", () => {
  assert.deepEqual(api.routeLimit("checkout", {}).user, { limit: 10, windowSeconds: 3600 });
  assert.deepEqual(api.routeLimit("checkout", { RATE_LIMIT_CHECKOUT_USER: "5" }).user, { limit: 5, windowSeconds: 3600 });
  assert.deepEqual(api.routeLimit("checkout", { RATE_LIMIT_CHECKOUT_IP: "7/60" }).ip, { limit: 7, windowSeconds: 60 });
  assert.deepEqual(api.routeLimit("stripe-webhook-invalid", { RATE_LIMIT_STRIPE_WEBHOOK_INVALID_IP: "0" }).ip, { limit: 0, windowSeconds: 600 });
  for (const bad of ["-1", "x", "5/0", "5/99999999", "1.5"]) assert.deepEqual(api.routeLimit("checkout", { RATE_LIMIT_CHECKOUT_USER: bad }).user, { limit: 10, windowSeconds: 3600 }, bad);
  assert.equal(api.limitsDisabled({ RATE_LIMIT_DISABLED: "1" }), true);
  assert.equal(api.limitsDisabled({}), false);
  // every scope has at least one dimension and valid numbers
  for (const [scope, cfg] of Object.entries(api.ROUTE_LIMITS)) {
    const specs = [cfg.ip, cfg.user, cfg.userDay].filter(Boolean);
    assert.ok(specs.length, scope);
    for (const s of specs) assert.ok(Number.isInteger(s.limit) && s.limit > 0 && s.windowSeconds >= 1, scope);
  }
});

test("limitIp/limitUser: count per IP / per id, 429 JSON + Retry-After + German text; kill switch lets everything through", async () => {
  process.env.RATE_LIMIT_PORTAL_IP = "2";
  const h = new Headers(ip("203.0.113.5"));
  assert.equal(await api.limitIp("portal", h), null);
  assert.equal(await api.limitIp("portal", h), null);
  await expect429(await api.limitIp("portal", h), /Kundenportal/);
  assert.equal(await api.limitIp("portal", new Headers(ip("203.0.113.6"))), null, "other IP has its own budget");
  // raw IPs are never part of the key
  assert.ok([...mem.counts.keys()].every((k) => !k.includes("203.0.113")));
  process.env.RATE_LIMIT_DISABLED = "1";
  assert.equal(await api.limitIp("portal", h), null);
  delete process.env.RATE_LIMIT_DISABLED;
  process.env.RATE_LIMIT_ACCOUNT_DELETE_USER = "1";
  assert.equal(await api.limitUser("account-delete", "u1"), null);
  await expect429(await api.limitUser("account-delete", "u1"));
  assert.equal(await api.limitUser("account-delete", "u2"), null);
});

test("userDay: the daily cap applies after the short window", async () => {
  process.env.RATE_LIMIT_JOB_SEARCH_USER = "100";
  process.env.RATE_LIMIT_JOB_SEARCH_USER_DAY = "3";
  for (let i = 0; i < 3; i++) assert.equal(await api.limitUser("job-search", "u"), null);
  const res = await api.limitUser("job-search", "u");
  await expect429(res, /nächsten Suche/);
});

test("database errors: availability first (allowed, degraded)", async () => {
  rl.setRateLimitRpc(async () => { throw new Error("db down"); });
  assert.equal(await api.limitIp("checkout", new Headers(ip("198.51.100.1"))), null);
  const r = await api.checkUser("checkout", "u");
  assert.equal(r.allowed, true);
  assert.equal(r.degraded, true);
});

test("withUserLimit: only VERIFIED users are counted (a forged token never burns someone's budget); over the limit → RateLimitedError", async () => {
  process.env.RATE_LIMIT_CHECKOUT_USER = "2";
  const auth = { async getUser(t) { return t === "good" ? { id: "user-1", email: null } : null; }, async isSchoolAdmin() { return true; }, async isFamilyParent() { return true; } };
  const wrapped = api.withUserLimit(auth, "checkout");
  for (let i = 0; i < 5; i++) assert.equal(await wrapped.getUser("forged"), null);
  assert.equal([...mem.counts.keys()].length, 0, "invalid tokens are not counted per user");
  assert.deepEqual(await wrapped.getUser("good"), { id: "user-1", email: null });
  await wrapped.getUser("good");
  await assert.rejects(wrapped.getUser("good"), (e) => e instanceof api.RateLimitedError && e.result.retryAfter >= 1);
  assert.equal(await wrapped.isSchoolAdmin("good", "s"), true, "other methods pass through");
  const err = await wrapped.getUser("good").catch((e) => e);
  await expect429(err.response(), /Zahlung/);
});

test("withUserLimit inside the billing checkout logic: 3rd checkout of the same admin → 429 via RateLimitedError", async () => {
  process.env.RATE_LIMIT_CHECKOUT_USER = "2";
  const { checkout } = await import("../lib/billing/api.ts");
  const SCHOOL = "00000000-0000-4000-8000-000000003001";
  const deps = {
    enabled: true, configured: true, liveMode: false, baseUrl: "https://wendapply.test",
    auth: api.withUserLimit({ async getUser() { return { id: "admin-1", email: "a@b.ch" }; }, async isSchoolAdmin() { return true; }, async isFamilyParent() { return false; } }, "checkout"),
    stripe: { async priceIdForLookupKey(k) { return `price_${k}`; }, async createCustomer() { return "cus_1"; }, async createCheckoutSession() { return { url: "https://checkout.stripe.test/cs_1" }; }, async createInvoiceSubscription() { return { hostedInvoiceUrl: "x" }; }, async createPortalSession() { return { url: "x" }; } },
    db: { async findCustomerId() { return "cus_1"; }, async hasOpenSubscription() { return false; }, async ownerName() { return "S"; }, async status() { return null; } },
  };
  const input = { token: "t", body: { plan: "starter", schoolId: SCHOOL, payment: "card" } };
  assert.equal((await checkout(input, deps)).status, 200);
  assert.equal((await checkout(input, deps)).status, 200);
  await assert.rejects(checkout(input, deps), api.RateLimitedError);
});

test("localRateLimitRpc: same semantics as the SQL function, windows reset, memory stays bounded", async () => {
  let now = 1_700_000_000_000;
  const local = api.localRateLimitRpc(50, () => now);
  assert.deepEqual(await local("k", 2, 60, 1), { allowed: true, retryAfter: 0 });
  assert.equal((await local("k", 2, 60, 1)).allowed, true);
  const denied = await local("k", 2, 60, 1);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfter >= 1 && denied.retryAfter <= 60);
  now += 61_000;
  assert.equal((await local("k", 2, 60, 1)).allowed, true, "new window");
  for (let i = 0; i < 500; i++) await local(`ip-${i}`, 5, 60, 1);
  assert.ok(local.size() <= 50, `size ${local.size()}`);
});

// ---------------------------------------------------------------- the real route files
const SCHOOL = "00000000-0000-4000-8000-000000003001";
const post = (url, body, headers = {}) => new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("routes: billing checkout / portal / status are limited per IP before anything else", async () => {
  process.env.RATE_LIMIT_CHECKOUT_IP = "2";
  process.env.RATE_LIMIT_PORTAL_IP = "1";
  process.env.RATE_LIMIT_BILLING_STATUS_IP = "1";
  delete process.env.STRIPE_ENABLED;
  const checkout = await import("../app/api/billing/checkout/route.ts");
  const portal = await import("../app/api/billing/portal/route.ts");
  const status = await import("../app/api/billing/status/route.ts");
  const h = ip("192.0.2.10");
  assert.equal((await checkout.POST(post("http://x/api/billing/checkout", { plan: "starter", schoolId: SCHOOL }, h))).status, 503);
  assert.equal((await checkout.POST(post("http://x/api/billing/checkout", { plan: "starter", schoolId: SCHOOL }, h))).status, 503);
  await expect429(await checkout.POST(post("http://x/api/billing/checkout", { plan: "starter", schoolId: SCHOOL }, h)), /Zahlung/);
  assert.equal((await portal.POST(post("http://x/api/billing/portal", { schoolId: SCHOOL }, h))).status, 503);
  await expect429(await portal.POST(post("http://x/api/billing/portal", { schoolId: SCHOOL }, h)));
  assert.equal((await status.GET(new Request(`http://x/api/billing/status?schoolId=${SCHOOL}`, { headers: h }))).status, 503);
  await expect429(await status.GET(new Request(`http://x/api/billing/status?schoolId=${SCHOOL}`, { headers: h })));
});

test("routes: Stripe webhook – only invalid signatures are counted; a valid event is never limited", async () => {
  process.env.RATE_LIMIT_STRIPE_WEBHOOK_INVALID_IP = "2";
  process.env.STRIPE_ENABLED = "true";
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_unit_tests";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit_test_secret";
  process.env.BILLING_DB = "memory";
  delete process.env.CONTEXT;
  const webhook = await import("../app/api/stripe/webhook/route.ts");
  const h = ip("192.0.2.20");
  const bad = () => webhook.POST(new Request("http://x/api/stripe/webhook", { method: "POST", headers: { ...h, "stripe-signature": "t=1,v1=bad" }, body: "{}" }));
  assert.equal((await bad()).status, 400);
  assert.equal((await bad()).status, 400);
  await expect429(await bad());
  // same IP, valid signature: processed normally (not 429)
  const payload = JSON.stringify({ id: "evt_rl_1", object: "event", type: "customer.created", data: { object: { id: "cus_x", object: "customer" } }, livemode: false, created: 1, api_version: "2025-01-01" });
  const sig = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const ok = await webhook.POST(new Request("http://x/api/stripe/webhook", { method: "POST", headers: { ...h, "stripe-signature": sig }, body: payload }));
  assert.notEqual(ok.status, 429);
  assert.notEqual(ok.status, 400);
  assert.ok(ok.status < 500, `status ${ok.status}`);
  // a missing signature counts as invalid too
  const missing = await webhook.POST(new Request("http://x/api/stripe/webhook", { method: "POST", headers: ip("192.0.2.21"), body: "{}" }));
  assert.equal(missing.status, 400);
});

test("routes: job search – per IP before the token check (fake-token floods)", async () => {
  process.env.RATE_LIMIT_JOB_SEARCH_IP = "2";
  const route = await import("../app/api/job-search/route.ts");
  const h = ip("192.0.2.30");
  assert.equal((await route.POST(post("http://x/api/job-search", {}, h))).status, 401);
  assert.equal((await route.POST(post("http://x/api/job-search", {}, h))).status, 401);
  await expect429(await route.POST(post("http://x/api/job-search", {}, h)), /nächsten Suche/);
});

test("routes: places autocomplete – instance-local limiter (no DB call), 429 when over", async () => {
  process.env.RATE_LIMIT_PLACES_IP = "2";
  const route = await import("../app/api/places/route.ts");
  const h = ip("192.0.2.40");
  const before = mem.counts.size;
  assert.equal((await route.GET(new Request("http://x/api/places?q=Zue", { headers: h }))).status, 200);
  assert.equal((await route.GET(new Request("http://x/api/places?q=Zue", { headers: h }))).status, 200);
  await expect429(await route.GET(new Request("http://x/api/places?q=Zue", { headers: h })));
  assert.equal(mem.counts.size, before, "the shared (DB) limiter is not used for places");
});

test("routes: account delete – per IP before auth", async () => {
  process.env.RATE_LIMIT_ACCOUNT_DELETE_IP = "2";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-service-key";
  const route = await import("../app/api/account/delete/route.ts");
  const h = ip("192.0.2.50");
  assert.equal((await route.POST(post("http://x/api/account/delete", {}, h))).status, 401);
  assert.equal((await route.POST(post("http://x/api/account/delete", {}, h))).status, 401);
  await expect429(await route.POST(post("http://x/api/account/delete", {}, h)));
});

test("routes: push subscribe/unsubscribe – per IP before auth", async () => {
  process.env.RATE_LIMIT_PUSH_SUBSCRIBE_IP = "2";
  const route = await import("../app/api/reminders/push/route.ts");
  const h = ip("192.0.2.60");
  assert.equal((await route.POST(post("http://x/api/reminders/push", {}, h))).status, 401);
  assert.equal((await route.DELETE(new Request("http://x/api/reminders/push", { method: "DELETE", headers: h, body: "{}" }))).status, 401);
  await expect429(await route.POST(post("http://x/api/reminders/push", {}, h)));
});

test("routes: reminder digest – wrong cron secrets are counted per IP, the right secret is never blocked by them", async () => {
  process.env.RATE_LIMIT_DIGEST_UNAUTHORIZED_IP = "2";
  process.env.REMINDERS_CRON_SECRET = "a-very-long-cron-secret-for-tests";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const route = await import("../app/api/reminders/digest/route.ts");
  const h = ip("192.0.2.70");
  const call = (secret) => route.POST(new Request("http://x/api/reminders/digest", { method: "POST", headers: { ...h, authorization: `Bearer ${secret}` } }));
  assert.equal((await call("wrong")).status, 401);
  assert.equal((await call("wrong")).status, 401);
  await expect429(await call("wrong"));
  assert.equal((await call(process.env.REMINDERS_CRON_SECRET)).status, 503, "valid secret goes on (here: not configured)");
});

test("routes: calendar feed – guessing tokens is limited per IP", async () => {
  process.env.RATE_LIMIT_ICS_FEED_MISS_IP = "2";
  const route = await import("../app/api/ics/feed/[token]/route.ts");
  const h = ip("192.0.2.80");
  const call = (token) => route.GET(new Request(`http://x/api/ics/feed/${token}`, { headers: h }), { params: Promise.resolve({ token }) });
  assert.equal((await call("short")).status, 404);
  assert.equal((await call("short")).status, 404);
  await expect429(await call("short"));
  // the token itself never ends up in a limiter key
  assert.ok([...mem.counts.keys()].every((k) => !k.includes("short")));
});

// ---------------------------------------------------------------- lib/rate-limit-text.ts
test("rateLimitText: PostgREST RPC error, databaseError() message, API body; older RATE_LIMITED errors are left alone", () => {
  const rpcError = { code: "rate_limited", message: "RATE_LIMITED", details: "Du hast das gerade sehr oft versucht. Bitte warte 5 Minuten und versuche es dann nochmals.", hint: "300" };
  assert.match(text.rateLimitText(rpcError), /5 Minuten/);
  const wrapped = new Error("Database error: rate_limited | RATE_LIMITED | Du hast das gerade sehr oft versucht. Bitte warte eine Minute und versuche es dann nochmals. | 60");
  assert.match(text.rateLimitText(wrapped), /eine Minute/);
  assert.equal(text.rateLimitText({ error: "rate_limited", message: "Bitte warte kurz vor der nächsten Suche. Versuche es in einer Minute wieder." }), "Bitte warte kurz vor der nächsten Suche. Versuche es in einer Minute wieder.");
  assert.equal(text.rateLimitText({ status: 429 }), text.RATE_LIMIT_FALLBACK);
  assert.equal(text.rateLimitText(new Error("Database error: P0001 | RATE_LIMITED")), null, "teacher nudge limit keeps its own text");
  assert.equal(text.rateLimitText(new Error("CLASS_NOT_FOUND")), null);
  assert.equal(text.rateLimitText(null), null);
});

// ---------------------------------------------------------------- client: "no row" = not found (RPC wrappers)
test("client: an empty answer of class_join / class_preview / social_send_request / school_attach_class means not found; 429 shows the German text", async () => {
  const { joinClass, previewClass, classErrorCode } = await import("../lib/classes.ts");
  const { sendFriendRequest, socialErrorCode } = await import("../lib/social.ts");
  const { attachClassToSchool } = await import("../lib/b2b/client.ts");
  globalThis.__supabaseStub = { rpc: async () => ({ data: [], error: null }) };
  try {
    assert.equal(classErrorCode(await joinClass("ZZZZZZZZ").catch((e) => e)), "CLASS_NOT_FOUND");
    assert.equal(classErrorCode(await previewClass("ZZZZZZZZ").catch((e) => e)), "CLASS_NOT_FOUND");
    assert.equal(socialErrorCode(await sendFriendRequest("x@y.ch").catch((e) => e)), "USER_NOT_FOUND");
    assert.match(String((await attachClassToSchool("00000000-0000-4000-8000-000000000001", "zzzzzzzz").catch((e) => e)).message), /CLASS_NOT_FOUND/);
    globalThis.__supabaseStub = { rpc: async () => ({ data: null, error: { code: "rate_limited", message: "RATE_LIMITED", details: "Du hast das gerade sehr oft versucht. Bitte warte 7 Minuten und versuche es dann nochmals.", hint: "420" } }) };
    const err = await joinClass("ZZZZZZZZ").catch((e) => e);
    assert.match(text.rateLimitText(err), /7 Minuten/);
    const { errorMessage } = await import("../components/classes/shared.tsx").catch(() => ({}));
    if (errorMessage) assert.match(errorMessage(err), /7 Minuten/);
    const { friendlyError } = await import("../components/friends/shared.ts");
    assert.match(friendlyError(await sendFriendRequest("x").catch((e) => e)), /7 Minuten/);
  } finally {
    delete globalThis.__supabaseStub;
  }
});
