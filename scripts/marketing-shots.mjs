// Raw screenshots for the public marketing pages (/, /schulen, /familien, /anleitung) and the PWA manifest.
// Everything runs against the in-memory Supabase stand-in (scripts/lib/mock-supabase.mjs) with fictional demo data
// (pupil "Lena Muster", invented companies); nothing real is contacted and no real account is used.
// The dev server must run with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy.
// Usage: PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3311 OUT=<dir>/ [ONLY=dashboard,dorf] node scripts/marketing-shots.mjs
// Output: <OUT><name>-<theme>.png at 2x DPR (downscale/convert with scripts/marketing-images.sh; Open Graph cards: scripts/og-images.mjs).
import { mkdirSync } from "node:fs";
import { createMockSupabase, makeApplication, SUPABASE_URL } from "./lib/mock-supabase.mjs";
import { installJobsearchStub, makeJobs } from "./lib/jobsearch-stub.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3311";
const OUT = (process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/seo-shots/raw/`).replace(/\/?$/, "/");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
mkdirSync(OUT, { recursive: true });

const day = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

// ------------------------------------------------------------------ fictional demo data
const APPS = [
  ["Limmat Informatik AG", "Informatiker:in EFZ Applikationsentwicklung", "Zürich", "interview", 6, -1],
  ["Seeland Bank AG", "Kauffrau/Kaufmann EFZ Bank", "Biel", "applied", 12, -3],
  ["Holzbau Gerber AG", "Zeichner:in EFZ Architektur", "Winterthur", "schnupper_done", 18, -4],
  ["Aare Versicherungen", "Kauffrau/Kaufmann EFZ", "Bern", "preparing", 4, -2],
  ["Velo Keller GmbH", "Fahrradmechaniker:in EFZ", "Uster", "saved", 9, -6],
  ["Mediawerk Brunner AG", "Mediamatiker:in EFZ", "Zürich", "offer", 0, -5],
  ["Spital Seefeld", "Fachfrau/Fachmann Gesundheit EFZ", "Zürich", "applied", 14, -8],
  ["Logistikzentrum Mittelland", "Logistiker:in EFZ", "Olten", "rejected", 0, -12],
];
const apps = () => APPS.map(([company, position, location, status, dl, upd], i) => makeApplication(i + 1, {
  company, position, location, status, deadline: dl ? day(dl) : null, updated_at: day(upd), created_at: day(upd - 10),
  applied_at: ["applied", "interview", "offer", "rejected", "schnupper_done"].includes(status) ? day(upd - 3) : null,
  notes: null, category: "other",
}));
const profile = { full_name: "Lena Muster", location: "Zürich", target_roles: ["Informatikerin EFZ"], skills: [], bio: "" };

const TEACHER = {
  class_list_mine: [{ id: "c1", name: "Sek 3a", school_year: "2026/27", join_code: "KLAS-7Q2", created_at: day(-60), member_count: 22, archived: false, is_owner: true }, { id: "c2", name: "Sek 3b", school_year: "2026/27", join_code: "KLAS-4M8", created_at: day(-60), member_count: 19, archived: false, is_owner: true }],
  teacher_dashboard: {
    totals: { students: 41, classes: 2, applications: 186, interviews: 23, offers: 9, placed: 9, inactive: 4, deadlines_7d: 6, hidden_students: 2 },
    classes: [
      { id: "c1", name: "Sek 3a", school_year: "2026/27", archived: false, is_owner: true, join_code: "KLAS-7Q2", students: 22, applications: 104, interviews: 14, offers: 6, placed: 6, inactive: 1, hidden: 1 },
      { id: "c2", name: "Sek 3b", school_year: "2026/27", archived: false, is_owner: true, join_code: "KLAS-4M8", students: 19, applications: 82, interviews: 9, offers: 3, placed: 3, inactive: 3, hidden: 1 },
    ],
    deadlines: [
      { class_id: "c1", class_name: "Sek 3a", student_id: "s1", student_name: "Mia Schneider", company: "Limmat Informatik AG", position: "Informatiker:in EFZ", deadline: day(2) },
      { class_id: "c2", class_name: "Sek 3b", student_id: "s5", student_name: "Noah Frei", company: "Holzbau Gerber AG", position: "Zimmermann EFZ", deadline: day(4) },
      { class_id: "c1", class_name: "Sek 3a", student_id: "s2", student_name: "Luca Baumann", company: "Seeland Bank AG", position: "Kaufmann EFZ", deadline: day(6) },
    ],
  },
  teacher_attention: [
    { class_id: "c2", class_name: "Sek 3b", student_id: "s6", display_name: "Elin Graf", reason: "self_report", days: 0, open_count: 0, self_report: true },
    { class_id: "c1", class_name: "Sek 3a", student_id: "s7", display_name: "Jonas Wyss", reason: "no_activity", days: 16, open_count: 3, self_report: false },
  ],
  school_admin_my_schools: [],
};

const FAMILY = {
  family_get_my: { family: { id: "f1", name: "Familie Muster" }, my_role: "parent", members: [
    { user_id: "u1", display_name: "Sandra Muster", role: "parent", status: "active", consent_status: "not_required", share_settings: { progress: true, applications: false, village: true, documents: false } },
    { user_id: "c1", display_name: "Lena Muster", role: "child", status: "active", consent_status: "granted" },
  ], plan: { plan_type: "family", status: "trial", seats_parents: 2, seats_children: 1, trial_ends_at: new Date(Date.now() + 12 * 864e5).toISOString() } },
  family_child_overview: { child: { display_name: "Lena Muster" }, consent_status: "granted", progress: { total: 8, status_counts: { applied: 3, interview: 1, schnupper_done: 1, offer: 1, saved: 1, preparing: 1 }, last_activity: day(-1) }, village: { islands: 2, items: 9, points_earned: 640 } },
  class_my_classes: [],
};

// Varied, fictional search results (the shared stub numbers repeated titles, which looks odd in marketing shots).
const JOBS = [
  ["Informatiker:in EFZ Applikationsentwicklung", "Limmat Informatik AG", "8005 Zürich", "ZH", "Yousty", 0],
  ["Informatiker:in EFZ Plattformentwicklung", "Aare Versicherungen", "3011 Bern", "BE", "jobs.ch", 1],
  ["ICT-Fachfrau/ICT-Fachmann EFZ", "Spital Seefeld", "8008 Zürich", "ZH", "Yousty", 2],
  ["Informatiker:in EFZ Betriebsinformatik", "Rhein Energie AG", "4051 Basel", "BS", "jobup.ch", 3],
  ["Mediamatiker:in EFZ", "Mediawerk Brunner AG", "8400 Winterthur", "ZH", "Yousty", 5],
  ["Entwickler:in digitales Business EFZ", "Seeland Bank AG", "2502 Biel", "BE", "jobs.ch", 6],
  ["Informatiker:in EFZ Applikationsentwicklung", "Pilatus Software GmbH", "6003 Luzern", "LU", "Yousty", 8],
  ["ICT-Fachfrau/ICT-Fachmann EFZ", "Gemeindeverwaltung Seebach", "8052 Zürich", "ZH", "jobs.ch", 9],
];
const jobs = () => makeJobs(JOBS.length).map((job, i) => {
  const [title, company, location, canton, source, ago] = JOBS[i];
  return { ...job, title, company, location, canton, source, url: `https://example.com/lehrstelle/${i + 1}`, postedAt: day(-ago),
    snippet: `Lehrbeginn August ${new Date().getFullYear() + 1}. Du arbeitest in einem jungen Team in ${location.replace(/^\d+ /, "")} mit und lernst den Beruf von Grund auf.`,
    jobType: "lehrstelle", education: "efz", years: [String(new Date().getFullYear() + 1)], workloadMin: undefined, workloadMax: undefined };
});

