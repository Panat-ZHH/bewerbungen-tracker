// QA (independent reviewer, 2026-11-22): leak tests for family_child_village after
// 20261122190000_family_child_village_full_details.sql, against PGlite with the FULL migration chain and Supabase default
// privileges. Every applications column the child's village does not show is filled with a LEAK marker (discovered from
// information_schema, so new columns are covered automatically) and must never appear in the RPC result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setupAccessDb } from "./helpers/access-db.mjs";

const ctx = await setupAccessDb({ supabaseDefaults: true });
const { admin, as, q, code, user, mode, reset, database } = ctx;
const YEAR = new Date().getFullYear();
let n = 9100;
const next = () => ++n;

const TOP_KEYS = ["child_id", "display_name", "houses", "island_count", "items", "layouts"];
const HOUSE_KEYS = ["appliedAt", "company", "createdAt", "deadline", "id", "location", "position", "status", "updatedAt"];
const ITEM_KEYS = ["createdAt", "id", "itemType", "rotation", "x", "z"];
const LAYOUT_KEYS = ["id", "rotation", "x", "z"];
// columns the child's village shows (or that are identity/ownership), everything else is a secret
const SHOWN = new Set(["id", "user_id", "company", "position", "location", "status", "created_at", "updated_at", "applied_at", "deadline", "category"]);

const call = async (viewer, child) => {
  await as(viewer);
  try { return { data: (await q("select public.family_child_village($1) as r", [child]))[0].r, error: null }; }
  catch (e) { return { data: null, error: String(e.message) }; }
  finally { await reset(); }
};

async function family({ consent = "granted", share = { progress: false, applications: false, village: true, documents: false } } = {}) {
  const parent = await user(next());
  const child = await user(next(), { email: `child${n}@leak.test` });
  await admin(`insert into public.profiles (id, user_id, first_name, last_name, email, birth_year, account_type) values ($1, $2, 'Lia', 'LEAKLASTNAME', 'LEAKMAIL@x.ch', $3, 'independent_student')`,
    [`p-${child}`, child, YEAR - 13]);
  await admin("update public.user_roles set display_name = 'Lia' where user_id = $1", [child]);
  const [fam] = await admin("insert into public.families (name, created_by) values ('LEAKFAMILYNAME', $1) returning id", [parent]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [fam.id, parent]);
  await admin("insert into public.family_members (family_id, user_id, role, consent_status, share_settings) values ($1, $2, 'child', $3, $4)",
    [fam.id, child, consent, JSON.stringify(share)]);
  return { parent, child, familyId: fam.id };
}

/** One application with every non-shown column filled with a LEAK marker (text) or 424242 (numbers). */
async function seed(child) {
  const id = `qa-app-${child.slice(-6)}`;
  await admin(`insert into public.applications (id, user_id, company, position, location, category, status, created_at, updated_at, applied_at, deadline)
    values ($1, $2, 'Sichtbar AG', 'Informatiker EFZ', 'Bern', 'software', 'rejected', '2026-10-01', '2026-10-05', '2026-10-02', '2026-11-30')`, [id, child]);
  const cols = await admin(`select column_name, data_type, udt_name from information_schema.columns where table_schema = 'public' and table_name = 'applications'`);
  const filled = [];
  for (const c of cols) {
    if (SHOWN.has(c.column_name)) continue;
    let value = null;
    if (["text", "character varying"].includes(c.data_type)) value = `LEAK_${c.column_name}`;
    else if (["integer", "bigint", "numeric", "real", "double precision", "smallint"].includes(c.data_type)) value = 424242;
    else if (c.data_type === "jsonb" || c.data_type === "json") value = JSON.stringify({ leak: `LEAK_${c.column_name}` });
    else if (c.data_type === "ARRAY" && c.udt_name === "_text") value = [`LEAK_${c.column_name}`];
    if (value === null) continue;
    const r = await code(admin(`update public.applications set ${JSON.stringify(c.column_name)} = $1 where id = $2`, [value, id]));
    if (r === null) filled.push(c.column_name);
  }
  // other tables tied to the child that must never leak
  await code(admin("insert into public.map_layouts (user_id, object_id, x, z, rotation) values ($1, $2, 1, 2, 3)", [child, `house:${id}`]));
  await code(admin("insert into public.map_layouts (user_id, object_id, x, z, rotation) values ($1, 'house:LEAKORPHAN', 5, 5, 0)", [child]));
  await admin("insert into public.map_items (id, user_id, item_type, price_paid, x, z, rotation) values (gen_random_uuid(), $1, 'tree', 424242, 7, 2, 2)", [child]);
  return { id, filled };
}

