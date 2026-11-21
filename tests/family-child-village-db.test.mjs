// Parent village view (supabase/migrations/20261121100000_family_child_village.sql) against PGlite with ALL migrations
// replayed AND Supabase's default privileges (so the migration's own revokes are what protects the function).
// Contract: docs/family/parent-village-contract.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setupAccessDb } from "./helpers/access-db.mjs";

const ctx = await setupAccessDb({ supabaseDefaults: true });
const { admin, as, q, code, user, mode, expire, reset } = ctx;
const YEAR = new Date().getFullYear();
let n = 5100;
const next = () => ++n;

const village = async (viewer, child) => { await as(viewer); try { return (await q("select public.family_child_village($1) as r", [child]))[0].r; } finally { await reset(); } };
const fails = async (viewer, child) => { await as(viewer); try { return await code(q("select public.family_child_village($1) as r", [child])); } finally { await reset(); } };
const rpc = async (viewer, sql, params) => { await as(viewer); try { return (await q(sql, params))[0]; } finally { await reset(); } };

/** A family with one active parent and one active child (under 16 unless `adult`). */
async function family({ consent = "granted", share = { progress: true, applications: false, village: true, documents: false }, adult = false } = {}) {
  const parent = await user(next());
  const child = await user(next());
  await admin("update public.profiles set account_type = 'parent' where user_id = $1", [parent]).catch(() => {});
  await admin(`insert into public.profiles (id, user_id, first_name, last_name, email, birth_year, account_type) values ($1, $2, 'Kim', 'Kind', 'kim@x.ch', $3, 'independent_student')`,
    [`p-${child}`, child, adult ? YEAR - 18 : YEAR - 13]);
  await admin("update public.user_roles set display_name = 'Kim' where user_id = $1", [child]);
  const [fam] = await admin("insert into public.families (name, created_by) values ('Familie Test', $1) returning id", [parent]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [fam.id, parent]);
  await admin("insert into public.family_members (family_id, user_id, role, consent_status, share_settings) values ($1, $2, 'child', $3, $4)",
    [fam.id, child, adult ? "not_required" : consent, JSON.stringify(share)]);
  return { parent, child, familyId: fam.id };
}

/** Village data of the child: two applications (secrets in every other column), a house layout, a stray layout, a shop item. */
async function seedVillage(child) {
  await admin(`insert into public.applications (id, user_id, company, position, location, category, status, created_at, updated_at, notes, salary_min, salary_max, job_url, source, job_description, deadline)
    values ('app-b-' || $2, $1, '  Zweite GmbH ', 'Mediamatiker', 'GEHEIMORT', 'software', 'interview', '2026-11-10', '2026-11-12', 'GEHEIME NOTIZ', 77777, 88888, 'https://secret.example/job', 'SECRETSOURCE', 'SECRETDESC', '2026-12-01'),
           ('app-a-' || $2, $1, 'Kinder AG', 'Informatiker', 'GEHEIMORT', 'software', 'applied', '2026-11-01', '2026-11-02', 'GEHEIME NOTIZ', 77777, 88888, 'https://secret.example/job', 'SECRETSOURCE', 'SECRETDESC', '2026-12-01')`,
    [child, child.slice(-4)]);
  await admin("insert into public.map_layouts (user_id, object_id, x, z, rotation) values ($1, $2, 3, 4, 1), ($1, 'house:deleted-app', 9, 9, 0)",
    [child, `house:app-a-${child.slice(-4)}`]);
  const [item] = await admin("insert into public.map_items (id, user_id, item_type, price_paid, x, z, rotation) values (gen_random_uuid(), $1, 'tree', 40, 7, 2, 2) returning id", [child]);
  await admin("insert into public.map_items (id, user_id, item_type, price_paid) values (gen_random_uuid(), $1, 'bench', 50)", [child]);
  return { itemId: item.id, a: `app-a-${child.slice(-4)}`, b: `app-b-${child.slice(-4)}` };
}

const SECRETS = ["GEHEIM", "77777", "88888", "secret.example", "SECRETSOURCE", "SECRETDESC", "Informatiker", "Mediamatiker", "2026-12-01", "kim@x.ch", "Familie Test", "price", "wallet", "balance"];

