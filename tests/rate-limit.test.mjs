// Generic persistent rate limiter: SQL (public.rate_limits + rate_limit_hit on PGlite, all migrations applied),
// the pure core (lib/rate-limit/core.ts), the Next.js wrapper (lib/rate-limit/index.ts) and the edge-function copy.
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { readFile } from "node:fs/promises";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

const core = await import("../lib/rate-limit/core.ts");
const lib = await import("../lib/rate-limit/index.ts");

let ctx;
before(async () => {
  ctx = await setupTeacherDb({ seed: false });
  await ctx.admin("create role service_role");
  await ctx.apply("20261117010000_rate_limits.sql"); // idempotent re-run, now with service_role grants
});

const hitSql = async (key, limit, win, cost) => {
  const rows = cost === undefined
    ? await ctx.admin("select * from public.rate_limit_hit($1, $2, $3)", [key, limit, win])
    : await ctx.admin("select * from public.rate_limit_hit($1, $2, $3, $4)", [key, limit, win, cost]);
  return rows[0];
};
/** RateLimitRpc on PGlite – same mapping as supabaseRateLimitRpc. */
const pgRpc = async (key, limit, win, cost) => { const r = await hitSql(key, limit, win, cost); return { allowed: r.allowed, retryAfter: r.retry_after }; };

test("sql: counts per key and window, denies above the limit with retry_after", async () => {
  const k = "t:basic";
  for (let i = 1; i <= 3; i++) assert.deepEqual(await hitSql(k, 3, 3600), { allowed: true, retry_after: 0 }, `hit ${i}`);
  const denied = await hitSql(k, 3, 3600);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retry_after >= 1 && denied.retry_after <= 3600, `retry_after ${denied.retry_after}`);
  assert.equal((await hitSql("t:other", 3, 3600)).allowed, true, "keys are independent");
  const [{ count }] = await ctx.admin("select count from public.rate_limits where key = $1", [k]);
  assert.equal(count, 4, "denied hits are counted too");
});

test("sql: cost (token budgets), peek with cost 0, refunds never go below 0", async () => {
  const k = "t:budget";
  assert.equal((await hitSql(k, 1000, 86400, 0)).allowed, true, "peek on empty budget");
  assert.equal((await hitSql(k, 1000, 86400, 900)).allowed, true);
  assert.equal((await hitSql(k, 1000, 86400, 0)).allowed, true, "900 < 1000");
  assert.equal((await hitSql(k, 1000, 86400, 200)).allowed, false, "1100 > 1000");
  assert.equal((await hitSql(k, 1000, 86400, 0)).allowed, false, "peek on exhausted budget");
  assert.equal((await hitSql(k, 1000, 86400, -5000)).allowed, true, "refund");
  const [{ count }] = await ctx.admin("select count from public.rate_limits where key = $1", [k]);
  assert.equal(count, 0);
  assert.equal((await hitSql("t:zero", 0, 60)).allowed, false, "limit 0 = always denied (kill switch)");
});

test("sql: windows are aligned to the epoch (daily window starts 00:00 UTC)", async () => {
  await hitSql("t:day", 5, 86400);
  const [{ ws }] = await ctx.admin("select window_start::text as ws, extract(epoch from window_start)::bigint % 86400 as m from public.rate_limits where key = 't:day'");
  const [{ m }] = await ctx.admin("select extract(epoch from window_start)::bigint % 86400 as m from public.rate_limits where key = 't:day'");
  assert.equal(Number(m), 0, ws);
});

test("sql: invalid arguments raise", async () => {
  for (const args of [["", 1, 60], [null, 1, 60], ["x".repeat(201), 1, 60], ["k", -1, 60], ["k", 1, 0], ["k", 1, 2678401], ["k", null, 60]]) {
    const err = await ctx.code(ctx.admin("select * from public.rate_limit_hit($1, $2, $3)", args));
    assert.match(String(err), /rate_limit_hit: invalid/, JSON.stringify(args));
  }
});

