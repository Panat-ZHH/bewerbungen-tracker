// Re-audit 1 (auth + rate limits + AI limits), 2026-11-17. One test per fix:
//  - ai-review per-IP limit cannot be dodged with a forged x-nf-client-connection-ip header (Supabase is not Netlify),
//  - IPv6 addresses with "::" are bucketed to their /64 (TS core and SQL _rl_client_ip),
//  - class_invite_create_many_v2 (the bulk invite the app uses) is rate limited, signature + grants unchanged,
//  - /api/billing/session verifies the token before it calls Stripe and has its own route limit,
//  - the frontend shows the German wait text for the new limiter everywhere friendlyMessage() is used,
//  - the data export does not silently drop the server part when it is rate limited.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { loadLib } from "./helpers/load-lib.mjs";
import { setupTeacherDb, ids } from "./helpers/teacher-db.mjs";

const core = await import("../lib/rate-limit/core.ts");
const limits = await import("../supabase/functions/ai-review/limits.ts");
const { checkoutSession } = await import("../lib/billing/api.ts");
const api = await loadLib("api-rate-limit");
const headers = (h) => new Headers(h);

// ---------------------------------------------------------------- ai-review IP key
test("ai-review: a forged x-nf-client-connection-ip does not create a new IP budget on Supabase", async () => {
  const a = await limits.keys.ip(headers({ "cf-connecting-ip": "203.0.113.5", "x-nf-client-connection-ip": "1.1.1.1" }));
  const b = await limits.keys.ip(headers({ "cf-connecting-ip": "203.0.113.5", "x-nf-client-connection-ip": "9.9.9.9" }));
  const c = await limits.keys.ip(headers({ "cf-connecting-ip": "203.0.113.5" }));
  assert.equal(a, b);
  assert.equal(a, c);
  assert.notEqual(c, await limits.keys.ip(headers({ "cf-connecting-ip": "203.0.113.6" })));

  const rpc = core.memoryRateLimitRpc();
  const limiter = new limits.AiLimiter(rpc, { ...limits.limitConfig(() => undefined), ipPer10Min: 2 });
  for (let i = 0; i < 2; i++) await limiter.checkRequest(headers({ "cf-connecting-ip": "198.51.100.1", "x-nf-client-connection-ip": `10.0.0.${i}` }));
  await assert.rejects(limiter.checkRequest(headers({ "cf-connecting-ip": "198.51.100.1", "x-nf-client-connection-ip": "10.0.0.99" })), (e) => e.code === "rate_limited" && e.status === 429);
});

test("Next (Netlify) still prefers x-nf-client-connection-ip, which Netlify sets itself", () => {
  assert.equal(core.clientIp(headers({ "x-nf-client-connection-ip": "192.0.2.1", "cf-connecting-ip": "192.0.2.2", "x-forwarded-for": "192.0.2.3" })), "192.0.2.1");
});

// ---------------------------------------------------------------- IPv6 bucketing (TS)
test("ipBucket: '::' is expanded, so every address of one /64 shares a bucket", () => {
  const b = core.ipBucket;
  assert.equal(b("2001:db8:1::5"), b("2001:db8:1::6"));
  assert.equal(b("2001:db8:1::5"), b("2001:DB8:1:0:ffff:ffff:ffff:ffff"));
  assert.equal(b("2001:db8:1:2:3:4:5:6"), "2001:db8:1:2::/64");
  assert.equal(b("2001:db8:1:2:ffff::1"), "2001:db8:1:2::/64");
  assert.equal(b("2001:0db8:0001:0002::1"), "2001:db8:1:2::/64");
  assert.notEqual(b("2001:db8:1::5"), b("2001:db8:2::5"));
  assert.equal(b("::ffff:192.0.2.7"), "192.0.2.7");
  assert.equal(b("192.0.2.7"), "192.0.2.7");
  assert.equal(b("2001:db8::1::2"), "2001:db8::1::2", "invalid input stays its own (lower-case) bucket");
  // the edge copy is identical (also enforced in tests/rate-limit.test.mjs)
  assert.equal(readFileSync(new URL("../supabase/functions/_shared/rate-limit-core.ts", import.meta.url), "utf8"), readFileSync(new URL("../lib/rate-limit/core.ts", import.meta.url), "utf8"));
});