test("shared village: exactly the contract fields, houses oldest first, company null, only real house layouts, items like /map", async () => {
  await mode("test_users");
  const { parent, child } = await family();
  const { itemId, a, b } = await seedVillage(child);
  const v = await village(parent, child);
  assert.deepEqual(Object.keys(v).sort(), ["child_id", "display_name", "houses", "island_count", "items", "layouts", "show_companies"]);
  assert.equal(v.child_id, child);
  assert.equal(v.display_name, "Kim");
  assert.equal(v.island_count, 1);
  assert.equal(v.show_companies, false);
  assert.deepEqual(v.houses, [{ id: a, status: "applied", company: null }, { id: b, status: "interview", company: null }]);
  assert.deepEqual(v.layouts, [{ id: `house:${a}`, x: 3, z: 4, rotation: 1 }], "stray layout of a deleted application is not returned");
  assert.equal(v.items.length, 2);
  for (const it of v.items) assert.deepEqual(Object.keys(it).sort(), ["createdAt", "id", "itemType", "rotation", "x", "z"]);
  const tree = v.items.find((i) => i.id === itemId);
  assert.deepEqual([tree.itemType, tree.x, tree.z, tree.rotation], ["tree", 7, 2, 2]);
  assert.equal(typeof tree.createdAt, "string");
  const bench = v.items.find((i) => i.itemType === "bench");
  assert.deepEqual([bench.x, bench.z, bench.rotation], [null, null, 0], "unplaced items come back like map_shop_state");
  const text = JSON.stringify(v);
  for (const s of [...SECRETS, "Kinder AG", "Zweite"]) assert.ok(!text.includes(s), `leaked ${s}`);
});

test("companies only when the child also shares applications (trimmed, empty -> null)", async () => {
  const { parent, child } = await family();
  const { a, b } = await seedVillage(child);
  await admin("insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at) values ($2, $1, '   ', 'X', 'software', 'saved', '2026-11-20', '2026-11-20')", [child, `app-c-${child.slice(-4)}`]);
  await rpc(child, "select public.family_set_share($1::jsonb)", ['{"applications":true}']);
  const v = await village(parent, child);
  assert.equal(v.show_companies, true);
  assert.deepEqual(v.houses, [{ id: a, status: "applied", company: "Kinder AG" }, { id: b, status: "interview", company: "Zweite GmbH" },
    { id: `app-c-${child.slice(-4)}`, status: "saved", company: null }]);
  const text = JSON.stringify(v);
  for (const s of SECRETS) assert.ok(!text.includes(s), `leaked ${s}`);
  await rpc(child, "select public.family_set_share($1::jsonb)", ['{"applications":false}']);
  assert.ok((await village(parent, child)).houses.every((h) => h.company === null), "switching applications off hides companies again");
});

test("empty village: empty arrays, island count 1", async () => {
  const { parent, child } = await family();
  const v = await village(parent, child);
  assert.deepEqual([v.houses, v.layouts, v.items, v.island_count], [[], [], [], 1]);
});

test("village not shared -> NOT_SHARED (even with consent and applications shared)", async () => {
  const { parent, child } = await family({ share: { progress: true, applications: true, village: false, documents: true } });
  await seedVillage(child);
  assert.match(await fails(parent, child), /NOT_SHARED/);
});

test("consent pending (under 16) -> NOT_SHARED; over 16 needs no consent", async () => {
  const pending = await family({ consent: "pending" });
  await seedVillage(pending.child);
  assert.match(await fails(pending.parent, pending.child), /NOT_SHARED/);
  const adult = await family({ adult: true });
  assert.equal((await village(adult.parent, adult.child)).child_id, adult.child);
});

test("error hint tells the UI why (consent_pending / consent_withdrawn / village_off)", async () => {
  const { parent, child } = await family({ consent: "pending" });
  const hint = async () => { await as(parent); try { await q("select public.family_child_village($1)", [child]); return null; } catch (e) { return [e.message, e.hint]; } finally { await reset(); } };
  assert.deepEqual(await hint(), ["NOT_SHARED", "consent_pending"]);
  await rpc(parent, "select public.family_set_consent($1, true)", [child]);
  await rpc(parent, "select public.family_set_consent($1, false)", [child]);
  assert.deepEqual(await hint(), ["NOT_SHARED", "consent_withdrawn"]);
  await rpc(parent, "select public.family_set_consent($1, true)", [child]);
  await rpc(child, "select public.family_set_share($1::jsonb)", ['{"village":false}']);
  assert.deepEqual(await hint(), ["NOT_SHARED", "village_off"]);
});

