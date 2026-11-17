// Security re-audit round 2 (branch reaudit2-sec, 2026-11-17): database regressions on PGlite (all migrations in order).
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { readFile } from "node:fs/promises";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = { attacker: id(1901), victim: id(1902), victim2: id(1903) };

let ctx;
before(async () => {
  ctx = await setupTeacherDb({ seed: false });
  const rows = Object.entries(U).map(([k, v]) => `('${v}','${k}@sq.ch','{}')`);
  await ctx.admin(`insert into auth.users values ${rows.join(",")}`);
});

test("profiles.id cannot be squatted: direct writes always get / keep 'profile-<own uid>'", async () => {
  // INSERT with a foreign id -> stored under the attacker's own canonical id.
  await ctx.as(U.attacker);
  await ctx.rpc(`insert into public.profiles (id,user_id,first_name,last_name,email) values ($1,$2,'A','B','a@x.ch')`, [`profile-${U.victim}`, U.attacker]);
  let rows = await ctx.admin("select id from public.profiles where user_id = $1", [U.attacker]);
  assert.deepEqual(rows, [{ id: `profile-${U.attacker}` }]);

  // UPDATE of the id -> kept (other columns still change).
  await ctx.as(U.attacker);
  await ctx.rpc("update public.profiles set id = $1, first_name = 'Neu' where user_id = $2", [`profile-${U.victim2}`, U.attacker]);
  rows = await ctx.admin("select id, first_name from public.profiles where user_id = $1", [U.attacker]);
  assert.deepEqual(rows, [{ id: `profile-${U.attacker}`, first_name: "Neu" }]);

  // The victims' own writes work: the client upsert (lib/storage.ts saveProfile) and the onboarding RPC.
  await ctx.as(U.victim);
  await ctx.rpc(`insert into public.profiles (id,user_id,first_name,last_name,email) values ($1,$2,'V','W','v@x.ch')
    on conflict (id) do update set first_name = excluded.first_name`, [`profile-${U.victim}`, U.victim]);
  await ctx.as(U.victim2);
  const r = (await ctx.rpc("select public.account_set_type('independent_student', $1) as r", [new Date().getFullYear() - 18]))[0].r;
  assert.equal(r.account_type, "independent_student");
  rows = await ctx.admin("select user_id, id from public.profiles where user_id in ($1,$2) order by id", [U.victim, U.victim2]);
  assert.deepEqual(rows.map((x) => x.id).sort(), [`profile-${U.victim}`, `profile-${U.victim2}`].sort());

  // Still guarded as before: account_type / birth_year are not writable directly.
  await ctx.as(U.victim);
  await ctx.rpc("update public.profiles set account_type = 'parent', birth_year = 1950 where user_id = $1", [U.victim]);
  rows = await ctx.admin("select account_type, birth_year from public.profiles where user_id = $1", [U.victim]);
  assert.deepEqual(rows, [{ account_type: "independent_student", birth_year: null }]);
});

test("profiles id guard migration is additive and idempotent", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261117141000_profiles_id_guard.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /\bdrop\s+(table|column|function|policy)\b/i);
  await ctx.as(null);
  await ctx.database.exec("reset role");
  await ctx.database.exec(sql);
  await ctx.database.exec(sql);
  const trig = await ctx.admin("select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal");
  assert.deepEqual(trig.map((t) => t.tgname).sort(), ["profiles_account_guard", "profiles_delete_keeps_account", "profiles_zz_access_gate"]); // + re-audit 3 (20261117163000), + access gate (20261118020000)
});
