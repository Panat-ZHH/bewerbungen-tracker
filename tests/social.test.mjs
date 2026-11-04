import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const ids = { a: "00000000-0000-4000-8000-0000000000a1", b: "00000000-0000-4000-8000-0000000000b2", c: "00000000-0000-4000-8000-0000000000c3" };

async function setup() {
  const database = new PGlite();
  await database.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated;
  `);
  await database.exec(await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  await database.exec(await readFile(new URL("../supabase/social.sql", import.meta.url), "utf8"));
  await database.exec(await readFile(new URL("../supabase/social.sql", import.meta.url), "utf8")); // idempotent
  await database.query(`insert into auth.users values ($1,'Anna@Example.com','{"full_name":"Anna"}'), ($2,'ben@example.com','{"full_name":"Ben","role":"teacher"}'), ($3,'cara@example.com','{}')`, [ids.a, ids.b, ids.c]);
  const as = async (user) => { await database.exec("reset role"); await database.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]); await database.exec("set role authenticated"); };
  const rpc = async (sql, params) => (await database.query(sql, params)).rows;
  return { database, as, rpc };
}

test("roles come from signup metadata and users only read their own role row", async () => {
  const { database, as, rpc } = await setup();
  await as(ids.a);
  const [me] = await rpc("select * from public.social_my_profile()");
  assert.equal(me.role, "student");
  assert.equal(me.invite_code.length, 8);
  assert.equal(me.email, "anna@example.com");
  await as(ids.b);
  assert.equal((await rpc("select * from public.social_my_profile()"))[0].role, "teacher");
  assert.equal((await rpc("select * from public.user_roles")).length, 1);
  await assert.rejects(database.query("update public.user_roles set role = 'teacher' where user_id = $1", [ids.b]), /permission denied/);
  await as(ids.a);
  const updated = await rpc("select * from public.social_update_profile('Anna K', 'seed1', false)");
  assert.deepEqual([updated[0].display_name, updated[0].avatar_seed, updated[0].share_with_friends, updated[0].role], ["Anna K", "seed1", false, "student"]);
  await as(null);
  await assert.rejects(database.query("select * from public.social_my_profile()"), /AUTH_REQUIRED/);
  await database.exec("reset role; set role anon");
  await assert.rejects(database.query("select * from public.social_my_profile()"), /permission denied/);
});

test("find by code is exact only and hides e-mail", async () => {
  const { as, rpc } = await setup();
  await as(ids.b);
  const [{ invite_code: code }] = await rpc("select * from public.social_my_profile()");
  await as(ids.a);
  const found = await rpc("select * from public.social_find_by_code($1)", [code.toLowerCase()]);
  assert.equal(found.length, 1);
  assert.equal(found[0].display_name, "Ben");
  assert.equal("email" in found[0], false);
  assert.equal(found[0].relation, "none");
  for (const partial of [code.slice(0, 7), code.slice(1), "", "%", "_", "ben@example.com", code + "X"]) {
    assert.equal((await rpc("select * from public.social_find_by_code($1)", [partial])).length, 0, partial);
  }
  assert.equal((await rpc("select * from public.social_find_by_code(null)")).length, 0);
});

test("friend request flow by code and email, with activity summary limits", async () => {
  const { database, as, rpc } = await setup();
  await database.query("insert into public.applications (id,user_id,company,position,category,status,created_at,updated_at,notes,salary_min) values ('x1',$1,'Secret GmbH','Dev','software','applied',current_date,current_date,'private note',90000), ('x2',$1,'Other','Dev','software','saved',current_date,current_date,null,null)", [ids.a]);
  await as(ids.a);
  const [{ invite_code: codeA }] = await rpc("select * from public.social_my_profile()");
  await as(ids.b);
  await assert.rejects(database.query("select * from public.social_send_request('nobody@example.com')"), /USER_NOT_FOUND/);
  await assert.rejects(database.query("select * from public.social_send_request($1)", [codeA.slice(0, 5)]), /USER_NOT_FOUND/);
  const [{ invite_code: codeB }] = await rpc("select * from public.social_my_profile()");
  await assert.rejects(database.query("select * from public.social_send_request($1)", [codeB]), /CANNOT_ADD_SELF/);
  const [req] = await rpc("select * from public.social_send_request('ANNA@example.com')");
  assert.equal(req.status, "pending");
  await assert.rejects(database.query("select * from public.social_send_request($1)", [codeA]), /REQUEST_PENDING/);
  assert.equal((await rpc("select * from public.social_find_by_code($1)", [codeA]))[0].relation, "pending_out");
  assert.equal((await rpc("select * from public.social_friends_overview()")).length, 0);
  // not the addressee: cannot respond
  await assert.rejects(database.query("select public.social_respond_request($1, true)", [req.id]), /NOT_FOUND/);
  await as(ids.c);
  await assert.rejects(database.query("select public.social_respond_request($1, true)", [req.id]), /NOT_FOUND/);
  await assert.rejects(database.query("select public.social_remove_friend($1)", [req.id]), /NOT_FOUND/);
  assert.equal((await rpc("select * from public.social_list()")).length, 0);
  await as(ids.a);
  const incoming = await rpc("select * from public.social_list()");
  assert.deepEqual([incoming[0].state, incoming[0].display_name], ["incoming", "Ben"]);
  assert.equal((await rpc("select * from public.social_friends_overview()")).length, 0);
  assert.equal(await (await rpc("select public.social_respond_request($1, true) as r", [req.id]))[0].r, "accepted");
  await assert.rejects(database.query("select * from public.social_send_request($1)", [codeB]), /ALREADY_FRIENDS/);
  await as(ids.b);
  const [summary] = await rpc("select * from public.social_friends_overview()");
  assert.equal(summary.shared, true);
  assert.equal(summary.total, 2);
  assert.deepEqual(summary.status_counts, { applied: 1, saved: 1 });
  assert.deepEqual(Object.keys(summary).sort(), ["avatar_seed", "display_name", "map_items", "map_points_earned", "shared", "status_counts", "total", "user_id"]);
  assert.equal(JSON.stringify(summary).includes("Secret"), false);
  assert.equal(summary.map_points_earned, 100);
  // direct table access stays closed
  assert.equal((await rpc("select * from public.applications where user_id = $1", [ids.a])).length, 0);
  // sharing off
  await as(ids.a);
  await rpc("select * from public.social_update_profile(null, null, false)");
  await as(ids.b);
  const [hidden] = await rpc("select * from public.social_friends_overview()");
  assert.deepEqual([hidden.shared, hidden.total, hidden.status_counts], [false, null, null]);
  // removal
  const [{ id }] = await rpc("select * from public.social_list()");
  await rpc("select public.social_remove_friend($1)", [id]);
  assert.equal((await rpc("select * from public.social_list()")).length, 0);
  // decline deletes, reverse request auto-accepts
  await as(ids.c);
  const [toB] = await rpc("select * from public.social_send_request('ben@example.com')");
  await as(ids.b);
  assert.equal((await rpc("select * from public.social_send_request('cara@example.com')"))[0].status, "accepted");
  assert.equal((await rpc("select * from public.social_list()"))[0].id, toB.id);
});

test("declining a request removes it", async () => {
  const { as, rpc } = await setup();
  await as(ids.a);
  const [{ invite_code: codeC }] = await (async () => { await as(ids.c); return rpc("select * from public.social_my_profile()"); })();
  await as(ids.a);
  const [req] = await rpc("select * from public.social_send_request($1)", [codeC]);
  await as(ids.c);
  assert.equal((await rpc("select public.social_respond_request($1, false) as r", [req.id]))[0].r, "declined");
  assert.equal((await rpc("select * from public.social_list()")).length, 0);
});