// ---------------------------------------------------------------- billing session
function sessionDeps() {
  const calls = [];
  const PARENT = { id: "00000000-0000-4000-8000-000000003004", email: "p@f.ch" };
  const FAMILY = "00000000-0000-4000-8000-000000003002";
  return {
    calls,
    deps: {
      enabled: true, configured: true, liveMode: false, baseUrl: "https://wendapply.test",
      auth: {
        async getUser(t) { calls.push(["getUser", t]); return t === "tok-parent" ? PARENT : null; },
        async isSchoolAdmin() { return false; },
        async isFamilyParent(t, id) { return t === "tok-parent" && id === FAMILY; },
      },
      stripe: {
        async retrieveCheckoutSession(id) {
          calls.push(["retrieve", id]);
          return { id, status: "complete", paymentStatus: "paid", metadata: { app: "wendapply", family_id: FAMILY, plan_id: "family", interval: "year" } };
        },
      },
      db: {},
    },
  };
}
const q = (id) => new URLSearchParams({ id });

test("billing session: a fake token never reaches the Stripe API; a real one is verified exactly once", async () => {
  const fake = sessionDeps();
  const r = await checkoutSession({ token: "garbage", query: q("cs_test_a1B2c3D4e5F6g7H8i9") }, fake.deps);
  assert.equal(r.status, 401);
  assert.equal(fake.calls.filter(([k]) => k === "retrieve").length, 0);

  const ok = sessionDeps();
  const r2 = await checkoutSession({ token: "tok-parent", query: q("cs_test_a1B2c3D4e5F6g7H8i9") }, ok.deps);
  assert.equal(r2.status, 200);
  assert.equal(ok.calls.filter(([k]) => k === "getUser").length, 1, "one verification → the per-user limit counts once");
});

test("billing session route: own route limit, per IP before and per user after the token check", () => {
  assert.ok(api, "lib/api-rate-limit.ts loads");
  assert.ok(api.ROUTE_LIMITS["billing-session"].ip.limit > 0);
  assert.ok(api.ROUTE_LIMITS["billing-session"].user.limit > 0);
  const src = readFileSync(new URL("../app/api/billing/session/route.ts", import.meta.url), "utf8");
  assert.match(src, /limitIp\("billing-session"/);
  assert.match(src, /withUserLimit\(deps\.auth, "billing-session"\)/);
  assert.match(src, /RateLimitedError/);
});

// ---------------------------------------------------------------- frontend texts
test("friendlyMessage shows the limiter's German text for RPC and API 429s", async () => {
  const { friendlyMessage } = await loadLib("ux");
  const rpcErr = Object.assign(new Error("Database error: rate_limited | RATE_LIMITED | Du hast das gerade sehr oft versucht. Bitte warte 5 Minuten und versuche es dann nochmals. | 300"), { code: "rate_limited" });
  assert.match(friendlyMessage(rpcErr, "X."), /Bitte warte 5 Minuten/);
  const rpcErr2 = { code: "rate_limited", message: "RATE_LIMITED", details: "Du hast das gerade sehr oft versucht. Bitte warte eine Minute und versuche es dann nochmals." };
  assert.match(friendlyMessage(rpcErr2, "X."), /eine Minute/);
  const apiErr = Object.assign(new Error("PUSH_SAVE_FAILED"), { status: 429, error: "rate_limited", message: "Du warst gerade sehr schnell unterwegs. Versuche es in 5 Minuten wieder." });
  assert.match(friendlyMessage(apiErr, "X."), /in 5 Minuten/);
  assert.equal(friendlyMessage(new Error("something"), "Fehler."), "Fehler. Versuch es bitte noch einmal.");
});

test("data export: a rate-limited server export is reported, other errors still fall back to 'not deployed'", async () => {
  const { unlessRateLimited } = await loadLib("rate-limit-text");
  const limited = { code: "rate_limited", message: "RATE_LIMITED", details: "warte" };
  assert.throws(() => unlessRateLimited(undefined)(limited));
  assert.equal(unlessRateLimited(undefined)(new Error("boom")), undefined);
  assert.match(readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8"), /exportMyDataFromServer\(\)\.catch\(unlessRateLimited\(undefined\)\)/);
  assert.match(readFileSync(new URL("../lib/reminders-client.ts", import.meta.url), "utf8"), /status: 429, error: "rate_limited"/);
});

// ---------------------------------------------------------------- SQL (PGlite, all migrations)
const viaApi = async (database, ip) => {
  await database.query("select set_config('request.method', 'POST', false)");
  await database.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "cf-connecting-ip": ip })]);
};

