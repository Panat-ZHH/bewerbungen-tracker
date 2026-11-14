// End-to-end check of the first-login onboarding tour against the in-memory Supabase stub (nothing real is touched).
// Flows per viewport/theme: full path (login gate with ?next=, keyboard, all 5 steps), skip, replay from the settings,
// plus an old database without the tour column (no loop) and a teacher (never sees the tour).
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3291 node scripts/onboarding-tour-e2e.mjs [--only=375-light]
// The app must run with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy.
import fs from "node:fs";
import { installStub, launch, makeUser, newCtx } from "./ux-v2-stub.mjs";

const BASE = process.env.BASE || "http://localhost:3291";
const OUT = (process.env.TOUR_OUT || "/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/screenshots/onboarding-tour/").replace(/\/?$/, "/");
fs.mkdirSync(OUT, { recursive: true });
const SUPA = "http://localhost:54321";
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const results = [];
const problems = [];
let current = "";
const check = (ok, text) => { results.push({ ok, text: `[${current}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${current}]`, text); };

/** Stub + a stateful layer for the auth metadata, the profile row and the tour RPCs. */
async function actor(browser, vp, { meta = { role: "student" }, profile = null, oldDb = false, role = "student" } = {}) {
  const ctx = await newCtx(browser, vp);
  const t = { meta: { ...meta }, profile: profile ? { ...profile } : null, rpc: [] };
  const rpc = {
    student_onboarding_save: (b) => { t.rpc.push(["student_onboarding_save", b]); t.profile = { ...(t.profile ?? { id: "profile-u1", user_id: "u1", email: "lena@beispiel.ch" }), first_name: b.p_first_name || t.profile?.first_name || "", last_name: b.p_last_name ?? "", school_level: b.p_school_level, desired_professions: b.p_professions ?? [], canton: b.p_canton, location: b.p_place, desired_start_year: b.p_start_year, onboarding_completed_at: b.p_complete ? new Date().toISOString() : t.profile?.onboarding_completed_at ?? null }; return null; },
    onboarding_tour_set: (b) => { t.rpc.push(["onboarding_tour_set", b]); t.profile = { ...(t.profile ?? { id: "profile-u1", user_id: "u1", first_name: "", last_name: "", email: "lena@beispiel.ch" }) }; if (b.p_step !== null) t.profile.onboarding_tour_step = Math.max(0, Math.min(4, b.p_step)); if (b.p_complete) t.profile.onboarding_tour_completed_at ??= new Date().toISOString(); return t.profile.onboarding_tour_completed_at ?? null; },
  };
  const state = await installStub(ctx, { role, rpc });
  const user = () => ({ ...makeUser(role).user, user_metadata: t.meta });
  // Registered after installStub, so these handlers win; everything else falls through to the stub.
  await ctx.route(`${SUPA}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const m = req.method();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(b) });
    if (m === "OPTIONS") return route.fallback();
    if (p === "/auth/v1/user") {
      if (m === "PUT") { const body = req.postDataJSON() || {}; t.meta = { ...t.meta, ...(body.data || {}) }; }
      return json(user());
    }
    if (p === "/rest/v1/rpc/onboarding_tour_set" && oldDb) { t.rpc.push(["onboarding_tour_set", req.postDataJSON()]); return json({ code: "PGRST202", message: "Could not find the function public.onboarding_tour_set(p_complete, p_step) in the schema cache" }, 404); }
    if (p === "/rest/v1/profiles" && m === "GET") {
      const select = url.searchParams.get("select") || "";
      if (oldDb && select.includes("onboarding_tour")) return json({ code: "42703", message: "column profiles.onboarding_tour_completed_at does not exist" }, 400);
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      const rows = t.profile ? [t.profile] : [];
      return json(single ? (rows[0] ?? null) : rows);
    }
    return route.fallback();
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${current}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (msg) => { if (msg.type() === "error" && !/Failed to load resource|favicon|status of 4\d\d|status of 5\d\d/.test(msg.text())) problems.push(`[${current}] console ${msg.text().slice(0, 200)}`); });
  return { ctx, page, t, state };
}

const step = (page) => page.getByTestId("tour-progress").locator("span").first().textContent();
const focusedTag = (page) => page.evaluate(() => document.activeElement?.tagName);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const pathOf = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };

async function advanceToCheck(page) {
  await page.getByRole("button", { name: /Los geht/ }).click();
  await page.getByLabel("Vorname").waitFor();
  if (!(await page.getByLabel("Vorname").inputValue())) await page.getByLabel("Vorname").fill("Lena");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("button", { name: /Speichern & weiter/ }).click();
  await page.getByRole("button", { name: "Mache ich später" }).click();
  await page.getByRole("heading", { name: /KI-Check/ }).waitFor();
}

async function run(browser, vp, tag) {
  current = tag;
  // waits for the step animation (and the "ABGESCHICKT!" stamp) to settle so the screenshots show the final state
  const shot = async (page, name, settle = 700) => { await page.waitForTimeout(settle); await page.screenshot({ path: `${OUT}${tag}-${name}.png`, fullPage: true }); };

  // ---------------------------------------------------------------- 1. full path (gate after login, ?next survives)
  {
    const { ctx, page, t, state } = await actor(browser, vp);
    await page.goto(`${BASE}/auth/callback?next=${encodeURIComponent("/search?q=Koch")}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/onboarding**", { timeout: 60000 }).catch(() => {});
    check(pathOf(page) === "/onboarding?next=%2Fsearch%3Fq%3DKoch", `login gate routes a new student to the tour with ?next (${pathOf(page)})`);
    await page.getByRole("heading", { name: /Das ist WendApply/ }).waitFor();
    check((await step(page)) === "Schritt 1 von 5", "progress shows 'Schritt 1 von 5'");
    check((await page.getByRole("progressbar").getAttribute("aria-valuenow")) === "1", "progressbar aria-valuenow = 1");
    check((await focusedTag(page)) === "H1", "focus starts on the step title");
    check((await overflow(page)) <= 1, "no horizontal overflow (welcome)");
    check(vp.dark ? (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark" : true, "dark theme active when requested");
    await shot(page, "01-welcome");
    // keyboard: Tab from the title reaches "Los geht's", Enter starts
    await page.keyboard.press("Tab");
    check(/Los geht/.test(await page.evaluate(() => document.activeElement?.textContent ?? "")), "Tab reaches the primary button");
    await page.keyboard.press("Enter");
    await page.getByLabel("Vorname").waitFor();
    check((await step(page)) === "Schritt 2 von 5" && (await focusedTag(page)) === "H1", "Enter goes to step 2, focus on the new title");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    check(await page.getByText("Wie dürfen wir dich nennen?").isVisible(), "first name is required");
    await shot(page, "02a-profile-error");
    await page.getByLabel("Vorname").fill("Mia");
    await page.getByLabel(/In welcher Klasse/).selectOption({ index: 3 });
    await shot(page, "02b-profile-name");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByRole("button", { name: "+ Koch / Köchin" }).click();
    await shot(page, "02c-profile-professions");
    await page.getByRole("button", { name: "Zurück" }).click();
    check((await page.getByLabel("Vorname").inputValue()) === "Mia", "Back inside the profile step keeps the answers");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Wohnort").fill("Uster");
    await page.getByLabel("Kanton").selectOption("ZH");
    await shot(page, "02d-profile-place");
    await page.getByRole("button", { name: /Speichern & weiter/ }).click();
    await page.getByLabel("Firma").waitFor();
    const save = t.rpc.find((c) => c[0] === "student_onboarding_save")?.[1];
    check(save?.p_first_name === "Mia" && save?.p_complete === true && save?.p_place === "Uster" && save?.p_canton === "ZH" && save?.p_professions?.includes("Koch / Köchin"), "profile answers saved via student_onboarding_save");
    check(t.rpc.some((c) => c[0] === "onboarding_tour_set" && c[1].p_step === 2 && c[1].p_complete === false), "tour step 2 stored for resume");
    check(t.meta.onboarding_tour_done !== true, "tour not marked done after the profile step");
    check((await page.getByLabel("Beruf").inputValue()) === "Koch / Köchin", "first wish profession prefills the application");
    check((await step(page)) === "Schritt 3 von 5", "progress shows 'Schritt 3 von 5'");
    await page.getByRole("button", { name: "Bewerbung speichern" }).click();
    check(await page.getByText(/Bei welcher Firma/).isVisible(), "company is required");
    await page.getByLabel("Firma").fill("Migros");
    check(!(await page.getByText(/Bei welcher Firma/).isVisible()), "the error disappears once the field is filled");
    await page.getByText("Abgeschickt", { exact: true }).click();
    await shot(page, "03a-application");
    await page.getByRole("button", { name: "Bewerbung speichern" }).click();
    await page.getByText("Gespeichert", { exact: true }).waitFor();
    const app = state.apps.find((a) => a.company === "Migros" && String(a.id).startsWith("u1-app-")); // the seed data has another Migros row
    check(app?.status === "applied" && app?.position === "Koch / Köchin" && app?.user_id === "u1" && !!app?.applied_at, "first application saved to applications (status applied, applied_at set)");
    await shot(page, "03b-application-saved", 2600);
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByRole("heading", { name: /KI-Check/ }).waitFor();
    check((await step(page)) === "Schritt 4 von 5", "progress shows 'Schritt 4 von 5'");
    await shot(page, "04-ai-check", 2600);
    check((await page.getByRole("button", { name: "Bewerbung prüfen lassen" }).count()) === 0, "with ?next the KI-Check CTA is hidden (it would lose the next path)");
    await page.getByRole("button", { name: /^Später/ }).click();
    await page.getByRole("heading", { name: /bereit/ }).waitFor();
    check((await step(page)) === "Schritt 5 von 5", "progress shows 'Schritt 5 von 5'");
    check((await page.getByRole("button", { name: /überspringen/ }).count()) === 0, "no skip on the final step");
    await page.getByRole("button", { name: "Zurück" }).click();
    check((await step(page)) === "Schritt 4 von 5", "Back works across steps");
    await page.getByRole("button", { name: /^Später/ }).click();
    await page.getByRole("heading", { name: /bereit/ }).waitFor();
    check((await overflow(page)) <= 1, "no horizontal overflow (done)");
    await shot(page, "05-done");
    await page.getByRole("button", { name: /^Weiter/ }).click();
    await page.waitForURL("**/search**", { timeout: 60000 }).catch(() => {});
    check(pathOf(page) === "/search?q=Koch", `done forwards to ?next (${pathOf(page)})`);
    check(t.meta.onboarding_tour_done === true && t.meta.student_onboarded === true, "auth flags set on completion");
    check(t.rpc.some((c) => c[0] === "onboarding_tour_set" && c[1].p_complete === true && c[1].p_step === 4), "onboarding_tour_set(4, true) on completion");
    await page.goto(`${BASE}/auth/callback`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/dashboard**", { timeout: 60000 }).catch(() => {});
    check(pathOf(page) === "/dashboard", "next login goes straight to the dashboard");
    await ctx.close();
  }

  // ---------------------------------------------------------------- 2. skip (answers already typed are kept)
  {
    const { ctx, page, t } = await actor(browser, vp);
    await page.goto(`${BASE}/auth/callback`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/onboarding**", { timeout: 60000 }).catch(() => {});
    await page.getByRole("button", { name: /Los geht/ }).click();
    await page.getByLabel("Vorname").fill("Ben");
    await shot(page, "06-skip-from-profile");
    await page.getByRole("button", { name: "Einführung überspringen" }).click();
    await page.waitForURL("**/dashboard**", { timeout: 60000 }).catch(() => {});
    check(pathOf(page) === "/dashboard", "skip ends the tour on the dashboard");
    const save = t.rpc.find((c) => c[0] === "student_onboarding_save")?.[1];
    check(save?.p_first_name === "Ben" && save?.p_complete === false, "skip keeps the typed answers (partial save)");
    check(t.rpc.some((c) => c[0] === "onboarding_tour_set" && c[1].p_complete === true) && t.meta.onboarding_tour_done === true, "skip marks the tour as completed");
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/dashboard**", { timeout: 60000 }).catch(() => {});
    check(pathOf(page) === "/dashboard", "opening /onboarding after completion forwards (no replay without ?replay)");
    await ctx.close();
  }

  // ---------------------------------------------------------------- 3. replay from the settings
  {
    const profile = { id: "profile-u1", user_id: "u1", first_name: "Lena", last_name: "Müller", email: "lena@beispiel.ch", location: "Zürich", canton: "ZH", desired_professions: ["Mediamatiker:in"], school_level: "8. Klasse", desired_start_year: null, onboarding_completed_at: "2026-11-10T08:00:00Z", onboarding_tour_completed_at: "2026-11-10T08:00:00Z", onboarding_tour_step: 4 };
    const { ctx, page, t, state } = await actor(browser, vp, { meta: { role: "student", onboarding_tour_done: true }, profile });
    const appsBefore = state.apps.length;
    await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
    const link = page.getByRole("link", { name: "Einführung nochmals ansehen" });
    await link.waitFor();
    await link.scrollIntoViewIfNeeded();
    await shot(page, "07-settings-entry");
    await link.click();
    await page.waitForURL("**/onboarding?replay=1", { timeout: 60000 }).catch(() => {});
    await page.getByRole("heading", { name: /Das ist WendApply/ }).waitFor();
    check(await page.getByText(/Nochmals ansehen/).isVisible(), "replay mode is labelled");
    await shot(page, "08-replay-welcome");
    await page.getByRole("button", { name: /Los geht/ }).click();
    check((await page.getByLabel("Vorname").inputValue()) === "Lena", "replay prefills the stored profile (nothing reset)");
    await page.getByRole("button", { name: "Einführung schliessen" }).click();
    await page.waitForURL("**/settings", { timeout: 60000 }).catch(() => {});
    check(pathOf(page) === "/settings", "closing the replay returns to the settings");
    await link.click();
    await page.waitForURL("**/onboarding?replay=1", { timeout: 60000 }).catch(() => {});
    await advanceToCheck(page);
    await page.getByRole("button", { name: /^Später/ }).click();
    await page.getByRole("button", { name: "Zurück zu den Einstellungen" }).click();
    await page.waitForURL("**/settings", { timeout: 60000 }).catch(() => {});
    check(pathOf(page) === "/settings", "'Fertig' in replay returns to the settings");
    check(!t.rpc.some((c) => c[0] === "onboarding_tour_set"), "replay never writes the tour state");
    check(state.apps.length === appsBefore && t.profile.first_name === "Lena" && t.profile.desired_professions.includes("Mediamatiker:in"), "replay keeps applications and profile data");
    // the KI-Check CTA opens /bewerbung-check
    await link.click();
    await page.waitForURL("**/onboarding?replay=1", { timeout: 60000 }).catch(() => {});
    await advanceToCheck(page);
    await page.getByRole("button", { name: "Bewerbung prüfen lassen" }).click();
    await page.waitForURL("**/bewerbung-check", { timeout: 60000 }).catch(() => {});
    check(pathOf(page) === "/bewerbung-check", "KI-Check CTA opens /bewerbung-check");
    await ctx.close();
  }
}

async function extras(browser) {
  current = "extras";
  // old database: no onboarding_tour_* column and no RPC -> tour once, then never again (no loop, no crash)
  {
    const { ctx, page, t } = await actor(browser, { w: 375, h: 812 }, { oldDb: true });
    await page.goto(`${BASE}/auth/callback?next=${encodeURIComponent("/classes/join/tok123_abcdefghijklmnopqrs")}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/onboarding**", { timeout: 60000 }).catch(() => {});
    check(pathOf(page).startsWith("/onboarding?next=%2Fclasses%2Fjoin%2F"), `old DB: tour shown once, invite next kept (${pathOf(page)})`);
    await page.getByRole("heading", { name: /Das ist WendApply/ }).waitFor();
    await page.getByRole("button", { name: "Einführung überspringen" }).click();
    await page.waitForURL("**/classes/join/**", { timeout: 60000 }).catch(() => {});
    check(pathOf(page).startsWith("/classes/join/"), `old DB: skip forwards to the invite (${pathOf(page)})`);
    check(t.meta.onboarding_tour_done === true, "old DB: flag set although the RPC is missing");
    await page.goto(`${BASE}/auth/callback`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/dashboard**", { timeout: 60000 }).catch(() => {});
    check(pathOf(page) === "/dashboard", "old DB: no loop on the next login");
    await ctx.close();
  }
  // teacher: never the student tour
  {
    const { ctx, page } = await actor(browser, { w: 1280, h: 800 }, { role: "teacher", meta: { role: "teacher", teacher_onboarded: true } });
    await page.goto(`${BASE}/auth/callback`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/teacher**", { timeout: 60000 }).catch(() => {});
    check(new URL(page.url()).pathname.startsWith("/teacher"), `teacher lands on /teacher (${pathOf(page)})`);
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/teacher**", { timeout: 60000 }).catch(() => {});
    check(new URL(page.url()).pathname.startsWith("/teacher"), "teacher opening /onboarding is sent to /teacher");
    await ctx.close();
  }
  // teacher by DB role only (stale student metadata): /onboarding still sends them to /teacher
  {
    const { ctx, page } = await actor(browser, { w: 1280, h: 800 }, { role: "teacher", meta: { role: "student", teacher_onboarded: true } });
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/teacher**", { timeout: 60000 }).catch(() => {});
    check(new URL(page.url()).pathname.startsWith("/teacher"), `teacher with stale student metadata opening /onboarding is sent to /teacher (${pathOf(page)})`);
    await ctx.close();
  }
  // reduced motion: the bar has no transition
  {
    const { ctx, page } = await actor(browser, { w: 375, h: 812, reducedMotion: "reduce" });
    await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Das ist WendApply/ }).waitFor();
    // app/globals.css switches motion off with a ~0s duration under prefers-reduced-motion.
    const motion = await page.evaluate(() => { const bar = document.querySelector('[role="progressbar"] > div'); const panel = document.querySelector(".animate-rise"); return { bar: getComputedStyle(bar).transitionDuration, anim: getComputedStyle(panel).animationDuration }; });
    const off = (d) => d.split(",").every((x) => parseFloat(x) < 0.01);
    check(off(motion.bar), `reduced motion: no bar transition (${motion.bar})`);
    check(off(motion.anim), `reduced motion: no step animation (${motion.anim})`);
    await ctx.close();
  }
}

const browser = await launch();
try {
  const combos = [[{ w: 375, h: 812 }, "375-light"], [{ w: 375, h: 812, dark: true }, "375-dark"], [{ w: 1280, h: 800 }, "1280-light"], [{ w: 1280, h: 800, dark: true }, "1280-dark"]];
  for (const [vp, tag] of combos) {
    if (only && only !== tag) continue;
    try { await run(browser, vp, tag); } catch (e) { check(false, `threw: ${String(e.message).split("\n")[0]}`); }
  }
  if (!only || only === "extras") { try { await extras(browser); } catch (e) { check(false, `threw: ${String(e.message).split("\n")[0]}`); } }
} finally { await browser.close(); }

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
if (problems.length) { console.log(`${problems.length} browser problem(s):`); for (const p of [...new Set(problems)]) console.log("  ", p); }
process.exit(failed.length || problems.length ? 1 : 0);