test("sql: only the service role can use it – anon / authenticated get no access", async () => {
  const priv = await ctx.admin(`select
      has_function_privilege('anon', 'public.rate_limit_hit(text,integer,integer,integer)', 'execute') as anon_exec,
      has_function_privilege('authenticated', 'public.rate_limit_hit(text,integer,integer,integer)', 'execute') as user_exec,
      has_function_privilege('service_role', 'public.rate_limit_hit(text,integer,integer,integer)', 'execute') as svc_exec,
      has_table_privilege('anon', 'public.rate_limits', 'select') as anon_sel,
      has_table_privilege('authenticated', 'public.rate_limits', 'select') or has_table_privilege('authenticated', 'public.rate_limits', 'insert')
        or has_table_privilege('authenticated', 'public.rate_limits', 'update') or has_table_privilege('authenticated', 'public.rate_limits', 'delete') as user_any,
      (select relrowsecurity from pg_class where oid = 'public.rate_limits'::regclass) as rls,
      (select prosecdef from pg_proc where proname = 'rate_limit_hit') as definer`);
  assert.deepEqual(priv[0], { anon_exec: false, user_exec: false, svc_exec: true, anon_sel: false, user_any: false, rls: true, definer: true });
  await ctx.as("00000000-0000-4000-8000-000000000001");
  assert.match(String(await ctx.code(ctx.rpc("select * from public.rate_limit_hit('x', 1, 60)"))), /permission denied/);
  assert.match(String(await ctx.code(ctx.rpc("select * from public.rate_limits"))), /permission denied/);
  await ctx.asAnon();
  assert.match(String(await ctx.code(ctx.rpc("select * from public.rate_limit_hit('x', 1, 60)"))), /permission denied/);
});

test("core: hitAll stops at the first denial and does not count later rules", async () => {
  const rules = [{ key: "t:all:ip", limit: 2, windowSeconds: 600 }, { key: "t:all:user", limit: 10, windowSeconds: 600 }];
  assert.equal((await core.hitAll(rules, { rpc: pgRpc })).allowed, true);
  assert.equal((await core.hitAll(rules, { rpc: pgRpc })).allowed, true);
  const r = await core.hitAll(rules, { rpc: pgRpc });
  assert.equal(r.allowed, false);
  assert.equal(r.key, "t:all:ip");
  assert.ok(r.retryAfter >= 1);
  const [{ count }] = await ctx.admin("select count from public.rate_limits where key = 't:all:user'");
  assert.equal(count, 2);
});

test("core: database errors follow onError (allow by default, deny for cost protection)", async () => {
  const broken = async () => { throw new Error("db down"); };
  const rule = { key: "t:err", limit: 1, windowSeconds: 60 };
  assert.deepEqual(await core.hit(rule, { rpc: broken }), { allowed: true, retryAfter: 0, key: "t:err", limit: 1, degraded: true });
  const d = await core.hit(rule, { rpc: broken, onError: "deny", errorRetryAfter: 30 });
  assert.equal(d.allowed, false);
  assert.equal(d.retryAfter, 30);
  assert.equal(d.degraded, true);
  await assert.rejects(core.hit({ key: "", limit: 1, windowSeconds: 60 }, { rpc: broken }), /invalid key/, "programming errors still throw");
  await assert.rejects(core.hit({ key: "k", limit: 1.5, windowSeconds: 60 }, { rpc: broken }), /invalid limit/);
});

test("core: memory rpc mirrors the SQL semantics incl. window reset", async () => {
  let t = 1_700_000_000_000; // aligned to 600 s windows? 1700000000 % 600 = 200
  const rpc = core.memoryRateLimitRpc(() => t);
  const rule = { key: "m", limit: 2, windowSeconds: 600 };
  assert.equal((await core.hit(rule, { rpc })).allowed, true);
  assert.equal((await core.hit(rule, { rpc })).allowed, true);
  const denied = await core.hit(rule, { rpc });
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfter, 400);
  t += 400_000; // next window
  assert.equal((await core.hit(rule, { rpc })).allowed, true);
  assert.equal((await core.hit({ ...rule, cost: 0 }, { rpc })).allowed, true);
  assert.equal((await core.hit({ ...rule, cost: -10 }, { rpc })).allowed, true);
});

