// LIVE production smoke for the onboarding release – run by the ORCHESTRATOR after the deploy, never by builders/testers.
// Creates throwaway users probe-onb-<role>-<stamp>@wendapply-probe.invalid through the REAL funnel (student, parent, teacher),
// confirms each address with the admin generateLink API (service role read from the env file, never printed), logs in on the same
// browser (the funnel answers are applied), checks the saved profile / goal / weekly target / role with the service role, starts and
// skips the tour (state persisted, no restart after reload), logs in an existing throwaway user (no funnel, no tour), checks the two
// website buttons and console errors. Deletes ALL probe-onb-* users in finally{} and verifies 0 are left.
//
//   SMOKE_BASE=https://wendapply.ch node scripts/onb-smoke-prod.mjs [--roles=student,parent,teacher]
// Secrets: WENDAPPLY_SR_ENV (default ~/.config/alfred/tmp/wendapply-sr.env) with SR=<service role> and ANON=<publishable key>.
// SUPABASE_REF (default bhwreehwirrloxagyypi). Output: _onboarding/onb-smoke-prod/results.{json,md} + screenshots.
// No e-mail is sent to a real mailbox (.invalid TLD; GoTrue's own confirmation mail to it bounces/drops). No card is charged.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findChrome, isProbeEmail, loadPlaywright, probeEmail, resultsTable } from "./onb-lib.mjs";
import { ANSWERS, slugOf, vis, waitPath, walk, fillKonto } from "./onb-driver.mjs";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const BASE = (process.env.SMOKE_BASE || "https://wendapply.ch").replace(/\/$/, "");
const REF = process.env.SUPABASE_REF || "bhwreehwirrloxagyypi";
const SB = `https://${REF}.supabase.co`;
const OUT = join(homedir(), "Projects/bewerbungen-tracker-wt/_onboarding/onb-smoke-prod");
mkdirSync(OUT, { recursive: true });
const ROLES = (args.roles || "student,parent,teacher").split(",");
const STAMP = Date.now().toString(36);
const PW = `Probe-${STAMP}-${Math.random().toString(36).slice(2, 10)}-xY9!`;
const PREFIX = "probe-onb-";

// ---------------------------------------------------------------- secrets (never printed)
const envFile = process.env.WENDAPPLY_SR_ENV || join(homedir(), ".config/alfred/tmp/wendapply-sr.env");
if (!existsSync(envFile)) { console.error(`secrets file missing (${envFile}) – needs SR and ANON`); process.exit(2); }
const SECRETS = Object.fromEntries(readFileSync(envFile, "utf8").trim().split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
if (!SECRETS.SR || !SECRETS.ANON) { console.error("secrets file must contain SR and ANON"); process.exit(2); }
const redact = (s) => String(s).replaceAll(SECRETS.SR, "<SR>").replaceAll(SECRETS.ANON, "<ANON>").replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<JWT>").replace(/token=[\w-]+/g, "token=<T>");
const srH = { apikey: SECRETS.SR, Authorization: `Bearer ${SECRETS.SR}`, "content-type": "application/json" };
const j = async (r) => { const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { b = t.slice(0, 200); } return { status: r.status, body: b }; };
const admin = (path, opts = {}) => fetch(`${SB}/auth/v1/admin${path}`, { ...opts, headers: srH }).then(j);
const rest = (path) => fetch(`${SB}/rest/v1${path}`, { headers: srH }).then(j);

// ---------------------------------------------------------------- results
const results = [];
let role = "";
const check = (ok, id, info = "") => { results.push({ id, device: role, status: ok ? "PASS" : "FAIL", info: ok ? "" : redact(info) }); console.log(ok ? "PASS" : "FAIL", `[${role}]`, id, ok ? "" : redact(info).slice(0, 200)); return !!ok; };

async function listProbeUsers() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await admin(`/users?page=${page}&per_page=200`);
    const users = r.body?.users || [];
    for (const u of users) if (String(u.email || "").startsWith(PREFIX) && String(u.email).endsWith("@wendapply-probe.invalid")) out.push({ id: u.id, email: u.email });
    if (users.length < 200) break;
  }
  return out;
}
async function cleanup() {
  const users = await listProbeUsers();
  for (const u of users) {
    if (!isProbeEmail(u.email)) continue; // belt and braces: never delete anything else
    await fetch(`${SB}/rest/v1/families?created_by=eq.${u.id}`, { method: "DELETE", headers: srH }).catch(() => {});
    const r = await admin(`/users/${u.id}`, { method: "DELETE" });
    if (r.status >= 300) console.log("delete failed", u.email, r.status);
  }
  const left = await listProbeUsers();
  return left.length;
}
/** Confirms the address server-side (admin generateLink → open the verify link without following the redirect). */
async function confirmByLink(email) {
  const r = await admin("/generate_link", { method: "POST", body: JSON.stringify({ type: "signup", email, password: PW, redirect_to: `${BASE}/auth/callback` }) });
  const link = r.body?.action_link || r.body?.properties?.action_link;
  if (!link) throw new Error(`generate_link failed (${r.status})`);
  const v = await fetch(link, { redirect: "manual" });
  return v.status;
}
const profileOf = async (uid) => (await rest(`/profiles?user_id=eq.${uid}&select=first_name,birth_year,school_level,canton,desired_professions,weekly_goal,help_wishes,funnel_completed_at,account_type`)).body?.[0] ?? null;
const roleOf = async (uid) => (await rest(`/user_roles?user_id=eq.${uid}&select=role,display_name`)).body?.[0] ?? null;
const tourOf = async (uid, tour) => (await rest(`/product_tour_state?user_id=eq.${uid}&tour=eq.${tour}&select=status,version`)).body?.[0] ?? null;
const userIdOf = async (email) => (await listProbeUsers()).find((u) => u.email === email)?.id ?? null;

