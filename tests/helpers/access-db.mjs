// PGlite with Supabase stubs and ALL migrations replayed in order, for the access model tests (docs/access/DB.md).
// auth.users has created_at here (like Supabase); `as(uid)` switches to role authenticated with that JWT sub.
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("../../supabase/migrations/", import.meta.url);
export const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** opts.supabaseDefaults: like Supabase, every table / function created in public is granted to anon + authenticated by
 *  default privileges (so the migrations' own revokes are what protects them). */
export async function setupAccessDb(opts = {}) {
  const database = new PGlite();
  await database.exec(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz not null default now(), email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create function auth.jwt() returns jsonb language sql stable as $auth$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $auth$;
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null default 'verified');
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text, owner uuid);
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated, service_role;
    grant usage on schema public to authenticated, anon, service_role;
  `);
  if (opts.supabaseDefaults) {
    await database.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
  }
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) { await database.exec("reset role"); await database.exec(await readFile(new URL(f, dir), "utf8")); }
  const reset = async () => { await database.exec("reset role"); await database.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)"); };
  /** claims (optional) = the full JWT claims object seen by auth.jwt() (aal, amr, …). */
  const as = async (user, claims = null) => {
    await reset();
    await database.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
      [user ?? "", claims ? JSON.stringify({ sub: user, role: "authenticated", ...claims }) : ""]);
    await database.exec("set role authenticated");
  };
  const asService = async () => { await reset(); await database.exec("set role service_role"); };
  const admin = async (sql, params) => { await reset(); return (await database.query(sql, params)).rows; };
  const q = async (sql, params) => (await database.query(sql, params)).rows;
  const code = async (promise) => { try { await promise; return null; } catch (e) { return String(e.message); } };
  /** Creates an auth user (trigger creates account_access). meta = raw_user_meta_data. */
  const user = async (n, { email = `u${n}@example.test`, meta = {}, createdAt = null } = {}) => {
    await admin("insert into auth.users (id, email, raw_user_meta_data, created_at) values ($1, $2, $3, coalesce($4::timestamptz, now()))",
      [uid(n), email, JSON.stringify(meta), createdAt]);
    return uid(n);
  };
  const mode = (m) => admin("update public.access_settings set enforce_mode = $1 where id = 1", [m]);
  const expire = (u) => admin("update public.account_access set trial_ends_at = now() - interval '1 day' where user_id = $1", [u]);
  const access = async (u) => (await admin("select public.app_access($1) as a", [u]))[0].a;
  return { database, files, as, asService, admin, q, code, user, mode, expire, access, reset };
}