function assertNoLeak(v) {
  const s = JSON.stringify(v);
  for (const m of ["LEAK", "424242", "@leak.test", "@x.ch"]) assert.ok(!s.includes(m), `leaked marker ${m}: ${s.slice(0, 400)}`);
}

test("active parent: data, exact key sets, no LEAK marker from any non-shown applications column", async () => {
  await mode("test_users");
  const { parent, child } = await family();
  const { id, filled } = await seed(child);
  assert.ok(filled.length >= 8, `seeded secrets into ${filled.length} columns: ${filled.join(",")}`);
  const { data, error } = await call(parent, child);
  assert.equal(error, null);
  assert.deepEqual(Object.keys(data).sort(), TOP_KEYS);
  assert.equal(data.houses.length, 1);
  for (const h of data.houses) assert.deepEqual(Object.keys(h).sort(), HOUSE_KEYS);
  for (const i of data.items) assert.deepEqual(Object.keys(i).sort(), ITEM_KEYS);
  for (const l of data.layouts) assert.deepEqual(Object.keys(l).sort(), LAYOUT_KEYS);
  const h = data.houses[0];
  assert.deepEqual([h.id, h.company, h.position, h.location, h.status], [id, "Sichtbar AG", "Informatiker EFZ", "Bern", "rejected"], "real status, not masked");
  assert.deepEqual(data.layouts.map((l) => l.id), [`house:${id}`], "orphan layout not returned");
  assertNoLeak(data);
});

test("deny matrix: nobody but the active parent gets anything", async () => {
  const a = await family();
  const b = await family();
  await seed(a.child);
  const cases = [];
  cases.push(["parent of other family", b.parent, a.child]);
  cases.push(["the child itself", a.child, a.child]);
  cases.push(["non-member", await user(next()), a.child]);
  // sibling child in the same family
  const sib = await user(next());
  await admin(`insert into public.profiles (id, user_id, first_name, last_name, email, birth_year, account_type) values ($1, $2, 'Sib', 'S', 's@s.ch', $3, 'independent_student')`, [`p-${sib}`, sib, YEAR - 12]);
  await admin("insert into public.family_members (family_id, user_id, role, consent_status, share_settings) values ($1, $2, 'child', 'granted', '{\"village\":true}')", [a.familyId, sib]);
  cases.push(["sibling child", sib, a.child]);
  const pending = await user(next());
  await admin("insert into public.family_members (family_id, user_id, role, status) values ($1, $2, 'parent', 'pending')", [a.familyId, pending]);
  cases.push(["pending parent", pending, a.child]);
  const removed = await user(next());
  await admin("insert into public.family_members (family_id, user_id, role, status) values ($1, $2, 'parent', 'removed')", [a.familyId, removed]);
  cases.push(["removed parent", removed, a.child]);
  cases.push(["no session (authenticated, empty sub)", null, a.child]);
  cases.push(["random child id", a.parent, "00000000-0000-4000-8000-999999999999"]);
  for (const [label, viewer, child] of cases) {
    const r = await call(viewer, child);
    assert.equal(r.data, null, `${label} got data`);
    assert.ok(r.error, `${label}: no error`);
    assert.ok(!/LEAK|Sichtbar/.test(r.error), `${label}: error text leaks data`);
  }
  // anon role
  await reset(); await database.exec("set role anon");
  assert.match(await code(q("select public.family_child_village($1)", [a.child])), /permission denied/);
  assert.match(await code(q("select public._acc_impl_family_child_village($1)", [a.child])), /permission denied/);
  await reset();
  // authenticated cannot call the impl directly (would skip the paywall guard)
  await as(a.parent);
  assert.match(await code(q("select public._acc_impl_family_child_village($1)", [a.child])), /permission denied/);
  await reset();
  // sanity: the active parent still works
  assert.equal((await call(a.parent, a.child)).error, null);
});

