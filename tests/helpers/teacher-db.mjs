import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../../supabase/migrations/", import.meta.url);

export const ids = {
  owner: "00000000-0000-4000-8000-0000000000a1", co: "00000000-0000-4000-8000-0000000000a2", other: "00000000-0000-4000-8000-0000000000a3",
  s1: "00000000-0000-4000-8000-0000000000b1", s2: "00000000-0000-4000-8000-0000000000b2", s3: "00000000-0000-4000-8000-0000000000b3",
  s4: "00000000-0000-4000-8000-0000000000b4", stranger: "00000000-0000-4000-8000-0000000000b5",
};

/** Fresh pglite with Supabase stubs, all migrations applied, a class "10a" (owner), users and applications. `as(user)` switches the JWT. */
export async function setupTeacherDb({ seed = true, migrate = true } = {}) {
  const database = new PGlite();
  await database.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated;
  `);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const apply = async (f) => { await database.exec("reset role"); await database.exec(await readFile(new URL(f, dir), "utf8")); };
  if (migrate) for (const f of files) await apply(f);
  const as = async (user) => { await database.exec("reset role"); await database.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]); await database.exec("set role authenticated"); };
  const asAnon = async () => { await database.exec("reset role"); await database.query("select set_config('request.jwt.claim.sub', '', false)"); await database.exec("set role anon"); };
  const rpc = async (sql, params) => (await database.query(sql, params)).rows;
  const admin = async (sql, params) => { await database.exec("reset role"); return (await database.query(sql, params)).rows; };
  const code = async (promise) => { try { await promise; return null; } catch (e) { return String(e.message); } };
  const ctx = { database, as, asAnon, rpc, admin, code, apply, files };
  if (seed) await seedData(ctx);
  return ctx;
}

async function seedData({ database, as, rpc, admin }) {
  await database.query(`insert into auth.users values
    ($1,'owner@school.de','{"full_name":"Frau Owner","role":"teacher"}'), ($2,'co@school.de','{"full_name":"Herr Co","role":"teacher"}'),
    ($3,'other@school.de','{"full_name":"Frau Other","role":"teacher"}'),
    ($4,'s1@x.de','{"full_name":"Anna"}'), ($5,'s2@x.de','{"full_name":"Ben"}'), ($6,'s3@x.de','{"full_name":"Cem"}'),
    ($7,'s4@x.de','{"full_name":"Dina"}'), ($8,'stranger@x.de','{"full_name":"Fremd"}')`,
    [ids.owner, ids.co, ids.other, ids.s1, ids.s2, ids.s3, ids.s4, ids.stranger]);
  // Applications incl. sensitive fields that must never reach a teacher.
  const app = (id, user, company, status, extra = {}) => database.query(
    `insert into public.applications (id,user_id,company,position,location,category,status,deadline,applied_at,created_at,updated_at,notes,salary_min,salary_max,job_url,job_description)
     values ($1,$2,$3,$4,'Zürich','software',$5,$6,$7,$8,$9,'GEHEIME NOTIZ',80000,90000,'https://secret.example/job','GEHEIME BESCHREIBUNG')`,
    [id, user, company, extra.position ?? "Informatiker", status, extra.deadline ?? null, extra.applied ?? null, extra.created ?? new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), extra.updated ?? extra.created ?? new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)]);
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await app("s1a", ids.s1, "Alpha AG", "applied", { applied: day(-3), created: day(-5), updated: day(-3) });
  await app("s1b", ids.s1, "Beta GmbH", "interview", { applied: day(-9), created: day(-12), updated: day(-1) });
  await app("s1c", ids.s1, "Gamma SE", "saved", { deadline: day(3), created: day(-1), updated: day(-1) });
  await app("s1d", ids.s1, "Delta AG", "offer", { applied: day(-30), created: day(-40), updated: day(-4) });
  await app("s2a", ids.s2, "Verborgen AG", "offer", { applied: day(-2), created: day(-2) });
  await app("s3a", ids.s3, "Cem Firma", "final_interview", { applied: day(-2), created: day(-3) });
  await app("s4a", ids.s4, "Dina Firma", "preparing", { deadline: day(10), created: day(-60), updated: day(-60) });
  // Sharing starts OFF unless the student is 16+ (migration 20261109030000); the seeded students are 16+ so existing expectations hold.
  await database.exec("update public.user_roles set under_16 = false");
  await as(ids.owner);
  const [cls] = await rpc("select * from public.class_create('10a', '2026/27')");
  const [cls2] = await rpc("select * from public.class_create('10b', '2026/27')");
  await as(ids.other);
  const [foreign] = await rpc("select * from public.class_create('Fremdklasse', '2026/27')");
  for (const [s, c] of [[ids.s1, cls.join_code], [ids.s2, cls.join_code], [ids.s3, cls.join_code], [ids.s4, cls.join_code], [ids.stranger, foreign.join_code]]) {
    await as(s); await rpc("select * from public.class_join($1)", [c]);
  }
  await as(ids.s2); await rpc("select public.class_set_sharing($1, false)", [cls.id]);
  await as(ids.s3); await rpc("select public.class_set_sharing_v2($1, true, false)", [cls.id]);
  await as(ids.s4); await rpc("select public.class_set_sharing_v2($1, true, true, false)", [cls.id]);
  await as(ids.owner);
  await database.exec("reset role");
  return { cls, cls2, foreign };
}

/** Looks up the seeded classes (as superuser). */
export async function seededClasses({ admin }) {
  const rows = await admin("select id, name, join_code from public.classes order by name");
  return Object.fromEntries(rows.map((r) => [r.name, r]));
}
