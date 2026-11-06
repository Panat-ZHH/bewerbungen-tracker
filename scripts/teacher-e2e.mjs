// End-to-end flows for the teacher role against a stateful in-memory stand-in for the Supabase RPCs. Nothing real is touched.
// The stand-in mirrors the permission rules of supabase/migrations/20261107000000_teacher_role.sql (real RLS/permissions are
// covered by tests/teacher-sql.test.mjs on pglite). Screenshots: ~/Projects/bewerbungen-tracker-wt/screenshots/teacher/
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3231 node scripts/teacher-e2e.mjs [--only=desktop-light]
import fs from "node:fs";
import { homedir } from "node:os";
import { installStub, launch, newCtx, seedApps } from "./ux-v2-stub.mjs";

export const BASE = process.env.BASE || "http://localhost:3231";
const OUT = (process.env.TEACHER_OUT || `${homedir()}/Projects/bewerbungen-tracker-wt/screenshots/teacher/`).replace(/\/?$/, "/");
fs.mkdirSync(OUT, { recursive: true });
const day = (d) => new Date(Date.now() + d * 864e5).toISOString();
const results = [];

// ---------------------------------------------------------------- in-memory backend (same rules as the migration)
function backend() {
  const S = { classes: {}, members: [], invites: [], news: [], nudges: [], names: { t1: "Frau Keller", t2: "Herr Bachmann", u1: "Lena Müller", s2: "Ben Huber", s3: "Cleo Brunner", u9: "Zoe Fremd" }, seq: 0, apps: seedApps(), co: [] };
  S.members.push(
    { class_id: null, student_id: "s2", joined_at: day(-40), share: true, companies: true, status: true, apps: 2, last: day(-25) },
    { class_id: null, student_id: "s3", joined_at: day(-40), share: false, companies: true, status: true, apps: 0, last: null },
  );
  const err = (m) => ({ __error: m });
  const isTeacher = (me, cid) => { const c = S.classes[cid]; return !!c && (c.owner === me || S.co.some((x) => x.class_id === cid && x.teacher_id === me)); };
  const memberOf = (cid) => S.members.filter((m) => m.class_id === cid);
  const studentRow = (m, inactiveDays = 14) => {
    const mine = m.student_id === "u1"; const apps = mine ? S.apps : [];
    const counts = {}; apps.forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1; });
    const total = mine ? apps.length : m.apps; const last = mine ? apps.map((a) => a.updated_at).sort().pop() : m.last;
    const inactive = !last || (Date.now() - new Date(last).getTime()) / 864e5 > inactiveDays;
    const nud = S.nudges.filter((n) => n.class_id === m.class_id && n.student_id === m.student_id).pop();
    const base = { student_id: m.student_id, display_name: S.names[m.student_id], avatar_seed: m.student_id, joined_at: m.joined_at, hidden: !m.share, last_nudged_at: nud?.at ?? null };
    if (!m.share) return { ...base, total: 0, status_counts: {}, interviews: 0, offers: 0, placed: false, last_activity: null, inactive: false };
    return { ...base, total, status_counts: mine ? counts : { applied: total }, interviews: counts.interview || 0, offers: counts.offer || 0, placed: !!counts.offer, last_activity: last, inactive };
  };
  const forActor = (me) => ({
    social_my_profile: () => [{ user_id: me, role: me.startsWith("t") ? "teacher" : "student", display_name: S.names[me], avatar_seed: me, invite_code: "X-1", share_with_friends: true, email: `${me}@beispiel.ch` }],
    social_update_profile: (b) => { if (b.p_display_name) S.names[me] = b.p_display_name; return [{ user_id: me, role: "teacher", display_name: S.names[me], avatar_seed: me, invite_code: "X-1", share_with_friends: true, email: `${me}@beispiel.ch` }]; },
    class_create: (b) => { if (!me.startsWith("t")) return err("FORBIDDEN"); if (!String(b.p_name || "").trim()) return err("INVALID_NAME"); const id = "c" + ++S.seq; S.classes[id] = { id, name: b.p_name, year: b.p_school_year || "", owner: me, code: "KLAS-7Q2", archived: false, created: day(0) }; S.members.forEach((m) => { if (!m.class_id) m.class_id = id; }); return [{ id, name: b.p_name, school_year: b.p_school_year || "", join_code: "KLAS-7Q2", created_at: day(0), member_count: 0 }]; },
    class_list_mine: () => Object.values(S.classes).filter((c) => isTeacher(me, c.id)).map((c) => ({ id: c.id, name: c.name, school_year: c.year, join_code: c.code, created_at: c.created, member_count: memberOf(c.id).length, archived: c.archived, is_owner: c.owner === me })),
    teacher_dashboard: () => { const cs = Object.values(S.classes).filter((c) => isTeacher(me, c.id)); const rows = cs.map((c) => ({ c, st: memberOf(c.id).map((m) => studentRow(m)) })); const sum = (f) => rows.reduce((a, r) => a + r.st.reduce((x, s) => x + f(s), 0), 0);
      const classes = rows.map(({ c, st }) => ({ id: c.id, name: c.name, school_year: c.year, archived: c.archived, is_owner: c.owner === me, join_code: c.code, students: st.length, applications: st.reduce((a, s) => a + s.total, 0), interviews: st.reduce((a, s) => a + s.interviews, 0), offers: st.reduce((a, s) => a + s.offers, 0), placed: st.filter((s) => s.placed).length, inactive: st.filter((s) => s.inactive).length, hidden: st.filter((s) => s.hidden).length }));
      return { totals: { students: sum(() => 1), classes: cs.length, applications: sum((s) => s.total), interviews: sum((s) => s.interviews), offers: sum((s) => s.offers), placed: sum((s) => (s.placed ? 1 : 0)), inactive: sum((s) => (s.inactive ? 1 : 0)), deadlines_7d: 0, hidden_students: sum((s) => (s.hidden ? 1 : 0)) }, classes, deadlines: [] }; },
    teacher_class_students: (b) => (isTeacher(me, b.p_class_id) ? memberOf(b.p_class_id).map((m) => studentRow(m)) : err("FORBIDDEN")),
    class_student_timeline: (b) => { if (!isTeacher(me, b.p_class_id)) return err("FORBIDDEN"); const m = memberOf(b.p_class_id).find((x) => x.student_id === b.p_student_id); if (!m) return err("NOT_FOUND"); if (!m.share) return [{ hidden: true, application_id: null, company: null, position: null, status: null, event_date: null, kind: null }];
      if (m.student_id !== "u1") return []; return S.apps.flatMap((a) => [["created", a.created_at, "saved"], ["applied", a.applied_at, "applied"], ["deadline", a.deadline, a.status]].filter((e) => e[1]).map(([k, d, st]) => ({ hidden: false, application_id: a.id, company: m.companies ? a.company : null, position: m.companies ? a.position : null, status: m.status ? st : null, event_date: String(d).slice(0, 10), kind: k }))); },
    class_invite_create: (b) => { if (!isTeacher(me, b.p_class_id)) return err("FORBIDDEN"); const r = { id: "i" + ++S.seq, class_id: b.p_class_id, token: `tok${String(S.seq).padStart(3, "0")}_abcdefghijklmnopqrs`, email: b.p_email ?? null, max_uses: b.p_max_uses ?? null, uses: 0, expires_at: day(14), revoked: false, created_at: day(0) }; S.invites.unshift(r); return [{ id: r.id, token: r.token, expires_at: r.expires_at }]; },
    class_invite_create_many: (b) => { if (!isTeacher(me, b.p_class_id)) return err("FORBIDDEN"); return b.p_emails.map((e) => { const r = { id: "i" + ++S.seq, class_id: b.p_class_id, token: `mail${String(S.seq).padStart(3, "0")}_abcdefghijklmnop`, email: e, max_uses: 1, uses: 0, expires_at: day(14), revoked: false, created_at: day(0) }; S.invites.unshift(r); return { email: e, token: r.token }; }); },
    class_invite_list: (b) => (isTeacher(me, b.p_class_id) ? S.invites.filter((i) => i.class_id === b.p_class_id) : err("FORBIDDEN")),
    class_invite_revoke: (b) => { const i = S.invites.find((x) => x.id === b.p_invitation_id); if (!i || !isTeacher(me, i.class_id)) return err("FORBIDDEN"); i.revoked = true; return null; },
    class_invite_preview: (b) => { const i = S.invites.find((x) => x.token === b.p_token); const bad = (reason) => [{ valid: false, reason, class_id: null, name: null, school_year: null, teacher_name: null, member_count: null, already_member: false }]; if (!i) return bad("INVALID"); if (i.revoked) return bad("REVOKED"); const c = S.classes[i.class_id]; const already = memberOf(c.id).some((m) => m.student_id === me); if (!already && i.max_uses !== null && i.uses >= i.max_uses) return bad("USED_UP"); if (!already && i.email && i.email !== (me === "u1" ? "lena@beispiel.ch" : `${me}@beispiel.ch`)) return bad("WRONG_EMAIL"); return [{ valid: true, reason: null, class_id: c.id, name: c.name, school_year: c.year, teacher_name: S.names[c.owner], member_count: memberOf(c.id).length, already_member: already }]; },
    class_invite_accept: (b) => { const pv = forActor(me).class_invite_preview(b)[0]; if (!pv.valid) return err(pv.reason); const i = S.invites.find((x) => x.token === b.p_token); const c = S.classes[i.class_id]; if (!memberOf(c.id).some((m) => m.student_id === me)) { S.members.push({ class_id: c.id, student_id: me, joined_at: day(0), share: true, companies: true, status: true, apps: 0, last: null }); i.uses++; } return [{ class_id: c.id, name: c.name, school_year: c.year, teacher_name: S.names[c.owner], share_applications: true, joined_at: day(0) }]; },
    class_my_classes: () => S.members.filter((m) => m.student_id === me).map((m) => { const c = S.classes[m.class_id]; return { class_id: c.id, name: c.name, school_year: c.year, teacher_name: S.names[c.owner], share_applications: m.share, share_companies: m.companies, share_status: m.status, joined_at: m.joined_at, last_nudge_at: S.nudges.filter((n) => n.student_id === me).pop()?.at ?? null, announcements_count: S.news.filter((n) => n.class_id === c.id).length }; }),
    class_set_sharing_v2: (b) => { const m = S.members.find((x) => x.class_id === b.p_class_id && x.student_id === me); if (!m) return err("NOT_FOUND"); m.share = b.p_share; if (b.p_companies !== null && b.p_companies !== undefined) m.companies = b.p_companies; if (b.p_status !== null && b.p_status !== undefined) m.status = b.p_status; return null; },
    class_announce: (b) => { if (!isTeacher(me, b.p_class_id)) return err("FORBIDDEN"); S.news.unshift({ id: "n" + ++S.seq, class_id: b.p_class_id, text: b.p_text, created_at: day(0), author_name: S.names[me] }); return "n"; },
    class_announcement_list: (b) => S.news.filter((n) => n.class_id === b.p_class_id && (isTeacher(me, b.p_class_id) || S.members.some((m) => m.class_id === b.p_class_id && m.student_id === me))),
    class_nudge: (b) => { if (!isTeacher(me, b.p_class_id)) return err("FORBIDDEN"); const last = S.nudges.filter((n) => n.class_id === b.p_class_id && n.student_id === b.p_student_id).pop(); if (last && Date.now() - new Date(last.at) < 3 * 864e5) return err("RATE_LIMITED"); S.nudges.push({ class_id: b.p_class_id, student_id: b.p_student_id, at: day(0), message: b.p_message }); return null; },
    my_notifications: () => S.nudges.filter((n) => n.student_id === me).map((n, i) => ({ id: "nt" + i, kind: "nudge", class_id: n.class_id, class_name: S.classes[n.class_id].name, message: n.message ?? null, created_at: n.at, read: false })),
    class_coteachers: (b) => (isTeacher(me, b.p_class_id) ? S.co.filter((x) => x.class_id === b.p_class_id).map((x) => ({ teacher_id: x.teacher_id, display_name: S.names[x.teacher_id], avatar_seed: x.teacher_id, email: `${x.teacher_id}@beispiel.ch`, added_at: day(-1) })) : err("FORBIDDEN")),
    class_visibility_info: () => ({ teacher_sees: ["Firmenname und Position (wenn freigegeben)", "Status deiner Bewerbungen"], teacher_never_sees: ["Notizen", "Gehalt", "Lebenslauf und Dokumente"] }),
  });
  return { S, forActor };
}

