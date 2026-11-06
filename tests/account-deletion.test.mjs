import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { loadLib } from "./helpers/load-lib.mjs";

const lib = await loadLib("account-deletion");
const server = await loadLib("account-delete-server");
const dir = new URL("../supabase/migrations/", import.meta.url);

const jwt = (payload) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
const NOW = 1_800_000_000_000;

test("confirmation: LÖSCHEN (any case, trimmed) or the e-mail", () => {
  assert.ok(lib.confirmationMatches("LÖSCHEN"));
  assert.ok(lib.confirmationMatches("  löschen "));
  assert.ok(lib.confirmationMatches("loeschen"));
  assert.ok(lib.confirmationMatches("Anna@Example.ch", "anna@example.ch"));
  assert.ok(!lib.confirmationMatches("", "anna@example.ch"));
  assert.ok(!lib.confirmationMatches("lösche", "anna@example.ch"));
  assert.ok(!lib.confirmationMatches("other@example.ch", "anna@example.ch"));
  assert.ok(!lib.confirmationMatches("x", null));
});

test("fresh sign-in is read from the JWT amr claim", () => {
  const at = (secondsAgo) => jwt({ amr: [{ method: "password", timestamp: NOW / 1000 - secondsAgo }] });
  assert.equal(lib.secondsSinceSignIn(at(30), NOW), 30);
  assert.ok(lib.isFreshSignIn(at(30), NOW));
  assert.ok(lib.isFreshSignIn(at(300), NOW));
  assert.ok(!lib.isFreshSignIn(at(301), NOW));
  assert.ok(!lib.isFreshSignIn(at(86400), NOW));
  // the newest entry counts (e.g. old password login + fresh Google login)
  assert.ok(lib.isFreshSignIn(jwt({ amr: [{ method: "password", timestamp: 1 }, { method: "oauth", timestamp: NOW / 1000 - 5 }] }), NOW));
  // fail closed
  assert.ok(!lib.isFreshSignIn(jwt({}), NOW));
  assert.ok(!lib.isFreshSignIn(jwt({ amr: [] }), NOW));
  assert.ok(!lib.isFreshSignIn("garbage", NOW));
  assert.ok(!lib.isFreshSignIn(jwt({ amr: [{ method: "password" }] }), NOW));
});

test("dialog texts mention everything that is deleted, teachers get a class warning", () => {
  const text = lib.deletionItems(null).join(" | ");
  for (const word of ["Bewerbungen", "Notizen", "Dokumente", "Dateien", "Profil", "Suchen", "Freundschaften", "Anmeldung"]) assert.match(text, new RegExp(word), word);
  const s = { role: "teacher", applications: 1, documents: 2, friends: 3, classes_joined: 1, classes_owned: 2, students_in_owned_classes: 5 };
  const items = lib.deletionItems(s).join(" | ");
  assert.match(items, /1 Bewerbung samt/); assert.match(items, /2 Dokumente/); assert.match(items, /Klassenmitgliedschaften/);
  assert.match(lib.teacherWarning(s), /2 Klassen mit 5 Schüler:innen/);
  assert.equal(lib.teacherWarning({ ...s, classes_owned: 0 }), null);
  assert.equal(lib.teacherWarning(null), null);
});

// ---- server deletion order and storage walk against a fake client ----
function fakeAdmin({ tree, cvPaths = [], failRemove = false, failDelete = false }) {
  const calls = [];
  const removed = [];
  const admin = {
    rpc: async (name) => { calls.push(`rpc:${name}`); return { data: name === "account_delete_prepare" ? { classes_transferred: 1, classes_deleted: 2 } : {}, error: null }; },
    auth: { admin: { deleteUser: async () => { calls.push("deleteUser"); return { error: failDelete ? { message: "boom" } : null }; } } },
    from: () => ({ select: () => ({ eq: async () => ({ data: cvPaths.map((p) => ({ storage_path: p })) }) }) }),
    storage: { from: (bucket) => ({
      list: async (prefix, { limit, offset }) => { const all = tree[bucket]?.[prefix] ?? []; return { data: all.slice(offset, offset + limit), error: null }; },
      remove: async (paths) => { calls.push(`remove:${bucket}`); if (failRemove) return { error: { message: "nope" } }; removed.push(...paths.map((p) => `${bucket}/${p}`)); return { error: null }; },
    }) },
  };
  return { admin, calls, removed };
}