// ------------------------------------------------------------------ helpers
const settle = async (page, ms = 1200) => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(ms); };
const waitMap = async (page) => {
  await page.waitForSelector("[data-map-fullscreen] canvas, [data-map-fullscreen] [data-map-renderer]", { timeout: 180000 });
  await page.waitForTimeout(4000);
  const dismiss = page.getByRole("button", { name: "Super, weiter" });
  if (await dismiss.count()) { await dismiss.first().click(); await page.waitForTimeout(1500); }
  await page.waitForTimeout(3000);
};
const search = async (page) => {
  const box = page.getByRole("combobox", { name: "Beruf oder Stelle suchen" });
  await box.waitFor({ timeout: 120000 });
  await box.fill("Informatiker"); await box.press("Enter");
  await page.locator('section[aria-label="Suchergebnisse"] ol > li').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
};
const text = (t) => async (page) => { await page.getByText(t).locator("visible=true").first().waitFor({ timeout: 120000 }); await settle(page); };

async function rpcOverrides(ctx, map) {
  await ctx.route(`${SUPABASE_URL}/rest/v1/rpc/*`, async (route) => {
    const req = route.request(); const name = new URL(req.url()).pathname.split("/").pop();
    if (req.method() === "OPTIONS" || !(name in map)) return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(map[name]) });
  });
}