// ---------------------------------------------------------------- harness
const browser = await launch();
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
let current = "";
const check = (ok, text) => { results.push({ ok, text: `[${current}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${current}]`, text); };
const problems = [];

async function actor(be, { me, role, vp, auth = true }) {
  const ctx = await newCtx(browser, vp);
  const meta = role === "teacher" && me === "t1" ? undefined : undefined; void meta;
  const state = await installStub(ctx, { role, authed: auth, rpc: be.forActor(me) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${current}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|status of 4\d\d|status of 5\d\d/.test(m.text())) problems.push(`[${current}] console ${m.text().slice(0, 200)}`); });
  return { ctx, page, state };
}

async function flow(tag, vp) {
  current = tag; if (only && only !== tag) return;
  const shot = (page, name, full = true) => page.screenshot({ path: `${OUT}${tag}-${name}.png`, fullPage: full });
  const be = backend(); const { S } = be;
  const wait = async (page, text, t = 45000) => { try { await page.getByText(text).and(page.locator(":visible")).first().waitFor({ timeout: t }); } catch { await shot(page, "FAILED-waiting-for-" + String(text).replace(/\W+/g, "_").slice(0, 30)); throw new Error(`waiting for "${text}" at ${page.url()}`); } };
  const T = await actor(be, { me: "t1", role: "teacher", vp }); const tp = T.page;

  // 1. teacher logs in -> onboarding (first teacher login has no teacher_onboarded flag)
  await tp.goto(BASE + "/teacher", { waitUntil: "domcontentloaded" });
  await tp.waitForURL("**/teacher/onboarding**", { timeout: 90000 }).catch(() => {});
  check(tp.url().includes("/teacher/onboarding"), "first teacher visit is routed to onboarding");
  await tp.getByRole("heading", { name: /Willkommen/ }).waitFor(); await shot(tp, "01-onboarding-role");
  await tp.getByRole("button", { name: "Weiter" }).click();
  await tp.getByLabel("Anzeigename").fill("Frau Keller"); await shot(tp, "02-onboarding-name");
  await tp.getByRole("button", { name: /Weiter/ }).click();
  await tp.getByLabel("Klassenname").fill("Informatik 4a"); await shot(tp, "03-onboarding-class");
  await tp.getByRole("button", { name: "Klasse erstellen" }).click();
  await wait(tp, "KLAS-7Q2"); await shot(tp, "04-onboarding-done");
  check(Object.values(S.classes).some((c) => c.name === "Informatik 4a" && c.owner === "t1"), "class created in onboarding (class_create)");

  // 2. dashboard (class has seeded students s2 active-ish/inactive and s3 hidden)
  await tp.goto(BASE + "/teacher", { waitUntil: "domcontentloaded" });
  await wait(tp, "Informatik 4a"); await tp.waitForTimeout(500); await shot(tp, "05-dashboard");
  check(!tp.url().includes("onboarding"), "dashboard opens after onboarding");
  const overflow = await tp.evaluate(() => document.documentElement.scrollWidth - innerWidth); check(overflow <= 1, `no horizontal overflow on dashboard (${overflow}px)`);

  // 3. create a second class via dashboard dialog
  const create = tp.getByRole("button", { name: "Klasse erstellen" }).first();
  if (await create.count()) { await create.click(); await tp.getByLabel("Klassenname").fill("Mediamatik 3b"); await shot(tp, "06-create-class-dialog", false); await tp.getByRole("dialog").getByRole("button", { name: /Erstellen|Klasse erstellen/ }).last().click(); await tp.waitForTimeout(1200); check(Object.values(S.classes).length === 2, "second class created from dashboard"); await tp.goto(BASE + "/teacher", { waitUntil: "domcontentloaded" }); await wait(tp, "Informatik 4a"); await shot(tp, "06b-dashboard-two-classes"); }

  // 4. class detail, invites: link, code, email list
  await tp.locator('a[href*="/teacher/classes/"]', { hasText: "Informatik 4a" }).first().click(); await tp.waitForURL("**/teacher/classes/**"); await wait(tp, "Ben Huber"); await shot(tp, "07-class-students");
  await tp.getByRole("tab", { name: /Einladen/ }).click(); await wait(tp, "KLAS-7Q2"); await shot(tp, "08-invite");
  await tp.getByRole("button", { name: "Offenen Link erstellen" }).click(); await tp.waitForTimeout(600);
  const open = S.invites.find((i) => !i.email); check(!!open, "open invite link created (class_invite_create)");
  await tp.getByLabel("E-Mail-Adressen").fill("lena@beispiel.ch, anna@schule.ch\nkaputt");
  await tp.getByRole("button", { name: "Einladungen erstellen" }).click(); await wait(tp, "persönliche Links bereit"); await shot(tp, "09-invite-created");
  const mailInvite = S.invites.find((i) => i.email === "lena@beispiel.ch"); check(S.invites.filter((i) => i.email).length === 2 && !!mailInvite, "email list invites created, invalid entry skipped");
  await tp.getByRole("button", { name: /Einladung für anna@schule.ch widerrufen/ }).click(); await tp.waitForTimeout(500);
  check(S.invites.find((i) => i.email === "anna@schule.ch").revoked, "invite revoked (class_invite_revoke)");

  // 5. a stranger (student not invited by mail) and a revoked/invalid token are blocked
  const X = await actor(be, { me: "u9", role: "student", vp });
  await X.page.goto(BASE + `/classes/join/${mailInvite.token}`, { waitUntil: "domcontentloaded" }); await wait(X.page, "Einladung nicht gültig"); await shot(X.page, "10-stranger-wrong-email");
  check(!S.members.some((m) => m.student_id === "u9"), "invite for another e-mail address cannot be used by a stranger");
  await X.page.goto(BASE + `/classes/join/${S.invites.find((i) => i.email === "anna@schule.ch").token}`, { waitUntil: "domcontentloaded" }); await wait(X.page, "Einladung nicht gültig");
  check(!S.members.some((m) => m.student_id === "u9"), "revoked invite is rejected");
  await X.page.goto(BASE + "/teacher/classes/" + Object.keys(S.classes)[0], { waitUntil: "domcontentloaded" }); await X.page.waitForURL("**/dashboard**", { timeout: 90000 }).catch(() => {});
  check(!X.page.url().includes("/teacher"), "student is redirected away from /teacher/*");
  await X.ctx.close();

  // 6. student joins via the personal link, sets consent
  const St = await actor(be, { me: "u1", role: "student", vp }); const sp = St.page;
  await sp.goto(BASE + `/classes/join/${mailInvite.token}`, { waitUntil: "domcontentloaded" }); await wait(sp, "Informatik 4a"); await shot(sp, "11-student-join");
  await sp.getByRole("button", { name: /Beitreten und Freigabe erlauben/ }).click(); await wait(sp, "Du bist beigetreten"); await shot(sp, "12-student-joined");
  check(S.members.some((m) => m.student_id === "u1" && m.share), "student joined with the personal invite link");
  check(S.invites.find((i) => i.id === mailInvite.id).uses === 1, "invite use counted");
  await sp.goto(BASE + "/classes", { waitUntil: "domcontentloaded" }); await wait(sp, "Fortschritt mit Lehrperson teilen"); await shot(sp, "13-student-classes");

  // 7. teacher: overview, KPIs, filters, detail, CSV, nudge
  await tp.goto(BASE + "/teacher/classes/" + Object.keys(S.classes)[0], { waitUntil: "domcontentloaded" }); await wait(tp, "Lena Müller"); await tp.waitForTimeout(500); await shot(tp, "14-class-with-student");
  const rows = await tp.locator("tbody tr, [data-student-card]").count(); check(rows >= 3 || (await tp.getByText("Ben Huber").count()) > 0, "student list shows joined student next to seeded students");
  await tp.goto(BASE + "/teacher", { waitUntil: "domcontentloaded" }); await wait(tp, "Informatik 4a"); await tp.waitForTimeout(500); await shot(tp, "15-dashboard-kpis");
  check(await tp.getByText(/3 Schüler/).count() > 0, "dashboard class card counts the joined student (3 Schüler)");
  await tp.goto(BASE + "/teacher/classes/" + Object.keys(S.classes)[0], { waitUntil: "domcontentloaded" }); await wait(tp, "Lena Müller");
  const inactiveTab = tp.getByRole("tab", { name: /^Inaktiv/ });
  if (await inactiveTab.count()) { await inactiveTab.click(); await tp.waitForTimeout(300); check(await tp.getByText("Ben Huber").count() > 0 && await tp.getByText("Lena Müller").count() === 0, "filter 'Inaktiv' lists only inactive students"); await shot(tp, "16-filter-inactive"); await tp.getByRole("tab", { name: /^Alle/ }).click(); }
  await tp.getByLabel("Schüler suchen").fill("lena"); await tp.waitForTimeout(300); check(await tp.getByText("Ben Huber").count() === 0 && await tp.getByText("Lena Müller").count() > 0, "search narrows the list"); await tp.getByLabel("Schüler suchen").fill("");
  const [dl] = await Promise.all([tp.waitForEvent("download"), tp.getByRole("button", { name: "CSV" }).click()]);
  const csv = fs.readFileSync(await dl.path(), "utf8"); check(csv.includes("Lena Müller") && csv.includes("Ben Huber") && !csv.includes("Notiz") && !csv.includes("Rückruf"), "CSV export has the students and no private fields");
  // nudge Ben (inactive)
  const ben = tp.locator("tbody tr, ul[aria-label=\"Schüler als Karten\"] > li", { hasText: "Ben Huber" }).filter({ visible: true }).first();
  await ben.getByRole("button", { name: /Erinnern/ }).first().click(); await tp.waitForTimeout(300); await shot(tp, "17-nudge-dialog", false);
  await tp.getByRole("button", { name: "Erinnerung senden" }).last().click(); await tp.waitForTimeout(700);
  check(S.nudges.some((n) => n.student_id === "s2"), "nudge sent (class_nudge)");
  await ben.getByRole("button", { name: /Erinn/ }).first().click().catch(() => {}); await tp.getByRole("button", { name: "Erinnerung senden" }).last().click({ timeout: 3000 }).catch(() => {}); await tp.waitForTimeout(500);
  check(S.nudges.filter((n) => n.student_id === "s2").length === 1, "second nudge within 3 days is blocked");
  await tp.keyboard.press("Escape");
  // student detail with company names
  await tp.goto(BASE + `/teacher/classes/${Object.keys(S.classes)[0]}/students/u1`, { waitUntil: "domcontentloaded" }); await wait(tp, "Swisscom"); await shot(tp, "18-student-detail");
  check(await tp.getByText("Swisscom").count() > 0, "student detail shows company names when allowed");
  // announcement
  await tp.goto(BASE + "/teacher/classes/" + Object.keys(S.classes)[0], { waitUntil: "domcontentloaded" }); await wait(tp, "Lena Müller");
  await tp.getByRole("tab", { name: /Mitteilungen/ }).click(); await tp.getByLabel("Nachricht").fill("Bis Freitag drei Bewerbungen."); await tp.getByRole("button", { name: "Veröffentlichen" }).click(); await wait(tp, "Bis Freitag drei Bewerbungen."); await shot(tp, "19-announcement");

  // 8. consent changes reach the teacher view
  await sp.goto(BASE + "/classes", { waitUntil: "domcontentloaded" }); await wait(sp, "Firmennamen zeigen");
  await sp.getByRole("switch", { name: /Firmennamen zeigen/ }).evaluate((el) => el.click()); await sp.waitForTimeout(600);
  check(S.members.find((m) => m.student_id === "u1").companies === false, "student turns off company names (class_set_sharing_v2)");
  await shot(sp, "20-student-consent-companies-off");
  await tp.goto(BASE + `/teacher/classes/${Object.keys(S.classes)[0]}/students/u1`, { waitUntil: "domcontentloaded" }); await wait(tp, "Firma nicht freigegeben"); await shot(tp, "21-student-detail-no-companies");
  check(await tp.getByText("Swisscom").count() === 0, "company names are hidden from the teacher after opting out");
  await sp.getByRole("switch", { name: /Fortschritt mit Lehrperson teilen/ }).evaluate((el) => el.click()); await sp.waitForTimeout(600);
  await tp.reload({ waitUntil: "domcontentloaded" }); await wait(tp, "teilt keine Bewerbungsdaten"); await shot(tp, "22-student-detail-hidden");
  check(S.members.find((m) => m.student_id === "u1").share === false, "student pauses sharing; teacher sees only the hidden notice");
  check(await tp.getByText("Swisscom").count() === 0 && await tp.getByText("UBS").count() === 0, "no application data visible while sharing is off");
  await sp.getByRole("switch", { name: /Fortschritt mit Lehrperson teilen/ }).evaluate((el) => el.click()); await sp.waitForTimeout(400);
  await sp.goto(BASE + "/classes", { waitUntil: "domcontentloaded" }); await wait(sp, "Fortschritt mit Lehrperson teilen"); await shot(sp, "23-student-notification");
  await St.ctx.close();

  // 9. other teacher is blocked; student cannot call teacher views
  const T2 = await actor(be, { me: "t2", role: "teacher", vp });
  await T2.page.goto(BASE + "/teacher/classes/" + Object.keys(S.classes)[0], { waitUntil: "domcontentloaded" }); await T2.page.waitForTimeout(2500); await shot(T2.page, "24-other-teacher-blocked");
  const body = await T2.page.locator("body").innerText();
  check(!body.includes("Lena Müller") && !body.includes("Ben Huber"), "other teacher cannot see the students of a foreign class");
  check(T2.state.calls.every((c) => !c.rpc || c.rpc !== "class_nudge"), "other teacher made no mutating call");
  await T2.ctx.close();
  await T.ctx.close();
}

const CONFIGS = [["desktop-light", { w: 1280, h: 800 }], ["desktop-dark", { w: 1280, h: 800, dark: true }], ["mobile-light", { w: 375, h: 812 }], ["mobile-dark", { w: 375, h: 812, dark: true }]];
for (const [tag, vp] of CONFIGS) {
  try { await flow(tag, vp); } catch (e) { check(false, `flow aborted: ${String(e.message).split("\n")[0]}`); }
}
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n==== teacher e2e: ${results.length - failed.length} PASS, ${failed.length} FAIL, ${problems.length} page problems`);
for (const p of [...new Set(problems)]) console.log("  PROBLEM", p);
fs.writeFileSync(OUT + "summary.json", JSON.stringify({ results, problems: [...new Set(problems)] }, null, 2));
process.exit(failed.length || problems.length ? 1 : 0);
