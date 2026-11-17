// Integration test (PGlite, all migrations) of supabase/migrations/20261117020000_rate_limit_rpcs.sql:
// the code-redeem / lookup RPCs count per user and per IP in one shared budget, failed guesses are COUNTED when the call
// comes through PostgREST (request.method set), 429 is raised as a PostgREST custom error with Retry-After,
// settings can tune / switch off a scope, the renamed originals are not callable, grants are unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setupTeacherDb, ids } from "./helpers/teacher-db.mjs";

const viaApi = async (database, ip = "203.0.113.9") => {
  await database.query("select set_config('request.method', 'POST', false)");
  await database.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "cf-connecting-ip": ip, "x-forwarded-for": `${ip}, 10.0.0.1` })]);
};
const notApi = async (database) => {
  await database.query("select set_config('request.method', '', false)");
  await database.query("select set_config('request.headers', '', false)");
};
const counters = async (admin, like) => (await admin("select key, count from public.rate_limits where key like $1 order by key", [like]));

let ctx;
test("setup: all migrations incl. the rate-limit wrappers apply", async () => {
  ctx = await setupTeacherDb();
  const { admin } = ctx;
  const impl = await admin("select proname from pg_proc where proname like '\\_rl\\_impl\\_%' order by 1");
  assert.equal(impl.length, 15, impl.map((r) => r.proname).join(","));
});

