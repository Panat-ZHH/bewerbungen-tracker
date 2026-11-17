// Flows re-audit 3 (PGlite, all migrations incl. the pending 20261117* ones).
// "Meine Daten löschen" (lib/storage.ts clearLocalData) must not reset the account type / birth year stored in profiles
// (migration 20261117163000_profiles_clear_keeps_account.sql + CLEARED_PROFILE update in lib/storage.ts).
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { readFile } from "node:fs/promises";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = { parent: id(931), child: id(932), parent2: id(933), teen: id(934) };
const YEAR = new Date().getFullYear();
let ctx;

const as = async (user, sql, params) => { await ctx.as(user); return ctx.rpc(sql, params); };
const fails = async (user, sql, params) => { await ctx.as(user); return ctx.code(ctx.rpc(sql, params)); };
const profile = async (user) => (await ctx.admin("select * from public.profiles where user_id = $1", [user]))[0];
const accountType = async (user) => (await ctx.admin("select public._account_type($1) as t", [user]))[0].t;

/** The column list the app sends (lib/storage.ts CLEARED_PROFILE), parsed from the source so both stay in sync. */
async function clearedProfileFromApp() {
  const src = await readFile(new URL("../lib/storage.ts", import.meta.url), "utf8");
  const body = /export const CLEARED_PROFILE = \{([^\n]*)\};/.exec(src)?.[1];
  assert.ok(body, "CLEARED_PROFILE exists in lib/storage.ts");
  return Object.fromEntries(body.split(",").map((pair) => pair.split(":").map((s) => s.trim())).map(([k, v]) => [k, v.startsWith("[]") ? [] : v === "null" ? null : JSON.parse(v)]));
}

before(async () => {
  ctx = await setupTeacherDb({ seed: true });
  const rows = Object.entries(U).map(([k, v]) => `('${v}','${k}@r3.ch','${JSON.stringify({ full_name: k })}')`);
  await ctx.admin(`insert into auth.users values ${rows.join(",")}`);
  await as(U.parent, "select public.account_set_type('parent')");
  await as(U.parent2, "select public.account_set_type('parent')");
  await as(U.child, "select public.account_set_type('independent_student', $1)", [YEAR - 13]);
  await as(U.teen, "select public.account_set_type('independent_student', $1)", [YEAR - 12]);
  await as(U.parent, "update public.profiles set first_name = 'Petra', last_name = 'Muster', phone = '079', location = 'Bern', display_name = 'Petra M.' where user_id = auth.uid()");
});

test("bug: before the fix a direct delete lost the parent type (reproduced on the raw SQL without the trigger)", async () => {
  await ctx.admin("alter table public.profiles disable trigger profiles_delete_keeps_account");
  try {
    await as(U.parent2, "delete from public.profiles where user_id = auth.uid()");
    assert.equal(await accountType(U.parent2), "independent_student", "the row is gone → fallback type");
    assert.match(await fails(U.parent2, "select public.family_create('X')"), /NOT_A_PARENT/);
  } finally {
    await ctx.admin("alter table public.profiles enable trigger profiles_delete_keeps_account");
    await ctx.admin("insert into public.profiles (id, user_id, first_name, last_name, email, account_type) values ('profile-' || $1, $1::uuid, '', '', '', 'parent') on conflict do nothing", [U.parent2]);
  }
});

test("new app: clearLocalData's UPDATE blanks the personal fields and keeps account type + birth year", async () => {
  const cleared = await clearedProfileFromApp();
  const sets = Object.keys(cleared).map((k, i) => `${k} = $${i + 1}`).join(", ");
  await as(U.parent, `update public.profiles set ${sets} where user_id = auth.uid()`, Object.values(cleared));
  const p = await profile(U.parent);
  assert.equal(p.account_type, "parent");
  assert.equal(p.first_name, ""); assert.equal(p.phone, null); assert.equal(p.location, null); assert.equal(p.display_name, null);
  assert.equal(await accountType(U.parent), "parent");
  // The parent journey still works afterwards.
  await as(U.parent, "select public.family_create('Familie R3')");
  assert.ok((await as(U.parent, "select public.family_get_my() as f"))[0].f);
  // Every column the app sends exists (a typo would fail the whole "Meine Daten löschen").
  const cols = (await ctx.admin("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles'")).map((r) => r.column_name);
  for (const k of Object.keys(cleared)) assert.ok(cols.includes(k), `profiles.${k}`);
});

test("old app / direct API: DELETE of the own profile row blanks it instead; the child keeps the birth year (consent stays required)", async () => {
  await as(U.teen, "update public.profiles set first_name = 'Tina', school = 'OS Bern' where user_id = auth.uid()");
  await as(U.teen, "delete from public.profiles where user_id = auth.uid()");
  const p = await profile(U.teen);
  assert.ok(p, "row kept");
  assert.equal(p.account_type, "independent_student");
  assert.equal(p.birth_year, YEAR - 12);
  assert.equal(p.first_name, ""); assert.equal(p.school, null);
  assert.equal((await ctx.admin("select public._family_needs_consent($1) as n", [U.teen]))[0].n, true);
  // The parent cannot become a "child" through a delete: a parent_invites_child code is still refused for a parent.
  await as(U.parent, "delete from public.profiles where user_id = auth.uid()");
  assert.equal(await accountType(U.parent), "parent");
});

test("a user cannot blank someone else's profile; service role (account deletion) still deletes for real", async () => {
  await as(U.child, "update public.profiles set first_name = 'Kim' where user_id = auth.uid()");
  await as(U.teen, "delete from public.profiles where user_id = $1", [U.child]);
  assert.equal((await profile(U.child)).first_name, "Kim", "RLS: foreign rows invisible");
  await ctx.admin("delete from public.profiles where user_id = $1", [U.child]);
  assert.equal(await profile(U.child), undefined);
});

test("grants: the trigger function is not callable from the API; migration re-applies", async () => {
  const r = (await ctx.admin(`select has_function_privilege('authenticated', 'public._profiles_delete_keeps_account()', 'execute') as a,
    has_function_privilege('anon', 'public._profiles_delete_keeps_account()', 'execute') as b`))[0];
  assert.deepEqual(r, { a: false, b: false });
  await ctx.apply("20261117163000_profiles_clear_keeps_account.sql");
  await ctx.apply("20261117163000_profiles_clear_keeps_account.sql");
  const triggers = await ctx.admin("select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_delete_keeps_account'");
  assert.equal(triggers.length, 1);
});
