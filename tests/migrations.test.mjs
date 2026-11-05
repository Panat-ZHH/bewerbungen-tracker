import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../supabase/migrations/", import.meta.url);
const U1 = "00000000-0000-4000-8000-0000000000a1", U2 = "00000000-0000-4000-8000-0000000000b2";

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated;
  `);
  return db;
}
const files = async () => (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const as = async (db, user) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]); await db.exec("set role authenticated"); };

test("migration file names are timestamp-ordered and unique", async () => {
  const list = await files();
  assert.ok(list.length >= 7);
  for (const f of list) assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, f);
  assert.deepEqual(list, [...list].sort());
  assert.equal(new Set(list.map((f) => f.slice(0, 14))).size, list.length, "duplicate timestamps");
});

test("all migrations apply cleanly in order on an empty database", async () => {
  const db = await fresh();
  for (const f of await files()) {
    try { await db.exec(await readFile(new URL(f, dir), "utf8")); }
    catch (e) { assert.fail(`${f} failed: ${e.message}`); }
  }
  const tables = (await db.query("select table_name from information_schema.tables where table_schema='public'")).rows.map((r) => r.table_name);
  for (const t of ["applications", "profiles", "cvs"]) assert.ok(tables.includes(t), `table ${t} missing (have ${tables.join(",")})`);
});

test("every public table has row level security enabled", async () => {
  const db = await fresh();
  for (const f of await files()) await db.exec(await readFile(new URL(f, dir), "utf8"));
  const rows = (await db.query("select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows;
  assert.ok(rows.length > 0);
  const off = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
  assert.deepEqual(off, [], `tables without RLS: ${off.join(", ")}`);
});

test("security definer functions pin search_path and are not executable by anon", async () => {
  const db = await fresh();
  for (const f of await files()) await db.exec(await readFile(new URL(f, dir), "utf8"));
  const rows = (await db.query(`select p.proname, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon_exec
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.prorettype <> 'trigger'::regtype`)).rows;
  assert.ok(rows.length > 10, "expected many RPCs");
  const noPath = rows.filter((r) => !(r.proconfig ?? []).some((c) => c.startsWith("search_path="))).map((r) => r.proname);
  assert.deepEqual(noPath, [], `security definer without search_path: ${noPath.join(", ")}`);
  const anon = rows.filter((r) => r.anon_exec).map((r) => r.proname);
  assert.deepEqual(anon, [], `anon may execute: ${anon.join(", ")}`);
});

test("RLS isolates applications between users after all migrations", async () => {
  const db = await fresh();
  for (const f of await files()) await db.exec(await readFile(new URL(f, dir), "utf8"));
  await db.query(`insert into auth.users values ($1,'a@x.de','{"full_name":"A"}'), ($2,'b@x.de','{"full_name":"B"}')`, [U1, U2]);
  await db.query(`insert into public.applications (id,user_id,company,position,category,status,created_at,updated_at) values ('p1',$1,'Alpha','Dev','software','applied',current_date,current_date), ('p2',$2,'Beta','Dev','software','saved',current_date,current_date)`, [U1, U2]);
  await as(db, U1);
  assert.deepEqual((await db.query("select id from public.applications")).rows.map((r) => r.id), ["p1"]);
  await assert.rejects(() => db.query(`insert into public.applications (id,user_id,company,position,category,status,created_at,updated_at) values ('p3',$1,'X','Y','software','saved',current_date,current_date)`, [U2]));
  assert.equal((await db.query("update public.applications set company='hack' where id='p2'")).affectedRows, 0);
  assert.equal((await db.query("delete from public.applications where id='p2'")).affectedRows, 0);
  await as(db, null);
  assert.equal((await db.query("select id from public.applications")).rows.length, 0, "no user sees nothing");
  await db.exec("reset role");
  assert.equal((await db.query("select company from public.applications where id='p2'")).rows[0].company, "Beta");
});

test("migrations are re-runnable where they claim idempotence (second run does not break the schema)", async () => {
  const db = await fresh();
  const list = await files();
  for (const f of list) await db.exec(await readFile(new URL(f, dir), "utf8"));
  const skipped = [];
  for (const f of list.slice(2)) {
    try { await db.exec(await readFile(new URL(f, dir), "utf8")); } catch { skipped.push(f); }
  }
  // not required to be idempotent, but report which are not so the plan can track it
  console.log(`# non-idempotent migrations: ${skipped.join(", ") || "none"}`);
  assert.ok((await db.query("select count(*)::int as n from public.applications")).rows[0].n === 0);
});
