import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../supabase/migrations/", import.meta.url);
const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

async function setup() {
  const database = new PGlite();
  await database.exec(`
    create role authenticated; create role anon; create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated;
  `);
  for (const file of (await readdir(dir)).sort()) { if (file > "20261109050000_friends_privacy_defaults.sql") break; if (file.endsWith(".sql")) await database.exec(await readFile(new URL(file, dir), "utf8")); }
  return database;
}

test("friends privacy: results and company names are hidden for friends by default, enforced server-side", async () => {
  const database = await setup();
  try {
    const [owner, friend, stranger] = ["bbbbbbbb-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000002", "bbbbbbbb-0000-4000-8000-000000000003"];
    for (const [id, name] of [[owner, "Owner"], [friend, "Friend"], [stranger, "Stranger"]]) {
      await database.query("insert into auth.users (id) values ($1)", [id]);
      await database.query("insert into public.user_roles (user_id, display_name, invite_code) values ($1, $2, $2) on conflict (user_id) do update set display_name = excluded.display_name", [id, name]);
    }
    await database.query("insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted')", [owner, friend]);
    await database.query(`insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at) values
      ('a1', $1, 'Swisscom', 'P', 'software', 'offer', '2026-10-01', '2026-10-01'),
      ('a2', $1, 'UBS', 'P', 'software', 'rejected', '2026-10-02', '2026-10-02'),
      ('a3', $1, 'SBB', 'P', 'software', 'interview', '2026-10-03', '2026-10-03'),
      ('a4', $1, 'Migros', 'P', 'software', 'saved', '2026-10-04', '2026-10-04')`, [owner]);
    const as = async (viewer) => { await database.exec("reset role"); await database.query("select set_config('request.jwt.claim.sub', $1, false)", [viewer ?? ""]); await database.exec("set role authenticated"); };
    const island = async (viewer, target) => { await as(viewer); return (await database.query("select public.map_friend_island($1) as r", [target])).rows[0].r; };
    const overview = async (viewer) => { await as(viewer); return (await database.query("select * from public.social_friends_overview()")).rows; };

    // defaults for a fresh account: off
    await as(owner);
    assert.equal((await database.query("select public.social_get_share_companies() as v")).rows[0].v, false);
    assert.equal((await database.query("select public.social_get_share_outcomes() as v")).rows[0].v, false);

    const hidden = await island(friend, owner);
    assert.equal(hidden.outcomesShared, false); assert.equal(hidden.companiesShared, false);
    assert.deepEqual(hidden.applications.map((a) => a.status), ["applied", "applied", "interview", "saved"]);
    assert.ok(!JSON.stringify(hidden).match(/offer|rejected|Swisscom|UBS|SBB|Migros/));
    const row = (await overview(friend)).find((r) => r.user_id === owner);
    assert.deepEqual(row.status_counts, { applied: 2, interview: 1, saved: 1 });
    assert.equal(row.total, 4);

    // owner sees own rows unmasked via RLS
    await as(owner);
    assert.deepEqual((await database.query("select status from public.applications order by id")).rows.map((r) => r.status), ["offer", "rejected", "interview", "saved"]);

    // owner opts in to results only: statuses revealed, names still hidden
    await as(owner); await database.query("select public.social_set_share_outcomes(true)");
    const shown = await island(friend, owner);
    assert.deepEqual(shown.applications.map((a) => a.status), ["offer", "rejected", "interview", "saved"]);
    assert.ok(!JSON.stringify(shown).match(/Swisscom|UBS/));
    assert.equal((await overview(friend)).find((r) => r.user_id === owner).status_counts.offer, 1);

    // friend cannot flip the owner's switches; stranger gets nothing; anon rejected
    await as(friend); await database.query("select public.social_set_share_outcomes(false)");
    assert.equal((await island(friend, owner)).outcomesShared, true);
    await assert.rejects(island(stranger, owner), /NOT_FRIENDS/);
    await assert.rejects(island(null, owner), /AUTH_REQUIRED/);
    assert.equal((await overview(stranger)).length, 0);
    await as(null);
    await assert.rejects(database.query("select public.social_set_share_outcomes(true)"), /AUTH_REQUIRED/);
    // helpers are not callable by clients
    await as(friend);
    await assert.rejects(database.query("select public._soc_friend_status('offer', true)"), /permission denied/);
    await assert.rejects(database.query("select public._soc_status_counts_friend($1, true)", [owner]), /permission denied/);
  } finally { await database.close(); }
});

test("friends privacy migration is idempotent and never overrides a later opt-in; existing users are switched off once", async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create role authenticated; create role anon; create schema auth; create schema storage;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
      grant usage on schema auth to authenticated;
    `);
    const files = (await readdir(dir)).sort().filter((f) => f.endsWith(".sql") && f < "20261109050000");
    for (const f of files) await database.exec(await readFile(new URL(f, dir), "utf8"));
    const u = "cccccccc-0000-4000-8000-000000000001";
    await database.query("insert into auth.users (id) values ($1)", [u]);
    await database.query("insert into public.user_roles (user_id, display_name, invite_code) values ($1,'X','X') on conflict (user_id) do nothing", [u]);
    assert.equal((await database.query("select share_companies_with_friends v from public.user_roles where user_id=$1", [u])).rows[0].v, true, "old default was on");
    const sql = await read("../supabase/migrations/20261109050000_friends_privacy_defaults.sql");
    await database.exec(sql);
    assert.equal((await database.query("select share_companies_with_friends v from public.user_roles where user_id=$1", [u])).rows[0].v, false, "existing rows switched off once");
    await database.query("update public.user_roles set share_companies_with_friends = true where user_id=$1", [u]);
    await database.exec(sql);
    assert.equal((await database.query("select share_companies_with_friends v from public.user_roles where user_id=$1", [u])).rows[0].v, true, "second run keeps the user's choice");
  } finally { await database.close(); }
});

test("qr encoder: sizes per version, finder patterns, too long text returns null", async () => {
  const { qrMatrix } = await import("../lib/qr.ts");
  assert.equal(qrMatrix("HELLO").length, 21);
  assert.equal(qrMatrix("x".repeat(30)).length, 25);
  assert.equal(qrMatrix("x".repeat(130)).length, 41);
  assert.equal(qrMatrix("x".repeat(200)), null);
  const m = qrMatrix("https://wendapply.ch/invite/ABCD1234");
  for (const [r, c] of [[0, 0], [0, m.length - 7], [m.length - 7, 0]]) { assert.equal(m[r][c], true); assert.equal(m[r + 3][c + 3], true); assert.equal(m[r + 1][c + 1], false); }
});
