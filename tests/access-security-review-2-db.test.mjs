// Independent security review #2 (supabase/migrations/20261118310000_access_security_review_2.sql, _access/REPORT-security-2.md).
// PGlite with real role switching. R1 needs users that exist BEFORE 20261118300000 (live users at deploy time), so it builds
// its own database: migrations up to 20261118030000, users, then the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setupAccessDb, uid } from "./helpers/access-db.mjs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const SPLIT = "20261118030000_billing_solo.sql"; // last file before the e-mail normalisation of review #1

async function dbWithLiveUsers(users, { only = null } = {}) {
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
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files.filter((x) => x <= SPLIT)) await db.exec(await readFile(new URL(f, dir), "utf8"));
  for (const [n, email] of users) {
    await db.query("insert into auth.users (id, email, created_at) values ($1, $2, now() - interval '60 days')", [uid(n), email]);
  }
  for (const f of files.filter((x) => x > SPLIT && (!only || only.includes(x)))) await db.exec(await readFile(new URL(f, dir), "utf8"));
  const access = async (u) => (await db.query("select public.app_access($1) as a", [u])).rows[0].a;
  return { db, access };
}

async function resignup(db, pairs) {
  await db.exec("update public.account_access set trial_ends_at = now() - interval '1 day'");
  for (const [oldN, , ] of pairs) await db.query("delete from auth.users where id = $1", [uid(oldN)]);
  for (const [, newN, email] of pairs) await db.query("insert into auth.users (id, email) values ($1, $2)", [uid(newN), email]);
}

const LIVE = [[1, "First.Last@gmail.com"], [2, "anna+wa@example.ch"], [3, "plain@example.ch"]];
const AGAIN = [[1, 11, "First.Last@gmail.com"], [2, 12, "anna+wa@example.ch"], [3, 13, "plain@example.ch"]];

test("R1 attack (before the fix): an existing user with a Gmail-dot / +tag address gets a new trial by re-signing up with the SAME address", async () => {
  const { db, access } = await dbWithLiveUsers(LIVE, { only: ["20261118300000_access_security_review.sql"] });
  await db.exec("update public.access_settings set enforce_mode = 'on'");
  await resignup(db, AGAIN);
  assert.equal((await access(uid(11))).state, "trial"); // the hole
  assert.equal((await access(uid(12))).state, "trial"); // the hole
  assert.equal((await access(uid(13))).state, "expired"); // plain addresses were never affected
});

test("R1: with 20261118310000 an existing user's re-signup (same address, and Gmail / +tag aliases) gets NO new trial", async () => {
  const { db, access } = await dbWithLiveUsers(LIVE);
  await db.exec("update public.access_settings set enforce_mode = 'on'");
  // idempotent: replaying the fix changes nothing
  const before = (await db.query("select count(*)::int n from public.trial_ledger")).rows[0].n;
  await db.exec(await readFile(new URL("20261118310000_access_security_review_2.sql", dir), "utf8"));
  assert.equal((await db.query("select count(*)::int n from public.trial_ledger")).rows[0].n, before);
  await resignup(db, AGAIN);
  for (const n of [11, 12, 13]) assert.equal((await access(uid(n))).state, "expired", `user ${n}`);
  // aliases of the existing mailboxes neither
  await db.query("insert into auth.users (id, email) values ($1, 'firstlast@googlemail.com'), ($2, 'anna+zwei@example.ch')", [uid(21), uid(22)]);
  for (const n of [21, 22]) assert.equal((await access(uid(n))).state, "expired", `alias ${n}`);
  // a really new address still gets its 7 days
  await db.query("insert into auth.users (id, email) values ($1, 'neu@example.ch')", [uid(23)]);
  assert.deepEqual([(await access(uid(23))).state, (await access(uid(23))).trial_days_left], ["trial", 7]);
});

test("R1: a ledger row that only exists under the legacy hash (account deleted before the fix) still counts", async () => {
  const { db, access } = await dbWithLiveUsers([[31, "Old.Mail@gmail.com"]], { only: ["20261118300000_access_security_review.sql"] });
  await db.exec("update public.access_settings set enforce_mode = 'on'");
  await db.exec("update public.account_access set trial_ends_at = now() - interval '1 day'");
  await db.exec("update public.trial_ledger set first_trial_ends_at = now() - interval '1 day'");
  await db.query("delete from auth.users where id = $1", [uid(31)]);
  await db.exec(await readFile(new URL("20261118310000_access_security_review_2.sql", dir), "utf8"));
  await db.query("insert into auth.users (id, email) values ($1, 'Old.Mail@gmail.com')", [uid(32)]);
  assert.equal((await access(uid(32))).state, "expired");
});

test("R2: a failing profile insert never blocks the signup and no longer drops the trial row or its ledger row", async () => {
  const { admin, access } = await setupAccessDb();
  await admin("create function public._t_fail() returns trigger language plpgsql as $f$ begin raise exception 'boom'; end $f$");
  await admin("create trigger zz_t_fail before insert on public.profiles for each row execute function public._t_fail()");
  await admin("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'r2@example.ch', '{\"account_type\":\"parent\"}')", [uid(41)]);
  await admin("drop trigger zz_t_fail on public.profiles");
  assert.equal((await admin("select count(*)::int n from public.account_access where user_id = $1", [uid(41)]))[0].n, 1);
  assert.equal((await admin("select count(*)::int n from public.trial_ledger where email_hash = public._access_email_hash('r2@example.ch')"))[0].n, 1);
  assert.equal((await access(uid(41))).state, "trial");
});

test("Re-check of review #1 (S1 order): staff cannot reach a student licence path", async () => {
  const { admin, as, q, code, user, mode } = await setupAccessDb();
  await mode("on");
  const [s] = await admin("insert into public.schools (name) values ('Sek R') returning id");
  await admin(`insert into public.school_licences (school_id, package, status, student_limit, valid_from, valid_until)
    values ($1, 'starter', 'active', 100, current_date - 30, '2099-12-31')`, [s.id]);
  const t = await user(51, { meta: { role: "teacher" } });
  await admin("update public.user_roles set role = 'teacher' where user_id = $1", [t]);
  await admin("update public.account_access set free_access_until = now() + interval '1 day' where user_id = $1", [t]);
  await as(t);
  const [c] = await q("select * from public.class_create('Klasse', '2026')");
  await admin("update public.classes set school_id = $1 where id = $2", [s.id, c.class_id ?? c.id]);
  const [{ join_code: codeOf }] = await admin("select join_code from public.classes where id = $1", [c.class_id ?? c.id]);
  // a member of a licensed class cannot become a teacher (would keep the class_members licence path)
  const st = await user(52, { meta: { account_type: "independent_student" } });
  await as(st);
  await q("select * from public.class_join($1)", [codeOf]);
  await as(st);
  assert.match(String(await code(q("select public.set_my_role('teacher')"))), /FORBIDDEN/);
  // a teacher-role account cannot join a class as a member
  const t2 = await user(53, { meta: { role: "teacher" } });
  await admin("update public.user_roles set role = 'teacher' where user_id = $1", [t2]);
  await as(t2);
  assert.notEqual(await code(q("select * from public.class_join($1)", [codeOf])), null);
});
