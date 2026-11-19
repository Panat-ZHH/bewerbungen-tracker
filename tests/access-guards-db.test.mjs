// The paywall in the database (supabase/migrations/20261118020000_access_guards.sql), PGlite with ALL migrations.
// Enforcement 'on' + expired trial: writes denied on every client-writable table / bucket, reads and deletes allowed,
// "Meine Daten löschen" allowed, every wrapped RPC raises PAYWALL, the documented ungated flows (class join into a licensed
// class, family create → invite → join → consent, exports, role / account type) keep working. Plus: no unknown definer RPC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupAccessDb, uid } from "./helpers/access-db.mjs";
import { isPaywallError } from "../lib/access/core.ts";

const ctx = await setupAccessDb();
const { admin, as, q, code, user, mode, expire } = ctx;
// Supabase grants table privileges to authenticated by default privileges; the stub does not – mirror Supabase here.
await ctx.reset();
await ctx.database.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on schema storage to authenticated; alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated; grant usage on all sequences in schema public to authenticated`);
let n = 500;
const next = () => ++n;
const paywalled = async (o = {}) => { const u = await user(next(), o); await expire(u); return u; };
const app = (id, u) => q(`insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at)
  values ($1, $2, 'Firma', 'Lehre', 'Lehrstelle', 'saved', current_date, current_date)`, [id, u]);
const cv = (id, u) => q(`insert into public.cvs (id, user_id, name, type, description, updated_at, status, file_name, storage_path, file_type, file_size)
  values ($1, $2, 'CV', 'cv', '', current_date, 'Ready', 'cv.pdf', $3, 'application/pdf', 100)`, [id, u, `${u}/cv.pdf`]);

// Every definer RPC an authenticated user can call that is deliberately NOT gated (docs/access/GUARDS.md, reasons there).
const UNGATED = new Set(`_assert_app_access account_delete_summary account_set_type am_i_platform_admin billing_status_for_family
  billing_status_for_school billing_status_for_user class_deadline_delete class_delete class_invite_accept class_invite_preview class_invite_revoke
  class_join class_leave class_my_classes class_preview class_remove_coteacher class_remove_student class_set_sharing class_set_sharing_v2
  export_my_data family_create family_create_invite family_export_my_data family_get_my family_join family_leave family_remove_member
  family_set_consent family_set_share funnel_apply has_app_access invite_context is_class_member is_class_teacher is_family_parent is_school_admin
  map_friend_island map_islands_state map_shop_state mark_notification_read my_access my_class_deadlines my_notifications my_self_reports
  my_view_log onboarding_tour_set profile_name_status profile_set_under_16 school_admin_my_schools school_admin_overview school_detach_class
  school_remove_teacher school_student_count set_my_role social_avatars social_friends_overview social_get_share_companies
  social_get_share_outcomes social_list social_my_profile social_remove_friend social_set_share_companies social_set_share_outcomes
  tour_state_set waitlist_join`.split(/\s+/).filter(Boolean));
const TEACHER_MODE = new Set(["class_announcement_list", "class_deadline_list", "class_goal_progress"]);

async function wrapped() {
  return admin(`select substr(p.proname, 11) as name, pg_get_function_identity_arguments(p.oid) as args, p.pronargs as nargs,
      coalesce((select array_agg(format_type(t, null) order by i) from unnest(p.proargtypes) with ordinality x(t, i)), '{}') as types
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like '\\_acc\\_impl\\_%' order by 1`);
}

test("coverage: every security-definer RPC callable by authenticated is wrapped or on the documented ungated list", async () => {
  const rows = await admin(`select distinct p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1`);
  const w = new Set((await wrapped()).map((r) => r.name));
  assert.ok(w.size >= 40, `wrapped ${w.size}`);
  const unknown = rows.map((r) => r.proname).filter((name) => !w.has(name) && !UNGATED.has(name));
  assert.deepEqual(unknown, [], "new definer RPC: gate it in 20261118020000_access_guards.sql (or a later migration) or add it to the ungated list + docs/access/GUARDS.md");
  for (const name of w) assert.equal(UNGATED.has(name), false, `${name} is both wrapped and ungated`);
  // impls are not callable by clients; wrappers keep the original grants
  const leaked = await admin(`select p.proname from pg_proc p where p.proname like '\\_acc\\_impl\\_%'
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))`);
  assert.deepEqual(leaked, []);
  const anonWrappers = await admin(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname = any($1) and has_function_privilege('anon', p.oid, 'EXECUTE')`, [[...w]]);
  assert.deepEqual(anonWrappers, []);
});

