// Throwaway users for scripts/mobile-responsive-e2e.mjs (live Supabase, confirmed users, no e-mails are sent).
// Every user is `probe-rel-mobile-<key>-<stamp>@wendapply-probe.invalid`. `setupUsers()` writes its state file
// progressively, so `cleanupUsers()` (always called from a finally{}) removes everything even after a crash, and
// `cleanupUsers({ all: true })` removes leftovers of earlier runs. Secrets are read from ~/.config/alfred/tmp/wendapply-sr.env
// (keys SR + ANON) and are never printed. SQL goes through ~/JARVIS/bin/sb privat (needed for the school admin role only).
//
//   node scripts/mobile-users.mjs setup     # prints the state file path
//   node scripts/mobile-users.mjs cleanup   # removes the users of the state file + every probe-rel-mobile-% leftover
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const PREFIX = "probe-rel-mobile-";
const HOME = homedir();
const REF = process.env.SUPABASE_REF || "bhwreehwirrloxagyypi";
const SB = `https://${REF}.supabase.co`;
export const DEFAULT_STATE = join(HOME, "Projects/bewerbungen-tracker-wt/_mobile/mobile-users-state.json");

let secrets;
function env() {
  if (secrets) return secrets;
  const file = process.env.WENDAPPLY_SR_ENV || join(HOME, ".config/alfred/tmp/wendapply-sr.env");
  if (!existsSync(file)) throw new Error(`secrets file missing (${file}); live role pages need SR + ANON`);
  secrets = Object.fromEntries(readFileSync(file, "utf8").trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  if (!secrets.SR || !secrets.ANON) throw new Error("secrets file must contain SR and ANON");
  return secrets;
}
const srH = () => ({ apikey: env().SR, Authorization: "Bearer " + env().SR, "content-type": "application/json" });
const j = async (r) => { const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { b = t.slice(0, 300); } return { status: r.status, body: b }; };
const authAdmin = (path, opts = {}) => fetch(SB + "/auth/v1/admin" + path, { ...opts, headers: srH() }).then(j);
const srRest = (path, opts = {}) => fetch(SB + "/rest/v1" + path, { ...opts, headers: { ...srH(), Prefer: "return=representation", ...(opts.headers || {}) } }).then(j);
const userRpc = (tok, fn, body = {}) => fetch(SB + "/rest/v1/rpc/" + fn, { method: "POST", headers: { apikey: env().ANON, Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(body) }).then(j);
const sql = (q) => {
  const out = execFileSync(join(HOME, "JARVIS/bin/sb"), ["privat", "db", "query", "--linked", "--project-ref", REF, q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out.slice(out.indexOf("{"))).rows;
};
const esc = (s) => String(s).replace(/'/g, "''");
async function token(email, pw) {
  const r = await fetch(SB + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: env().ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: pw }) }).then(j);
  if (r.status !== 200) throw new Error("password grant " + r.status);
  return r.body.access_token;
}
const day = (d = 0) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const one = (b) => (Array.isArray(b) ? b[0] : b);

/**
 * Creates: schueler (class member, 4 applications incl. very long names, a friend, an unplaced "Sport-Roller Limette" + 300 points),
 * schuelerfresh (not onboarded), friend, parent (family with connected child famkid, active family plan), parentfresh (trial, no family),
 * teacher (school with active licence, 2 classes, 3 pupils), teacherfresh, schooladmin. Returns the state object.
 */
export async function setupUsers({ stateFile = DEFAULT_STATE, log = () => {} } = {}) {
  const stamp = Date.now().toString(36);
  const pw = `Probe-${stamp}-${randomUUID().slice(0, 8)}-xY9!`;
  const S = { stamp, pw, users: {}, schools: [], classes: [], families: [], vars: {} };
  mkdirSync(dirname(stateFile), { recursive: true });
  const save = () => writeFileSync(stateFile, JSON.stringify(S, null, 2), { mode: 0o600 });
  save();
  let appN = 0;
  const APP = (uid, status, company, position, deadline = null) => ({ id: `${PREFIX}${stamp}-${++appN}`, user_id: uid, company, position, category: "lehrstelle", status, created_at: day(-20 + appN), updated_at: day(-2), location: "Winterthur-Oberwinterthur", deadline, notes: "Probe (mobile responsive test)", salary_min: 900 });
  async function mkUser(key, meta) {
    const email = `${PREFIX}${key}-${stamp}@wendapply-probe.invalid`;
    const r = await authAdmin("/users", { method: "POST", body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: meta }) });
    if (r.status >= 300) throw new Error(`create ${key}: ${r.status}`);
    S.users[key] = { id: r.body.id, email }; save();
    return S.users[key];
  }
  const student = { role: "student", account_type: "independent_student", birth_year: 2010, onboarding_tour_done: true, student_onboarded: true };

  // --- pupils
  const kid = await mkUser("schueler", student);
  const kt = await token(kid.email, pw);
  await userRpc(kt, "account_set_type", { p_type: "independent_student", p_birth_year: 2010 });
  await srRest(`/profiles?user_id=eq.${kid.id}`, { method: "PATCH", body: JSON.stringify({ first_name: "Lea-Sophie", last_name: "Brunnenmeister-Oberholzer" }) });
  await userRpc(kt, "social_update_profile", { p_display_name: "Lea-Sophie B.", p_avatar_seed: null, p_share_with_friends: true });
  const apps = [
    APP(kid.id, "applied", "Probe Informatikdienstleistungsgesellschaft Oberwinterthur AG", "Informatikerin EFZ Applikationsentwicklung", day(5)),
    APP(kid.id, "interview", "Probe Bäckerei-Konditorei Langstrasse", "Bäckerin-Konditorin-Confiseurin EFZ"),
    APP(kid.id, "offer", "Probe Gemeindeverwaltung", "Kauffrau EFZ"),
    APP(kid.id, "saved", "Probe Spital", "Fachfrau Gesundheit EFZ", day(12)),
  ];
  const ar = await srRest("/applications", { method: "POST", body: JSON.stringify(apps) });
  log("apps", ar.status);
  S.vars.appId = apps[0].id;
  // village: points + one unplaced item (the item from Panat's screenshot: one unplaced, one placed)
  await srRest("/map_wallets", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ user_id: kid.id, balance: 300, earned: 420 }) });
  const it = await srRest("/map_items", { method: "POST", body: JSON.stringify({ id: randomUUID(), user_id: kid.id, item_type: "scooter_sport_lime", price_paid: 120, x: null, z: null }) });
  const it2 = await srRest("/map_items", { method: "POST", body: JSON.stringify({ id: randomUUID(), user_id: kid.id, item_type: "scooter_sport_lime", price_paid: 120, x: 6, z: 3 }) });
  log("items", it.status, it2.status);
  const prof = one((await userRpc(kt, "social_my_profile")).body);
  S.vars.inviteCode = prof?.invite_code || "";

  const fr = await mkUser("friend", student);
  const ft = await token(fr.email, pw);
  await userRpc(ft, "social_update_profile", { p_display_name: "Noah-Alexander F.", p_avatar_seed: null, p_share_with_friends: true });
  if (S.vars.inviteCode) {
    const req = one((await userRpc(ft, "social_send_request", { p_code_or_email: S.vars.inviteCode })).body);
    if (req?.id && req.status !== "accepted") log("accept", (await userRpc(kt, "social_respond_request", { p_request_id: req.id, p_accept: true })).status);
  }
  S.vars.friendId = fr.id; save();

  await mkUser("schuelerfresh", { role: "student" });

  // --- family: parent + connected child + active family plan
  const par = await mkUser("parent", { role: "student", account_type: "parent", onboarding_tour_done: true });
  const fk = await mkUser("famkid", student);
  const pt = await token(par.email, pw), fkt = await token(fk.email, pw);
  await userRpc(pt, "account_set_type", { p_type: "parent", p_birth_year: null });
  await userRpc(fkt, "account_set_type", { p_type: "independent_student", p_birth_year: 2010 });
  await srRest(`/profiles?user_id=eq.${par.id}`, { method: "PATCH", body: JSON.stringify({ first_name: "Marco", last_name: "Probe-Brunnenmeister" }) });
  await srRest(`/profiles?user_id=eq.${fk.id}`, { method: "PATCH", body: JSON.stringify({ first_name: "Mia-Valentina", last_name: "Probe" }) });
  await userRpc(pt, "family_create", { p_name: "Probe Rel Mobile Familie Brunnenmeister-Oberholzer" });
  const famId = (await userRpc(pt, "family_get_my")).body?.family?.id;
  if (famId) { S.families.push(famId); save(); }
  const inv = await userRpc(pt, "family_create_invite", { p_direction: "parent_invites_child" });
  const famCode = inv.body?.code || one(inv.body)?.code;
  if (famCode) await userRpc(fkt, "family_join", { p_code: famCode });
  S.vars.familyChildId = fk.id; save();
  await userRpc(fkt, "family_set_share", { p_settings: { progress: true, applications: true, village: true } });
  await srRest("/applications", { method: "POST", body: JSON.stringify([APP(fk.id, "applied", "Probe Druckerei Langstrassen AG", "Polygrafin EFZ"), APP(fk.id, "interview", "Probe Spital", "Fachfrau Gesundheit EFZ", day(6))]) });
  if (famId) log("family plan", (await srRest("/school_licences", { method: "POST", body: JSON.stringify({ family_id: famId, plan_type: "family", package: "family", student_limit: 2, seats_parents: 1, seats_children: 1, status: "active", valid_from: day(-1), valid_until: day(300), source: "manual", notes: "probe-rel-mobile (temporary)" }) })).status);
  // a fresh invite code for the public invitation page
  const inv2 = await userRpc(pt, "family_create_invite", { p_direction: "parent_invites_child" });
  S.vars.familyCode = inv2.body?.code || one(inv2.body)?.code || famCode || "FALSCH12"; save();
  const pf = await mkUser("parentfresh", { role: "student", account_type: "parent", onboarding_tour_done: true });
  await userRpc(await token(pf.email, pw), "account_set_type", { p_type: "parent", p_birth_year: null });

  // --- school + teacher + class with pupils (incl. the main schueler)
  const sch = await srRest("/schools", { method: "POST", body: JSON.stringify({ name: `Probe Rel Mobile Sekundarschule Oberwinterthur-Stadel ${stamp}`, canton_or_state: "ZH", country: "CH" }) });
  const schoolId = one(sch.body)?.id; if (!schoolId) throw new Error("school " + sch.status);
  S.schools.push(schoolId); save();
  log("licence", (await srRest("/school_licences", { method: "POST", body: JSON.stringify({ school_id: schoolId, plan_type: "school", package: "starter", student_limit: 30, source: "manual", billing_interval: "yearly", notes: "probe-rel-mobile (temporary)", status: "active", valid_from: day(-10), valid_until: day(300) }) })).status);
  async function mkTeacher(key, meta, name) {
    const t = await mkUser(key, { role: "teacher", role_confirmed: true, ...meta });
    await srRest("/school_teachers", { method: "POST", body: JSON.stringify({ school_id: schoolId, user_id: t.id }) });
    const tok = await token(t.email, pw);
    if (one((await userRpc(tok, "social_my_profile")).body)?.role !== "teacher") await userRpc(tok, "set_my_role", { p_role: "teacher" });
    if (name) await userRpc(tok, "social_update_profile", { p_display_name: name, p_avatar_seed: null, p_share_with_friends: false });
    return { ...t, tok };
  }
  const t = await mkTeacher("teacher", { teacher_onboarded: true }, "Frau Brunnenmeister-Keller");
  await mkTeacher("teacherfresh", {}, null);
  const cls = one((await userRpc(t.tok, "class_create", { p_name: "Sek 3b Berufswahl Probe Oberwinterthur", p_school_year: "2026/27" })).body);
  if (!cls?.id) throw new Error("class_create failed");
  S.classes.push(cls.id); S.vars.classId = cls.id; S.vars.classCode = cls.join_code; save();
  const c2 = one((await userRpc(t.tok, "class_create", { p_name: "Sek 3a Probe", p_school_year: "2026/27" })).body);
  if (c2?.id) { S.classes.push(c2.id); save(); }
  for (const [tok, key] of [[kt, "schueler"], [ft, "friend"]]) {
    await userRpc(tok, "class_join", { p_code: cls.join_code });
    await userRpc(tok, "class_set_sharing_v2", { p_class_id: cls.id, p_share: true, p_companies: true, p_status: true });
    log("joined", key);
  }
  S.vars.studentId = kid.id; save();
  await srRest("/class_announcements", { method: "POST", body: JSON.stringify({ class_id: cls.id, author_id: t.id, text: "Probe: Bitte bis Freitag zwei Bewerbungen abschicken. Denkt an das Motivationsschreiben und die Schnupperlehrberichte!" }) });

  // --- school admin (pure) of the same school
  const adm = await mkUser("schooladmin", { role: "student", role_confirmed: true, full_name: "Sandra Probe" });
  sql(`select public.platform_add_school_admin('${schoolId}', '${esc(adm.email)}', true)`);
  log("SETUP OK", stamp);
  return S;
}