test("storage: walks nested folders, adds recorded paths, removes before the auth user is deleted", async () => {
  const tree = { cvs: { U: [{ name: "cv1", id: null }, { name: "root.pdf", id: "x" }], "U/cv1": [{ name: "a.pdf", id: "y" }] }, avatars: { U: [{ name: "avatar.webp", id: "z" }] } };
  const { admin, calls, removed } = fakeAdmin({ tree, cvPaths: ["U/cv1/a.pdf", "U/orphan/b.pdf"] });
  const result = await server.deleteAccount(admin, "U");
  assert.deepEqual(removed.sort(), ["avatars/U/avatar.webp", "cvs/U/cv1/a.pdf", "cvs/U/orphan/b.pdf", "cvs/U/root.pdf"]);
  assert.equal(result.files, 4);
  assert.deepEqual([result.classesTransferred, result.classesDeleted], [1, 2]);
  assert.ok(calls.indexOf("rpc:account_delete_prepare") < calls.indexOf("remove:cvs"));
  assert.ok(calls.indexOf("remove:avatars") < calls.indexOf("deleteUser"), "files must go before the auth user");
});

test("storage: paginates folders with more than 100 entries", async () => {
  const many = Array.from({ length: 230 }, (_, i) => ({ name: `f${i}`, id: String(i) }));
  const { admin, removed } = fakeAdmin({ tree: { cvs: { U: many }, avatars: {} } });
  await server.deleteAccount(admin, "U");
  assert.equal(removed.length, 230);
});

test("a storage failure aborts before the account is deleted (nothing half-lost, retry possible)", async () => {
  const { admin, calls } = fakeAdmin({ tree: { cvs: { U: [{ name: "a", id: "1" }] }, avatars: {} }, failRemove: true });
  await assert.rejects(() => server.deleteAccount(admin, "U"), /STORAGE_REMOVE_FAILED/);
  assert.ok(!calls.includes("deleteUser"));
});

test("an auth failure is reported", async () => {
  const { admin } = fakeAdmin({ tree: { cvs: {}, avatars: {} }, failDelete: true });
  await assert.rejects(() => server.deleteAccount(admin, "U"), /AUTH_DELETE_FAILED/);
});

