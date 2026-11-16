// Family / private accounts (supabase/migrations/20261116140000_family_accounts.sql): account types, families, invites,
// consent for under-16s, share settings, seat limits, family plans in school_licences, waitlist, RLS between two families,
// export and deletion. Runs every migration in order on PGlite (seeded school class "10a" from the teacher helper).
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { setupTeacherDb, ids as S } from "./helpers/teacher-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = { parentA: id(901), childA: id(902), parentB: id(903), childB: id(904), teen2: id(905), coParent: id(906), outsider: id(907), kid3: id(908) };
const YEAR = new Date().getFullYear();

let ctx;
const svc = async (sql, params) => { await ctx.as(null); return ctx.admin(sql, params); };
const one = async (user, sql, params) => { await ctx.as(user); return (await ctx.rpc(sql, params))[0]; };
const val = async (user, sql, params) => Object.values(await one(user, sql, params))[0];
const fails = async (user, sql, params) => { await ctx.as(user); return ctx.code(ctx.rpc(sql, params)); };
const fullErr = async (user, sql, params) => { await ctx.as(user); try { await ctx.rpc(sql, params); return null; } catch (e) { return e; } };

let famA, famB;

before(async () => {
  ctx = await setupTeacherDb({ seed: true });
  const rows = Object.entries(U).map(([k, v]) => `('${v}','${k.toLowerCase()}@fam.ch','${JSON.stringify({ full_name: k })}')`);
  await ctx.admin(`insert into auth.users values ${rows.join(",")}`);
  await ctx.admin(`insert into public.applications (id,user_id,company,position,location,category,status,created_at,updated_at,notes,salary_min,job_url)
    values ('ca1',$1,'Kinder AG','Informatiker','Zürich','software','applied',current_date,current_date,'GEHEIME NOTIZ',99999,'https://secret.example/job'),
           ('ca2',$1,'Zweite GmbH','Mediamatiker','Bern','software','offer',current_date,current_date,'GEHEIME NOTIZ',99999,'https://secret.example/job')`, [U.childA]);
  await ctx.admin(`insert into public.cvs (id,user_id,name,type,description,updated_at,status,storage_path) values ('cvA',$1,'Lebenslauf','cv','x',current_date,'ready','secret/path.pdf')`, [U.childA]);
});