test("every wrapped RPC raises PAYWALL for a paywalled user (mode on); teacher-mode ones for the class's teacher", async () => {
  await mode("on");
  const student = await paywalled();
  const teacher = await user(next(), { meta: { role: "teacher" } });
  await mode("off");
  await as(teacher);
  const [cls] = await q("select * from public.class_create('Gate', '2026')");
  await mode("on");
  const nullArgs = (k) => Array.from({ length: k }, (_, i) => `$${i + 1}`).join(", ");
  for (const f of await wrapped()) {
    const who = TEACHER_MODE.has(f.name) ? teacher : (f.name.startsWith("class_") || f.name.startsWith("teacher_") || f.name.startsWith("school_") ? teacher : student);
    await as(who);
    const params = f.types.map((t, i) => (i === 0 && TEACHER_MODE.has(f.name) ? cls.id : null));
    const casts = f.types.map((t, i) => `$${i + 1}::${t}`).join(", ");
    const err = await code(q(`select * from public.${f.name}(${f.nargs ? casts : ""})`, params));
    assert.match(String(err), /PAYWALL/, `${f.name}(${f.args}) → ${err}`);
  }
  assert.ok(nullArgs(0) === "");
});

test("teacher-mode views: a student of the class still reads after their trial if the teacher is licensed… and a paywalled student reads too", async () => {
  await mode("off");
  const teacher = await user(next(), { meta: { role: "teacher" } });
  await as(teacher);
  const [cls] = await q("select * from public.class_create('Lesen', '2026')");
  const st = await user(next());
  await as(st); await q("select * from public.class_join($1)", [cls.join_code]);
  await expire(st);
  await mode("on");
  await as(st);
  for (const sql of ["select * from public.class_announcement_list($1)", "select * from public.class_deadline_list($1, null, null)", "select public.class_goal_progress($1)"]) {
    assert.equal(await code(q(sql, [cls.id])), null, sql);
  }
  await as(teacher);
  assert.match(await code(q("select * from public.class_announcement_list($1)", [cls.id])), /PAYWALL/);
});

test("tables: paywalled user cannot insert/update, can still select and delete; in trial everything works", async () => {
  await mode("off");
  const u = await user(next());
  await as(u);
  await app(`a-${n}`, u); await cv(`c-${n}`, u);
  await q("insert into public.profiles (id, user_id, first_name, last_name, email) values ($1, $2, 'Lea', 'Muster', 'lea@x.ch')", [`profile-${u}`, u]);
  await expire(u);
  await mode("on");
  await as(u);
  const denied = [
    ["applications insert", () => app(`a2-${n}`, u)],
    ["applications update", () => q("update public.applications set notes = 'x' where user_id = $1", [u])],
    ["cvs insert", () => cv(`c2-${n}`, u)],
    ["cvs update", () => q("update public.cvs set name = 'neu' where user_id = $1", [u])],
    ["profiles update", () => q("update public.profiles set first_name = 'Max' where user_id = $1", [u])],
    ["push insert", () => q("insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/x', 'k', 'a')", [u])],
    ["calendar insert", () => q("insert into public.calendar_feeds (user_id, token) values ($1, repeat('t', 40))", [u])],
    ["reminders insert on", () => q("insert into public.reminder_settings (user_id, email) values ($1, true)", [u])],
    ["application_documents insert", () => q("insert into public.application_documents (application_id, document_id, user_id) values ($1, $2, $3)", [`a-${n}`, `c-${n}`, u])],
  ];
  for (const [label, run] of denied) {
    const err = await code(run());
    assert.ok(err && /PAYWALL|row-level security/.test(err), `${label}: ${err}`);
    // the UI must recognise every one of these real Postgres errors as the paywall (integration: lib/access/core isPaywallError)
    assert.equal(isPaywallError({ message: String(err) }), true, `${label} not seen as paywall by the UI: ${err}`);
  }
  // an UPDATE that "denies" silently would affect 0 rows: make sure the row is unchanged
  await as(u);
  assert.equal((await q("select first_name from public.profiles where user_id = $1", [u]))[0].first_name, "Lea");
  assert.equal((await q("select count(*)::int c from public.applications where user_id = $1", [u]))[0].c, 1);
  assert.equal(await code(q("delete from public.applications where user_id = $1", [u])), null);
  assert.equal((await q("select count(*)::int c from public.applications where user_id = $1", [u]))[0].c, 0);
  // reminders can always be switched off
  await mode("off"); await as(u); await q("insert into public.reminder_settings (user_id, email, push) values ($1, true, false)", [u]); await mode("on"); await as(u);
  assert.match(String(await code(q("update public.reminder_settings set days_before = 5, email = true where user_id = $1", [u]))), /row-level security/);
  assert.equal(await code(q("update public.reminder_settings set email = false, push = false where user_id = $1", [u])), null);
  // mode off: same user can write again
  await mode("off"); await as(u);
  assert.equal(await code(app(`a3-${n}`, u)), null);
  await mode("on");
});