test("the service role key never reaches client code", async () => {
  const { readdir: ls, readFile: rf } = await import("node:fs/promises");
  const walk = async (d) => (await Promise.all((await ls(d, { withFileTypes: true })).flatMap(async (e) => {
    if (["node_modules", ".next", ".git"].includes(e.name)) return [];
    const p = new URL(e.name + (e.isDirectory() ? "/" : ""), d);
    return e.isDirectory() ? walk(p) : [p];
  }))).flat();
  for (const root of ["../app/", "../components/", "../lib/"]) {
    for (const file of await walk(new URL(root, import.meta.url))) {
      if (!/\.(tsx?|mjs)$/.test(file.pathname)) continue;
      const src = await rf(file, "utf8");
      if (!src.includes("SERVICE_ROLE")) continue;
      assert.match(file.pathname, /(app\/api\/account\/delete\/route|lib\/reminders-server)\.ts$/, `SERVICE_ROLE referenced in ${file.pathname}`);
      assert.ok(!/^["']use client["']/m.test(src));
    }
  }
  const route = await rf(new URL("../app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.ok(!route.includes("NEXT_PUBLIC_SUPABASE_SERVICE"));
});

// ---- SQL: nothing is left behind ----
const U = { student: "00000000-0000-4000-8000-0000000000a1", friend: "00000000-0000-4000-8000-0000000000a2", teacher: "00000000-0000-4000-8000-0000000000b1", co: "00000000-0000-4000-8000-0000000000b2", other: "00000000-0000-4000-8000-0000000000c3" };

async function migrated(extra = "") {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $a$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $a$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $s$ select string_to_array($1, '/') $s$;
    grant usage on schema auth to authenticated;
  `);
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) {
    if (extra && f.startsWith("99")) continue;
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  }
  if (extra) await db.exec(extra);
  return db;
}
const as = async (db, user) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]); await db.exec("set role authenticated"); };

async function seed(db) {
  await db.exec("reset role");
  for (const [k, id] of Object.entries(U)) await db.query("insert into auth.users(id,email) values ($1,$2)", [id, `${k}@example.test`]);
  // signup triggers already created user_roles and the default CVs
  await db.query("update public.user_roles set role='teacher' where user_id in ($1,$2)", [U.teacher, U.co]);
  await db.query("insert into public.applications(id,user_id,company,position,category,status,created_at,updated_at) values ('a1',$1,'Acme','Dev','IT','applied',now(),now()),('a2',$1,'Beta','Dev','IT','applied',now(),now()),('o1',$2,'Other','Dev','IT','applied',now(),now())", [U.student, U.other]);
  await db.query("insert into public.profiles(id,user_id,first_name,last_name,email) values ('p1',$1,'a','b','c')", [U.student]);
  await db.query("insert into public.cvs(id,user_id,name,type,description,updated_at,status,storage_path) values ('c1',$1,'CV','Standard','d',now(),'Ready','x/y')", [U.student]);
  await db.query("insert into public.friendships(requester_id,addressee_id,status) values ($1,$2,'accepted'),($3,$1,'pending')", [U.student, U.friend, U.other]);
  await db.query("insert into public.classes(id,teacher_id,name,join_code) values ('10000000-0000-4000-8000-000000000001',$1,'8a','CODE1'),('10000000-0000-4000-8000-000000000002',$2,'9b','CODE2')", [U.teacher, U.co]);
  await db.query("insert into public.class_members(class_id,student_id) values ('10000000-0000-4000-8000-000000000001',$1),('10000000-0000-4000-8000-000000000001',$2),('10000000-0000-4000-8000-000000000002',$1)", [U.student, U.other]);
}
const report = async (db, id) => (await db.query("select public.account_data_report($1) as r", [id])).rows[0].r;

test("migration: every foreign key to auth.users cascades or nulls", async () => {
  const db = await migrated();
  const bad = (await db.query(`select c.conrelid::regclass::text t, c.conname from pg_constraint c where c.contype='f' and c.confrelid='auth.users'::regclass and c.confdeltype not in ('c','n')`)).rows;
  assert.deepEqual(bad, []);
});

test("migration: a non-cascading FK added later (teacher tables) is repaired by re-running the migration", async () => {
  const db = await migrated(`create table public.class_announcements (id serial primary key, author_id uuid not null references auth.users(id), created_by uuid references auth.users(id)); alter table public.class_announcements enable row level security;`);
  await db.exec(await readFile(new URL("20261108000000_account_deletion.sql", dir), "utf8"));
  const rows = (await db.query(`select a.attname, c.confdeltype from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.conrelid='public.class_announcements'::regclass and c.contype='f'`)).rows;
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.attname, r.confdeltype])), { author_id: "c", created_by: "n" });
});

test("SQL: deleting a student leaves no rows; other users, friends, teachers and their classes are untouched", async () => {
  const db = await migrated();
  await seed(db);
  assert.ok(Object.keys(await report(db, U.student)).length >= 5);
  await db.query("select public.account_delete_prepare($1)", [U.student]);
  await db.query("delete from auth.users where id=$1", [U.student]);
  assert.deepEqual(await report(db, U.student), {});
  const q = async (sql) => Number((await db.query(sql)).rows[0].n);
  assert.equal(await q("select count(*) n from public.applications where id in ('a1','a2')"), 0);
  assert.equal(await q("select count(*) n from public.cvs where id='c1'"), 0);
  assert.equal(await q("select count(*) n from public.friendships where requester_id='" + U.student + "' or addressee_id='" + U.student + "'"), 0);
  assert.equal(await q("select count(*) n from public.class_members where student_id='" + U.student + "'"), 0);
  // untouched
  assert.equal(await q("select count(*) n from public.applications where id='o1'"), 1);
  assert.equal(await q("select count(*) n from public.classes"), 2);
  assert.equal(await q("select count(*) n from public.class_members where student_id='" + U.other + "'"), 1);
  assert.equal(await q("select count(*) n from auth.users"), 4);
  // the friend no longer sees the student (RLS as the friend)
  await as(db, U.friend);
  assert.equal(await q("select count(*) n from public.friendships"), 0);
});

test("SQL: deleting a teacher removes the class, students keep their own data", async () => {
  const db = await migrated();
  await seed(db);
  const prep = (await db.query("select public.account_delete_prepare($1) r", [U.teacher])).rows[0].r;
  assert.deepEqual(prep, { classes_transferred: 0, classes_deleted: 1 });
  await db.query("delete from auth.users where id=$1", [U.teacher]);
  assert.deepEqual(await report(db, U.teacher), {});
  const q = async (sql) => Number((await db.query(sql)).rows[0].n);
  assert.equal(await q("select count(*) n from public.classes where id='10000000-0000-4000-8000-000000000001'"), 0);
  assert.equal(await q("select count(*) n from public.class_members where class_id='10000000-0000-4000-8000-000000000001'"), 0);
  assert.equal(await q("select count(*) n from public.applications where user_id='" + U.student + "'"), 2, "students keep their applications");
  assert.equal(await q("select count(*) n from public.class_members where class_id='10000000-0000-4000-8000-000000000002'"), 1, "the other teacher's class is untouched");
});

test("SQL: a class with a co-teacher is handed over instead of deleted", async () => {
  const db = await migrated(`create table public.class_teachers (class_id uuid references public.classes(id) on delete cascade, teacher_id uuid references auth.users(id) on delete cascade, added_at timestamptz default now(), primary key (class_id, teacher_id)); alter table public.class_teachers enable row level security;`);
  await seed(db);
  await db.query("insert into public.class_teachers(class_id, teacher_id) values ('10000000-0000-4000-8000-000000000001', $1)", [U.co]);
  const prep = (await db.query("select public.account_delete_prepare($1) r", [U.teacher])).rows[0].r;
  assert.deepEqual(prep, { classes_transferred: 1, classes_deleted: 0 });
  await db.query("delete from auth.users where id=$1", [U.teacher]);
  const row = (await db.query("select teacher_id from public.classes where id='10000000-0000-4000-8000-000000000001'")).rows[0];
  assert.equal(row.teacher_id, U.co);
  assert.equal(Number((await db.query("select count(*) n from public.class_members where class_id='10000000-0000-4000-8000-000000000001'")).rows[0].n), 2, "students stay in the class");
  assert.deepEqual(await report(db, U.teacher), {});
});

test("SQL: account_delete_summary counts only the caller's data; admin functions are not callable by users", async () => {
  const db = await migrated();
  await seed(db);
  await as(db, U.student);
  const s = (await db.query("select public.account_delete_summary() s")).rows[0].s;
  const docs = Number((await db.query("select count(*) n from public.cvs where user_id=$1", [U.student])).rows[0].n);
  assert.ok(docs >= 1);
  assert.deepEqual(s, { role: "student", applications: 2, documents: docs, friends: 2, classes_joined: 2, classes_owned: 0, students_in_owned_classes: 0 });
  await as(db, U.teacher);
  const t = (await db.query("select public.account_delete_summary() s")).rows[0].s;
  assert.equal(t.classes_owned, 1); assert.equal(t.students_in_owned_classes, 2);
  await assert.rejects(() => db.query("select public.account_delete_prepare($1)", [U.student]), /permission denied/);
  await assert.rejects(() => db.query("select public.account_data_report($1)", [U.student]), /permission denied/);
  await as(db, null);
  await assert.rejects(() => db.query("select public.account_delete_summary()"), /FORBIDDEN/);
});
