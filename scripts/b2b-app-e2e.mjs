// End-to-end flows for the B2B app part against an in-memory Supabase stand-in (nothing real is touched):
// teacher (class overview, support list, class goals CRUD), student (class goals, aggregates only), school admin (licence,
// usage warning, pilot), "B2B migrations not deployed yet" (features hide or fall back, no crash) and the settings export.
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3291 node scripts/b2b-app-e2e.mjs
// Shapes follow supabase/migrations/20261116*_b2b_*.sql (b2b-db part). Screenshots: $OUT (default ~/Projects/bewerbungen-tracker-wt/screenshots/b2b-app/).
import fs from "node:fs";
import { homedir } from "node:os";
import { installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const BASE = process.env.BASE || "http://localhost:3291";
const SUPA = "http://localhost:54321";
const OUT = (process.env.OUT || `${homedir()}/Projects/bewerbungen-tracker-wt/screenshots/b2b-app/`).replace(/\/?$/, "/");
fs.mkdirSync(OUT, { recursive: true });
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const results = [];
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, text: `[${scope}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : info); };
const problems = [];

// ---------------------------------------------------------------- fixtures
const STUDENTS = [
  { student_id: "s1", display_name: "Anna Meier", avatar_seed: "s1", joined_at: day(-40), hidden: false, total: 6, status_counts: { applied: 3, interview: 1, schnupper_done: 1, offer: 1 }, interviews: 1, offers: 1, placed: true, last_activity: day(-1), inactive: false, last_nudged_at: null },
  { student_id: "s2", display_name: "Ben Huber", avatar_seed: "s2", joined_at: day(-40), hidden: false, total: 0, status_counts: {}, interviews: 0, offers: 0, placed: false, last_activity: null, inactive: true, last_nudged_at: null },
  { student_id: "s3", display_name: "Cleo Brunner", avatar_seed: "s3", joined_at: day(-40), hidden: true, total: 0, status_counts: {}, interviews: 0, offers: 0, placed: false, last_activity: null, inactive: false, last_nudged_at: null },
  { student_id: "s4", display_name: "Dario Rossi", avatar_seed: "s4", joined_at: day(-40), hidden: false, total: 12, status_counts: { saved: 2, applied: 9, rejected: 1 }, interviews: 0, offers: 0, placed: false, last_activity: day(-20), inactive: true, last_nudged_at: null },
];
const OVERVIEW = {
  class_id: "c1", inactive_days: 14,
  totals: { students: 4, students_sharing: 3, applications: 18, students_with_application: 2, students_placed: 1, students_active: 1, needs_support: 3 },
  students: [
    { student_id: "s2", display_name: "Ben Huber", alias: null, hidden: false, share_status: true, applications: 0, status_counts: {}, last_activity: null, placed: false, needs_support: true, reasons: ["no_application"] },
    { student_id: "s4", display_name: "Dario Rossi", alias: null, hidden: false, share_status: true, applications: 12, status_counts: { saved: 2, applied: 9, rejected: 1 }, last_activity: day(-20), placed: false, needs_support: true, reasons: ["no_activity", "upcoming_deadline"] },
    { student_id: "s3", display_name: "Cleo Brunner", alias: null, hidden: true, share_status: false, applications: null, status_counts: null, last_activity: null, placed: false, needs_support: true, reasons: ["self_report"] },
    { student_id: "s1", display_name: "Anna Meier", alias: null, hidden: false, share_status: true, applications: 6, status_counts: { applied: 3, interview: 1, schnupper_done: 1, offer: 1 }, last_activity: day(-1), placed: true, needs_support: false, reasons: [] },
  ],
};
const DASH = { totals: { students: 4, classes: 1, applications: 18, interviews: 1, offers: 1, placed: 1, inactive: 2, deadlines_7d: 0, hidden_students: 1 }, classes: [{ id: "c1", name: "Sek 3a", school_year: "2026/27", archived: false, is_owner: true, join_code: "KLAS-7Q2", students: 4, applications: 18, interviews: 1, offers: 1, placed: 1, inactive: 2, hidden: 1 }], deadlines: [] };
const CLASSES = [{ id: "c1", name: "Sek 3a", school_year: "2026/27", join_code: "KLAS-7Q2", created_at: day(-60), member_count: 4, archived: false, is_owner: true }];

const missing = (name) => ({ __missing: `Could not find the function public.${name} without parameters in the schema cache` });
function teacherRpc(goals, { deployed = true } = {}) {
  return {
    class_list_mine: CLASSES,
    teacher_dashboard: DASH,
    teacher_class_students: STUDENTS,
    teacher_attention: [{ class_id: "c1", class_name: "Sek 3a", student_id: "s3", display_name: "Cleo Brunner", reason: "self_report", days: 0, open_count: 0, self_report: true }],
    class_overview_stats: deployed ? OVERVIEW : missing("class_overview_stats"),
    class_goal_progress: deployed ? () => goals.map((g) => ({ goal_id: g.id, title: g.title, description: g.description, metric: g.metric, target: g.target, due_date: g.due_date, students_total: 4, students_counted: g.metric === "custom" ? 0 : 3, students_reached: g.metric === "custom" ? null : 1, total_value: g.metric === "custom" ? null : 5, average_value: 1.7, suppressed: false })) : missing("class_goal_progress"),
    school_admin_my_schools: deployed ? [] : missing("school_admin_my_schools"),
  };
}

async function actor({ role = "teacher", rpc = {}, vp = { w: 375, h: 812 }, goals = null, tablesMissing = false }) {
  const ctx = await newCtx(browser, vp);
  const state = await installStub(ctx, { role, rpc: Object.fromEntries(Object.entries(rpc).filter(([, v]) => !(v && v.__missing))) });
  // Undeployed RPCs answer like PostgREST does (404 PGRST202). Registered after the stub, so these routes win.
  for (const [name, value] of Object.entries(rpc)) if (value && value.__missing) await ctx.route(`${SUPA}/rest/v1/rpc/${name}`, (route) => route.fulfill({ status: 404, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "PGRST202", message: value.__missing, details: null, hint: null }) }));
  await ctx.route(`${SUPA}/rest/v1/class_goals*`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (tablesMissing) return route.fulfill({ status: 404, contentType: "application/json", headers: cors, body: JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.class_goals' in the schema cache" }) });
    const id = (url.searchParams.get("id") || "").replace("eq.", "");
    let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
    state.calls.push({ goals: req.method(), body, id });
    if (req.method() === "POST" && goals) goals.push({ id: `g${goals.length + 1}`, ...body });
    if (req.method() === "PATCH" && goals) Object.assign(goals.find((g) => g.id === id) ?? {}, body);
    if (req.method() === "DELETE" && goals) goals.splice(goals.findIndex((g) => g.id === id), 1);
    return route.fulfill({ status: req.method() === "GET" ? 200 : 201, contentType: "application/json", headers: cors, body: JSON.stringify(req.method() === "GET" ? (goals ?? []) : []) });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|status of 4\d\d|status of 5\d\d|React DevTools/.test(m.text())) problems.push(`[${scope}] console ${m.text().slice(0, 200)}`); });
  return { ctx, page, state };
}
const visible = (page, text, timeout = 30000) => page.getByText(text).locator("visible=true").first().waitFor({ timeout }).then(() => true, () => false);
const noOverflow = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: true }).catch(() => {});

// ---------------------------------------------------------------- flows
const browser = await launch();
const VIEWPORTS = [{ key: "mobile-light", vp: { w: 375, h: 812 } }, { key: "desktop-dark", vp: { w: 1280, h: 860, dark: true } }];

for (const { key, vp } of VIEWPORTS) {
  // Teacher: overview + goals CRUD
  scope = `teacher ${key}`;
  {
    const goals = [];
    const { ctx, page, state } = await actor({ role: "teacher", rpc: teacherRpc(goals), vp, goals });
    await page.goto(`${BASE}/teacher/classes/c1`, { waitUntil: "domcontentloaded" });
    check(await visible(page, "Anna Meier", 90000), "class page loads with the student list (students tab stays default)");
    await page.getByRole("tab", { name: /Überblick/ }).click();
    check(await visible(page, "Klassenstatistik"), "overview tab shows the class statistics");
    check(await visible(page, "Wer braucht Unterstützung"), "support list is shown");
    check(await visible(page, "Noch keine Bewerbung erfasst"), "reason text for Ben (no_application)");
    check(await visible(page, "Meldet selbst: noch keine Lehrstelle"), "hidden student appears only via self report");
    const support = page.getByRole("list", { name: "Schüler:innen, die Unterstützung brauchen" });
    check((await support.getByRole("link").count()) === 3, "three students need support (placed Anna does not)");
    check((await page.getByRole("progressbar").count()) >= 4, "statistics are rendered as accessible progress bars");
    const panelText = await page.locator("[role=tabpanel]").innerText();
    check(!/Swisscom|UBS|Migros|ZKB|Google|Rückruf/.test(panelText), "overview contains no companies or notes", (panelText.match(/.{0,60}(Swisscom|UBS|Migros|ZKB|Google|Rückruf).{0,60}/) || [""])[0]);
    check(state.calls.some((c) => c.rpc === "class_overview_stats" && c.body.p_class_id === "c1"), "class_overview_stats called for the class");
    check(await noOverflow(page), "no horizontal overflow");
    await shot(page, `${key}-teacher-overview`);

    await page.getByRole("tab", { name: /^Mehr/ }).click(); await page.getByRole("tab", { name: /Ziele/ }).click();
    check(await visible(page, "Noch keine Klassenziele"), "goals tab: empty state");
    await page.getByRole("button", { name: "Ziel erstellen" }).first().click();
    await page.getByLabel("Titel").fill("Alle schnuppern zweimal bis zu den Sportferien");
    await page.getByLabel("Zielwert pro Person").fill("0");
    await page.getByRole("button", { name: "Speichern" }).click();
    check(await visible(page, "ganze Zahl zwischen 1 und 1000"), "invalid target is rejected with a message");
    await page.getByLabel("Zielwert pro Person").fill("2");
    await page.getByRole("button", { name: "Speichern" }).click();
    check(await visible(page, "1 von 3 haben das Ziel erreicht. Zusammen: 5 Schnuppertage."), "created goal shows the class progress");
    check(await visible(page, "Ziel: 2 Schnuppertage pro Person"), "target is shown per person");
    const post = state.calls.find((c) => c.goals === "POST");
    check(post && post.body.class_id === "c1" && post.body.metric === "trial_days" && post.body.target === 2, "insert sends class, metric and target", JSON.stringify(post));
    check(await page.getByRole("img", { name: /Alle schnuppern zweimal.*Mauern stehen/ }).count() === 1, "class village shows the goal house (33 % = walls)");
    await shot(page, `${key}-teacher-goals`);
    await page.getByRole("button", { name: /bearbeiten/ }).first().click();
    await page.getByLabel("Titel").fill("Alle schnuppern bis Ende Januar");
    await page.getByRole("button", { name: "Speichern" }).click();
    check(await visible(page, "Alle schnuppern bis Ende Januar"), "goal can be edited");
    await page.getByRole("button", { name: "Ziel erstellen" }).first().click();
    await page.getByLabel("Titel").fill("Bewerbungsdossier fertig");
    await page.getByLabel("Was wird gezählt?").selectOption("custom");
    await page.getByLabel("Zielwert pro Person (optional)").fill("");
    await page.getByRole("button", { name: "Speichern" }).click();
    check(await visible(page, "Eigenes Ziel: den Fortschritt besprecht ihr im Unterricht."), "custom goal without target can be created");
    check(state.calls.filter((c) => c.goals === "POST").pop()?.body.target === null, "custom goal is saved with target null");
    await page.getByRole("button", { name: /Bewerbungsdossier fertig.*löschen$/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await page.getByText("Bewerbungsdossier fertig").waitFor({ state: "detached" }).catch(() => {});
    await page.getByRole("button", { name: /löschen$/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    check(await visible(page, "Noch keine Klassenziele"), "goal can be deleted");
    check(state.calls.some((c) => c.goals === "DELETE" && c.id === "g1"), "delete targets the goal id");
    await ctx.close();
  }

  // Student: class goals with aggregates only
  scope = `student ${key}`;
  {
    const rpc = {
      class_my_classes: [{ class_id: "c1", name: "Sek 3a", school_year: "2026/27", teacher_name: "Frau Keller", share_applications: true, joined_at: day(-30) }],
      class_goal_progress: [
        { goal_id: "g1", title: "Alle schnuppern zweimal bis zu den Sportferien", description: "Wir helfen uns gegenseitig.", metric: "trial_days", target: 2, due_date: day(30), students_total: 18, students_counted: 12, students_reached: 4, total_value: 7, average_value: 0.6, suppressed: false },
        { goal_id: "g2", title: "Alle haben ein Gespräch", description: null, metric: "interviews", target: 1, due_date: null, students_total: 18, students_counted: 2, students_reached: null, total_value: null, average_value: null, suppressed: true },
      ],
    };
    const { ctx, page } = await actor({ role: "student", rpc, vp });
    await page.goto(`${BASE}/classes`, { waitUntil: "domcontentloaded" });
    check(await visible(page, "Ziele deiner Klasse", 90000), "student class area shows the class goals");
    check(await visible(page, "4 von 12 haben das Ziel erreicht. Zusammen: 7 Schnuppertage."), "aggregate progress is shown");
    check(await visible(page, "mindestens drei Personen"), "suppressed goal explains why no number is shown");
    check(!(await page.getByText("Anna Meier").count()), "no other student names on the page");
    check(await noOverflow(page), "no horizontal overflow");
    await shot(page, `${key}-student-goals`);
    await ctx.close();
  }

  // School admin: licence, usage warning, pilot
  scope = `school-admin ${key}`;
  {
    const licence = { package: "professional", status: "active", state: "active", student_limit: 300, students_used: 276, seats_left: 24, pilot_start: null, pilot_end: null, valid_from: day(-100), valid_until: day(265), days_left: 265 };
    const pilot = { package: "pilot", status: "pilot", state: "pilot", student_limit: 60, students_used: 21, seats_left: 39, pilot_start: day(-18), pilot_end: day(12), days_left: 12 };
    const rpc = {
      class_list_mine: CLASSES, teacher_dashboard: DASH,
      school_admin_my_schools: [{ school_id: "sch1", name: "Sekundarschule Seefeld", canton_or_state: "ZH", country: "CH", licence }, { school_id: "sch2", name: "Oberstufe Bergli", canton_or_state: "BE", country: "CH", licence: pilot }],
      school_admin_overview: (b) => b.p_school_id === "sch1"
        ? { school: { id: "sch1", name: "Sekundarschule Seefeld", canton_or_state: "ZH", country: "CH" }, licence, totals: { classes: 2, teachers: 2, students: 276 }, classes: [{ id: "c1", name: "Sek 3a", school_year: "2026/27", archived: false, teacher_name: "Frau Keller", students: 22, students_sharing: 18, suppressed: false, students_with_application: 15, students_placed: 6 }, { id: "c2", name: "Sek 3b", school_year: "2026/27", archived: false, teacher_name: "Herr Bachmann", students: 2, students_sharing: 2, suppressed: true, students_with_application: null, students_placed: null }], teachers: [{ teacher_id: "t1", display_name: "Frau Keller", classes: 1 }, { teacher_id: "t2", display_name: "Herr Bachmann", classes: 1 }] }
        : { school: { id: "sch2", name: "Oberstufe Bergli" }, licence: pilot, totals: { students: 21 }, classes: [], teachers: [] },
    };
    const { ctx, page, state } = await actor({ role: "teacher", rpc, vp });
    await page.goto(`${BASE}/teacher`, { waitUntil: "domcontentloaded" });
    check(await visible(page, "Schuladministration", 90000), "teacher dashboard links to the school administration");
    await page.goto(`${BASE}/schul-admin`, { waitUntil: "domcontentloaded" });
    check(await visible(page, "Sekundarschule Seefeld", 90000), "school name");
    check(await visible(page, "Professional"), "licence package");
    check(await visible(page, "von 300 im Paket"), "student count vs limit");
    check(await visible(page, "Über 90 % der Plätze sind belegt (noch 24 frei)"), "warning at >= 90 %");
    check(await visible(page, "Noch 12 Tage Pilotphase"), "pilot days remaining for the pilot school");
    check(await visible(page, "Paketwechsel über Kontakt"), "package change only via contact");
    check(await visible(page, "15 mit Bewerbung"), "class aggregate shown when not suppressed");
    check(!(await page.getByText(/Sek 3b.*mit Bewerbung/).count()), "suppressed class shows no aggregates");
    check(await visible(page, "Herr Bachmann"), "teachers listed");
    check(!(await page.locator("text=/Stripe|Bezahlen|Kreditkarte/i").count()), "no payment UI");
    check(["sch1", "sch2"].every((id) => state.calls.some((c) => c.rpc === "school_admin_overview" && c.body.p_school_id === id)), "overview loaded per school");
    // Attach a class by join code: success, then the licence-full error (WA001) with its German details.
    const attachBodies = [];
    await ctx.route(`${SUPA}/rest/v1/rpc/school_attach_class`, async (route) => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const body = JSON.parse(route.request().postData() || "{}"); attachBodies.push(body);
      if (body.p_join_code === "VOLL-01") return route.fulfill({ status: 400, contentType: "application/json", headers: cors, body: JSON.stringify({ code: "WA001", message: "LICENCE_LIMIT_REACHED", details: "Die Schullizenz ist voll (300 von 300 Plätzen belegt). Die Schulleitung kann die Lizenz erweitern.", hint: null }) });
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ class_id: "c9", name: "Sek 2c", students: 19 }) });
    });
    const attachInput = page.getByLabel("Klasse hinzufügen").first();
    await attachInput.fill("sek2-c9");
    await page.getByRole("button", { name: "Zuordnen" }).first().click();
    check(await visible(page, "«Sek 2c» ist jetzt der Schule zugeordnet (19 Schüler:innen)."), "class can be attached by join code");
    check(attachBodies[0]?.p_school_id === "sch1" && attachBodies[0]?.p_join_code === "SEK2-C9", "attach sends school id and upper-cased code", JSON.stringify(attachBodies[0]));
    await attachInput.fill("VOLL-01");
    await page.getByRole("button", { name: "Zuordnen" }).first().click();
    check(await visible(page, "Die Lizenz ist voll: Diese Klasse hat nicht mehr genug freie Plätze."), "licence-full error is shown in German with the next step for admins");
    check(await noOverflow(page), "no horizontal overflow");
    await shot(page, `${key}-school-admin`);
    await ctx.close();
  }
}

// Not deployed: B2B migrations missing on the live DB -> no crash, features hide or fall back
scope = "not-deployed mobile";
{
  const { ctx, page } = await actor({ role: "teacher", rpc: teacherRpc([], { deployed: false }), tablesMissing: true });
  await page.goto(`${BASE}/teacher`, { waitUntil: "domcontentloaded" });
  check(await visible(page, "Sek 3a", 90000), "teacher dashboard still works");
  check(!(await page.getByText("Schuladministration").count()), "no school admin link without the RPC");
  await page.goto(`${BASE}/teacher/classes/c1`, { waitUntil: "domcontentloaded" });
  await visible(page, "Anna Meier", 60000);
  await page.getByRole("tab", { name: /Überblick/ }).click();
  check(await visible(page, "Klassenstatistik"), "overview falls back to the existing teacher RPCs");
  check(await visible(page, "Noch keine Bewerbung erfasst"), "fallback derives support reasons");
  check(await visible(page, "Meldet selbst: noch keine Lehrstelle"), "fallback keeps the self report of a hidden student");
  await page.getByRole("tab", { name: /^Mehr/ }).click(); await page.getByRole("tab", { name: /Ziele/ }).click();
  check(await visible(page, "Klassenziele kommen bald"), "goals tab explains the feature is not ready");
  check(!(await page.getByRole("button", { name: "Ziel erstellen" }).count()), "no create button without the table");
  await page.goto(`${BASE}/schul-admin`, { waitUntil: "domcontentloaded" });
  check(await visible(page, "Keine Schule zugeordnet", 60000), "school admin page degrades gracefully");
  await shot(page, "not-deployed-school-admin");
  await ctx.close();
}

// Settings: "Meine Daten" export (server export merged, secrets stripped) + fallback without the RPC
for (const deployed of [true, false]) {
  scope = `settings export ${deployed ? "deployed" : "not-deployed"}`;
  const rpc = deployed ? { export_my_data: { format: "wendapply-export-v1", account: { id: "u1", email: "student@beispiel.ch" }, classes: [{ class: "Sek 3a" }], tables: { user_roles: [{ role: "student", access_token: "geheim" }] } } } : { export_my_data: missing("export_my_data") };
  const { ctx, page } = await actor({ role: "student", rpc, vp: { w: 375, h: 812 } });
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  check(await visible(page, "Daten & Datenschutz", 90000), "settings show the data section");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: "Daten exportieren" }).click()]);
  const json = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  check(/^wendapply-meine-daten-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), "file name", download.suggestedFilename());
  check(Array.isArray(json.applications) && json.applications.length > 0 && json.profile, "export keeps the importable applications + profile");
  check(deployed ? json.account?.format === "wendapply-export-v1" && json.account.classes.length === 1 : json.account === undefined, deployed ? "server export is included" : "works without export_my_data");
  check(!JSON.stringify(json).includes("geheim"), "tokens are stripped from the export");
  check(await visible(page, "Daten exportiert."), "success message");
  check(await page.getByRole("heading", { name: "Meine Daten löschen" }).isVisible() && await page.getByRole("heading", { name: "Konto löschen" }).isVisible(), "deletion flows are still offered");
  await page.getByRole("button", { name: "Meine Daten löschen" }).click();
  check(await page.getByRole("dialog").getByText("Bewerbungsdaten löschen?").isVisible(), "deleting asks for confirmation");
  await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();
  if (deployed) await shot(page, "settings-my-data");
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const p of problems) console.log("PROBLEM", p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${problems.length} page problems. Screenshots: ${OUT}`);
fs.writeFileSync(`${OUT}results.json`, JSON.stringify({ results, problems }, null, 2));
process.exit(failed.length || problems.length ? 1 : 0);