/** Deletes everything of the state file and (all=true) every leftover probe-rel-mobile-% user. Returns the number of users left. */
export async function cleanupUsers({ stateFile = DEFAULT_STATE, all = true, log = () => {} } = {}) {
  const S = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { users: {}, schools: [], classes: [], families: [] };
  const users = Object.values(S.users || {});
  if (all) {
    const rows = sql(`select id::text, email from auth.users where email like '${PREFIX}%'`);
    for (const r of rows) if (!users.some((u) => u.id === r.id)) users.push({ id: r.id, email: r.email });
  }
  try {
    for (const u of users) {
      for (const r of (await srRest(`/classes?teacher_id=eq.${u.id}&select=id`)).body || []) if (!S.classes.includes(r.id)) S.classes.push(r.id);
      for (const r of (await srRest(`/families?created_by=eq.${u.id}&select=id`)).body || []) if (!S.families.includes(r.id)) S.families.push(r.id);
    }
    for (const id of S.classes) await srRest(`/classes?id=eq.${id}`, { method: "DELETE" });
    for (const id of S.families) { await srRest(`/school_licences?family_id=eq.${id}`, { method: "DELETE" }); await srRest(`/families?id=eq.${id}`, { method: "DELETE" }); }
    const schools = new Set(S.schools || []);
    if (all) for (const r of sql("select id::text from public.schools where name like 'Probe Rel Mobile%'")) schools.add(r.id);
    for (const id of schools) {
      await srRest(`/school_licences?school_id=eq.${id}`, { method: "DELETE" });
      await srRest(`/school_teachers?school_id=eq.${id}`, { method: "DELETE" });
      try { sql(`delete from public.school_admins where school_id='${id}'`); } catch { /* table may not exist on old schemas */ }
      await srRest(`/schools?id=eq.${id}`, { method: "DELETE" });
    }
    await srRest(`/applications?id=like.${PREFIX}*`, { method: "DELETE" });
  } catch (e) { log("cleanup data error", String(e).slice(0, 200)); }
  for (const u of users) await authAdmin("/users/" + u.id, { method: "DELETE" });
  const left = sql(`select (select count(*) from auth.users where email like '${PREFIX}%')::int users,
    (select count(*) from public.schools where name like 'Probe Rel Mobile%')::int schools,
    (select count(*) from public.families where name like 'Probe Rel Mobile%')::int families,
    (select count(*) from public.school_licences where notes like 'probe-rel-mobile%')::int licences,
    (select count(*) from public.applications where id like '${PREFIX}%')::int applications`)[0];
  log("left", JSON.stringify(left));
  return left;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  const log = (...a) => console.log(...a);
  if (cmd === "setup") { try { await setupUsers({ log }); console.log("state:", DEFAULT_STATE); } catch (e) { console.error("setup failed:", e.message); await cleanupUsers({ log }); process.exitCode = 1; } }
  else if (cmd === "cleanup") { const l = await cleanupUsers({ log }); if (l.users) process.exitCode = 1; }
  else console.log("usage: node scripts/mobile-users.mjs setup|cleanup");
}
