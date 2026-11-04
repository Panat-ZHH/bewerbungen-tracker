import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const ids = { t1: "00000000-0000-4000-8000-0000000000a1", t2: "00000000-0000-4000-8000-0000000000a2", s1: "00000000-0000-4000-8000-0000000000b1", s2: "00000000-0000-4000-8000-0000000000b2", s3: "00000000-0000-4000-8000-0000000000b3" };

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
  await database.query(`insert into auth.users values
    ($1,'t1@school.de','{"full_name":"Lehrer Eins","role":"teacher"}'), ($2,'t2@school.de','{"full_name":"Lehrer Zwei","role":"teacher"}'),
    ($3,'s1@x.de','{"full_name":"Schueler A"}'), ($4,'s2@x.de','{"full_name":"Schueler B"}'), ($5,'s3@x.de','{}')`, [ids.t1, ids.t2, ids.s1, ids.s2, ids.s3]);
  await database.query(`insert into public.applications (id,user_id,company,position,location,category,status,deadline,applied_at,created_at,updated_at,notes,salary_min,job_description)
    values ('a1',$1,'Alpha AG','Dev','Berlin','software','applied',null,current_date - 3,current_date - 3,current_date - 3,'geheime Notiz',70000,'desc'),
           ('a2',$1,'Beta GmbH','Sales','Hamburg','sales','saved',current_date + 5,null,current_date - 40,current_date - 40,null,null,null),
           ('b1',$2,'Gamma SE','Fin','Köln','finance','interview',null,current_date - 20,current_date - 20,current_date - 20,null,null,null)`, [ids.s1, ids.s2]);
  const as = async (user) => { await database.exec("reset role"); await database.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]); await database.exec("set role authenticated"); };
  const rpc = async (sql, params) => (await database.query(sql, params)).rows;
  return { database, as, rpc };
}

async function twoClasses({ as, rpc }) {
  await as(ids.t1);
  const [classA] = await rpc("select * from public.class_create('10a', '2026/27')");
  await as(ids.t2);
  const [classB] = await rpc("select * from public.class_create('10b', '2026/27')");
  await as(ids.s1); await rpc("select * from public.class_join($1)", [classA.join_code]);
  await as(ids.s2); await rpc("select * from public.class_join($1)", [classB.join_code.toLowerCase()]);
  return { classA, classB };
}

test("only teachers can create classes and call teacher RPCs", async () => {
  const { database, as, rpc } = await setup();
  const { classA } = await twoClasses({ as, rpc });
  assert.equal(classA.join_code.length, 8);
  for (const student of [ids.s1, ids.s3]) {
    await as(student);
    await assert.rejects(database.query("select * from public.class_create('X')"), /FORBIDDEN/);
    await assert.rejects(database.query("select * from public.class_list_mine()"), /FORBIDDEN/);
    await assert.rejects(database.query("select * from public.class_members($1)", [classA.id]), /FORBIDDEN/);
    await assert.rejects(database.query("select * from public.class_overview($1)", [classA.id]), /FORBIDDEN/);
    await assert.rejects(database.query("select * from public.class_student_applications($1,$2)", [classA.id, ids.s1]), /FORBIDDEN/);
  }
  await as(ids.t1);
  await assert.rejects(database.query("select * from public.class_join($1)", [classA.join_code]), /FORBIDDEN/);
  await assert.rejects(database.query("select * from public.class_create('   ')"), /INVALID_NAME/);
  await as(null);
  await assert.rejects(database.query("select * from public.class_list_mine()"), /AUTH_REQUIRED/);
  await as(ids.s1);
  await assert.rejects(database.query("select * from public.class_join('NOPE1234')"), /CLASS_NOT_FOUND/);
  await assert.rejects(database.query("select * from public.class_join('')"), /CLASS_NOT_FOUND/);
});

test("a teacher cannot see another teacher's class", async () => {
  const { database, as, rpc } = await setup();
  const { classA, classB } = await twoClasses({ as, rpc });
  await as(ids.t1);
  assert.deepEqual((await rpc("select * from public.class_list_mine()")).map((c) => [c.id, c.member_count]), [[classA.id, 1]]);
  await assert.rejects(database.query("select * from public.class_members($1)", [classB.id]), /FORBIDDEN/);
  await assert.rejects(database.query("select * from public.class_overview($1)", [classB.id]), /FORBIDDEN/);
  await assert.rejects(database.query("select * from public.class_student_applications($1,$2)", [classB.id, ids.s2]), /FORBIDDEN/);
  // student of class B is not reachable through class A
  await assert.rejects(database.query("select * from public.class_student_applications($1,$2)", [classA.id, ids.s2]), /NOT_FOUND/);
  assert.equal((await rpc("select * from public.classes")).length, 1);
  assert.equal((await rpc("select * from public.class_members")).length, 0);
});