test("SQL: class_invite_create_many_v2 is limited (shared invite-create budget), signature and grants unchanged", async () => {
  const { database, admin, as, rpc, code } = await setupTeacherDb();
  const fn = "public.class_invite_create_many_v2(uuid, text[], integer)";
  const can = async (role, f) => (await admin("select has_function_privilege($1, $2, 'execute') as ok", [role, f]))[0].ok;
  assert.equal(await can("authenticated", fn), true);
  assert.equal(await can("anon", fn), false);
  assert.equal(await can("authenticated", "public._rl_impl_class_invite_create_many_v2(uuid, text[], integer)"), false);
  const [p] = await admin("select pg_get_function_result(oid) as res, pg_get_function_arguments(oid) as args, prosecdef, provolatile from pg_proc where oid = $1::regprocedure", [fn]);
  assert.equal(p.res, "TABLE(email text, outcome text, token text)");
  assert.match(p.args, /p_expires_in_days integer DEFAULT 14/);
  assert.equal(p.prosecdef, true);
  assert.equal(p.provolatile, "v");

  const { id } = (await admin("select id from public.classes where name = '10a'"))[0];
  await admin("insert into public.rate_limit_settings (scope, user_limit) values ('invite-create', 2) on conflict (scope) do update set user_limit = 2");
  await viaApi(database, "203.0.113.20");
  await as(ids.owner);
  const rows = await rpc("select * from public.class_invite_create_many_v2($1, array['neu1@schule.ch', 'neu1@schule.ch'])", [id]);
  assert.deepEqual(rows.map((r) => r.outcome), ["created", "duplicate"]);
  await rpc("select * from public.class_invite_create_many_v2($1, array['neu2@schule.ch'])", [id]);
  assert.match(await code(rpc("select * from public.class_invite_create_many_v2($1, array['neu3@schule.ch'])", [id])), /RATE_LIMITED/);
  assert.equal((await admin("select count(*)::int as n from public.class_invitations where email = 'neu3@schule.ch'"))[0].n, 0);
  // shared with v1 / single invites: they are blocked too now
  assert.match(await code(rpc("select * from public.class_invite_create($1)", [id])), /RATE_LIMITED/);
});

test("SQL: _rl_client_ip buckets IPv6 to the /64 also when '::' sits in the prefix, IPv4 stays exact", async () => {
  const { database, admin } = await setupTeacherDb({ seed: false });
  const ipOf = async (ip) => { await viaApi(database, ip); return (await admin("select public._rl_client_ip() as ip"))[0].ip; };
  assert.equal(await ipOf("2001:db8:1::5"), await ipOf("2001:db8:1::6"));
  assert.equal(await ipOf("2001:db8:1::5"), "2001:db8:1::/64");
  assert.equal(await ipOf("2001:db8:1:2:3:4:5:6"), "2001:db8:1:2::/64");
  assert.equal(await ipOf("2001:db8:1:2:ffff::1"), "2001:db8:1:2::/64", "same key format as before for the common case");
  assert.equal(await ipOf("192.0.2.44"), "192.0.2.44");
  assert.equal(await ipOf("not-an-ip"), null);
});
