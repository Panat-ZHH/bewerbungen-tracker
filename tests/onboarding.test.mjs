import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { loadLib } from "./helpers/load-lib.mjs";

const core = await loadLib("onboarding-core");
const role = await loadLib("role");

test("addProfession trims, dedupes case-insensitively and caps at 8", () => {
  let list = core.addProfession([], "  Informatiker:in ");
  list = core.addProfession(list, "informatiker:in");
  list = core.addProfession(list, "   ");
  assert.deepEqual(list, ["Informatiker:in"]);
  for (let i = 0; i < 12; i++) list = core.addProfession(list, `Beruf ${i}`);
  assert.equal(list.length, core.MAX_PROFESSIONS);
  assert.deepEqual(core.removeProfession(["a", "b"], "a"), ["b"]);
});

test("searchPrefill uses the first profession, place wins over canton, null when empty", () => {
  assert.deepEqual(core.searchPrefill({ professions: ["Koch", "Maurer"], canton: "ZH", place: "", startYear: 2027 }), { query: "Koch", location: "", cantons: ["ZH"], startYear: 2027 });
  assert.deepEqual(core.searchPrefill({ professions: [], canton: "ZH", place: "Winterthur", startYear: null }), { query: "", location: "Winterthur", cantons: [] });
  assert.equal(core.searchPrefill({ professions: [], canton: "", place: " ", startYear: null }), null);
});

test("parsePrefill rejects garbage and sanitises cantons", () => {
  assert.equal(core.parsePrefill("not json"), null);
  assert.equal(core.parsePrefill(JSON.stringify({ query: 1 })), null);
  assert.deepEqual(core.parsePrefill(JSON.stringify({ query: "x", location: "", cantons: ["ZH", "zz", 3] })), { query: "x", location: "", cantons: ["ZH"] });
});

test("startYearOptions starts next year from October on", () => {
  assert.deepEqual(core.startYearOptions(new Date(2026, 5, 1)), [2026, 2027, 2028, 2029]);
  assert.deepEqual(core.startYearOptions(new Date(2026, 10, 6)), [2027, 2028, 2029, 2030]);
});

test("inviteSentence", () => {
  assert.equal(core.inviteSentence("Frau Keller", "4a"), "Du wurdest von Frau Keller in Klasse 4a eingeladen");
  assert.equal(core.inviteSentence("", "4a"), "Du wurdest von deiner Lehrperson in Klasse 4a eingeladen");
});

test("student onboarding routing helpers", () => {
  assert.equal(role.studentOnboarded({ student_onboarded: true }), true);
  assert.equal(role.studentOnboarded({}), false);
  assert.equal(role.studentOnboardingHref(), "/onboarding");
  assert.equal(role.studentOnboardingHref("/classes/join/ABC"), "/onboarding?next=%2Fclasses%2Fjoin%2FABC");
  assert.equal(role.studentOnboardingHref("//evil.com"), "/onboarding");
});

test("migration: onboarding save + invite_context behave and leak nothing else", async () => {
  const db = new PGlite();
  const U = "00000000-0000-4000-8000-0000000000a1", T = "00000000-0000-4000-8000-0000000000b2";
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $a$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $a$;
    grant usage on schema auth to authenticated, anon;
    create table public.profiles (id text primary key, user_id uuid unique references auth.users(id), first_name text not null, last_name text not null, email text not null, phone text, location text, website text, linkedin text);
    create table public.user_roles (user_id uuid primary key, role text, display_name text);
    create table public.classes (id uuid primary key default gen_random_uuid(), teacher_id uuid, name text, join_code text unique, archived boolean not null default false);
    create table public.class_invitations (id uuid primary key default gen_random_uuid(), class_id uuid, token text, max_uses int, uses int default 0, expires_at timestamptz, revoked boolean default false);
    insert into auth.users values ('${U}', 's@x.ch'), ('${T}', 't@x.ch');
    insert into public.user_roles values ('${U}', 'student', 'u1'), ('${T}', 'teacher', 'Frau Keller');
    insert into public.classes (id, teacher_id, name, join_code) values ('00000000-0000-4000-8000-0000000000c1', '${T}', '4a', 'ABCD2345');
    insert into public.class_invitations (class_id, token, expires_at) values ('00000000-0000-4000-8000-0000000000c1', 'tokentokentokentokentoken', now() + interval '1 day'), ('00000000-0000-4000-8000-0000000000c1', 'revokedrevokedrevokedrevoked', now() + interval '1 day');
    update public.class_invitations set revoked = true where token like 'revoked%';
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261109010000_student_onboarding.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261109010000_student_onboarding.sql", import.meta.url), "utf8")); // idempotent
  const asUser = async (id) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]); await db.exec("set role authenticated"); };

  await asUser(U);
  await db.query("select public.student_onboarding_save('Lena', 'M.', '9. Klasse – Sek A / Bezirk', array['Koch','koch','Maurer:in'], 'zh', 'Winterthur', 2027, true)");
  await db.exec("reset role");
  const p = (await db.query("select * from public.profiles where user_id = $1", [U])).rows[0];
  assert.equal(p.first_name, "Lena"); assert.equal(p.email, "s@x.ch"); assert.equal(p.location, "Winterthur"); assert.equal(p.canton, "ZH");
  assert.deepEqual(p.desired_professions, ["Koch", "Maurer:in"]); assert.equal(p.display_name, "Lena M."); assert.ok(p.onboarding_completed_at);
  assert.equal((await db.query("select display_name from public.user_roles where user_id = $1", [U])).rows[0].display_name, "Lena M.");

  // second save keeps unrelated answers
  await asUser(U);
  await db.query("select public.student_onboarding_save(null, null, null, null, null, null, null, false)");
  await db.exec("reset role");
  assert.equal((await db.query("select canton from public.profiles where user_id = $1", [U])).rows[0].canton, "ZH");

  // teachers' names are never touched by the student RPC
  await asUser(T);
  await db.query("select public.student_onboarding_save('Hacker', '', null, null, null, null, null, true)");
  await db.exec("reset role");
  assert.equal((await db.query("select display_name from public.user_roles where user_id = $1", [T])).rows[0].display_name, "Frau Keller");

  // invite_context: anonymous, exact two columns, nothing for invalid/revoked/archived
  await db.exec("reset role"); await db.exec("set role anon");
  const ok = await db.query("select * from public.invite_context('abcd2345')");
  assert.deepEqual(ok.fields.map((f) => f.name), ["teacher_name", "class_name"]);
  assert.deepEqual(ok.rows, [{ teacher_name: "Frau Keller", class_name: "4a" }]);
  assert.equal((await db.query("select * from public.invite_context('tokentokentokentokentoken')")).rows.length, 1);
  assert.equal((await db.query("select * from public.invite_context('revokedrevokedrevokedrevoked')")).rows.length, 0);
  assert.equal((await db.query("select * from public.invite_context('ZZZZZZZZ')")).rows.length, 0);
  assert.equal((await db.query("select * from public.invite_context('')")).rows.length, 0);
  await assert.rejects(() => db.query("select public.student_onboarding_save('x')"));
  await db.exec("reset role");
  await db.exec("update public.classes set archived = true");
  await db.exec("set role anon");
  assert.equal((await db.query("select * from public.invite_context('ABCD2345')")).rows.length, 0);
});