test("child-side switches: village off, consent pending, consent withdrawn, child removed -> error, no data", async () => {
  const f = await family();
  await seed(f.child);
  const set = (sql) => admin(`update public.family_members set ${sql} where family_id = $1 and user_id = $2`, [f.familyId, f.child]);
  await set(`share_settings = '{"progress":true,"applications":true,"village":false,"documents":true}'`);
  assert.match((await call(f.parent, f.child)).error, /NOT_SHARED/, "village off even with everything else on");
  await set(`share_settings = share_settings - 'village'`);
  assert.match((await call(f.parent, f.child)).error, /NOT_SHARED/, "village key missing = off");
  await set(`share_settings = '{"village":true}', consent_status = 'pending'`);
  assert.match((await call(f.parent, f.child)).error, /NOT_SHARED/, "consent pending");
  await set(`consent_status = 'withdrawn'`);
  assert.match((await call(f.parent, f.child)).error, /NOT_SHARED/, "consent withdrawn");
  await set(`consent_status = 'granted'`);
  assert.equal((await call(f.parent, f.child)).error, null, "back on");
  await set(`status = 'removed'`);
  assert.match((await call(f.parent, f.child)).error, /NOT_FOUND/, "removed child");
});

test("applications toggle no longer matters: same full result with applications on and off", async () => {
  const f = await family({ share: { village: true, applications: false } });
  await seed(f.child);
  const off = (await call(f.parent, f.child)).data;
  await admin(`update public.family_members set share_settings = '{"village":true,"applications":true}' where family_id = $1 and user_id = $2`, [f.familyId, f.child]);
  const on = (await call(f.parent, f.child)).data;
  assert.deepEqual(off, on);
  assert.equal(off.houses[0].company, "Sichtbar AG");
});

test("security definer + search_path='' + grants; wrapper keeps the paywall guard", async () => {
  const fns = await admin(`select p.proname, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') anon,
    has_function_privilege('authenticated', p.oid, 'execute') auth from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('family_child_village', '_acc_impl_family_child_village') order by 1`);
  assert.deepEqual(fns.map((f) => [f.proname, f.prosecdef, f.anon, f.auth]), [["_acc_impl_family_child_village", true, false, false], ["family_child_village", true, false, true]]);
  for (const f of fns) assert.deepEqual(f.proconfig, ['search_path=""']);
  const [w] = await admin("select prosrc from pg_proc where proname = 'family_child_village' and pronamespace = 'public'::regnamespace");
  assert.match(w.prosrc, /_assert_app_access\(\)/);
});

test("replay: migration -> rollback -> migration; rollback restores the previous (friend-like) payload; grants stay", async () => {
  const f = await family();
  await seed(f.child);
  const before = (await call(f.parent, f.child)).data;
  const down = await readFile(new URL("../supabase/rollback/20261122190000_family_child_village_full_details.down.sql", import.meta.url), "utf8");
  const up = await readFile(new URL("../supabase/migrations/20261122190000_family_child_village_full_details.sql", import.meta.url), "utf8");
  await reset(); await database.exec(down);
  const old = (await call(f.parent, f.child)).data;
  assert.ok("show_companies" in old, "old contract after rollback");
  assert.equal(old.houses[0].id, "h0001", "pseudo ids after rollback");
  assert.equal(old.houses[0].company ?? null, null, "no company without applications share after rollback");
  const [prev] = await admin("select prosrc from pg_proc where proname = '_acc_impl_family_child_village'");
  const prevMig = await readFile(new URL("../supabase/migrations/20261122100000_family_child_village_like_friend.sql", import.meta.url), "utf8");
  assert.ok(prevMig.includes(prev.prosrc.trim()), "rollback body == 20261122100000 body");
  await as(f.parent); assert.match(await code(q("select public._acc_impl_family_child_village($1)", [f.child])), /permission denied/); await reset();
  await reset(); await database.exec(up);
  await database.exec(up); // idempotent
  assert.deepEqual((await call(f.parent, f.child)).data, before);
  const cnt = await admin("select count(*)::int c from pg_proc where proname in ('family_child_village','_acc_impl_family_child_village')");
  assert.equal(cnt[0].c, 2);
});

test("read-only: calling the RPC changes no rows anywhere in public", async () => {
  const f = await family();
  await seed(f.child);
  const snapshot = async () => {
    const tables = await admin("select tablename from pg_tables where schemaname = 'public' order by 1");
    const out = {};
    for (const { tablename } of tables) out[tablename] = (await admin(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) h from public.${JSON.stringify(tablename)} t`))[0].h;
    return out;
  };
  const a = await snapshot();
  await call(f.parent, f.child);
  await call(f.parent, f.child);
  assert.deepEqual(await snapshot(), a);
});
