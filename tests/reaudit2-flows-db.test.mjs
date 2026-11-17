// Flows re-audit 2 (PGlite, all migrations incl. the pending 20261117* ones).
// 1. supabase/migrations/20261117143000_coin_cap_deferred_rewards.sql: applications over the daily coin cap are paid
//    automatically on a later day (village open = map_claim_application_rewards(), or any newly rewarded application),
//    the cap itself (10/day) still holds, nothing is paid twice, grants are tight.
// 2. supabase/migrations/20261117143100_school_network_ip_limits.sql: many pupils behind ONE school IP can preview/join
//    classes and open invite context in the same hour; the per-user limit on code guessing is unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setupTeacherDb, ids, seededClasses } from "./helpers/teacher-db.mjs";

let ctx;
const wallet = async (user) => (await ctx.admin("select balance, earned from public.map_wallets where user_id = $1", [user]))[0] ?? { balance: 0, earned: 0 };
const unpaid = async (user) => Number((await ctx.admin(
  "select count(*)::int as n from public.applications a where a.user_id = $1 and (a.applied_at is not null or a.status in ('applied', 'aptitude_test', 'interview', 'final_interview', 'offer', 'contract_signed', 'rejected')) and not exists (select 1 from public.map_application_rewards r where r.user_id = a.user_id and r.application_id = a.id)", [user]))[0].n);
const addApps = async (user, prefix, n, status = "applied") => {
  await ctx.as(user);
  await ctx.rpc(`insert into public.applications (id, user_id, company, position, location, category, status, applied_at, created_at, updated_at)
    select $1 || g, $2, 'Firma ' || g, 'Lehrstelle', 'Bern', 'software', $3, current_date - g, current_date, current_date from generate_series(1, $4::int) g`, [prefix, user, status, n]);
};
const nextDay = (user) => ctx.admin("update public.map_application_rewards set created_at = created_at - interval '1 day' where user_id = $1", [user]);
const viaApi = async (ip) => {
  await ctx.database.query("select set_config('request.method', 'POST', false)");
  await ctx.database.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "cf-connecting-ip": ip })]);
};
const notApi = async () => {
  await ctx.database.query("select set_config('request.method', '', false)");
  await ctx.database.query("select set_config('request.headers', '', false)");
};

test("setup", async () => {
  ctx = await setupTeacherDb();
  await ctx.admin("update public.map_application_rewards set created_at = now() - interval '7 days'");
});

test("backlog on day one: 10 paid today, the rest is paid automatically when the village opens on the next days", async () => {
  const before = await wallet(ids.stranger);
  await addApps(ids.stranger, "backlog-", 25);
  assert.equal((await wallet(ids.stranger)).earned - before.earned, 1000, "cap: 10 × 100 today");
  assert.equal(await unpaid(ids.stranger), 15);
  // Same day: opening the village pays nothing more (cap reached).
  await ctx.as(ids.stranger);
  assert.equal((await ctx.rpc("select public.map_claim_application_rewards() as n"))[0].n, 0);
  // Day 2: no edit needed – opening the village pays the next 10.
  await nextDay(ids.stranger);
  await ctx.as(ids.stranger);
  assert.equal((await ctx.rpc("select public.map_claim_application_rewards() as n"))[0].n, 10);
  assert.equal(await unpaid(ids.stranger), 5);
  assert.equal((await ctx.rpc("select public.map_claim_application_rewards() as n"))[0].n, 0, "nothing twice, cap holds");
  // Day 3: the last 5.
  await nextDay(ids.stranger);
  await ctx.as(ids.stranger);
  assert.equal((await ctx.rpc("select public.map_claim_application_rewards() as n"))[0].n, 5);
  const after = await wallet(ids.stranger);
  assert.equal(after.earned - before.earned, 2500, "every submitted application paid exactly once");
  assert.equal(after.balance - before.balance, 2500);
  assert.equal(await unpaid(ids.stranger), 0);
});

test("a new submitted application on a later day pays itself first and then waiting ones, within the cap", async () => {
  await ctx.admin("update public.map_application_rewards set created_at = now() - interval '7 days'");
  const before = await wallet(ids.s4);
  await addApps(ids.s4, "s4-backlog-", 14);
  assert.equal((await wallet(ids.s4)).earned - before.earned, 1000);
  await nextDay(ids.s4);
  await addApps(ids.s4, "s4-new-", 1);
  const paidNew = await ctx.admin("select 1 from public.map_application_rewards where user_id = $1 and application_id = 's4-new-1'", [ids.s4]);
  assert.equal(paidNew.length, 1, "the new application is paid");
  assert.equal((await wallet(ids.s4)).earned - before.earned, 1500, "plus the 4 waiting ones");
  assert.equal(await unpaid(ids.s4), 0);
});