test("core: client IP prefers platform headers, buckets IPv6 to /64, keys are hashed", async () => {
  const h = (o) => new Headers(o);
  assert.equal(core.clientIp(h({ "x-forwarded-for": "6.6.6.6", "x-nf-client-connection-ip": "1.2.3.4" })), "1.2.3.4");
  assert.equal(core.clientIp(h({ "x-forwarded-for": "9.9.9.9", "cf-connecting-ip": "5.6.7.8" })), "5.6.7.8");
  assert.equal(core.clientIp(h({ "x-forwarded-for": " 9.9.9.9 , 10.0.0.1" })), "9.9.9.9");
  assert.equal(core.clientIp(h({ "x-forwarded-for": "<script>" })), "unknown");
  assert.equal(core.clientIp(h({})), "unknown");
  assert.equal(core.ipBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(core.ipBucket("2001:db8:1:2:ffff::1"), "2001:db8:1:2::/64");
  assert.equal(core.ipBucket("1.2.3.4"), "1.2.3.4");
  const k1 = await core.ipKey("ai", h({ "x-nf-client-connection-ip": "1.2.3.4" }));
  const k2 = await core.ipKey("ai", h({ "x-nf-client-connection-ip": "1.2.3.5" }));
  assert.match(k1, /^ai:ip:[0-9a-f]{32}$/);
  assert.notEqual(k1, k2);
  assert.ok(!k1.includes("1.2.3.4"), "no raw IP in the key");
});

test("core: 429 response has Retry-After, JSON body and no-store", async () => {
  const res = core.tooManyRequests({ retryAfter: 12.2 }, "Bitte warten.", { "Access-Control-Allow-Origin": "*" });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "13");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await res.json(), { error: "rate_limited", message: "Bitte warten.", retryAfter: 13 });
  assert.equal(core.waitText(30), "in einer Minute");
  assert.equal(core.waitText(600), "in 10 Minuten");
  assert.equal(core.waitText(3 * 3600), "in 3 Stunden");
  assert.equal(core.waitText(20 * 3600), "morgen");
  assert.equal(core.envInt(undefined, 7), 7);
  assert.equal(core.envInt(" 0 ", 7), 0);
  assert.equal(core.envInt("abc", 7), 7);
  assert.equal(core.envInt("-3", 7), 7);
});

test("lib: rateLimit() uses an injectable transport; supabaseRateLimitRpc maps the rpc result", async () => {
  const calls = [];
  const fakeClient = { rpc: async (name, args) => { calls.push([name, args]); return { data: [{ allowed: false, retry_after: 42 }], error: null }; } };
  const r = await lib.rateLimit({ key: "x", limit: 1, windowSeconds: 60 }, { rpc: lib.supabaseRateLimitRpc(fakeClient) });
  assert.deepEqual(calls, [["rate_limit_hit", { p_key: "x", p_limit: 1, p_window_seconds: 60, p_cost: 1 }]]);
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfter, 42);
  const errClient = { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) };
  assert.equal((await lib.rateLimit({ key: "x", limit: 1, windowSeconds: 60 }, { rpc: lib.supabaseRateLimitRpc(errClient), onError: "deny" })).allowed, false);
  lib.setRateLimitRpc(core.memoryRateLimitRpc());
  assert.equal((await lib.rateLimit({ key: "y", limit: 1, windowSeconds: 60 })).allowed, true);
  assert.equal((await lib.rateLimit({ key: "y", limit: 1, windowSeconds: 60 })).allowed, false);
  lib.setRateLimitRpc(null);
});

test("edge copy: supabase/functions/_shared/rate-limit-core.ts is identical to lib/rate-limit/core.ts", async () => {
  const a = await readFile(new URL("../lib/rate-limit/core.ts", import.meta.url), "utf8");
  const b = await readFile(new URL("../supabase/functions/_shared/rate-limit-core.ts", import.meta.url), "utf8");
  assert.equal(b, a, "run: cp lib/rate-limit/core.ts supabase/functions/_shared/rate-limit-core.ts");
});