const DESK = { width: 1200, height: 960 };
const MOBILE = { width: 390, height: 844, mobile: true };
/** name, path, viewport, mock (createMockSupabase opts), rpc overrides, meta (user_metadata), prepare */
const SHOTS = [
  { name: "dashboard", path: "/dashboard", vp: DESK, prepare: text("Hoi Lena") },
  { name: "search", path: "/search", vp: DESK, prepare: search },
  { name: "applications", path: "/applications", vp: DESK, prepare: text("Limmat Informatik AG") },
  { name: "dorf", path: "/map", vp: { width: 1200, height: 628 }, prepare: waitMap },
  { name: "teacher", path: "/teacher", vp: DESK, mock: { role: "teacher" }, rpc: TEACHER, prepare: text("Sek 3a") },
  { name: "familie", path: "/familie", vp: DESK, rpc: FAMILY, meta: { role: "student", role_confirmed: true, account_type: "parent", full_name: "Sandra Muster" }, prepare: text("Bewerbungen erfasst") },
  { name: "m-search", path: "/search", vp: MOBILE, prepare: search },
  { name: "m-dashboard", path: "/dashboard", vp: MOBILE, prepare: text("Hoi Lena") },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const log = [];
for (const shot of SHOTS) for (const theme of ["light", "dark"]) {
  if (ONLY && !ONLY.includes(shot.name)) continue;
  const { vp } = shot;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, hasTouch: !!vp.mobile, isMobile: !!vp.mobile, colorScheme: theme, reducedMotion: "reduce" });
  await ctx.addInitScript((value) => localStorage.setItem("wendapply-theme", value), theme);
  const mock = createMockSupabase({ apps: apps(), profile, ...(shot.mock || {}) });
  mock.state.user.user_metadata.full_name = mock.state.role === "teacher" ? "Frau Keller" : "Lena Muster";
  if (shot.meta) mock.state.user.user_metadata = { ...shot.meta };
  mock.state.user.email = mock.state.role === "teacher" ? "lehrperson@beispiel.ch" : "lena@beispiel.ch";
  mock.state.social.display_name = mock.state.user.user_metadata.full_name;
  mock.state.connections = mock.state.connections.map((c) => ({ ...c }));
  await mock.install(ctx);
  if (shot.rpc) await rpcOverrides(ctx, shot.rpc);
  ctx.setDefaultTimeout(120000);
  const page = await ctx.newPage();
  await installJobsearchStub(page, { jobs: jobs() });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  try {
    await page.goto(BASE + shot.path, { waitUntil: "load", timeout: 180000 });
    await shot.prepare(page);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}${shot.name}-${theme}.png`, timeout: 120000 });
    log.push(`OK ${shot.name} ${theme} ${page.url().replace(BASE, "")}${errors.length ? " ERR " + errors[0] : ""}`);
  } catch (error) {
    await page.screenshot({ path: `${OUT}FAILED-${shot.name}-${theme}.png` }).catch(() => {});
    log.push(`FAILED ${shot.name} ${theme} ${String(error.message).slice(0, 160)}`);
  }
  await ctx.close();
}
await browser.close();
console.log(log.join("\n"));