test("schema: tables with RLS, profiles columns, family plan columns on school_licences", async () => {
  const tables = (await ctx.admin("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relrowsecurity")).map((r) => r.relname);
  for (const t of ["families", "family_members", "family_invites", "waitlist_requests"]) assert.ok(tables.includes(t), t);
  const cols = (await ctx.admin("select column_name from information_schema.columns where table_name='school_licences'")).map((r) => r.column_name);
  for (const c of ["family_id", "plan_type", "seats_parents", "seats_children", "trial_ends_at", "assigned_by", "external_ref"]) assert.ok(cols.includes(c), c);
  const anon = (await ctx.admin(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'
    and relname in ('families','family_members','family_invites','waitlist_requests') and has_table_privilege('anon', c.oid, 'select')`));
  assert.deepEqual(anon, []);
});

test("profiles: direct table writes cannot set account_type / birth_year; class members are school students", async () => {
  await ctx.as(S.s1);
  await ctx.rpc(`insert into public.profiles (id,user_id,first_name,last_name,email,account_type,birth_year) values ('p-s1',$1,'A','B','s1@x.de','parent',1950)`, [S.s1]);
  let p = (await ctx.rpc("select account_type, birth_year from public.profiles where user_id=$1", [S.s1]))[0];
  assert.deepEqual(p, { account_type: "school_student", birth_year: null });
  await ctx.rpc("update public.profiles set account_type='parent', birth_year=1950, first_name='Anna' where user_id=$1", [S.s1]);
  p = (await ctx.rpc("select account_type, birth_year, first_name from public.profiles where user_id=$1", [S.s1]))[0];
  assert.deepEqual(p, { account_type: "school_student", birth_year: null, first_name: "Anna" }, "other columns still editable");
  assert.match(await fails(S.s1, "select public.account_set_type('parent')"), /FORBIDDEN/, "class members stay school students");
  assert.match(await fails(S.s1, "select public.account_set_type('independent_student')"), /FORBIDDEN/);
  const r = await val(S.s1, "select public.account_set_type('school_student', $1)", [YEAR - 17]);
  assert.equal(r.needs_parental_consent, false);
});

test("account_set_type: parents, independent students, validation", async () => {
  assert.deepEqual(await val(U.parentA, "select public.account_set_type('parent')"), { account_type: "parent", birth_year: null, needs_parental_consent: false });
  for (const u of [U.parentB, U.coParent]) await val(u, "select public.account_set_type('parent')");
  const c = await val(U.childA, "select public.account_set_type('independent_student', $1)", [YEAR - 13]);
  assert.equal(c.needs_parental_consent, true);
  assert.equal((await val(U.childB, "select public.account_set_type('independent_student', $1)", [YEAR - 18])).needs_parental_consent, false);
  await val(U.teen2, "select public.account_set_type('independent_student', $1)", [YEAR - 15]);
  await val(U.kid3, "select public.account_set_type('independent_student', $1)", [YEAR - 12]);
  assert.match(await fails(U.outsider, "select public.account_set_type('school_student')"), /INVALID_ACCOUNT_TYPE/);
  assert.match(await fails(U.outsider, "select public.account_set_type('admin')"), /INVALID_ACCOUNT_TYPE/);
  assert.match(await fails(U.outsider, "select public.account_set_type('independent_student', 1800)"), /INVALID_BIRTH_YEAR/);
  // exactly 16 this year still counts as "under 16" (only the year is stored -> conservative)
  assert.equal((await val(U.outsider, "select public.account_set_type('independent_student', $1)", [YEAR - 16])).needs_parental_consent, true);
  await ctx.as(null);
  assert.ok(await ctx.code(ctx.rpc("select public.account_set_type('parent')")), "anonymous refused");
});

test("family_create: parents only, one family per person", async () => {
  assert.match(await fails(U.childA, "select public.family_create('X')"), /NOT_A_PARENT/);
  famA = await val(U.parentA, "select public.family_create('Familie A')");
  famB = await val(U.parentB, "select public.family_create(null)");
  assert.match(await fails(U.parentA, "select public.family_create('again')"), /ALREADY_IN_FAMILY/);
  const my = await val(U.parentA, "select public.family_get_my()");
  assert.equal(my.family.name, "Familie A");
  assert.equal(my.my_role, "parent");
  assert.equal(my.plan, null);
  assert.equal((await val(U.parentB, "select public.family_get_my()")).family.name, "Meine Familie");
  assert.equal(await val(U.childA, "select public.family_get_my()"), null);
});

let codeA;
test("invites + join: 8-char single-use codes, 7 days, account type checks, birth year required", async () => {
  const inv = await val(U.parentA, "select public.family_create_invite('parent_invites_child')");
  codeA = inv.code;
  assert.match(codeA, /^[A-Z0-9]{8}$/);
  const days = (new Date(inv.expires_at) - Date.now()) / 86400000;
  assert.ok(days > 6.9 && days <= 7.01, `expires in ${days}`);
  assert.match(await fails(U.childA, "select public.family_create_invite('parent_invites_child')"), /FORBIDDEN/);
  assert.match(await fails(U.coParent, "select public.family_join($1)", [codeA]), /INVITE_WRONG_ACCOUNT_TYPE/);
  assert.match(await fails(S.owner, "select public.family_join($1)", [codeA]), /INVITE_WRONG_ACCOUNT_TYPE/, "teachers cannot be children");
  await ctx.admin("update public.profiles set birth_year = null where user_id = $1", [U.outsider]);
  assert.match(await fails(U.outsider, "select public.family_join($1)", [codeA]), /BIRTH_YEAR_REQUIRED/);
  assert.match(await fails(U.childA, "select public.family_join('nope')"), /INVITE_INVALID/);
  const j = await val(U.childA, "select public.family_join($1)", [` ${codeA.toLowerCase()} `]);
  assert.deepEqual({ ...j, family_id: undefined }, { family_id: undefined, role: "child", status: "active", consent_status: "pending", family_name: "Familie A" });
  assert.equal((await val(U.childA, "select public.family_join($1)", [codeA])).role, "child", "same user again is idempotent");
  assert.match(await fails(U.teen2, "select public.family_join($1)", [codeA]), /INVITE_USED/);
  const exp = (await val(U.parentB, "select public.family_create_invite('parent_invites_child')")).code;
  await ctx.admin("update public.family_invites set expires_at = now() - interval '1 minute' where code=$1", [exp]);
  assert.match(await fails(U.teen2, "select public.family_join($1)", [exp]), /INVITE_EXPIRED/);
  const my = await val(U.parentA, "select public.family_get_my()");
  assert.deepEqual(my.members.map((m) => [m.display_name, m.role, m.consent_status, m.needs_consent, m.sharing_active]),
    [["parentA", "parent", "not_required", false, false], ["childA", "child", "pending", true, false]]);
  assert.match(await fails(U.childA, "select public.family_join($1)", [exp]), /ALREADY_IN_FAMILY|INVITE_EXPIRED/);
});

test("seat limit: 1 parent + 1 child without plan (WA010), more seats via admin plan", async () => {
  const e = await fullErr(U.parentA, "select public.family_create_invite('parent_invites_child')");
  assert.equal(e.code, "WA010");
  assert.match(e.message, /FAMILY_SEAT_LIMIT/);
  assert.match(e.detail, /1 von 1/);
  assert.match(await fails(U.childA, "select public.family_create_invite('child_invites_parent')"), /FAMILY_SEAT_LIMIT/, "parent seat taken");
  // Service role assigns a family plan with 2 child seats.
  assert.ok(await fails(U.parentA, "select public.admin_assign_family_plan($1, 'active', null, 5)", [famA]), "users cannot assign plans");
  const [{ admin_assign_family_plan: planId }] = await svc("select public.admin_assign_family_plan($1, 'trial', null, 2, 1, 'Testfamilie', 'panat')", [famA]);
  const row = (await ctx.admin("select * from public.school_licences where id=$1", [planId]))[0];
  assert.equal(row.plan_type, "family"); assert.equal(row.package, "family"); assert.equal(row.school_id, null);
  assert.equal(row.student_limit, 2); assert.equal(row.status, "trial");
  assert.ok(Math.abs((row.trial_ends_at - Date.now()) / 86400000 - 30) < 0.1, "30-day trial by default");
  const plan = (await val(U.parentA, "select public.family_get_my()")).plan;
  assert.deepEqual({ ...plan, trial_ends_at: undefined }, { plan_type: "family", status: "trial", state: "trial", seats_parents: 1, seats_children: 2,
    trial_ends_at: undefined, pilot_end: null, valid_until: null });
  assert.equal(JSON.stringify(plan).includes("Testfamilie"), false, "admin notes never reach users");
  const c2 = (await val(U.parentA, "select public.family_create_invite('parent_invites_child')")).code;
  assert.equal((await val(U.teen2, "select public.family_join($1)", [c2])).consent_status, "pending");
  assert.match(await fails(U.parentA, "select public.family_create_invite('parent_invites_child')"), /FAMILY_SEAT_LIMIT/);
  // A trial that ended still keeps its seats (no payment yet), state says expired.
  await ctx.admin("update public.school_licences set trial_ends_at = now() - interval '1 day' where id=$1", [planId]);
  assert.equal((await val(U.parentA, "select public.family_get_my()")).plan.state, "expired");
});

test("consent: under-16 child shares nothing until a parent consents; child controls each part", async () => {
  let o = await val(U.parentA, "select public.family_child_overview($1)", [U.childA]);
  assert.equal(o.sharing_active, false);
  assert.equal(o.reason, "consent_pending");
  assert.equal(o.progress, undefined); assert.equal(o.village, undefined);
  assert.match(await fails(U.childA, "select public.family_set_consent($1, true)", [U.childA]), /FORBIDDEN/, "child cannot consent for itself");
  assert.match(await fails(U.parentB, "select public.family_set_consent($1, true)", [U.childA]), /NOT_FOUND/, "other family's parent");
  const m = await val(U.parentA, "select public.family_set_consent($1, true)", [U.childA]);
  assert.equal(m.consent_status, "granted"); assert.equal(m.sharing_active, true);
  o = await val(U.parentA, "select public.family_child_overview($1)", [U.childA]);
  assert.equal(o.sharing_active, true);
  assert.deepEqual(o.shared, { progress: true, applications: false, village: true, documents: false });
  assert.equal(o.progress.applications_total, 2); assert.equal(o.progress.placed, true);
  assert.deepEqual(o.progress.status_counts, { applied: 1, offer: 1 });
  assert.equal(o.village.islands, 1);
  assert.equal(o.applications, undefined); assert.equal(o.documents, undefined);
  // child turns on the application list and documents, turns off progress
  const s = await val(U.childA, "select public.family_set_share($1::jsonb)", [JSON.stringify({ applications: true, documents: true, progress: false })]);
  assert.deepEqual(s.share_settings, { progress: false, applications: true, village: true, documents: true });
  o = await val(U.parentA, "select public.family_child_overview($1)", [U.childA]);
  assert.equal(o.progress, undefined);
  assert.deepEqual(o.applications.map((a) => a.company).sort(), ["Kinder AG", "Zweite GmbH"]);
  assert.deepEqual(o.documents.map((d) => d.name), ["Lebenslauf"]);
  const text = JSON.stringify(o);
  for (const secret of ["GEHEIME", "99999", "secret.example", "secret/path", "Zürich", "class", "10a"]) assert.ok(!text.includes(secret), secret);
  assert.match(await fails(U.childA, "select public.family_set_share($1::jsonb)", ['{"progress":"yes"}']), /INVALID_SETTINGS/);
  assert.match(await fails(U.childA, "select public.family_set_share($1::jsonb)", ['{"notes":true}']), /INVALID_SETTINGS/);
  assert.match(await fails(U.parentA, "select public.family_set_share($1::jsonb)", ['{"progress":true}']), /FORBIDDEN/);
  // withdraw -> nothing again
  await val(U.parentA, "select public.family_set_consent($1, false)", [U.childA]);
  o = await val(U.parentA, "select public.family_child_overview($1)", [U.childA]);
  assert.equal(o.sharing_active, false); assert.equal(o.reason, "consent_withdrawn"); assert.equal(o.applications, undefined);
  await val(U.parentA, "select public.family_set_consent($1, true)", [U.childA]);
  // the child can switch everything off at any time
  await val(U.childA, "select public.family_set_share($1::jsonb)", ['{"progress":false,"applications":false,"village":false,"documents":false}']);
  o = await val(U.parentA, "select public.family_child_overview($1)", [U.childA]);
  assert.deepEqual(Object.keys(o).sort(), ["child", "consent_status", "needs_consent", "shared", "sharing_active"]);
  await val(U.childA, "select public.family_set_share($1::jsonb)", ['{"progress":true,"village":true}']);
});

test("a child in a family cannot make itself older to skip consent", async () => {
  assert.match(await fails(U.childA, "select public.account_set_type('independent_student', $1)", [YEAR - 20]), /BIRTH_YEAR_LOCKED/);
  assert.equal((await val(U.childA, "select public.account_set_type('independent_student', $1)", [YEAR - 12])).birth_year, YEAR - 12, "younger is fine");
  assert.match(await fails(U.childA, "select public.account_set_type('parent')"), /IN_FAMILY/);
  assert.match(await fails(U.parentA, "select public.account_set_type('independent_student')"), /IN_FAMILY/);
});

test("child invites parent: 16+ child needs no consent, sharing on at once", async () => {
  assert.match(await fails(U.parentB, "select public.family_create_invite('child_invites_parent')"), /FORBIDDEN/);
  const c = (await val(U.childB, "select public.family_create_invite('child_invites_parent')")).code;
  const myB = await val(U.childB, "select public.family_get_my()");
  assert.equal(myB.my_role, "child"); assert.equal(myB.my_sharing_active, true); assert.equal(myB.invites[0].code, c);
  assert.match(await fails(U.parentB, "select public.family_join($1)", [c]), /ALREADY_IN_FAMILY/, "parentB already has a family");
  assert.match(await fails(U.teen2, "select public.family_join($1)", [c]), /INVITE_WRONG_ACCOUNT_TYPE/);
  await val(U.parentB, "select public.family_leave()");
  assert.equal((await ctx.admin("select count(*)::int as n from public.families where id=$1", [famB]))[0].n, 0, "empty family deleted");
  const j = await val(U.parentB, "select public.family_join($1)", [c]);
  assert.equal(j.role, "parent");
  famB = j.family_id;
  const o = await val(U.parentB, "select public.family_child_overview($1)", [U.childB]);
  assert.equal(o.sharing_active, true); assert.equal(o.consent_status, "not_required");
  assert.match(await fails(U.parentB, "select public.family_set_consent($1, false)", [U.childB]), /CONSENT_NOT_REQUIRED/);
});

test("RLS: two families never see each other; no direct writes; plans and waitlist invisible", async () => {
  await ctx.as(U.parentA);
  assert.deepEqual((await ctx.rpc("select user_id from public.family_members")).map((r) => r.user_id), [U.parentA], "own row only");
  assert.deepEqual((await ctx.rpc("select id from public.families")).map((r) => r.id), [famA]);
  assert.equal((await ctx.rpc("select * from public.family_invites where created_by <> $1", [U.parentA])).length, 0);
  assert.equal((await ctx.rpc("select id from public.school_licences")).length, 0, "family plan rows not readable directly");
  assert.ok(await ctx.code(ctx.rpc("select * from public.waitlist_requests")), "waitlist not readable");
  assert.ok(await ctx.code(ctx.rpc("insert into public.family_members (family_id,user_id,role) values ($1,$2,'parent')", [famB, U.parentA])));
  assert.ok(await ctx.code(ctx.rpc("update public.family_members set consent_status='granted'")));
  assert.ok(await ctx.code(ctx.rpc("insert into public.families (name) values ('x')")));
  assert.ok(await ctx.code(ctx.rpc("insert into public.family_invites (code,family_id,created_by,direction) values ('AAAAAAAA',$1,$2,'parent_invites_child')", [famA, U.parentA])));
  assert.match(await fails(U.parentA, "select public.family_child_overview($1)", [U.childB]), /NOT_FOUND/, "child of another family");
  assert.match(await fails(U.parentA, "select public.family_child_overview($1)", [S.s1]), /NOT_FOUND/, "classmate / random student");
  assert.match(await fails(U.childA, "select public.family_child_overview($1)", [U.teen2]), /FORBIDDEN/, "children cannot view siblings");
  assert.match(await fails(U.outsider, "select public.family_child_overview($1)", [U.childA]), /NOT_IN_FAMILY/);
  assert.match(await fails(U.parentB, "select public.family_remove_member($1)", [U.childA]), /NOT_FOUND/);
  const ga = JSON.stringify(await val(U.parentA, "select public.family_get_my()"));
  assert.ok(!ga.includes(U.childB) && !ga.includes(U.parentB), "no other family in family_get_my");
  await ctx.asAnon();
  assert.ok(await ctx.code(ctx.rpc("select * from public.families")));
  assert.ok(await ctx.code(ctx.rpc("select public.family_get_my()")));
});

test("school model unaffected: school licences keep their status set, school students keep working", async () => {
  const [{ platform_create_school: school }] = await svc("select public.platform_create_school('Sek Fam', 'ZH', 'CH')");
  assert.match(String(await ctx.code(ctx.admin("insert into public.school_licences (school_id, package, status, student_limit) values ($1,'starter','trial',10)", [school]))), /check/);
  assert.match(String(await ctx.code(ctx.admin("insert into public.school_licences (package, student_limit) values ('starter',10)"))), /check/, "owner required");
  assert.match(String(await ctx.code(ctx.admin("insert into public.school_licences (school_id, family_id, package, student_limit) values ($1,$2,'starter',10)", [school, famA]))), /check/, "only one owner");
  assert.match(String(await ctx.code(ctx.admin("insert into public.school_licences (school_id, package, student_limit) values ($1,'family',10)", [school]))), /check/);
  await svc("select public.platform_assign_licence($1, 'starter')", [school]);
  const lic = (await ctx.admin("select plan_type, student_limit, status from public.school_licences where school_id=$1", [school]))[0];
  assert.deepEqual(lic, { plan_type: "school", student_limit: 100, status: "active" });
  // A school student can also be a family child; the teacher view is unchanged and the parent sees no class data.
  const code = (await val(U.coParent, "select public.family_create($1)", ["Fam S1"]), await val(U.coParent, "select public.family_create_invite('parent_invites_child')")).code;
  const j = await val(S.s1, "select public.family_join($1)", [code]);
  assert.equal(j.consent_status, "not_required");
  const o = JSON.stringify(await val(U.coParent, "select public.family_child_overview($1)", [S.s1]));
  assert.ok(!o.includes("10a") && !o.includes("class") && !o.includes(S.s2), "no class, no classmates");
  const cls = (await ctx.admin("select id from public.classes where name='10a'"))[0].id;
  await ctx.as(S.owner);
  const st = await ctx.rpc("select * from public.class_student_applications($1, $2)", [cls, S.s1]);
  assert.ok(st.length >= 3, "teacher still sees the student as before");
});

test("remove / leave: removed child gets nothing shared and can join elsewhere", async () => {
  assert.match(await fails(U.teen2, "select public.family_remove_member($1)", [U.childA]), /FORBIDDEN/);
  assert.match(await fails(U.parentA, "select public.family_remove_member($1)", [U.parentA]), /INVALID_REQUEST/);
  await val(U.parentA, "select public.family_remove_member($1)", [U.teen2]);
  assert.equal(await val(U.teen2, "select public.family_get_my()"), null);
  assert.match(await fails(U.parentA, "select public.family_child_overview($1)", [U.teen2]), /NOT_FOUND/);
  const row = (await ctx.admin("select status, share_settings from public.family_members where user_id=$1", [U.teen2]))[0];
  assert.equal(row.status, "removed"); assert.equal(row.share_settings.progress, false);
  // teen2 is free again: a parent of another family can invite them (seat check counts only non-removed members)
  const c2 = (await val(U.parentA, "select public.family_create_invite('parent_invites_child')")).code;
  assert.match(c2, /^[A-Z0-9]{8}$/, "freed seat can be reused");
  await val(U.parentA, "select public.family_leave()");
  assert.equal((await val(U.childA, "select public.family_get_my()")).members.length, 1, "family stays while the child is in it");
  assert.equal((await val(U.childA, "select public.family_get_my()")).invites.length, 0);
  assert.match(await fails(U.parentA, "select public.family_child_overview($1)", [U.childA]), /NOT_IN_FAMILY/);
  // parentA comes back through a child invite (needs a parent seat again)
  const back = (await val(U.childA, "select public.family_create_invite('child_invites_parent')")).code;
  assert.equal((await val(U.parentA, "select public.family_join($1)", [back])).family_id, famA);
});

test("waitlist_join: anon allowed, validated, no duplicates, no enumeration", async () => {
  await ctx.asAnon();
  assert.deepEqual((await ctx.rpc("select public.waitlist_join('Eltern@Example.ch', 'family', 'Bitte informieren') as r"))[0].r, { ok: true });
  assert.deepEqual((await ctx.rpc("select public.waitlist_join('eltern@example.ch', 'family', null) as r"))[0].r, { ok: true });
  await ctx.asAnon(); assert.match(await ctx.code(ctx.rpc("select public.waitlist_join('kein-mail', 'family')")), /INVALID_EMAIL/);
  await ctx.asAnon(); assert.match(await ctx.code(ctx.rpc("select public.waitlist_join('a@b.ch', 'hacker')")), /INVALID_REQUEST/);
  await ctx.asAnon(); assert.match(await ctx.code(ctx.rpc("select public.waitlist_join('a@b.ch', 'family', $1)", ["x".repeat(1001)])), /INVALID_REQUEST/);
  await ctx.asAnon(); assert.ok(await ctx.code(ctx.rpc("select * from public.waitlist_requests")));
  await ctx.asAnon(); assert.ok(await ctx.code(ctx.rpc("select public.family_join('AAAAAAAA')")), "other family RPCs need a login");
  assert.equal((await ctx.admin("select count(*)::int as n from public.waitlist_requests"))[0].n, 1);
  await val(U.parentA, "select public.waitlist_join('parenta@fam.ch', 'parent', null)");
  assert.equal((await ctx.admin("select user_id from public.waitlist_requests where kind='parent'"))[0].user_id, U.parentA);
});

test("export: family section, invite codes redacted; deletion summary mentions the family", async () => {
  const ex = await val(U.childA, "select public.export_my_data()");
  assert.equal(ex.family.format, "wendapply-family-export-v1");
  assert.equal(ex.family.account_type, "independent_student");
  assert.equal(ex.family.memberships[0].consent_status, "granted");
  assert.ok(ex.tables.family_members.length === 1);
  const exP = await val(U.parentA, "select public.export_my_data()");
  assert.equal(exP.family.consents_given[0].child, "childA");
  assert.ok(exP.family.invites_created.length >= 2);
  assert.ok(exP.tables.family_invites.every((r) => r.code === undefined), "codes redacted");
  assert.ok(exP.family.waitlist.some((w) => w.kind === "parent"));
  assert.ok(!JSON.stringify(exP).includes("GEHEIME"), "child's application data is not in the parent's export");
  const sum = await val(U.parentA, "select public.account_delete_summary()");
  assert.equal(sum.family_member, true); assert.equal(sum.family_others, 1);
});

test("account deletion: nothing left, empty families removed with their plans", async () => {
  await ctx.admin("delete from auth.users where id=$1", [U.childB]);
  assert.deepEqual((await ctx.admin("select public.account_data_report($1) as r", [U.childB]))[0].r, {});
  assert.equal((await ctx.admin("select count(*)::int as n from public.families where id=$1", [famB]))[0].n, 1, "parentB still in it");
  await ctx.admin("delete from auth.users where id=$1", [U.parentB]);
  assert.equal((await ctx.admin("select count(*)::int as n from public.families where id=$1", [famB]))[0].n, 0);
  await ctx.admin("delete from auth.users where id = any($1::uuid[])", [[U.parentA, U.childA, U.teen2]]);
  for (const u of [U.parentA, U.childA, U.teen2]) assert.deepEqual((await ctx.admin("select public.account_data_report($1) as r", [u]))[0].r, {});
  assert.equal((await ctx.admin("select count(*)::int as n from public.families where id=$1", [famA]))[0].n, 0);
  assert.equal((await ctx.admin("select count(*)::int as n from public.school_licences where family_id is not null and family_id=$1", [famA]))[0].n, 0, "plan rows cascade");
});

test("the family migration is idempotent", async () => {
  const before = (await ctx.admin("select count(*)::int as n from public.family_members"))[0].n;
  await ctx.apply("20261116140000_family_accounts.sql");
  assert.equal((await ctx.admin("select count(*)::int as n from public.family_members"))[0].n, before);
  assert.equal((await ctx.admin("select account_type from public.profiles where user_id=$1", [S.s1]))[0].account_type, "school_student");
});
