import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { ids, seededClasses, setupTeacherDb } from "./helpers/teacher-db.mjs";

const SECRETS = ["GEHEIME NOTIZ", "GEHEIME BESCHREIBUNG", "secret.example", "80000", "90000"];
const noSecrets = (value) => { const text = JSON.stringify(value); for (const s of SECRETS) assert.ok(!text.includes(s), `leaked ${s}`); };
const FAKE = "00000000-0000-4000-8000-0000000000ff";

test("migration is idempotent and keeps existing data", async () => {
  const t = await setupTeacherDb();
  const before = await t.admin("select (select count(*) from public.class_members)::int m, (select count(*) from public.classes)::int c, (select count(*) from public.applications)::int a");
  await t.apply(t.files.at(-1)); // run the last migration a second time
  assert.deepEqual(await t.admin("select (select count(*) from public.class_members)::int m, (select count(*) from public.classes)::int c, (select count(*) from public.applications)::int a"), before);
  const fns = await t.admin(`select proname from pg_proc where pronamespace = 'public'::regnamespace`);
  for (const name of ["set_my_role", "class_set_archived", "class_add_coteacher", "class_remove_coteacher", "teacher_dashboard", "teacher_class_students", "class_student_timeline",
    "class_invite_create", "class_invite_create_many", "class_invite_list", "class_invite_revoke", "class_invite_preview", "class_invite_accept",
    "class_set_sharing_v2", "class_visibility_info", "class_announce", "class_announcement_list", "class_nudge", "my_notifications", "mark_notification_read"]) {
    assert.ok(fns.some((f) => f.proname === name), `${name} missing`);
  }
});

test("upgrade from the previous schema keeps existing members and defaults new consent flags to true", async () => {
  const t = await setupTeacherDb({ seed: false, migrate: false });
  for (const f of t.files.slice(0, -1)) await t.apply(f);
  await t.database.query(`insert into auth.users values ($1,'t@x.de','{"role":"teacher"}'), ($2,'s@x.de','{}')`, [ids.owner, ids.s1]);
  await t.as(ids.owner);
  const [c] = await t.rpc("select * from public.class_create('Alt')");
  await t.as(ids.s1); await t.rpc("select * from public.class_join($1)", [c.join_code]);
  await t.apply(t.files.at(-1));
  const rows = await t.admin("select share_applications, share_status, share_companies from public.class_members");
  assert.deepEqual(rows, [{ share_applications: true, share_status: true, share_companies: true }]);
  await t.as(ids.owner);
  assert.equal((await t.rpc("select * from public.class_list_mine()"))[0].is_owner, true);
});

test("role guard: set_my_role only without classes or memberships", async () => {
  const t = await setupTeacherDb();
  await t.as(ids.stranger);
  assert.match(await t.code(t.rpc("select public.set_my_role('teacher')")), /FORBIDDEN/); // member of a class
  await t.as(ids.owner);
  assert.match(await t.code(t.rpc("select public.set_my_role('student')")), /FORBIDDEN/); // owns classes
  await t.as(ids.co);
  assert.equal(await t.code(t.rpc("select public.set_my_role('teacher')")), null); // same role is a no-op
  assert.match(await t.code(t.rpc("select public.set_my_role('admin')")), /INVALID_REQUEST/);
  assert.equal(await t.code(t.rpc("select public.set_my_role('student')")), null);
  assert.equal((await t.rpc("select role from public.social_my_profile()"))[0].role, "student");
  assert.equal(await t.code(t.rpc("select public.set_my_role('teacher')")), null);
  assert.equal((await t.rpc("select role from public.social_my_profile()"))[0].role, "teacher");
  await t.asAnon();
  assert.match(await t.code(t.rpc("select public.set_my_role('teacher')")), /permission denied/);
  await t.as(null);
  assert.match(await t.code(t.rpc("select public.set_my_role('teacher')")), /AUTH_REQUIRED/);
  await t.as(ids.owner);
  assert.match(await t.code(t.database.query("update public.user_roles set role = 'student' where user_id = $1", [ids.owner])), /permission denied/);
});

