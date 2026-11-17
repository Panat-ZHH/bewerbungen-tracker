// Launch audit (2026-11-17): can one user see another user's data in the UI? Runs against the REAL Supabase project with
// THROWAWAY accounts created here (e2e-iso-*@example.com) and deletes every one of them at the end, even when a check fails.
//
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:<port> node scripts/e2e-isolation.mjs
//
// BASE must be a dev/prod server built with the REAL public Supabase env (.env.local). Without BASE a dev server is
// spawned on a free port (fails if another `next dev` already runs in this folder). The service role key is read from
// SUPABASE_SERVICE_ROLE_KEY or fetched with `sb privat projects api-keys` (never printed). Nothing is written except the
// throwaway users' own rows (applications, class, family), which cascade away when the users are deleted.
//
// Personas: A = student with applications + notes, B = unrelated student, T = teacher whose class A joins WITHOUT sharing,
// P = parent in A's family (A shares only "progress"). Checks (UI first, then the API behind it):
//   B: /applications lists none of A's, /applications/<A's id> shows "not found", A's island is refused, search by A's company empty
//   T: class overview shows A without any application data; A's notes never appear
//   P: /familie shows A's progress but no company / position / notes (applications not shared)
// Registered in scripts/e2e-all.mjs (runs only with E2E_REAL=1, because it touches the real project).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!/\.supabase\.co/.test(URL_ ?? "")) { console.error("needs the real NEXT_PUBLIC_SUPABASE_URL in .env.local"); process.exit(2); }
const ref = new globalThis.URL(URL_).hostname.split(".")[0];
let SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE) {
  const out = spawnSync(join(homedir(), "JARVIS/bin/sb"), ["privat", "projects", "api-keys", "--project-ref", ref, "-o", "json"], { encoding: "utf8" });
  try { SERVICE = JSON.parse(out.stdout).find((k) => k.name === "service_role")?.api_key; } catch { SERVICE = undefined; }
}
if (!SERVICE) { console.error("no service role key available"); process.exit(2); }

const pwPath = [process.env.PLAYWRIGHT, join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].find((p) => p && existsSync(p));
const { chromium } = await import(pwPath ? pathToFileURL(pwPath).href : "playwright-core");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now();
const PASSWORD = `Iso-${stamp}-Pw!x`;
const created = [];
let failed = 0;
const check = (ok, name, info = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + String(info).slice(0, 400)}`); return !!ok; };
const skip = (name, why) => console.log(`SKIP ${name} — ${why}`);

async function mkUser(label, meta) {
  const email = `e2e-iso-${label}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { onboarding_tour_done: true, ...meta } });
  if (error) throw error;
  created.push(data.user.id);
  return { id: data.user.id, email, label };
}
async function client(u) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: PASSWORD });
  if (error) throw error;
  return c;
}
const rpc = async (c, name, args = {}) => { const { data, error } = await c.rpc(name, args); return { data, error }; };

// ---------------------------------------------------------------- server
let server;
async function resolveBase() {
  if (process.env.BASE) return process.env.BASE.replace(/\/$/, "");
  const port = await new Promise((res) => { const s = createServer().listen(0, () => { const { port: p } = s.address(); s.close(() => res(p)); }); });
  server = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], { cwd: ROOT, stdio: "ignore" });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 150; i++) { if (await fetch(base + "/login").then((r) => r.status < 500, () => false)) return base; await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error("dev server did not start");
}

async function login(browser, base, u, { mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 375, height: 760 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
  await page.goto(base + "/login", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined); // fill only after hydration
  await page.waitForTimeout(800);
  await page.getByLabel("E-Mail-Adresse").fill(u.email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  const left = await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 60000 }).then(() => true, () => false);
  if (!left) { await page.screenshot({ path: `/tmp/e2e-iso-login-${u.label}.png` }).catch(() => undefined); throw new Error(`login as ${u.label} stayed on /login: ${(await page.getByRole("alert").allInnerTexts().catch(() => [])).join(" | ")} ${errors.join(" | ")}`); }
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
  return { ctx, page, errors };
}
const settle = async (page, ms = 1500) => { await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(ms); };
const bodyText = (page) => page.locator("body").innerText().catch(() => "");

