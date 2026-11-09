// Screenshots + interaction checks for part g (teacher) against a stubbed Supabase.
// Usage: PLAYWRIGHT=/Users/panat.ruangsri/JARVIS/browser-profiles/node_modules/playwright-core/index.mjs CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BASE=http://localhost:3107 node tests/teacher-g-shots.mjs
import { mkdirSync } from "node:fs";
import { installStub } from "../scripts/ux-v2-stub.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3107";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/p0-g/`;
mkdirSync(OUT, { recursive: true });
const day = (d) => new Date(Date.now() + d * 864e5).toISOString();
const dateOnly = (d) => day(d).slice(0, 10);

function makeRpc(variant = "full") {
  const st = { deadlines: [{ id: "d1", class_id: "c1", class_name: "Informatik 4a", title: "Dossier abgeben", due_date: dateOnly(2), note: "bis 12 Uhr im Sekretariat" }], selfReport: false, calls: [] };
  const student = (id, name, o = {}) => ({ student_id: id, display_name: name, avatar_seed: id, joined_at: day(-40), hidden: false, total: 5, status_counts: { applied: 3, interview: 1 }, interviews: 1, offers: 0, placed: false, last_activity: day(-2), inactive: false, last_nudged_at: null, ...o });
  const students = variant === "nostudents" ? [] : variant === "noapps" ? [student("s1", "Anna Meier", { total: 0, status_counts: {}, interviews: 0, last_activity: null })] : [
    student("s1", "Anna Meier", { total: 8, offers: 1, placed: true }), student("s2", "Ben Huber", { total: 2, interviews: 0, inactive: true, last_activity: day(-25) }),
    student("s3", "Cleo Brunner", { hidden: true, total: 0, status_counts: {}, interviews: 0, last_activity: null }), student("s4", "", { total: 0, status_counts: {}, interviews: 0, last_activity: null }),
  ];
  const totals = variant === "nostudents" ? { students: 0, classes: 1, applications: 0, interviews: 0, offers: 0, placed: 0, inactive: 0, deadlines_7d: 0, hidden_students: 0 }
    : variant === "noapps" ? { students: 1, classes: 1, applications: 0, interviews: 0, offers: 0, placed: 0, inactive: 0, deadlines_7d: 0, hidden_students: 0 }
    : { students: 4, classes: 1, applications: 15, interviews: 3, offers: 1, placed: 1, inactive: 1, deadlines_7d: 1, hidden_students: 1 };
  const cls = { id: "c1", name: "Informatik 4a", school_year: "2026/27", archived: false, is_owner: true, join_code: "KLAS-7Q2", students: students.length, applications: totals.applications, interviews: totals.interviews, offers: totals.offers, placed: totals.placed, inactive: totals.inactive, hidden: totals.hidden_students };
  const app = (id, company, status, o = {}) => ({ hidden: false, id, company, position: "Informatiker EFZ", status, category: "software", location: "Zürich", deadline: null, applied_at: null, created_at: dateOnly(-30), updated_at: dateOnly(-30), ...o });
  return { st, rpc: {
    teacher_dashboard: () => ({ totals, classes: [cls], deadlines: [] }),
    teacher_class_students: () => students,
    teacher_attention: () => variant === "full" ? [
      { class_id: "c1", class_name: "Informatik 4a", student_id: "s3", display_name: "Cleo Brunner", reason: "self_report", days: 0, open_count: 0, self_report: true },
      { class_id: "c1", class_name: "Informatik 4a", student_id: "s4", display_name: "", reason: "no_application", days: 0, open_count: 0, self_report: false },
      { class_id: "c1", class_name: "Informatik 4a", student_id: "s2", display_name: "Ben Huber", reason: "no_reply", days: 25, open_count: 2, self_report: false }] : [],
    class_student_applications: (b) => b.p_student_id === "s3" ? [{ hidden: true }] : [
      app("a1", "Swisscom", "applied", { applied_at: dateOnly(-25), created_at: dateOnly(-30), updated_at: dateOnly(-25), deadline: dateOnly(-20) }),
      app("a2", "UBS", "interview", { applied_at: dateOnly(-10), created_at: dateOnly(-14), updated_at: dateOnly(-3) }),
      app("a3", "SBB", "preparing", { deadline: dateOnly(5), created_at: dateOnly(-2), updated_at: dateOnly(-2) }),
      app("a4", "Neue AG", "brand_new_status", { applied_at: dateOnly(-4), updated_at: dateOnly(-1) }), app("a5", null, null, { company: null, position: null, status: null, applied_at: dateOnly(-60) })],
    class_log_view: (b) => { st.calls.push({ log: b }); return null; },
    class_invite_list: () => [], class_announcement_list: () => [],
    class_invite_create_many_v2: (b) => b.p_emails.map((e) => e.startsWith("s1@") ? { email: e, outcome: "already_member", token: null } : e === "dup@x.ch" ? { email: e, outcome: "already_invited", token: "tok_existing_abcdefghijklmnop" } : { email: e, outcome: "created", token: `tok_${e.split("@")[0]}_abcdefghijklmnopqrstuv` }),
    class_deadline_list: () => st.deadlines, class_deadline_add: (b) => { st.deadlines.push({ id: "d" + (st.deadlines.length + 1), class_id: "c1", class_name: "Informatik 4a", title: b.p_title, due_date: b.p_due_date, note: b.p_note }); return "d9"; }, class_deadline_delete: (b) => { st.deadlines = st.deadlines.filter((d) => d.id !== b.p_id); return null; },
    teacher_class_applications_export: () => [{ student_id: "s1", display_name: "Anna Meier", company: "Swisscom", position: "Informatiker EFZ", status: "applied", applied_at: dateOnly(-25), deadline: null, created_at: dateOnly(-30) }],
    my_class_deadlines: () => st.deadlines, my_self_reports: () => [{ class_id: "c1", class_name: "Informatik 4a", self_report: st.selfReport }],
    my_view_log: () => [{ id: "v1", class_id: "c1", class_name: "Informatik 4a", teacher_name: "Frau Keller", kind: "view", viewed_on: dateOnly(-1) }, { id: "v2", class_id: "c1", class_name: "Informatik 4a", teacher_name: "Frau Keller", kind: "export", viewed_on: dateOnly(-3) }],
    class_set_self_report: (b) => { st.selfReport = b.p_value; st.calls.push({ selfReport: b }); return null; },
  } };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const problems = []; const checks = [];
const check = (name, ok, extra = "") => { checks.push(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`); };
async function session({ w, h, dark, variant = "full", role = "teacher" }, fn) {
  const mobile = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, colorScheme: dark ? "dark" : "light", deviceScaleFactor: mobile ? 2 : 1, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript((t) => localStorage.setItem("wendapply-theme", t), dark ? "dark" : "light");
  const m = makeRpc(variant);
  await installStub(ctx, { role, rpc: m.rpc });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (msg) => { if (msg.type() === "error" && !/Failed to load resource|favicon/.test(msg.text())) problems.push(`console ${msg.text().slice(0, 200)}`); });
  try { await fn(page, m); } finally { await ctx.close(); }
}
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
const go = async (page, path, ready) => { await page.goto(BASE + path, { waitUntil: "domcontentloaded" }); await page.waitForSelector(ready, { timeout: 90000, state: "attached" }); await page.waitForTimeout(500); };
const tabTo = async (page, name) => { await page.getByRole("tab", { name }).click(); await page.waitForTimeout(500); };