test("co-teachers: owner-only management, same read rights, other teacher excluded", async () => {
  const t = await setupTeacherDb();
  const c = await seededClasses(t); const a = c["10a"].id;
  await t.as(ids.owner);
  assert.match(await t.code(t.rpc("select public.class_add_coteacher($1, 's1@x.de')", [a])), /NOT_FOUND/); // student account
  assert.match(await t.code(t.rpc("select public.class_add_coteacher($1, 'nobody@x.de')", [a])), /NOT_FOUND/);
  assert.match(await t.code(t.rpc("select public.class_add_coteacher($1, 'owner@school.de')", [a])), /INVALID_REQUEST/);
  assert.equal(await t.code(t.rpc("select public.class_add_coteacher($1, ' CO@School.de ')", [a])), null);
  assert.equal(await t.code(t.rpc("select public.class_add_coteacher($1, 'co@school.de')", [a])), null); // idempotent
  assert.equal((await t.rpc("select * from public.class_coteachers($1)", [a])).length, 1);
  // co-teacher reads and manages, but cannot delete or manage co-teachers
  await t.as(ids.co);
  assert.equal((await t.rpc("select * from public.teacher_class_students($1)", [a])).length, 4);
  assert.equal((await t.rpc("select * from public.class_list_mine()")).filter((r) => r.id === a)[0].is_owner, false);
  assert.equal((await t.rpc("select * from public.class_list_mine()")).length, 1); // 10b is not co-taught
  assert.equal(await t.code(t.rpc("select public.class_rename($1, '10a neu')", [a])), null);
  assert.equal(await t.code(t.rpc("select public.class_set_archived($1, true)", [a])), null);
  assert.equal(await t.code(t.rpc("select public.class_set_archived($1, false)", [a])), null);
  assert.match(await t.code(t.rpc("select public.class_delete($1)", [a])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select public.class_add_coteacher($1, 'other@school.de')", [a])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select public.class_remove_coteacher($1, $2)", [a, ids.other])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select * from public.teacher_class_students($1)", [c["10b"].id])), /FORBIDDEN/);
  // other teacher gets nothing
  await t.as(ids.other);
  for (const sql of ["select * from public.teacher_class_students($1)", "select * from public.class_members($1)", "select * from public.class_overview($1)",
    "select * from public.class_invite_list($1)", "select * from public.class_coteachers($1)", "select * from public.class_announcement_list($1)",
    "select public.class_set_archived($1, true)", "select public.class_rename($1, 'x')", "select public.class_delete($1)", "select public.class_announce($1, 'hi')", "select * from public.class_invite_create($1)"]) {
    assert.match(await t.code(t.rpc(sql, [a])), /FORBIDDEN/, sql);
  }
  assert.match(await t.code(t.rpc("select * from public.class_student_timeline($1, $2)", [a, ids.s1])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select * from public.class_student_applications($1, $2)", [a, ids.s1])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select public.class_nudge($1, $2)", [a, ids.s1])), /FORBIDDEN/);
  const dash = (await t.rpc("select public.teacher_dashboard() d"))[0].d;
  assert.equal(dash.totals.students, 1); // only the stranger in their own class
  assert.deepEqual(dash.classes.map((x) => x.name), ["Fremdklasse"]);
  // co-teacher may leave, owner removes
  await t.as(ids.co);
  assert.equal(await t.code(t.rpc("select public.class_remove_coteacher($1, $2)", [a, ids.co])), null);
  assert.match(await t.code(t.rpc("select * from public.teacher_class_students($1)", [a])), /FORBIDDEN/);
  await t.as(ids.owner);
  await t.rpc("select public.class_add_coteacher($1, 'co@school.de')", [a]);
  assert.match(await t.code(t.rpc("select public.class_remove_coteacher($1, $2)", [a, ids.other])), /NOT_FOUND/);
  assert.equal(await t.code(t.rpc("select public.class_remove_coteacher($1, $2)", [a, ids.co])), null);
  // students and strangers
  await t.as(ids.s1);
  assert.match(await t.code(t.rpc("select public.class_add_coteacher($1, 'co@school.de')", [a])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select * from public.class_list_mine()")), /FORBIDDEN/);
});

test("dashboard totals and per student rows respect consent; hidden students leak nothing", async () => {
  const t = await setupTeacherDb();
  const c = await seededClasses(t); const a = c["10a"].id;
  await t.as(ids.owner);
  const dash = (await t.rpc("select public.teacher_dashboard(14) d"))[0].d;
  assert.deepEqual(dash.totals, { students: 4, classes: 2, applications: 6, interviews: 2, offers: 1, placed: 1, inactive: 1, deadlines_7d: 1, hidden_students: 1 });
  const cls = dash.classes.find((x) => x.id === a);
  assert.deepEqual([cls.students, cls.applications, cls.interviews, cls.offers, cls.placed, cls.inactive, cls.hidden, cls.is_owner, cls.archived], [4, 6, 2, 1, 1, 1, 1, true, false]);
  // deadlines: only shared company names (Dina's status is hidden but companies are shared; Cem hides companies; Ben hides all)
  assert.deepEqual(dash.deadlines.map((d) => d.company), ["Gamma SE", "Dina Firma"]);
  assert.ok(!JSON.stringify(dash).includes("Verborgen AG"));
  assert.ok(!JSON.stringify(dash).includes("Cem Firma"));
  noSecrets(dash);
  const rows = await t.rpc("select * from public.teacher_class_students($1)", [a]);
  const by = Object.fromEntries(rows.map((r) => [r.display_name, r]));
  assert.deepEqual([by.Anna.total, by.Anna.interviews, by.Anna.offers, by.Anna.placed, by.Anna.hidden], [4, 1, 1, true, false]);
  assert.deepEqual(by.Anna.status_counts, { applied: 1, interview: 1, saved: 1, offer: 1 });
  // hidden: nothing but the name
  assert.deepEqual([by.Ben.hidden, by.Ben.total, by.Ben.status_counts, by.Ben.interviews, by.Ben.offers, by.Ben.placed, by.Ben.last_activity, by.Ben.inactive], [true, 0, {}, 0, 0, false, null, false]);
  // status hidden: counts, but no stages
  assert.deepEqual([by.Dina.total, by.Dina.status_counts, by.Dina.interviews, by.Dina.placed, by.Dina.inactive], [1, {}, 0, false, true]);
  // companies hidden but stages visible
  assert.deepEqual([by.Cem.total, by.Cem.interviews], [1, 1]);
  noSecrets(rows);
  // inactive days parameter and clamping
  assert.equal((await t.rpc("select public.teacher_dashboard(1) d"))[0].d.totals.inactive, 2); // Anna (-1 day) and Cem are still within 1 day? Anna's last update is 1 day ago
  assert.equal((await t.rpc("select public.teacher_dashboard(null) d"))[0].d.totals.students, 4);
  assert.equal((await t.rpc("select public.teacher_dashboard(-5) d"))[0].d.totals.students, 4);
});

test("student switches take effect immediately; archived classes are excluded from totals", async () => {
  const t = await setupTeacherDb();
  const c = await seededClasses(t); const a = c["10a"].id;
  await t.as(ids.s2); await t.rpc("select public.class_set_sharing_v2($1, true)", [a]);
  await t.as(ids.owner);
  let ben = (await t.rpc("select * from public.teacher_class_students($1)", [a])).find((r) => r.display_name === "Ben");
  assert.deepEqual([ben.hidden, ben.total, ben.placed], [false, 1, true]);
  assert.equal((await t.rpc("select public.teacher_dashboard() d"))[0].d.totals.hidden_students, 0);
  await t.as(ids.s1); await t.rpc("select public.class_set_sharing_v2($1, false)", [a]);
  await t.as(ids.owner);
  ben = (await t.rpc("select * from public.teacher_class_students($1)", [a])).find((r) => r.display_name === "Anna");
  assert.equal(ben.hidden, true);
  await t.rpc("select public.class_set_archived($1, true)", [a]);
  const dash = (await t.rpc("select public.teacher_dashboard() d"))[0].d;
  assert.deepEqual([dash.totals.classes, dash.totals.students], [1, 0]);
  assert.equal(dash.classes.find((x) => x.id === a).archived, true);
  const list = await t.rpc("select * from public.class_list_mine()");
  assert.deepEqual(list.map((x) => x.name), ["10b", "10a"]); // archived last
  // invites and short-code joins into archived classes are refused
  assert.match(await t.code(t.rpc("select * from public.class_invite_create($1)", [a])), /ARCHIVED/);
  await t.as(ids.stranger);
  assert.match(await t.code(t.rpc("select * from public.class_join($1)", [c["10a"].join_code])), /ARCHIVED/);
  await t.as(ids.s2); // existing members can still call join idempotently
  assert.equal(await t.code(t.rpc("select * from public.class_join($1)", [c["10a"].join_code])), null);
  await t.as(ids.owner);
  await t.rpc("select public.class_set_archived($1, false)", [a]);
  assert.match(await t.code(t.rpc("select public.class_set_archived($1, null)", [a])), /INVALID_REQUEST/);
});

test("timeline and applications show shared fields only", async () => {
  const t = await setupTeacherDb();
  const c = await seededClasses(t); const a = c["10a"].id;
  await t.as(ids.owner);
  const anna = await t.rpc("select * from public.class_student_timeline($1, $2)", [a, ids.s1]);
  assert.ok(anna.length >= 6);
  assert.ok(anna.every((r) => r.hidden === false && ["created", "applied", "updated", "deadline"].includes(r.kind)));
  assert.ok(anna.some((r) => r.company === "Delta AG" && r.kind === "applied" && r.status === "applied"));
  assert.deepEqual(Object.keys(anna[0]).sort(), ["application_id", "company", "event_date", "hidden", "kind", "position", "status"]);
  noSecrets(anna);
  const ben = await t.rpc("select * from public.class_student_timeline($1, $2)", [a, ids.s2]);
  assert.deepEqual(ben, [{ hidden: true, application_id: null, company: null, position: null, status: null, event_date: null, kind: null }]);
  const cem = await t.rpc("select * from public.class_student_timeline($1, $2)", [a, ids.s3]);
  assert.ok(cem.length > 0 && cem.every((r) => r.company === null && r.position === null && r.status !== null));
  const dina = await t.rpc("select * from public.class_student_timeline($1, $2)", [a, ids.s4]);
  assert.ok(dina.length > 0 && dina.every((r) => r.status === null && r.company === "Dina Firma"));
  assert.match(await t.code(t.rpc("select * from public.class_student_timeline($1, $2)", [a, ids.stranger])), /NOT_FOUND/); // not in this class
  assert.match(await t.code(t.rpc("select * from public.class_student_timeline($1, $2)", [a, FAKE])), /NOT_FOUND/);
  // class_student_applications / overview honour the same switches
  const apps = await t.rpc("select * from public.class_student_applications($1, $2)", [a, ids.s3]);
  assert.ok(apps.every((r) => r.company === null && r.location === null));
  noSecrets(apps);
  const dinaApps = await t.rpc("select * from public.class_student_applications($1, $2)", [a, ids.s4]);
  assert.ok(dinaApps.every((r) => r.status === null && r.company === "Dina Firma"));
  const overview = await t.rpc("select * from public.class_overview($1)", [a]);
  const ov = Object.fromEntries(overview.map((r) => [r.display_name, r]));
  assert.equal(ov.Ben.latest_company, null);
  assert.equal(ov.Cem.latest_company, null);
  assert.deepEqual(ov.Cem.upcoming_deadlines, []);
  assert.equal(ov.Dina.latest_status, null);
  assert.deepEqual(ov.Dina.status_counts, {});
  noSecrets(overview);
  // a student cannot call any teacher read RPC
  await t.as(ids.s1);
  for (const sql of ["select * from public.class_student_timeline($1, $2)", "select * from public.teacher_class_students($1)"]) assert.match(await t.code(t.rpc(sql, [a, ids.s2].slice(0, sql.includes("$2") ? 2 : 1))), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select public.teacher_dashboard()")), /FORBIDDEN/);
});

test("invitations: create, list, preview, accept, limits", async () => {
  const t = await setupTeacherDb();
  const c = await seededClasses(t); const a = c["10a"].id;
  await t.as(ids.owner);
  const [open] = await t.rpc("select * from public.class_invite_create($1, null, 2, 7)", [a]);
  assert.match(open.token, /^[a-z0-9]{22,}$/);
  const [bound] = await t.rpc("select * from public.class_invite_create($1, ' New@Student.DE ')", [a]);
  assert.notEqual(open.token, bound.token);
  for (const [sql, params, re] of [
    ["select * from public.class_invite_create($1, 'kaputt')", [a], /INVALID_EMAIL/],
    ["select * from public.class_invite_create($1, null, 0)", [a], /INVALID_REQUEST/],
    ["select * from public.class_invite_create($1, null, 501)", [a], /INVALID_REQUEST/],
    ["select * from public.class_invite_create($1, null, null, 0)", [a], /INVALID_REQUEST/],
    ["select * from public.class_invite_create($1, null, null, 91)", [a], /INVALID_REQUEST/],
  ]) assert.match(await t.code(t.rpc(sql, params)), re, sql);
  const list = await t.rpc("select * from public.class_invite_list($1)", [a]);
  assert.equal(list.length, 2);
  assert.equal(list.find((r) => r.email)?.email, "new@student.de");
  // bulk: dedupe, validation, limits
  const many = await t.rpc("select * from public.class_invite_create_many($1, array['A@x.de','a@x.de',' b@x.de ','','c@x.de'])", [a]);
  assert.deepEqual(many.map((r) => r.email).sort(), ["a@x.de", "b@x.de", "c@x.de"]);
  assert.equal(new Set(many.map((r) => r.token)).size, 3);
  assert.match(await t.code(t.rpc("select * from public.class_invite_create_many($1, array['ok@x.de','nope'])", [a])), /INVALID_EMAIL/);
  assert.equal((await t.rpc("select * from public.class_invite_list($1)", [a])).length, 5); // atomic: nothing created by the failing call
  assert.match(await t.code(t.rpc("select * from public.class_invite_create_many($1, array[]::text[])", [a])), /INVALID_REQUEST/);
  const sixtyOne = Array.from({ length: 61 }, (_, i) => `u${i}@x.de`);
  assert.match(await t.code(t.rpc("select * from public.class_invite_create_many($1, $2::text[])", [a, sixtyOne])), /INVALID_REQUEST/);
  const sixty = sixtyOne.slice(0, 60);
  assert.equal((await t.rpc("select * from public.class_invite_create_many($1, $2::text[])", [a, sixty])).length, 60);
  // preview and accept as a student (open invite, max 2 uses)
  await t.as(ids.stranger); // already in the foreign class, but not in 10a
  const [prev] = await t.rpc("select * from public.class_invite_preview($1)", [open.token]);
  assert.deepEqual([prev.valid, prev.reason, prev.name, prev.teacher_name, prev.already_member, prev.member_count], [true, null, "10a", "Frau Owner", false, 4]);
  const [joined] = await t.rpc("select * from public.class_invite_accept($1)", [open.token]);
  assert.deepEqual([joined.name, joined.teacher_name, joined.share_applications], ["10a", "Frau Owner", true]);
  assert.match(await t.code(t.rpc("select uses from public.class_invitations")), /permission denied/);
  // re-accepting as a member neither fails nor consumes another use
  await t.rpc("select * from public.class_invite_accept($1)", [open.token]);
  const [again] = await t.rpc("select * from public.class_invite_preview($1)", [open.token]);
  assert.deepEqual([again.valid, again.already_member], [true, true]);
  await t.admin("select 1");
  assert.equal((await t.admin("select uses from public.class_invitations where token = $1", [open.token]))[0].uses, 1);
  await t.as(ids.owner);
  // teacher accounts cannot accept
  assert.match(await t.code(t.rpc("select * from public.class_invite_accept($1)", [open.token])), /FORBIDDEN/);
});

test("invitations: expired, revoked, used up, email-bound, unknown, anon", async () => {
  const t = await setupTeacherDb();
  const c = await seededClasses(t); const a = c["10a"].id;
  await t.as(ids.owner);
  const mk = async (...args) => (await t.rpc("select * from public.class_invite_create($1, $2, $3, $4)", [a, ...args]))[0];
  const single = await mk(null, 1, 14);
  const expiring = await mk(null, null, 14);
  const revoked = await mk(null, null, 14);
  const bound = await mk("stranger@x.de", null, 14);
  await t.admin("update public.class_invitations set expires_at = now() - interval '1 minute' where token = $1", [expiring.token]);
  await t.as(ids.owner);
  await t.rpc("select public.class_invite_revoke($1)", [revoked.id]);
  await t.as(ids.stranger);
  const reason = async (token) => (await t.rpc("select * from public.class_invite_preview($1)", [token]))[0];
  assert.deepEqual([(await reason(expiring.token)).valid, (await reason(expiring.token)).reason], [false, "EXPIRED"]);
  assert.equal((await reason(revoked.token)).reason, "REVOKED");
  assert.equal((await reason("x".repeat(30))).reason, "INVALID");
  assert.equal((await reason("")).reason, "INVALID");
  const expired = await reason(expiring.token);
  assert.deepEqual([expired.name, expired.class_id, expired.teacher_name], [null, null, null]); // no class details for unusable tokens
  assert.match(await t.code(t.rpc("select * from public.class_invite_accept($1)", [expiring.token])), /EXPIRED/);
  assert.match(await t.code(t.rpc("select * from public.class_invite_accept($1)", [revoked.token])), /REVOKED/);
  assert.match(await t.code(t.rpc("select * from public.class_invite_accept($1)", ["x".repeat(30)])), /INVITE_INVALID/);
  // single use: s2 (already in class) does not consume; stranger takes the use, a later student is refused
  await t.rpc("select * from public.class_invite_accept($1)", [single.token]);
  await t.as(ids.s1); // already a member of 10a -> idempotent, no extra use
  await t.rpc("select * from public.class_invite_accept($1)", [single.token]);
  assert.equal((await t.admin("select uses from public.class_invitations where token = $1", [single.token]))[0].uses, 1);
  await t.admin("delete from public.class_members where student_id = $1 and class_id = $2", [ids.stranger, a]);
  await t.as(ids.stranger);
  assert.equal((await reason(single.token)).reason, "USED_UP");
  assert.match(await t.code(t.rpc("select * from public.class_invite_accept($1)", [single.token])), /USED_UP/);
  // e-mail bound: only the matching auth e-mail may use it
  await t.as(ids.s3); await t.rpc("select public.class_leave($1)", [a]);
  assert.equal((await reason(bound.token)).reason, "WRONG_EMAIL");
  assert.match(await t.code(t.rpc("select * from public.class_invite_accept($1)", [bound.token])), /FORBIDDEN/);
  await t.as(ids.stranger);
  assert.equal((await reason(bound.token)).valid, true);
  await t.rpc("select * from public.class_invite_accept($1)", [bound.token]);
  assert.equal((await t.admin("select count(*)::int n from public.class_members where class_id = $1 and student_id = $2", [a, ids.stranger]))[0].n, 1);
  // the existing join-code flow still works
  await t.as(ids.s3);
  assert.equal(await t.code(t.rpc("select * from public.class_join($1)", [c["10a"].join_code])), null);
  // revoke permissions
  await t.as(ids.other);
  assert.match(await t.code(t.rpc("select public.class_invite_revoke($1)", [bound.id])), /FORBIDDEN/);
  await t.as(ids.s1);
  assert.match(await t.code(t.rpc("select public.class_invite_revoke($1)", [bound.id])), /FORBIDDEN/);
  await t.as(ids.owner);
  assert.match(await t.code(t.rpc("select public.class_invite_revoke($1)", [FAKE])), /NOT_FOUND/);
  await t.asAnon();
  for (const sql of ["select * from public.class_invite_preview('x')", "select * from public.class_invite_accept('x')", "select * from public.class_invite_create($1)"]) {
    assert.match(await t.code(t.rpc(sql, sql.includes("$1") ? [a] : [])), /permission denied/, sql);
  }
  await t.as(null);
  assert.match(await t.code(t.rpc("select * from public.class_invite_preview('x')")), /AUTH_REQUIRED/);
});

test("nudges are rate limited, announcements reach members, notifications are private", async () => {
  const t = await setupTeacherDb();
  const c = await seededClasses(t); const a = c["10a"].id;
  await t.as(ids.owner);
  await t.rpc("select public.class_add_coteacher($1, 'co@school.de')", [a]);
  await t.rpc("select public.class_nudge($1, $2, 'Bitte melde dich')", [a, ids.s4]);
  assert.match(await t.code(t.rpc("select public.class_nudge($1, $2)", [a, ids.s4])), /RATE_LIMITED/);
  await t.as(ids.co); // co-teacher shares the limit
  assert.match(await t.code(t.rpc("select public.class_nudge($1, $2)", [a, ids.s4])), /RATE_LIMITED/);
  assert.equal(await t.code(t.rpc("select public.class_nudge($1, $2)", [a, ids.s1])), null); // other student is fine
  assert.match(await t.code(t.rpc("select public.class_nudge($1, $2)", [a, ids.stranger])), /NOT_FOUND/); // not in class
  assert.match(await t.code(t.rpc("select public.class_nudge($1, $2, $3)", [a, ids.s3, "x".repeat(201)])), /INVALID_REQUEST/);
  assert.ok((await t.rpc("select * from public.teacher_class_students($1)", [a])).find((r) => r.student_id === ids.s4).last_nudged_at);
  // after 3 days a new nudge is allowed
  await t.admin("update public.class_notifications set created_at = now() - interval '3 days 1 minute' where user_id = $1", [ids.s4]);
  await t.as(ids.owner);
  assert.equal(await t.code(t.rpc("select public.class_nudge($1, $2)", [a, ids.s4])), null);
  // student view
  await t.as(ids.s4);
  const notes = await t.rpc("select * from public.my_notifications()");
  assert.equal(notes.length, 2);
  assert.deepEqual([notes[0].kind, notes[0].class_name, notes[0].read], ["nudge", "10a", false]);
  const mine = (await t.rpc("select * from public.class_my_classes()"))[0];
  assert.ok(mine.last_nudge_at); assert.equal(mine.share_status, false); assert.equal(mine.share_companies, true);
  await t.as(ids.s1);
  assert.match(await t.code(t.rpc("select public.mark_notification_read($1)", [notes[0].id])), /NOT_FOUND/); // not yours
  assert.equal((await t.rpc("select * from public.my_notifications()")).length, 1);
  await t.as(ids.s4);
  await t.rpc("select public.mark_notification_read($1)", [notes[0].id]);
  assert.equal((await t.rpc("select * from public.my_notifications()")).find((n) => n.id === notes[0].id).read, true);
  // students cannot nudge or announce
  assert.match(await t.code(t.rpc("select public.class_nudge($1, $2)", [a, ids.s1])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select public.class_announce($1, 'hi')", [a])), /FORBIDDEN/);
  // announcements
  await t.as(ids.co);
  for (const bad of ["", "   ", "x".repeat(501)]) assert.match(await t.code(t.rpc("select public.class_announce($1, $2)", [a, bad])), /INVALID_REQUEST/);
  const id = (await t.rpc("select public.class_announce($1, ' Infoabend am Montag ') id", [a]))[0].id;
  assert.ok(id);
  assert.equal(await t.code(t.rpc("select public.class_announce($1, $2)", [a, "x".repeat(500)])), null);
  const asTeacher = await t.rpc("select * from public.class_announcement_list($1)", [a]);
  assert.equal(asTeacher.length, 2);
  assert.ok(asTeacher.some((r) => r.text === "Infoabend am Montag" && r.author_name === "Herr Co"));
  await t.as(ids.s2); // hidden student still gets class announcements
  assert.equal((await t.rpc("select * from public.class_announcement_list($1)", [a])).length, 2);
  assert.ok((await t.rpc("select * from public.my_notifications()")).some((n) => n.kind === "announcement" && n.message === "Infoabend am Montag"));
  assert.equal((await t.rpc("select announcements_count from public.class_my_classes()"))[0].announcements_count, 2);
  await t.as(ids.stranger);
  assert.match(await t.code(t.rpc("select * from public.class_announcement_list($1)", [a])), /FORBIDDEN/);
  await t.as(ids.other);
  assert.match(await t.code(t.rpc("select * from public.class_announcement_list($1)", [a])), /FORBIDDEN/);
  await t.asAnon();
  assert.match(await t.code(t.rpc("select * from public.my_notifications()")), /permission denied/);
  assert.match(await t.code(t.rpc("select public.class_nudge($1, $2)", [a, ids.s1])), /permission denied/);
});

test("consent RPCs: sharing v2 and transparency texts", async () => {
  const t = await setupTeacherDb();
  const c = await seededClasses(t); const a = c["10a"].id;
  await t.as(ids.s1);
  await t.rpc("select public.class_set_sharing_v2($1, true, false, false)", [a]);
  let mine = (await t.rpc("select * from public.class_my_classes()"))[0];
  assert.deepEqual([mine.share_applications, mine.share_companies, mine.share_status], [true, false, false]);
  await t.rpc("select public.class_set_sharing_v2($1, false)", [a]); // unchanged detail switches
  mine = (await t.rpc("select * from public.class_my_classes()"))[0];
  assert.deepEqual([mine.share_applications, mine.share_companies, mine.share_status], [false, false, false]);
  assert.match(await t.code(t.rpc("select public.class_set_sharing_v2($1, null)", [a])), /INVALID_REQUEST/);
  assert.match(await t.code(t.rpc("select public.class_set_sharing_v2($1, true)", [c["10b"].id])), /NOT_FOUND/); // not a member
  assert.match(await t.code(t.rpc("select public.class_set_sharing_v2($1, true)", [FAKE])), /NOT_FOUND/);
  // a teacher cannot flip a student's switches
  await t.as(ids.owner);
  assert.match(await t.code(t.rpc("select public.class_set_sharing_v2($1, true)", [a])), /NOT_FOUND/);
  assert.match(await t.code(t.database.query("update public.class_members set share_applications = true")), /permission denied/);
  const info = (await t.rpc("select public.class_visibility_info() i"))[0].i;
  assert.ok(info.teacher_sees.length >= 3 && info.teacher_never_sees.length >= 3);
  assert.ok(info.teacher_never_sees.join(" ").includes("Notizen"));
  assert.ok(!info.teacher_sees.join(" ").includes("Notizen"));
  await t.asAnon();
  assert.match(await t.code(t.rpc("select public.class_visibility_info()")), /permission denied/);
});

test("direct table access is denied for everybody; internals are not callable", async () => {
  const t = await setupTeacherDb();
  const c = await seededClasses(t); const a = c["10a"].id;
  await t.as(ids.owner);
  await t.rpc("select * from public.class_invite_create($1)", [a]);
  await t.rpc("select public.class_announce($1, 'hi')", [a]);
  await t.rpc("select public.class_add_coteacher($1, 'co@school.de')", [a]);
  for (const who of [ids.owner, ids.co, ids.other, ids.s1, ids.stranger]) {
    await t.as(who);
    for (const table of ["class_teachers", "class_invitations", "class_announcements", "class_notifications"]) {
      assert.match(await t.code(t.rpc(`select * from public.${table}`)), /permission denied/, `${table} as ${who}`);
      assert.match(await t.code(t.database.query(`delete from public.${table}`)), /permission denied/);
    }
    assert.match(await t.code(t.database.query("insert into public.class_teachers values ($1, $2)", [a, who])), /permission denied/);
    for (const fn of [`public._teacher_stats('${ids.owner}', 14, null)`, `public._soc_owner_of('${a}')`, `public._soc_can_teach('${ids.owner}', '${a}')`, "public._teacher_new_token()"]) {
      assert.match(await t.code(t.rpc(`select * from ${fn}`)), /permission denied/, fn);
    }
  }
  // the existing tables still expose nothing foreign
  await t.as(ids.other);
  assert.equal((await t.rpc("select * from public.classes")).length, 1); // only own
  assert.equal((await t.rpc("select * from public.class_members")).length, 0); // only memberships where they are the student
  await t.as(ids.s1);
  assert.equal((await t.rpc("select * from public.classes")).length, 0);
  assert.equal((await t.rpc("select * from public.class_members")).length, 1);
});