test("overview and application list expose only the allowed fields", async () => {
  const { as, rpc } = await setup();
  const { classA } = await twoClasses({ as, rpc });
  await as(ids.t1);
  const [row] = await rpc("select * from public.class_overview($1)", [classA.id]);
  assert.equal(row.display_name, "Schueler A");
  assert.equal(row.hidden, false);
  assert.equal(row.total, 2);
  assert.deepEqual(row.status_counts, { applied: 1, saved: 1 });
  assert.deepEqual([row.last_7_days, row.last_30_days], [1, 1]);
  assert.deepEqual([row.latest_company, row.latest_position, row.latest_status], ["Alpha AG", "Dev", "applied"]);
  assert.equal(row.upcoming_deadlines.length, 1);
  assert.equal(row.upcoming_deadlines[0].company, "Beta GmbH");
  const apps = await rpc("select * from public.class_student_applications($1,$2)", [classA.id, ids.s1]);
  assert.equal(apps.length, 2);
  const text = JSON.stringify(apps);
  for (const secret of ["geheime", "70000", "desc"]) assert.equal(text.includes(secret), false);
  assert.deepEqual(Object.keys(apps[0]).sort(), ["applied_at", "category", "company", "created_at", "deadline", "hidden", "id", "location", "position", "status", "updated_at"]);
  assert.equal(apps[0].hidden, false);
  const [member] = await rpc("select * from public.class_members($1)", [classA.id]);
  assert.equal(member.hidden, false);
});

test("students who stop sharing stay hidden; consent can be toggled and revoked by leaving", async () => {
  const { database, as, rpc } = await setup();
  const { classA } = await twoClasses({ as, rpc });
  await as(ids.s1);
  const [mine] = await rpc("select * from public.class_my_classes()");
  assert.deepEqual([mine.share_applications, mine.teacher_name, mine.name], [true, "Lehrer Eins", "10a"]);
  await rpc("select public.class_set_sharing($1, false)", [classA.id]);
  await assert.rejects(database.query("select public.class_set_sharing($1, null)", [classA.id]), /INVALID_REQUEST/);
  await as(ids.t1);
  const [row] = await rpc("select * from public.class_overview($1)", [classA.id]);
  assert.deepEqual([row.hidden, row.total, row.last_7_days, row.latest_company, row.upcoming_deadlines, row.status_counts], [true, 0, 0, null, [], {}]);
  assert.equal(JSON.stringify(row).includes("Alpha"), false);
  assert.equal((await rpc("select * from public.class_members($1)", [classA.id]))[0].hidden, true);
  const apps = await rpc("select * from public.class_student_applications($1,$2)", [classA.id, ids.s1]);
  assert.equal(apps.length, 1);
  assert.deepEqual([apps[0].hidden, apps[0].company, apps[0].id], [true, null, null]);
  await as(ids.s1);
  await rpc("select public.class_set_sharing($1, true)", [classA.id]);
  await as(ids.t1);
  assert.equal((await rpc("select * from public.class_student_applications($1,$2)", [classA.id, ids.s1])).length, 2);
  // leave
  await as(ids.s1);
  await rpc("select public.class_leave($1)", [classA.id]);
  await assert.rejects(database.query("select public.class_leave($1)", [classA.id]), /NOT_FOUND/);
  assert.equal((await rpc("select * from public.class_my_classes()")).length, 0);
  await as(ids.t1);
  await assert.rejects(database.query("select * from public.class_student_applications($1,$2)", [classA.id, ids.s1]), /NOT_FOUND/);
  assert.equal((await rpc("select * from public.class_overview($1)", [classA.id])).length, 0);
});

test("joining twice is idempotent and keeps the consent choice; students cannot write tables", async () => {
  const { database, as, rpc } = await setup();
  const { classA } = await twoClasses({ as, rpc });
  await as(ids.s1);
  await rpc("select public.class_set_sharing($1, false)", [classA.id]);
  const [again] = await rpc("select * from public.class_join($1)", [classA.join_code]);
  assert.equal(again.share_applications, false);
  await assert.rejects(database.query("insert into public.class_members (class_id, student_id) values ($1, $2)", [classA.id, ids.s3]), /permission denied/);
  await assert.rejects(database.query("update public.class_members set share_applications = true"), /permission denied/);
});

async function migrate(database) { await database.exec(await readFile(new URL("../supabase/migrations/20261104000000_class_management.sql", import.meta.url), "utf8")); }