test("grants: wrappers keep the old grants, originals and helpers are not callable by anon/authenticated", async () => {
  const { admin } = ctx;
  const can = async (role, fn) => (await admin("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]))[0].ok;
  for (const fn of ["public.class_join(text)", "public.class_preview(text)", "public.family_join(text)", "public.social_find_by_code(text)", "public.social_send_request(text)", "public.export_my_data()", "public.school_attach_class(uuid, text)"]) {
    assert.equal(await can("authenticated", fn), true, fn);
    assert.equal(await can("anon", fn), false, fn);
  }
  assert.equal(await can("anon", "public.invite_context(text)"), true);
  assert.equal(await can("anon", "public.waitlist_join(text, text, text)"), true);
  for (const fn of ["public._rl_impl_class_join(text)", "public._rl_impl_family_join(text)", "public._rl_impl_export_my_data()", "public._rl_enforce(text, integer, integer, integer)", "public._rl_deny(integer)", "public._rl_code()", "public.rate_limit_hit(text, integer, integer, integer)"]) {
    assert.equal(await can("authenticated", fn), false, fn);
    assert.equal(await can("anon", fn), false, fn);
  }
  // PostgREST runs non-volatile functions read-only: the wrappers must be VOLATILE (they write the counter)
  const vol = await admin("select proname, provolatile from pg_proc where proname in ('invite_context','export_my_data','class_preview','social_find_by_code') and pronamespace = 'public'::regnamespace");
  for (const r of vol) assert.equal(r.provolatile, "v", r.proname);
  // settings table: RLS on, no access for API roles
  assert.equal((await admin("select relrowsecurity from pg_class where oid = 'public.rate_limit_settings'::regclass"))[0].relrowsecurity, true);
  assert.equal((await admin("select has_table_privilege('authenticated', 'public.rate_limit_settings', 'select') as ok"))[0].ok, false);
});

test("outside the API (SQL): behaviour unchanged – a wrong code raises CLASS_NOT_FOUND, a right one joins", async () => {
  const { database, as, rpc, code, admin } = ctx;
  await notApi(database);
  await as(ids.stranger);
  assert.match(await code(rpc("select * from public.class_join('ZZZZZZZZ')")), /CLASS_NOT_FOUND/);
  assert.match(await code(rpc("select * from public.class_preview('ZZZZZZZZ')")), /CLASS_NOT_FOUND/);
  assert.match(await code(rpc("select public.family_join('ZZZZZZZZ')")), /INVITE_INVALID/);
  const { join_code } = (await admin("select join_code from public.classes where name = '10b'"))[0];
  await as(ids.stranger);
  const [row] = await rpc("select * from public.class_preview($1)", [join_code]);
  assert.equal(row.name, "10b");
});

test("via the API: a wrong code returns NO ROW (not an error) so the attempt is counted and committed", async () => {
  const { database, as, rpc, admin } = ctx;
  await admin("delete from public.rate_limits");
  await viaApi(database);
  await as(ids.s1);
  assert.deepEqual(await rpc("select * from public.class_join('QQQQQQQQ')"), []);
  assert.deepEqual(await rpc("select * from public.class_preview('QQQQQQQQ')"), []);
  assert.deepEqual(await rpc("select * from public.social_find_by_code('QQQQQQQQ')"), []);
  assert.deepEqual(await rpc("select * from public.social_send_request('nobody@nowhere.example')"), [], "USER_NOT_FOUND → no row");
  const user = await counters(admin, `code:user:${ids.s1}`);
  assert.equal(user[0].count, 3, "three guesses counted in the shared code budget (each call was its own transaction)");
  assert.equal((await counters(admin, "code-day:user:%"))[0].count, 3);
  const ipRows = await counters(admin, "code:ip:%");
  assert.equal(ipRows.length, 1);
  assert.ok(!ipRows[0].key.includes("203.0.113"), "IP is hashed");
});

test("family_join via the API: the error keeps its shape ({code,message,details,hint} + response.status 400) and the guess is counted", async () => {
  const { database, as, admin } = ctx;
  await admin("delete from public.rate_limits");
  await viaApi(database);
  await as(ids.s2);
  let out, status;
  await database.transaction(async (tx) => {
    out = (await tx.query("select public.family_join('QQQQQQQQ') as r")).rows[0].r;
    status = (await tx.query("select current_setting('response.status', true) as s")).rows[0].s;
  });
  assert.equal(status, "400");
  assert.equal(out.code, "P0001");
  assert.equal(out.message, "INVITE_INVALID");
  assert.equal(out.details, "Dieser Code ist ungültig.");
  assert.equal((await counters(admin, `code:user:${ids.s2}`))[0].count, 1);
});

test("brute force: the shared budget is per user across all code RPCs; then 429 with Retry-After and a German text", async () => {
  const { database, as, rpc, admin, code } = ctx;
  await admin("delete from public.rate_limits");
  await admin("insert into public.rate_limit_settings (scope, user_limit, ip_limit, window_seconds) values ('code', 3, 1000, 3600) on conflict (scope) do update set user_limit = 3, ip_limit = 1000, window_seconds = 3600");
  await viaApi(database);
  await as(ids.s3);
  await rpc("select * from public.class_preview('AAAAAAAA')");
  await rpc("select * from public.social_find_by_code('AAAAAAAA')");
  await rpc("select public.family_join('AAAAAAAA')");
  const err = await rpc("select * from public.class_join('AAAAAAAA')").catch((e) => e);
  assert.ok(err instanceof Error, "4th guess is refused");
  assert.equal(err.code, "PGRST");
  const body = JSON.parse(err.message);
  assert.equal(body.code, "rate_limited");
  assert.equal(body.message, "RATE_LIMITED");
  assert.match(body.details, /Bitte warte .+ und versuche es dann nochmals\./);
  assert.ok(Number(body.hint) >= 1 && Number(body.hint) <= 3600);
  const detail = JSON.parse(err.detail);
  assert.equal(detail.status, 429);
  assert.equal(detail.headers["Retry-After"], body.hint);
  // even a correct code is refused while over the limit (no oracle)
  const { join_code } = (await admin("select join_code from public.classes where name = '10b'"))[0];
  await as(ids.s3);
  assert.match(await code(rpc("select * from public.class_preview($1)", [join_code])), /RATE_LIMITED/);
  // another user is not affected
  await as(ids.s4);
  assert.equal((await rpc("select * from public.class_preview($1)", [join_code]))[0].name, "10b");
});

test("per IP: many accounts from one IP share the IP budget; another IP is free", async () => {
  const { database, as, rpc, admin, code } = ctx;
  await admin("delete from public.rate_limits");
  await admin("update public.rate_limit_settings set user_limit = 100, ip_limit = 2 where scope = 'code'");
  await viaApi(database, "198.51.100.7");
  await as(ids.s1); await rpc("select * from public.class_preview('BBBBBBBB')");
  await as(ids.s2); await rpc("select * from public.class_preview('BBBBBBBB')");
  await as(ids.s3);
  assert.match(await code(rpc("select * from public.class_preview('BBBBBBBB')")), /RATE_LIMITED/);
  await viaApi(database, "2001:db8:1:2:3:4:5:6");
  assert.deepEqual(await rpc("select * from public.class_preview('BBBBBBBB')"), []);
  // IPv6 is bucketed to its /64: another address of the same /64 shares the budget
  await viaApi(database, "2001:db8:1:2:ffff::1");
  await rpc("select * from public.class_preview('BBBBBBBB')");
  assert.match(await code(rpc("select * from public.class_preview('BBBBBBBB')")), /RATE_LIMITED/);
});

test("anon: invite_context is limited per IP (no user)", async () => {
  const { database, asAnon, rpc, admin, code } = ctx;
  await admin("delete from public.rate_limits");
  await admin("update public.rate_limit_settings set user_limit = 100, ip_limit = 2 where scope = 'code'");
  await viaApi(database, "192.0.2.99");
  await asAnon();
  assert.deepEqual(await rpc("select * from public.invite_context('CCCCCCCC')"), []);
  await rpc("select * from public.invite_context('CCCCCCCC')");
  assert.match(await code(rpc("select * from public.invite_context('CCCCCCCC')")), /RATE_LIMITED/);
  assert.equal((await counters(admin, "code:user:%")).length, 0);
});

test("settings: a scope can be switched off, '*' switches every RPC limit off; contact form 5/h per IP", async () => {
  const { database, as, asAnon, rpc, admin, code } = ctx;
  await admin("delete from public.rate_limits");
  await admin("update public.rate_limit_settings set enabled = false where scope = 'code'");
  await viaApi(database);
  await as(ids.s1);
  for (let i = 0; i < 5; i++) await rpc("select * from public.class_preview('DDDDDDDD')");
  assert.equal((await counters(admin, "code:%")).length, 0);
  await admin("delete from public.rate_limit_settings where scope = 'code'");
  // waitlist (anon contact form)
  await asAnon();
  for (let i = 0; i < 10; i++) await rpc("select public.waitlist_join($1, 'family', 'Hallo')", [`kontakt${i}@example.ch`]);
  assert.match(await code(rpc("select public.waitlist_join('spam@example.ch', 'family', 'x')")), /RATE_LIMITED/);
  await admin("insert into public.rate_limit_settings (scope, enabled) values ('*', false)");
  await asAnon();
  assert.deepEqual((await rpc("select public.waitlist_join('ok@example.ch', 'family', 'x') as r"))[0].r, { ok: true });
  await admin("delete from public.rate_limit_settings");
  await notApi(database);
});

test("exports and invite creation are limited per user", async () => {
  const { database, as, rpc, admin, code } = ctx;
  await admin("delete from public.rate_limits");
  await admin("insert into public.rate_limit_settings (scope, user_limit) values ('export', 2), ('invite-create', 1)");
  await viaApi(database);
  await as(ids.s1);
  await rpc("select public.export_my_data()");
  await rpc("select public.export_my_data()");
  assert.match(await code(rpc("select public.export_my_data()")), /RATE_LIMITED/);
  const { id } = (await admin("select id from public.classes where name = '10a'"))[0];
  await as(ids.owner);
  await rpc("select * from public.class_invite_create($1)", [id]);
  assert.match(await code(rpc("select * from public.class_invite_create_many($1, array['a@b.ch'])", [id])), /RATE_LIMITED/);
  await admin("delete from public.rate_limit_settings");
  await notApi(database);
});

test("codes: 8 characters from the 32-letter alphabet, every position uses all 32 letters (40 bits)", async () => {
  const { admin } = ctx;
  const rows = await admin("select public._soc_code() as c from generate_series(1, 3000)");
  const seen = Array.from({ length: 8 }, () => new Set());
  for (const { c } of rows) {
    assert.match(c, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    [...c].forEach((ch, i) => seen[i].add(ch));
  }
  for (let i = 0; i < 8; i++) assert.equal(seen[i].size, 32, `position ${i + 1}`);
});