test("withdrawn consent, village switched off or child removed -> hidden immediately", async () => {
  const { parent, child, familyId } = await family();
  await seedVillage(child);
  assert.ok(await village(parent, child));
  await rpc(parent, "select public.family_set_consent($1, false)", [child]);
  assert.match(await fails(parent, child), /NOT_SHARED/, "consent withdrawn");
  await rpc(parent, "select public.family_set_consent($1, true)", [child]);
  assert.ok(await village(parent, child), "consent granted again");
  await rpc(child, "select public.family_set_share($1::jsonb)", ['{"village":false}']);
  assert.match(await fails(parent, child), /NOT_SHARED/, "village switched off by the child");
  await rpc(child, "select public.family_set_share($1::jsonb)", ['{"village":true}']);
  assert.ok(await village(parent, child));
  await admin("update public.family_members set status = 'removed' where family_id = $1 and user_id = $2", [familyId, child]);
  assert.match(await fails(parent, child), /NOT_FOUND/, "removed child");
});

test("other family's parent, the child itself, pending parent, outsiders and anon get nothing", async () => {
  const a = await family();
  const b = await family();
  await seedVillage(a.child);
  assert.match(await fails(b.parent, a.child), /NOT_FOUND/, "parent of another family");
  assert.match(await fails(a.child, a.child), /FORBIDDEN/, "the child itself");
  assert.match(await fails(b.child, a.child), /FORBIDDEN/, "a child of another family");
  assert.match(await fails(a.parent, a.parent), /NOT_FOUND/, "a parent is no child");
  assert.match(await fails(a.parent, b.child), /NOT_FOUND/, "own parent, other family's child");
  const outsider = await user(next());
  assert.match(await fails(outsider, a.child), /NOT_IN_FAMILY/, "user without family");
  const pendingParent = await user(next());
  await admin("insert into public.family_members (family_id, user_id, role, status) values ($1, $2, 'parent', 'pending')", [a.familyId, pendingParent]);
  assert.match(await fails(pendingParent, a.child), /FORBIDDEN/, "pending parent");
  assert.match(await fails(null, a.child), /AUTH_REQUIRED|permission denied/, "no session");
  await reset();
  await ctx.database.exec("set role anon");
  assert.match(await code(q("select public.family_child_village($1)", [a.child])), /permission denied/, "anon");
  await reset();
});

test("grants: authenticated only; implementation not callable by clients; paywall guard like family_child_overview", async () => {
  const fns = await admin(`select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
      has_function_privilege('service_role', p.oid, 'execute') as svc, p.prosecdef, p.proconfig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('family_child_village', '_acc_impl_family_child_village') order by p.proname`);
  assert.deepEqual(fns.map((f) => [f.proname, f.anon, f.auth, f.svc, f.prosecdef]),
    [["_acc_impl_family_child_village", false, false, false, true], ["family_child_village", false, true, false, true]]);
  for (const f of fns) assert.deepEqual(f.proconfig, ['search_path=""']);
  const [w] = await admin("select prosrc from pg_proc where proname = 'family_child_village' and pronamespace = 'public'::regnamespace");
  assert.match(w.prosrc, /_assert_app_access\(\)/);
  assert.match(w.prosrc, /_acc_impl_family_child_village/);
  // without app access (enforcement on, trial over, no plan) the parent gets PAYWALL, like family_child_overview
  const { parent, child } = await family();
  await mode("on");
  await expire(parent);
  assert.match(await fails(parent, child), /PAYWALL/);
  await as(parent);
  assert.match(await code(q("select public.family_child_overview($1)", [child])), /PAYWALL/, "same guard as the overview");
  await reset();
  await mode("test_users");
  assert.ok(await village(parent, child));
});

test("the function is read-only: calling it changes no map / wallet / application rows", async () => {
  const { parent, child } = await family();
  await seedVillage(child);
  const snap = () => admin(`select (select count(*) from public.map_wallets where user_id = $1)::int w, (select count(*) from public.map_items where user_id = $1)::int i,
    (select count(*) from public.map_layouts where user_id = $1)::int l, (select count(*) from public.applications where user_id = $1)::int a,
    (select count(*) from public.map_application_rewards where user_id = $1)::int r`, [child]);
  const before = await snap();
  await village(parent, child);
  assert.deepEqual(await snap(), before);
});

test("migration is idempotent: re-running keeps one guarded wrapper with the same grants", async () => {
  const { parent, child } = await family();
  await reset();
  await ctx.database.exec(await readFile(new URL("../supabase/migrations/20261121100000_family_child_village.sql", import.meta.url), "utf8"));
  const fns = await admin(`select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
      has_function_privilege('service_role', p.oid, 'execute') as svc from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like '%family_child_village' order by p.proname`);
  assert.deepEqual(fns.map((f) => [f.proname, f.anon, f.auth, f.svc]),
    [["_acc_impl_family_child_village", false, false, false], ["family_child_village", false, true, false]]);
  assert.equal((await village(parent, child)).child_id, child);
});