// ---------------------------------------------------------------- run
const SECRET_COMPANY = `Geheimfirma${stamp % 100000}`;
const SECRET_NOTE = `Notiz-${stamp}-privat`;
const SECRET_POSITION = `Geheimstelle ${stamp % 1000}`;
let browser;
try {
  const A = await mkUser("a", { role: "student", full_name: "Iso Anna", student_onboarded: true });
  const B = await mkUser("b", { role: "student", full_name: "Iso Ben", student_onboarded: true });
  const T = await mkUser("t", { role: "teacher", full_name: "Iso Lehrer", teacher_onboarded: true });
  const P = await mkUser("p", { role: "student", account_type: "parent", full_name: "Iso Elternteil", student_onboarded: true });
  const a = await client(A), b = await client(B), t = await client(T), p = await client(P);

  // A: two applications with notes
  const today = new Date().toISOString().slice(0, 10);
  const rows = [0, 1].map((i) => ({ id: crypto.randomUUID(), user_id: A.id, company: `${SECRET_COMPANY}${i}`, position: SECRET_POSITION, status: i ? "interview" : "applied", category: "other", currency: "CHF", notes: SECRET_NOTE, created_at: today, updated_at: today }));
  const ins = await a.from("applications").insert(rows);
  check(!ins.error, "A can store own applications", ins.error?.message);

  // T: class; A joins (sharing switched off)
  const cls = await rpc(t, "class_create", { p_name: `Iso Klasse ${stamp % 1000}`, p_school_year: "2026/27" });
  const klass = Array.isArray(cls.data) ? cls.data[0] : cls.data;
  check(!cls.error && klass?.join_code, "T can create a class", cls.error?.message);
  if (klass?.join_code) {
    const j = await rpc(a, "class_join", { p_code: klass.join_code });
    check(!j.error, "A joins T's class", j.error?.message);
    const off = await rpc(a, "class_set_sharing_v2", { p_class_id: klass.id, p_share: false, p_companies: false, p_status: false });
    check(!off.error, "A switches class sharing off", off.error?.message);
  }

  // P: parent family; A joins as child, shares only progress (default share_settings)
  let familyOk = false;
  const setType = await rpc(p, "account_set_type", { p_type: "parent" });
  const fam = setType.error ? setType : await rpc(p, "family_create", { p_name: "Iso Familie" });
  const inv = fam.error ? fam : await rpc(p, "family_create_invite", { p_direction: "parent_invites_child" });
  const code = inv.data && (inv.data.code ?? inv.data[0]?.code);
  if (!inv.error && code) {
    // A is in T's class, so the account stays a school account; the birth year goes with that type (as lib/family.ts does).
    const year = await rpc(a, "account_set_type", { p_type: "school_student", p_birth_year: 2008 });
    check(!year.error, "A stores the birth year (school account)", year.error?.message);
    const join = await rpc(a, "family_join", { p_code: code });
    familyOk = !join.error;
    if (join.error) skip("family checks", `family_join: ${join.error.message}`);
  } else skip("family checks", `family setup: ${(setType.error ?? fam.error ?? inv.error)?.message ?? "no invite code"}`);

  // ---------------------------------------------------------------- API layer (what the UI is built on)
  const bSel = await b.from("applications").select("id,company").in("id", rows.map((r) => r.id));
  check(!bSel.error && bSel.data.length === 0, "API: B cannot read A's applications", JSON.stringify(bSel.data ?? bSel.error));
  const bUpd = await b.from("applications").update({ company: "hacked" }).eq("id", rows[0].id).select("id");
  check((bUpd.data ?? []).length === 0, "API: B cannot change A's application", JSON.stringify(bUpd.data ?? bUpd.error));
  const bIsland = await rpc(b, "map_friend_island", { p_friend_id: A.id });
  check(!!bIsland.error && /NOT_FRIENDS|NOT_SHARED/.test(bIsland.error.message), "API: B (no friend) is refused A's island", JSON.stringify(bIsland.data ?? bIsland.error));
  if (klass?.id) {
    const tApps = await rpc(t, "class_student_applications", { p_class_id: klass.id, p_student_id: A.id });
    const leaked = JSON.stringify(tApps.data ?? "").match(new RegExp(`${SECRET_COMPANY}|${SECRET_NOTE}|${SECRET_POSITION}`));
    check(!leaked, "API: T sees none of A's companies/positions/notes while sharing is off", JSON.stringify(tApps.data ?? tApps.error).slice(0, 300));
    const bOverview = await rpc(b, "class_overview", { p_class_id: klass.id });
    check(!!bOverview.error || (bOverview.data ?? []).length === 0, "API: B (not the teacher) cannot read T's class overview", JSON.stringify(bOverview.data ?? bOverview.error).slice(0, 200));
  }
  if (familyOk) {
    const ov = await rpc(p, "family_child_overview", { p_child_id: A.id });
    const txt = JSON.stringify(ov.data ?? ov.error);
    check(!new RegExp(`${SECRET_COMPANY}|${SECRET_NOTE}|${SECRET_POSITION}`).test(txt), "API: parent sees no companies/positions/notes (applications not shared)", txt.slice(0, 300));
    const bOv = await rpc(b, "family_child_overview", { p_child_id: A.id });
    check(!!bOv.error, "API: B (no family) cannot read A's family overview", JSON.stringify(bOv.data ?? bOv.error).slice(0, 200));
  }

  // ---------------------------------------------------------------- UI layer
  const base = await resolveBase();
  console.log(`UI checks against ${base}`);
  browser = await chromium.launch({ executablePath: chrome });
  const leakRe = new RegExp(`${SECRET_COMPANY}|${SECRET_NOTE}|${SECRET_POSITION}`);

  { // A sees own data (sanity, so the negative checks below mean something)
    const { ctx, page } = await login(browser, base, A);
    await page.goto(base + "/applications", { waitUntil: "domcontentloaded" }); await settle(page);
    check(leakRe.test(await bodyText(page)), "UI: A sees own applications on /applications");
    await ctx.close();
  }
  for (const mobile of [false, true]) { // B
    const { ctx, page, errors } = await login(browser, base, B, { mobile });
    const vp = mobile ? "mobile" : "desktop";
    for (const path of ["/dashboard", "/applications", "/analytics", "/map", "/search", "/friends", "/cvs"]) {
      await page.goto(base + path, { waitUntil: "domcontentloaded" }); await settle(page, 1200);
      check(!leakRe.test(await bodyText(page)), `UI (${vp}): B's ${path} shows nothing of A`);
    }
    await page.goto(base + `/applications/${rows[0].id}`, { waitUntil: "domcontentloaded" }); await settle(page, 2500);
    const detail = await bodyText(page);
    check(!leakRe.test(detail), `UI (${vp}): B opening A's application URL sees none of its data`);
    check(/nicht gefunden|gibt es nicht|existiert nicht|gelöscht/i.test(detail), `UI (${vp}): B opening A's application URL gets a clear 'not found'`, detail.slice(0, 200));
    await page.goto(base + `/friends/${A.id}`, { waitUntil: "domcontentloaded" }); await settle(page, 1000);
    await page.getByText(/befreundet|nicht laden|teilt/i).first().waitFor({ timeout: 20000 }).catch(() => undefined);
    const island = await bodyText(page);
    check(!leakRe.test(island) && /befreundet|nicht laden|teilt/i.test(island), `UI (${vp}): B opening A's island is refused with a message`, island.slice(0, 200));
    if (klass?.id) {
      await page.goto(base + `/teacher/classes/${klass.id}`, { waitUntil: "domcontentloaded" }); await settle(page, 2500);
      check(!/\/teacher/.test(new URL(page.url()).pathname) && !leakRe.test(await bodyText(page)), `UI (${vp}): B cannot open T's class page`, page.url());
    }
    check(errors.length === 0, `UI (${vp}): no uncaught errors / 5xx for B`, errors.slice(0, 3).join(" | "));
    await ctx.close();
  }
  if (klass?.id) { // T
    const { ctx, page, errors } = await login(browser, base, T);
    await page.goto(base + `/teacher/classes/${klass.id}`, { waitUntil: "domcontentloaded" }); await settle(page, 2500);
    const txt = await bodyText(page);
    check(/Iso Anna/.test(txt), "UI: T's class page lists A by name", txt.slice(0, 200));
    check(!leakRe.test(txt), "UI: T's class page shows none of A's companies/notes (sharing off)");
    await page.goto(base + `/teacher/classes/${klass.id}/students/${A.id}`, { waitUntil: "domcontentloaded" }); await settle(page, 2500);
    check(!leakRe.test(await bodyText(page)), "UI: T's student drilldown shows none of A's companies/notes (sharing off)");
    await page.goto(base + `/applications/${rows[0].id}`, { waitUntil: "domcontentloaded" }); await settle(page, 2000);
    check(!leakRe.test(await bodyText(page)), "UI: T opening A's application URL sees none of its data", page.url());
    check(errors.length === 0, "UI: no uncaught errors / 5xx for T", errors.slice(0, 3).join(" | "));
    await ctx.close();
  }
  if (familyOk) { // P
    const { ctx, page, errors } = await login(browser, base, P);
    await page.goto(base + "/familie", { waitUntil: "domcontentloaded" }); await settle(page, 2500);
    const txt = await bodyText(page);
    check(/Iso Anna/.test(txt), "UI: parent's /familie shows the child", txt.slice(0, 200));
    check(!leakRe.test(txt), "UI: parent's /familie shows no companies/positions/notes (not shared)");
    await page.goto(base + `/applications/${rows[0].id}`, { waitUntil: "domcontentloaded" }); await settle(page, 2000);
    check(!leakRe.test(await bodyText(page)), "UI: parent opening the child's application URL sees none of its data", page.url());
    check(errors.length === 0, "UI: no uncaught errors / 5xx for the parent", errors.slice(0, 3).join(" | "));
    await ctx.close();
  }
} catch (error) {
  check(false, "isolation run completed", error?.stack ?? String(error));
} finally {
  await browser?.close().catch(() => undefined);
  // families.created_by is "on delete set null": remove the throwaway family itself, not only its members.
  const fm = await admin.from("family_members").select("family_id").in("user_id", created).then((r) => r.data ?? [], () => []);
  const famIds = [...new Set(fm.map((r) => r.family_id))];
  if (famIds.length) { const { error } = await admin.from("families").delete().in("id", famIds); check(!error, `cleanup: ${famIds.length} throwaway family removed`, error?.message); }
  await admin.from("classes").delete().in("teacher_id", created).then(() => undefined, () => undefined);
  for (const id of created) {
    await admin.from("applications").delete().eq("user_id", id).then(() => undefined, () => undefined);
    const { error } = await admin.auth.admin.deleteUser(id);
    check(!error, `cleanup: throwaway user ${id.slice(0, 8)} deleted`, error?.message);
  }
  try { server?.kill("SIGTERM"); } catch { /* gone */ }
}
console.log(`\n==== isolation: ${failed ? `${failed} FAIL` : "all PASS"}`);
process.exit(failed ? 1 : 0);
