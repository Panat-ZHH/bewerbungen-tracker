// Perf migration 20261118500000_perf_indexes_rls_initplan.sql: indexes + auth.uid() wrapped as (select auth.uid()) in RLS.
// Proves (1) no bare auth.uid() is left, (2) every rewritten policy is the old one with only that wrap (same command, roles,
// permissive/restrictive, same expression after normalising the wrap), (3) idempotent, (4) owner isolation unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setupAccessDb, uid } from "./helpers/access-db.mjs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const PERF = "20261118500000_perf_indexes_rls_initplan.sql";
const BARE = /(?<!SELECT )auth\.uid\(\)/;
const norm = (e) => (e ?? "").replace(/\( SELECT auth\.uid\(\) AS uid\)/g, "auth.uid()").replace(/\(select auth\.uid\(\)\)/g, "auth.uid()").replace(/[()\s]/g, "");

async function stubDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz not null default now(), email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $a$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $a$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text, owner uuid);
    create function storage.foldername(text) returns text[] language sql as $s$ select string_to_array($1, '/') $s$;
    grant usage on schema auth to authenticated, service_role;
    grant usage on schema public to authenticated, anon, service_role;
  `);
  return db;
}
const policies = async (db) => (await db.query("select tablename, policyname, permissive, roles::text roles, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2")).rows;

test("perf RLS rewrite: only the auth.uid() wrap changes, nothing bare is left, and it is idempotent", async () => {
  const db = await stubDb();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(files.includes(PERF));
  for (const f of files.filter((x) => x < PERF)) await db.exec(await readFile(new URL(f, dir), "utf8"));
  const before = await policies(db);
  const bareBefore = before.filter((p) => BARE.test(p.qual ?? "") || BARE.test(p.with_check ?? ""));
  assert.ok(bareBefore.length >= 15, `expected many bare auth.uid() policies before, got ${bareBefore.length}`);
  const sql = await readFile(new URL(PERF, dir), "utf8");
  await db.exec(sql);
  const after = await policies(db);
  assert.equal(after.length, before.length, "same number of policies");
  for (let i = 0; i < before.length; i++) {
    const [b, a] = [before[i], after[i]];
    const id = `${b.tablename}.${b.policyname}`;
    assert.equal(a.policyname, b.policyname, id);
    assert.equal(a.permissive, b.permissive, `${id} permissive`);
    assert.equal(a.roles, b.roles, `${id} roles`);
    assert.equal(a.cmd, b.cmd, `${id} cmd`);
    assert.equal(norm(a.qual), norm(b.qual), `${id} using`);
    assert.equal(norm(a.with_check), norm(b.with_check), `${id} with check`);
    assert.equal(BARE.test(a.qual ?? "") || BARE.test(a.with_check ?? ""), false, `${id} still has a bare auth.uid()`);
  }
  await db.exec(sql); // second run: no error, no change
  assert.deepEqual(await policies(db), after);
  const idx = (await db.query("select count(*)::int c from pg_indexes where schemaname = 'public' and indexname in ('applications_user_updated_idx', 'cvs_user_updated_idx', 'map_items_user_idx', 'friendships_requester_idx')")).rows[0].c;
  assert.equal(idx, 4);
});

test("perf RLS rewrite: owner isolation on applications / cvs / profiles is unchanged", async () => {
  const { as, admin, q, code, user, mode } = await setupAccessDb();
  await mode("off");
  const a = await user(1); const b = await user(2);
  await admin("insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at) values ('a1', $1, 'A AG', 'Lehre', 'other', 'saved', '2026-11-01', '2026-11-01'), ('b1', $2, 'B AG', 'Lehre', 'other', 'saved', '2026-11-01', '2026-11-01')", [a, b]);
  await as(a);
  assert.deepEqual((await q("select id from public.applications order by id")).map((r) => r.id), ["a1"]);
  assert.equal((await q("update public.applications set company = 'x' where id = 'b1' returning id")).length, 0, "cannot update another user's row");
  assert.match(await code(q("insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at) values ('a2', $1, 'X', 'Y', 'other', 'saved', '2026-11-01', '2026-11-01')", [b])) ?? "", /row-level security/);
  assert.equal((await q("insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at) values ('a3', $1, 'X', 'Y', 'other', 'saved', '2026-11-01', '2026-11-01') returning id", [a])).length, 1);
  assert.equal((await q("select count(*)::int c from public.cvs")).length, 1);
  await as(b);
  assert.deepEqual((await q("select id from public.applications order by id")).map((r) => r.id), ["b1"]);
  await as(null);
  assert.equal((await q("select count(*)::int c from public.applications"))[0].c, 0, "no JWT: no rows");
  assert.equal(uid(1), a);
});