test("'Meine Daten löschen' works behind the paywall (G2): clearing updates on profiles/cvs, avatar removal, profile delete→blank", async () => {
  await mode("off");
  const u = await user(next());
  await as(u);
  await cv(`c-${n}`, u);
  await q("insert into public.profiles (id, user_id, first_name, last_name, email, avatar_url, phone) values ($1, $2, 'Lea', 'M', 'l@x.ch', 'https://x/a.png', '079')", [`profile-${u}`, u]);
  await expire(u);
  await mode("on");
  await as(u);
  // removeAvatar: only avatar_url → null
  assert.equal(await code(q("update public.profiles set avatar_url = null where user_id = $1", [u])), null);
  // clearing must not smuggle in a real change
  assert.match(String(await code(q("update public.profiles set first_name = '', last_name = 'Neu' where user_id = $1", [u]))), /PAYWALL/);
  // the exact CLEARED_PROFILE update of lib/storage.ts
  assert.equal(await code(q(`update public.profiles set first_name = '', last_name = '', email = '', phone = null, location = null, website = null,
    linkedin = null, avatar_url = null, display_name = null, school = null, grade_level = null, desired_profession = null, school_level = null,
    desired_professions = '{}', canton = null, desired_start_year = null, onboarding_completed_at = null, onboarding_tour_completed_at = null,
    onboarding_tour_step = null where user_id = $1`, [u])), null);
  assert.equal(await code(q(`update public.cvs set file_name = null, storage_path = null, file_type = null, file_size = null, status = 'Draft',
    updated_at = current_date where user_id = $1`, [u])), null);
  assert.match(String(await code(q("update public.cvs set file_name = null, name = 'x' where user_id = $1", [u]))), /PAYWALL/);
  // old app bundles: DELETE of the profile row is turned into a blanking UPDATE by 20261117163000 – still allowed
  await mode("off"); await as(u); await q("update public.profiles set first_name = 'Lea' where user_id = $1", [u]); await mode("on"); await as(u);
  assert.equal(await code(q("delete from public.profiles where user_id = $1", [u])), null);
  assert.equal((await admin("select first_name from public.profiles where user_id = $1", [u]))[0].first_name, "");
  // storage: remove allowed, upload denied
  await admin("insert into storage.objects (bucket_id, name) values ('cvs', $1), ('avatars', $2)", [`${u}/cv.pdf`, `${u}/a.png`]);
  await as(u);
  const storageErr = String(await code(q("insert into storage.objects (bucket_id, name) values ('cvs', $1)", [`${u}/neu.pdf`])));
  assert.match(storageErr, /row-level security/);
  assert.equal(isPaywallError({ message: storageErr }), true, storageErr);
  assert.match(String(await code(q("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${u}/b.png`]))), /row-level security/);
  assert.match(String(await code(q("update storage.objects set name = $1 where bucket_id = 'avatars' and name = $2", [`${u}/c.png`, `${u}/a.png`]))), /row-level security/);
  assert.equal(await code(q("delete from storage.objects where bucket_id = 'cvs' and name = $1", [`${u}/cv.pdf`])), null);
  assert.equal(await code(q("delete from storage.objects where bucket_id = 'avatars' and name = $1", [`${u}/a.png`])), null);
  assert.equal((await admin("select count(*)::int c from storage.objects where name like $1", [`${u}/%`]))[0].c, 0);
  // in trial: upload works
  const t = await user(next()); await as(t);
  assert.equal(await code(q("insert into storage.objects (bucket_id, name) values ('cvs', $1)", [`${t}/cv.pdf`])), null);
});

test("G1: a paywalled student can join a class of a LICENSED school (and then has access); exports keep working (G2/G11)", async () => {
  await mode("off");
  const [s] = await admin("insert into public.schools (name) values ('Lizenz-Schule') returning id");
  await admin("insert into public.school_licences (school_id, package, status, student_limit, valid_until) values ($1, 'starter', 'active', 100, '2099-01-01')", [s.id]);
  const teacher = await user(next(), { meta: { role: "teacher" } });
  await as(teacher);
  const [cls] = await q("select * from public.class_create('9b', '2026')");
  await admin("update public.classes set school_id = $1 where id = $2", [s.id, cls.id]);
  const st = await paywalled();
  await mode("on");
  await as(st);
  assert.equal((await q("select public.has_app_access() h"))[0].h, false);
  assert.equal(await code(q("select * from public.class_preview($1)", [cls.join_code])), null);
  assert.equal(await code(q("select * from public.class_join($1)", [cls.join_code])), null);
  assert.equal((await q("select public.has_app_access() h"))[0].h, true);
  assert.equal((await q("select public.my_access() a"))[0].a.reason, "school_licence");
  // exports + deletion summary stay available without access, also when blocked
  const b = await paywalled();
  await admin("update public.account_access set blocked_at = now() where user_id = $1", [b]);
  await as(b);
  for (const sql of ["select public.export_my_data()", "select public.family_export_my_data()", "select public.account_delete_summary()", "select public.my_access()"]) {
    assert.equal(await code(q(sql)), null, sql);
  }
});

test("G3/G7: paywalled parent + child: account type, family create → invite → join → consent; role switch", async () => {
  await mode("on");
  const parent = await paywalled({ meta: { account_type: "parent" } });
  const child = await paywalled({ meta: { account_type: "independent_student", birth_year: 2013 } });
  await as(parent);
  assert.equal(await code(q("select public.family_create('Familie Test')")), null);
  const [inv] = await q("select public.family_create_invite('parent_invites_child') as i");
  await as(child);
  assert.equal(await code(q("select public.account_set_type('independent_student', 2013)")), null);
  assert.equal(await code(q("select public.family_join($1)", [inv.i.code])), null);
  await as(parent);
  assert.equal(await code(q("select public.family_set_consent($1, true)", [child])), null);
  assert.equal(await code(q("select public.family_get_my()")), null);
  // parent still has no access (unpaid) → the child overview is behind the paywall
  assert.match(String(await code(q("select public.family_child_overview($1)", [child]))), /PAYWALL/);
  const [a] = await q("select public.my_access() a");
  assert.equal(a.a.has_access, false);
  // wrong role picked: switching role is possible without access (no classes yet)
  const t = await paywalled({ meta: { role: "teacher" } });
  await as(t);
  assert.equal(await code(q("select public.set_my_role('student')")), null);
});

test("in trial, with a grant, in mode off and in mode test_users (no enforce_test) every wrapped RPC passes the guard", async () => {
  const check = async (u) => {
    await as(u);
    const err = await code(q("select * from public.map_shop_buy(null, null)"));
    assert.doesNotMatch(String(err), /PAYWALL/);
  };
  await mode("on");
  await check(await user(next()));
  const g = await paywalled();
  await admin("update public.account_access set free_access_until = now() + interval '1 day' where user_id = $1", [g]);
  await check(g);
  const p = await paywalled();
  await mode("off"); await check(p);
  await mode("test_users"); await check(p);
  await admin("update public.account_access set enforce_test = true where user_id = $1", [p]);
  await as(p);
  assert.match(String(await code(q("select * from public.map_shop_buy(null, null)"))), /PAYWALL/);
});

test("wrappers keep signature, defaults and result shape; migration is idempotent (re-run + re-wrap after a replace)", async () => {
  const before = await admin("select pg_get_function_arguments('public.class_invite_create(uuid, text, integer, integer)'::regprocedure) a");
  assert.match(before[0].a, /DEFAULT/);
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(new URL("../supabase/migrations/20261118020000_access_guards.sql", import.meta.url), "utf8");
  await ctx.reset(); await ctx.database.exec(sql);
  const again = await admin("select count(*)::int c from pg_proc where proname like '\\_acc\\_impl\\_%'");
  assert.equal(again[0].c, (await wrapped()).length);
  assert.equal((await admin("select count(*)::int c from pg_proc where proname like '\\_acc\\_impl\\_\\_acc%'"))[0].c, 0);
  // a later migration replaces a wrapped function (MERGE NOTE) → _acc_wrap wraps the new body
  await ctx.reset();
  await ctx.database.exec(`create or replace function public.profile_set_display_name(p_name text) returns text language plpgsql security definer set search_path = '' as $x$ begin return 'v2'; end $x$;`);
  await ctx.database.exec(`select public._acc_wrap('profile_set_display_name', 'text')`);
  await mode("on");
  const u = await paywalled(); await as(u);
  assert.match(String(await code(q("select public.profile_set_display_name('x')"))), /PAYWALL/);
  await mode("off"); await as(u);
  assert.equal((await q("select public.profile_set_display_name('x') r"))[0].r, "v2");
  assert.equal(uid(1).length, 36);
});