test("farming stays capped: delete + re-create, drafts and claims never exceed 10 per day", async () => {
  await ctx.admin("update public.map_application_rewards set created_at = now() - interval '7 days'");
  const before = await wallet(ids.s2);
  for (let round = 0; round < 3; round += 1) {
    await addApps(ids.s2, `farm-${round}-`, 10);
    await ctx.as(ids.s2);
    await ctx.rpc("delete from public.applications where id like $1", [`farm-${round}-%`]);
    await ctx.rpc("select public.map_claim_application_rewards()");
  }
  await addApps(ids.s2, "draft-", 5, "saved");
  await ctx.as(ids.s2);
  await ctx.rpc("select public.map_claim_application_rewards()");
  assert.equal((await wallet(ids.s2)).earned - before.earned, 1000);
});

test("grants: the claim RPC is for signed-in users only, the helper is internal", async () => {
  const can = async (role, fn) => (await ctx.admin("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]))[0].ok;
  assert.equal(await can("authenticated", "public.map_claim_application_rewards()"), true);
  assert.equal(await can("anon", "public.map_claim_application_rewards()"), false);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await can(role, "public._map_pay_application_rewards(uuid, text)"), false, role);
    assert.equal(await can(role, "public.reward_submitted_application()"), false, role);
  }
  await ctx.as("");
  assert.match(await ctx.code(ctx.rpc("select public.map_claim_application_rewards()")), /NOT_AUTHENTICATED/);
});

test("school network: 120 pupils behind one IP preview + join (≈ 4 code calls each) within one hour", async () => {
  const { "10b": cls } = await seededClasses(ctx);
  const pupils = Array.from({ length: 120 }, (_, i) => `00000000-0000-4000-8000-${String(900000000000 + i)}`);
  await ctx.admin("insert into auth.users (id, email, raw_user_meta_data) select u::uuid, 'pupil' || n || '@schule.ch', '{\"full_name\":\"Kind\"}'::jsonb from unnest($1::text[]) with ordinality as t(u, n)", [pupils]);
  await ctx.admin("update public.user_roles set under_16 = false");
  await ctx.admin("delete from public.rate_limits");
  await viaApi("198.51.100.77");
  try {
    let joined = 0;
    for (const pupil of pupils) {
      await ctx.asAnon();
      await ctx.rpc("select * from public.invite_context($1)", [cls.join_code]); // login page banner
      await ctx.as(pupil);
      await ctx.rpc("select * from public.class_preview($1)", [cls.join_code]);
      await ctx.rpc("select * from public.class_preview($1)", [cls.join_code]); // reload
      joined += (await ctx.rpc("select * from public.class_join($1)", [cls.join_code])).length;
    }
    assert.equal(joined, 120, "480 code calls from one IP in one hour are fine");
  } finally {
    await notApi();
  }
});

test("per-user code limit is unchanged: one account still gets 30 lookups per hour", async () => {
  await ctx.admin("delete from public.rate_limits");
  await viaApi("198.51.100.78");
  try {
    await ctx.as(ids.s3);
    for (let i = 0; i < 30; i += 1) await ctx.rpc("select * from public.class_preview('ZZZZZZZZ')");
    assert.match(await ctx.code(ctx.rpc("select * from public.class_preview('ZZZZZZZZ')")), /rate_limited/);
  } finally {
    await notApi();
  }
  const rows = await ctx.admin("select scope, user_limit, ip_limit from public.rate_limit_settings where scope in ('code', 'code-day', 'invite-token') order by scope");
  assert.deepEqual(rows.map((r) => [r.scope, r.user_limit, r.ip_limit]), [["code", null, 1000], ["code-day", null, 3000], ["invite-token", null, 1000]]);
});

test("the settings migration keeps values an operator already set (idempotent, on conflict do nothing)", async () => {
  await ctx.admin("update public.rate_limit_settings set ip_limit = 5000 where scope = 'code'");
  await ctx.apply("20261117143100_school_network_ip_limits.sql");
  assert.equal((await ctx.admin("select ip_limit from public.rate_limit_settings where scope = 'code'"))[0].ip_limit, 5000);
  await ctx.apply("20261117143000_coin_cap_deferred_rewards.sql"); // re-runnable
});