for (const dark of [false, true]) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const tag = `${w}-${dark ? "dark" : "light"}`;
  await session({ w, h, dark }, async (page, m) => {
    await go(page, "/teacher", "text=Braucht Aufmerksamkeit");
    await shot(page, `dashboard-${tag}`);
    check(`${tag} KPI label not truncated`, await page.evaluate(() => [...document.querySelectorAll("section[aria-label=Kennzahlen] .text-eyebrow")].every((e) => e.scrollWidth <= e.clientWidth + 1)));
    check(`${tag} attention lists 3 rows incl. self-report + name fallback`, (await page.locator("section[aria-label='Braucht Aufmerksamkeit'] li").count()) === 3 && (await page.getByText("Ohne Namen").count()) >= 1);
    await go(page, "/teacher/classes/c1", "text=Anna Meier");
    await shot(page, `class-students-${tag}`);
    await tabTo(page, /Einladen/);
    await page.locator("#inv-emails").fill("Name;E-Mail\nAnna Neu;anna@x.ch\nKaputt;kaputt\nDoppelt;anna@x.ch\nBen;s1@x.ch\nDup;dup@x.ch");
    await page.waitForTimeout(300); await shot(page, `invite-preview-${tag}`);
    check(`${tag} preview counts`, await page.getByText("5 Zeilen: 3 gültig, 1 doppelt, 1 ungültig").count() === 1);
    await page.getByRole("button", { name: /3 Einladungen erstellen/ }).click(); await page.waitForTimeout(600);
    await shot(page, `invite-result-${tag}`);
    check(`${tag} result shows outcomes`, (await page.getByText("Ist schon in der Klasse").count()) === 1 && (await page.getByText("Schon eingeladen (bestehender Link)").count()) === 1 && (await page.getByText(/1 Einladung erstellt, 3 übersprungen \(doppelt oder schon dabei\), 1 ungültig/).count()) >= 1);
    await tabTo(page, /Kalender|Fristen/); await shot(page, `calendar-${tag}`);
    await page.locator("#dl-title").fill("Lebenslauf abgeben"); await page.locator("#dl-date").fill(dateOnly(1)); await page.getByRole("button", { name: "Frist speichern" }).click(); await page.waitForTimeout(600);
    check(`${tag} deadline added`, (await page.getByText("Lebenslauf abgeben").count()) >= 1);
    await go(page, "/teacher/classes/c1/students/s1", "[aria-label='Bewerbungen']");
    await shot(page, `student-${tag}`);
    check(`${tag} timeline shows age + no 'Frist · Abgeschickt' confusion`, (await page.getByText(/Beworben vor 3 Wochen, noch keine Antwort/).count()) === 1 && (await page.getByText("brand new status").count()) >= 1 && (await page.getByText("Firma nicht freigegeben").count()) === 1);
    check(`${tag} view logged`, m.st.calls.some((c) => c.log?.p_student_id === "s1"));
    await go(page, "/classes", "text=Übersicht"); await page.waitForTimeout(800);
    check(`${tag} /classes redirects teacher to /teacher`, new URL(page.url()).pathname === "/teacher", page.url());
    await go(page, "/friends", "text=Übersicht"); await page.waitForTimeout(800);
    check(`${tag} /friends redirects teacher`, new URL(page.url()).pathname === "/teacher", page.url());
  });
}
for (const [w, h] of [[1440, 900], [390, 844]]) for (const variant of ["nostudents", "noapps"]) await session({ w, h, dark: false, variant }, async (page) => {
  await go(page, "/teacher", "h1"); await page.waitForTimeout(600); await shot(page, `dashboard-${variant}-${w}`);
  const zeros = await page.locator("section[aria-label=Kennzahlen] .tabular").allInnerTexts().catch(() => []);
  check(`${variant} ${w}: no row of six zeros`, zeros.length <= 2, JSON.stringify(zeros));
});
for (const dark of [false, true]) for (const [w, h] of [[1440, 900], [390, 844]]) await session({ w, h, dark, role: "student" }, async (page, m) => {
  await go(page, "/classes", "text=Fristen deiner Klasse"); await shot(page, `student-classes-${w}-${dark ? "dark" : "light"}`);
  await page.getByLabel(/Ich habe noch keine Lehrstelle/).check(); await page.waitForTimeout(400);
  check(`student ${w}: self-report sent`, m.st.calls.some((c) => c.selfReport?.p_value === true));
  check(`student ${w}: sees who looked`, (await page.getByText(/Frau Keller hat angesehen/).count()) === 1);
});
console.log(checks.join("\n")); console.log(problems.length ? `PROBLEMS:\n${[...new Set(problems)].join("\n")}` : "no console/page errors");
await browser.close();