const pw = await loadPlaywright();
const browser = await pw.chromium.launch({ executablePath: findChrome() });
const created = [];
try {
  const left0 = await cleanup();
  check(left0 === 0, "no probe-onb leftovers before start", `${left0} left`);
  for (const r of ROLES) {
    role = r;
    const funnelRole = r === "teacher" ? "staff" : r;
    const email = probeEmail(r, STAMP);
    created.push(email);
    const ctx = await browser.newContext({ viewport: r === "student" ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: r === "student", hasTouch: r === "student", locale: "de-CH", timezoneId: "Europe/Zurich" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error" && !/favicon|status of 4\d\d/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    try {
      await page.goto(`${BASE}/start`);
      check(await vis(page.getByRole("heading", { name: /Dein Weg/ }), 30000), "funnel screen 0");
      await page.screenshot({ path: `${OUT}/${r}-weg.png` });
      await walk(page, funnelRole, ANSWERS[funnelRole]);
      check(slugOf(page) === "konto", "reached konto", slugOf(page));
      await page.screenshot({ path: `${OUT}/${r}-konto.png` });
      await fillKonto(page, email, { password: PW });
      check(await waitPath(page, /^\/start\/bestaetigen/, 30000), "→ /start/bestaetigen", page.url());
      const status = await confirmByLink(email);
      check(status >= 300 && status < 400, "confirmation link verified (redirect)", `status ${status}`);
      // same browser: log in → applyFunnelIfPending
      await page.goto(`${BASE}/login`);
      await page.getByLabel(/E-Mail/).first().fill(email);
      await page.getByLabel(/^Passwort$/).first().fill(PW);
      await page.getByRole("button", { name: /^Anmelden$/ }).last().click();
      const landing = r === "student" ? /^\/dashboard/ : r === "parent" ? /^\/familie/ : /^\/(schullizenz|teacher)/;
      check(await waitPath(page, landing, 45000), `lands on ${landing}`, page.url());
      const uid = await userIdOf(email);
      const prof = uid && await profileOf(uid);
      const ur = uid && await roleOf(uid);
      check(!!prof?.funnel_completed_at, "profile.funnel_completed_at set", JSON.stringify(prof));
      if (r === "student") {
        check(prof?.first_name === "Lena" && prof?.weekly_goal === ANSWERS.student.weeklyGoal && prof?.canton === "ZH" && prof?.birth_year === ANSWERS.student.birthYear, "student profile/goal/weekly target saved", JSON.stringify(prof));
        check(ur?.role === "student" && ur?.display_name === "Lena", "role student, display name = first name", JSON.stringify(ur));
      }
      if (r === "parent") check(prof?.account_type === "parent" && prof?.first_name === "Sandra", "parent account type + name saved", JSON.stringify(prof));
      if (r === "teacher") check(ur?.role === "teacher", "role teacher (licence gate, no trial)", JSON.stringify(ur));
      check(!(await page.evaluate(() => localStorage.getItem("wendapply.funnel.v1"))), "local funnel copy deleted");
      // tour start + skip (student / parent; the teacher stays behind the licence gate → no tour)
      const tour = r === "student" ? "schueler" : r === "parent" ? "eltern" : null;
      const dialog = page.locator('[role="dialog"]').filter({ has: page.getByRole("button", { name: /Weiter|Fertig/ }) });
      if (tour) {
        check(await vis(dialog, 20000), "tour starts automatically");
        await page.screenshot({ path: `${OUT}/${r}-tour-1.png` });
        await dialog.getByRole("button", { name: /^Weiter/ }).click().catch(() => {});
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}/${r}-tour-2.png` });
        await dialog.getByRole("button", { name: /überspringen/i }).first().click();
        await page.waitForTimeout(1500);
        check((await tourOf(uid, tour))?.status === "skipped", "tour skip persisted in product_tour_state");
        await page.reload(); await page.waitForTimeout(4000);
        check((await dialog.count()) === 0, "tour does not restart after reload");
      } else {
        await page.waitForTimeout(3000);
        check((await dialog.count()) === 0, "no tour behind the licence gate");
      }
      check(errors.length === 0, "no console errors", errors.join(" | "));
    } catch (e) {
      check(false, "flow completed", String(e.message).split("\n")[0]);
      await page.screenshot({ path: `${OUT}/${r}-error.png` }).catch(() => {});
    } finally { await ctx.close(); }
  }
  // existing throwaway user logs in: no funnel, no tour
  role = "login";
  if (created[0]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "de-CH" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/E-Mail/).first().fill(created[0]); await page.getByLabel(/^Passwort$/).first().fill(PW);
    await page.getByRole("button", { name: /^Anmelden$/ }).last().click();
    check(await waitPath(page, /^\/(dashboard|familie|schullizenz|teacher)/, 45000), "existing throwaway user logs in to the app", page.url());
    check(!/\/start/.test(page.url()), "no funnel for an existing user");
    await page.waitForTimeout(3000);
    check((await page.locator('[role="dialog"]').filter({ has: page.getByRole("button", { name: /Weiter|Fertig/ }) }).count()) === 0, "no tour after re-login (state from DB)");
    await ctx.close();
  }
  // website buttons, desktop + phone
  role = "website";
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    const signup = page.locator("header").first().getByRole("link", { name: /^Kostenlos testen$/ });
    const login = page.getByRole("link", { name: /^Anmelden$/ }).first();
    check(await vis(signup, 15000) && (await signup.first().getAttribute("href"))?.startsWith("/start"), `${vp.width}: «Kostenlos testen» → /start`);
    check(await vis(login, 15000) && (await login.getAttribute("href"))?.startsWith("/login"), `${vp.width}: «Anmelden» → /login`);
    await page.screenshot({ path: `${OUT}/website-${vp.width}.png` });
    await ctx.close();
  }
} finally {
  role = "cleanup";
  let left = -1;
  try { left = await cleanup(); } catch (e) { console.log("cleanup error", redact(e.message)); }
  check(left === 0, "all probe-onb users deleted (0 left)", `${left} left`);
  await browser.close().catch(() => {});
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT}/results.md`, `# onb live smoke ${new Date().toISOString()} – ${BASE}\n\n${resultsTable(results)}\n`);
  console.log(`results: ${OUT}/results.md`);
  process.exitCode = results.some((r) => r.status !== "PASS") ? 1 : 0;
}