test("migrations/ copies of schema.sql and social.sql stay identical to the originals", async () => {
  for (const [a, b] of [["schema.sql", "migrations/20260101000000_schema.sql"], ["social.sql", "migrations/20260101000001_social.sql"]]) {
    assert.equal(await readFile(new URL(`../supabase/${a}`, import.meta.url), "utf8"), await readFile(new URL(`../supabase/${b}`, import.meta.url), "utf8"));
  }
});

test("class_preview shows only class name, year and teacher before joining", async () => {
  const { database, as, rpc } = await setup(); await migrate(database);
  await as(ids.t1);
  const [cls] = await rpc("select * from public.class_create('10a', '2026/27')");
  await as(ids.s3);
  const [p] = await rpc("select * from public.class_preview($1)", [cls.join_code.toLowerCase()]);
  assert.deepEqual([p.name, p.school_year, p.teacher_name, p.member_count, p.already_member], ["10a", "2026/27", "Lehrer Eins", 0, false]);
  assert.deepEqual(Object.keys(p).sort(), ["already_member", "class_id", "member_count", "name", "school_year", "teacher_name"]);
  await rpc("select * from public.class_join($1)", [cls.join_code]);
  assert.equal((await rpc("select * from public.class_preview($1)", [cls.join_code]))[0].already_member, true);
  await assert.rejects(database.query("select * from public.class_preview('ZZZZZZZZ')"), /CLASS_NOT_FOUND/);
  await as(null);
  await assert.rejects(database.query("select * from public.class_preview($1)", [cls.join_code]), /AUTH_REQUIRED/);
});

test("teachers manage only their own classes: rename, remove student, regenerate code, delete", async () => {
  const { database, as, rpc } = await setup(); await migrate(database);
  const { classA, classB } = await twoClasses({ as, rpc });
  await as(ids.t1);
  await rpc("select public.class_rename($1, '  11a  ', '2027/28')", [classA.id]);
  assert.deepEqual((await rpc("select name, school_year from public.class_list_mine()")).map((r) => [r.name, r.school_year]), [["11a", "2027/28"]]);
  await rpc("select public.class_rename($1, '11b', null)", [classA.id]);
  assert.equal((await rpc("select school_year from public.class_list_mine()"))[0].school_year, "2027/28");
  await assert.rejects(database.query("select public.class_rename($1, '   ')", [classA.id]), /INVALID_NAME/);
  // foreign class and students are untouchable
  await assert.rejects(database.query("select public.class_rename($1, 'x')", [classB.id]), /FORBIDDEN/);
  await assert.rejects(database.query("select public.class_delete($1)", [classB.id]), /FORBIDDEN/);
  await assert.rejects(database.query("select public.class_regenerate_code($1)", [classB.id]), /FORBIDDEN/);
  await assert.rejects(database.query("select public.class_remove_student($1,$2)", [classB.id, ids.s2]), /FORBIDDEN/);
  await assert.rejects(database.query("select public.class_remove_student($1,$2)", [classA.id, ids.s2]), /NOT_FOUND/);
  // students cannot use teacher management
  await as(ids.s1);
  for (const sql of ["select public.class_delete($1)", "select public.class_regenerate_code($1)", "select public.class_rename($1,'x')"]) await assert.rejects(database.query(sql, [classA.id]), /FORBIDDEN/);
  // regenerate: old code dead, new works, members stay
  await as(ids.t1);
  const [{ class_regenerate_code: fresh }] = await rpc("select public.class_regenerate_code($1)", [classA.id]);
  assert.notEqual(fresh, classA.join_code); assert.equal(fresh.length, 8);
  await as(ids.s3);
  await assert.rejects(database.query("select * from public.class_join($1)", [classA.join_code]), /CLASS_NOT_FOUND/);
  await rpc("select * from public.class_join($1)", [fresh]);
  await as(ids.t1);
  assert.equal((await rpc("select * from public.class_members($1)", [classA.id])).length, 2);
  // remove a student: data access ends immediately
  await rpc("select public.class_remove_student($1,$2)", [classA.id, ids.s1]);
  await assert.rejects(database.query("select * from public.class_student_applications($1,$2)", [classA.id, ids.s1]), /NOT_FOUND/);
  assert.equal((await rpc("select * from public.class_members($1)", [classA.id])).length, 1);
  // delete
  await rpc("select public.class_delete($1)", [classA.id]);
  assert.equal((await rpc("select * from public.class_list_mine()")).length, 0);
  await as(ids.s3);
  assert.equal((await rpc("select * from public.class_my_classes()")).length, 0);
});
