// Migration 20261114000000_onboarding_tour.sql on PGlite: backfill for existing users, RPC only touches the caller's row,
// grants, idempotency. Runs on top of the real schema + student onboarding migrations.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const read = (file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
const TOUR = "20261114000000_onboarding_tour.sql";
const OLD = "00000000-0000-4000-8000-0000000000a1", DONE = "00000000-0000-4000-8000-0000000000a2", NEW = "00000000-0000-4000-8000-0000000000a3", OTHER = "00000000-0000-4000-8000-0000000000a4";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $a$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $a$;
    grant usage on schema auth to authenticated, anon;
    create table public.profiles (id text primary key, user_id uuid unique references auth.users(id), first_name text not null, last_name text not null, email text not null, phone text, location text, website text, linkedin text);
    alter table public.profiles enable row level security;
    grant select, insert, update, delete on public.profiles to authenticated;
    create policy "own" on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create table public.user_roles (user_id uuid primary key, role text, display_name text);
    create table public.classes (id uuid primary key default gen_random_uuid(), teacher_id uuid, name text, join_code text unique, archived boolean not null default false);
    create table public.class_invitations (id uuid primary key default gen_random_uuid(), class_id uuid, token text, max_uses int, uses int default 0, expires_at timestamptz, revoked boolean default false);
    insert into auth.users values ('${OLD}', 'old@x.ch'), ('${DONE}', 'done@x.ch'), ('${NEW}', 'new@x.ch'), ('${OTHER}', 'other@x.ch');
  `);
  await db.exec(await read("20261109010000_student_onboarding.sql"));
  // existing users before the release: one never finished the old onboarding, one finished it on 2026-11-10
  await db.exec(`
    insert into public.profiles (id, user_id, first_name, last_name, email) values ('profile-${OLD}', '${OLD}', 'Old', 'User', 'old@x.ch');
    insert into public.profiles (id, user_id, first_name, last_name, email, onboarding_completed_at) values ('profile-${DONE}', '${DONE}', 'Done', 'User', 'done@x.ch', '2026-11-10T08:00:00Z');
    insert into public.profiles (id, user_id, first_name, last_name, email) values ('profile-${OTHER}', '${OTHER}', 'Other', 'User', 'other@x.ch');
  `);
  const as = async (id) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]); await db.exec("set role authenticated"); };
  const row = async (id) => { await db.exec("reset role"); return (await db.query("select * from public.profiles where user_id = $1", [id])).rows[0]; };
  return { db, as, row };
}

test("migration text: additive only, security definer with empty search_path, no anon grant", async () => {
  const sql = await read(TOUR);
  const code = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(code, /drop table|drop column|truncate|delete from|alter column .* type/i);
  assert.match(code, /add column if not exists onboarding_tour_completed_at timestamptz/);
  assert.match(code, /add column if not exists onboarding_tour_step smallint/);
  assert.match(code, /security definer set search_path = ''/);
  assert.match(code, /revoke all on function public\.onboarding_tour_set\(integer, boolean\) from public, anon/);
  assert.doesNotMatch(code, /grant [^;]* to [^;]*anon/);
});

test("backfill: every existing profile counts as done (onboarding time kept), idempotent", async () => {
  const { db, row } = await setup();
  await db.exec(await read(TOUR));
  const done = await row(DONE);
  assert.equal(new Date(done.onboarding_tour_completed_at).toISOString(), "2026-11-10T08:00:00.000Z", "uses onboarding_completed_at");
  assert.ok((await row(OLD)).onboarding_tour_completed_at, "never-finished old user is not forced through the tour");
  assert.equal(await row(NEW), undefined);

  // a user who signs up after the release and starts the tour
  await db.exec("reset role");
  await db.exec(`insert into public.profiles (id, user_id, first_name, last_name, email) values ('profile-${NEW}', '${NEW}', '', '', 'new@x.ch')`);
  await db.exec(await read(TOUR)); // re-run must not mark newer users as done
  assert.equal((await row(NEW)).onboarding_tour_completed_at, null);
});

test("RPC: creates the row, stores the step, completion is sticky, only the caller's row", async () => {
  const { db, as, row } = await setup();
  await db.exec(await read(TOUR));
  await db.exec(`delete from public.profiles where user_id = '${NEW}'`);

  await as(NEW);
  assert.equal((await db.query("select public.onboarding_tour_set(2, false) as done")).rows[0].done, null);
  let p = await row(NEW);
  assert.equal(p.onboarding_tour_step, 2); assert.equal(p.onboarding_tour_completed_at, null); assert.equal(p.email, "new@x.ch"); assert.equal(p.first_name, "");

  await as(NEW);
  await db.query("select public.onboarding_tour_set(99, false)");
  assert.equal((await row(NEW)).onboarding_tour_step, 4, "clamped");
  await as(NEW);
  await db.query("select public.onboarding_tour_set(-5, false)");
  assert.equal((await row(NEW)).onboarding_tour_step, 0, "clamped");

  await as(NEW);
  const done = (await db.query("select public.onboarding_tour_set(1, true) as done")).rows[0].done;
  assert.ok(done);
  await as(NEW);
  await db.query("select public.onboarding_tour_set(3, false)");
  p = await row(NEW);
  assert.equal(p.onboarding_tour_step, 3);
  assert.equal(new Date(p.onboarding_tour_completed_at).getTime(), new Date(done).getTime(), "a later step never clears completion");
  await as(NEW);
  await db.query("select public.onboarding_tour_set(null, true)");
  assert.equal(new Date((await row(NEW)).onboarding_tour_completed_at).getTime(), new Date(done).getTime(), "first completion time is kept");

  // profile answers saved by the tour's profile step are untouched by the tour RPC
  await as(NEW);
  await db.query("select public.student_onboarding_save('Mia', 'K.', null, array['Koch'], 'ZH', 'Uster', 2027, true)");
  await as(NEW);
  await db.query("select public.onboarding_tour_set(4, true)");
  p = await row(NEW);
  assert.equal(p.first_name, "Mia"); assert.equal(p.location, "Uster"); assert.deepEqual(p.desired_professions, ["Koch"]);

  // other users' rows are never touched
  const before = await row(OTHER);
  await as(NEW);
  await db.query("select public.onboarding_tour_set(2, false)");
  const after = await row(OTHER);
  assert.equal(after.onboarding_tour_step, before.onboarding_tour_step);
  assert.deepEqual(after.onboarding_tour_completed_at, before.onboarding_tour_completed_at);
});

test("RPC: rejected without login and not executable by anon; RLS still hides other rows", async () => {
  const { db, as } = await setup();
  await db.exec(await read(TOUR));
  await as(null);
  await assert.rejects(() => db.query("select public.onboarding_tour_set(1, false)"), /NOT_AUTHENTICATED/);
  await db.exec("reset role"); await db.exec("set role anon");
  await assert.rejects(() => db.query("select public.onboarding_tour_set(1, false)"), /permission denied/);
  await as(NEW);
  assert.equal((await db.query("select * from public.profiles")).rows.length, 0, "RLS: a user sees only their own row");
  await as(OLD);
  const own = (await db.query("select onboarding_tour_completed_at, onboarding_tour_step from public.profiles")).rows;
  assert.equal(own.length, 1);
});
