// Integration test (PGlite, all migrations) of supabase/migrations/20261117110000_coin_daily_cap.sql:
// submitted applications pay +100 coins, but at most 10 per user per day; over-cap applications are not marked as
// rewarded (they pay later), re-saving a rewarded application pays nothing, the cap is per user, older rewards don't count.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setupTeacherDb, ids } from "./helpers/teacher-db.mjs";

let ctx;
const wallet = async (user) => (await ctx.admin("select balance, earned from public.map_wallets where user_id = $1", [user]))[0] ?? { balance: 0, earned: 0 };
const rewards = async (user) => Number((await ctx.admin("select count(*)::int as n from public.map_application_rewards where user_id = $1", [user]))[0].n);
const add = async (user, id, status = "applied") => {
  await ctx.as(user);
  await ctx.rpc("insert into public.applications (id, user_id, company, position, location, category, status, created_at, updated_at) values ($1, $2, 'Fake AG', 'Lehrstelle', 'Bern', 'software', $3, current_date, current_date)", [id, user, status]);
};

test("setup", async () => {
  ctx = await setupTeacherDb();
  // Seeded rewards are "today" too: move them to last week so the test starts with a clean day.
  await ctx.admin("update public.map_application_rewards set created_at = now() - interval '7 days'");
});

test("cap: only 10 applications per day earn coins, the 11th+ earn nothing and stay unrewarded", async () => {
  const before = await wallet(ids.stranger);
  const beforeCount = await rewards(ids.stranger);
  for (let i = 0; i < 15; i += 1) await add(ids.stranger, `farm-${i}`);
  const after = await wallet(ids.stranger);
  assert.equal(after.earned - before.earned, 1000);
  assert.equal(after.balance - before.balance, 1000);
  assert.equal(await rewards(ids.stranger) - beforeCount, 10);
  const unrewarded = await ctx.admin("select count(*)::int as n from public.applications a where a.user_id = $1 and a.id like 'farm-%' and not exists (select 1 from public.map_application_rewards r where r.user_id = a.user_id and r.application_id = a.id)", [ids.stranger]);
  assert.equal(unrewarded[0].n, 5);
});

test("bulk insert in one statement also respects the cap", async () => {
  const before = await wallet(ids.s4);
  await ctx.as(ids.s4);
  await ctx.rpc("insert into public.applications (id, user_id, company, position, location, category, status, created_at, updated_at) select 'bulk-' || g, $1, 'Bulk AG', 'X', 'Bern', 'software', 'applied', current_date, current_date from generate_series(1, 25) g", [ids.s4]);
  assert.equal((await wallet(ids.s4)).earned - before.earned, 1000);
});

test("the cap is per user; drafts never pay; re-saving a rewarded application pays nothing", async () => {
  const before = await wallet(ids.s2);
  await add(ids.s2, "draft-1", "saved");
  assert.equal((await wallet(ids.s2)).earned, before.earned);
  await add(ids.s2, "real-1");
  assert.equal((await wallet(ids.s2)).earned - before.earned, 100);
  await ctx.as(ids.s2);
  await ctx.rpc("update public.applications set status = 'interview' where id = 'real-1'");
  await ctx.rpc("update public.applications set status = 'applied' where id = 'draft-1'");
  assert.equal((await wallet(ids.s2)).earned - before.earned, 200);
});

test("next day: over-cap applications pay out on their next save, old rewards don't count against today", async () => {
  await ctx.admin("update public.map_application_rewards set created_at = created_at - interval '1 day' where user_id = $1", [ids.stranger]);
  const before = await wallet(ids.stranger);
  await ctx.as(ids.stranger);
  await ctx.rpc("update public.applications set notes = 'nochmal' where id like 'farm-%'");
  assert.equal((await wallet(ids.stranger)).earned - before.earned, 500, "the 5 unrewarded ones pay now");
  await ctx.rpc("update public.applications set notes = 'drittes mal' where id like 'farm-%'");
  assert.equal((await wallet(ids.stranger)).earned - before.earned, 500, "nothing twice");
});

test("trigger function is still not callable by clients", async () => {
  for (const role of ["anon", "authenticated"]) {
    const [r] = await ctx.admin("select has_function_privilege($1, 'public.reward_submitted_application()', 'execute') as ok", [role]);
    assert.equal(r.ok, false, role);
  }
});
