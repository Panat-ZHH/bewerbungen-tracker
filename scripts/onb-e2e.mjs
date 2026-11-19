// Onboarding e2e (SPEC-FLOW + SPEC-DATA): sign-up funnel for every role on iPhone 15 (WebKit), Pixel 7 (Chromium) and desktop 1280,
// back/forward, reload, resume + «Neu beginnen», e-mail confirmation (same + other browser via wa_funnel), Google (mocked to the
// OAuth boundary + nach=google), existing account without enumeration, saved payload, tour (next/back/skip/Esc/arrows, persistence,
// missing anchor, reduced motion, bottom nav, paywall/trial banner, Tour wiederholen), /login unaffected, website buttons,
// responsive regression 320–1280. Nothing real is touched: Supabase = in-memory stub (scripts/onb-lib.mjs).
//
//   node scripts/onb-e2e.mjs                       # spawns/reuses a billing-off dev server on :3245
//   BASE=http://localhost:3245 node scripts/onb-e2e.mjs --only=funnel --device=pixel7
//   flags: --only=<regex on case id>  --device=iphone15,pixel7,desktop1280  --out=<dir>  --no-shots
// Output: <out>/results.json + results.md (table per case/device), failure screenshots in <out>/failures.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPIRED, FUNNEL_CONFIRM_KEY, FUNNEL_KEY, PATHS, RESPONSIVE_WIDTHS, ROLE_LABEL, TRIAL,
  createOnbWorld, devices, findChrome, loadPlaywright, overflowX, payloadProblems, piiLeaks, resultsTable, smallTargets, startDevServer,
} from "./onb-lib.mjs";
import { ANSWERS, PW, YEAR, advance, fillKonto, funnelState, h1, ls, primary, slugOf, tile, vis, waitPath, waitSlug, walk } from "./onb-driver.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const OUT = (args.out || process.env.OUT || join(homedir(), "Projects/bewerbungen-tracker-wt/_onboarding/onb-e2e")).replace(/\/$/, "");
mkdirSync(`${OUT}/failures`, { recursive: true }); mkdirSync(`${OUT}/shots`, { recursive: true });
const ONLY = args.only ? new RegExp(args.only) : null;
const PORT = Number(process.env.PORT || 3245);

const pw = await loadPlaywright();
const CHROME = findChrome();
const DEVICES = devices(pw.devices).filter((d) => !args.device || args.device.split(",").includes(d.id));
const server = await startDevServer({ root: ROOT, port: PORT });
const BASE = process.env.BASE || server.base;
const browsers = {};
const getBrowser = async (type) => (browsers[type] ??= type === "webkit" ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }));

// ------------------------------------------------------------------------------------------------ results
const results = [];
let cur = { id: "", device: "" };
let caseFails = [];
const check = (ok, text, info = "") => { if (!ok) caseFails.push(`${text}${info ? ` (${String(info).slice(0, 200)})` : ""}`); console.log(ok ? "  ok  " : "  FAIL", text, ok ? "" : String(info).slice(0, 200)); return !!ok; };

// ------------------------------------------------------------------------------------------------ helpers
async function open(world, dev, { tag = "A", session = null, reducedMotion = "no-preference", viewport, storage } = {}) {
  const browser = await getBrowser(dev.browser);
  const ctx = await browser.newContext({ ...dev.options, ...(viewport ? { viewport } : {}), locale: "de-CH", timezoneId: "Europe/Zurich", reducedMotion, storageState: storage });
  ctx.setDefaultTimeout(20000);
  // WebKit upgrades http://localhost under `upgrade-insecure-requests` (see scripts/mobile-responsive-e2e.mjs) → strip it locally.
  if (dev.browser === "webkit") await ctx.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document" || !route.request().url().startsWith(BASE)) return route.fallback();
    try { const resp = await route.fetch({ maxRedirects: 0 }); const headers = { ...resp.headers() }; for (const k of Object.keys(headers)) if (/^content-security-policy/i.test(k)) headers[k] = headers[k].replace(/upgrade-insecure-requests;?\s*/gi, ""); return route.fulfill({ response: resp, headers }); } catch { return route.fallback(); }
  });
  await world.install(ctx, { tag, session });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on("pageerror", (e) => { const m = String(e.message).split("\n")[0]; if (!/aborted|Load failed|Failed to fetch|NetworkError|access control/i.test(m)) errors.push(m.slice(0, 200)); });
  page.on("console", (msg) => { if (msg.type() === "error" && !/Failed to load resource|favicon|status of [45]\d\d|Download the React DevTools|HMR|webpack/i.test(msg.text())) errors.push(`console: ${msg.text().slice(0, 200)}`); });
  page.on("request", (r) => { if (!/\/_next\/|\.(png|webp|svg|woff2?|ico|css)(\?|$)|__nextjs|webpack-hmr/.test(r.url())) requests.push({ method: r.method(), url: r.url(), body: r.postData() || "" }); });
  return { ctx, page, errors, requests };
}
const shot = async (page, name) => { if (args["no-shots"]) return; await page.screenshot({ path: `${OUT}/shots/${cur.device}-${name}.png`, fullPage: false }).catch(() => {}); };

// tour helpers
const tourDialog = (page) => page.locator('[role="dialog"]').filter({ has: page.getByRole("button", { name: /Weiter|Fertig/ }) });
const tourCounter = async (page) => { const t = await tourDialog(page).first().innerText().catch(() => ""); const m = /(\d+)\s*\/\s*(\d+)/.exec(t); return m ? [Number(m[1]), Number(m[2])] : null; };

// ------------------------------------------------------------------------------------------------ cases
const CASES = [];
const def = (id, fn, { devices: only } = {}) => CASES.push({ id, fn, only });

/** Full e-mail funnel for a role: walk, check payload + no PII before consent, confirm in the same browser, landing + saved data. */
for (const [id, role, extra] of [
  ["funnel-student-private", "student", {}],
  ["funnel-student-classcode", "student", { classCode: "KLAS7Q2" }],
  ["funnel-parent", "parent", {}],
  ["funnel-staff-licence", "staff", {}],
]) def(id, async (dev) => {
  const world = createOnbWorld({ base: BASE, access: role === "staff" ? EXPIRED({ role: "teacher", expired_reason: "no_licence" }) : TRIAL({ account_type: role === "parent" ? "parent" : null }) });
  const a = { ...ANSWERS[role], ...extra };
  const email = `neu-${role}-${Date.now()}@beispiel.ch`;
  const { ctx, page, errors, requests } = await open(world, dev);
  await page.goto(`${BASE}/start`);
  check(await vis(page.getByRole("heading", { name: /Dein Weg/ }), 30000), "screen 0 «Dein Weg» heading");
  check(await vis(page.getByRole("button", { name: /Los geht/ }).or(page.getByRole("link", { name: /Los geht/ }))), "one «Los geht’s» button");
  await shot(page, `${id}-weg`);
  const seen = await walk(page, role, a);
  const expected = PATHS[role].filter((s) => s !== "konto");
  check(slugOf(page) === "konto", `reached «konto» (at ${slugOf(page)})`);
  check(JSON.stringify(seen.slice(0, -1)) === JSON.stringify(expected), `visited the spec path`, seen.join(">"));
  if (role === "student") {
    const st = await funnelState(page);
    check(st && st.firstName === a.firstName && st.weeklyGoal === a.weeklyGoal, "answers in localStorage", JSON.stringify(st)?.slice(0, 200));
    check(!JSON.stringify(st || {}).includes("@"), "no e-mail in localStorage");
  }
  // plan screen reflected the answers (go back one step)
  await page.goBack(); await waitSlug(page, "plan");
  const planText = await page.locator("main").innerText().catch(() => "");
  if (role === "student") check(/4 Bewerbungen pro Woche/.test(planText) && planText.includes(a.firstName), "«Dein Plan» shows weekly goal + name", planText.slice(0, 160));
  if (role === "parent") check(planText.includes(a.firstName) && /7 Tage gratis testen/.test(planText), "parent plan shows name + trial", planText.slice(0, 160));
  await shot(page, `${id}-plan`);
  if (role !== "staff") { await advance(page, "plan"); } else { await page.goForward(); }
  await waitSlug(page, "konto");
  await shot(page, `${id}-konto`);
  // consent gates the submit
  await fillKonto(page, email, { consent: false });
  check(slugOf(page) === "konto" && world.signups.length === 0, "no sign-up without the consent checkbox");
  const piiBefore = piiLeaks(requests, [a.firstName, email, a.place].filter(Boolean));
  check(piiBefore.length === 0, "no PII sent before «Konto erstellen»", piiBefore.join("; "));
  await page.getByRole("checkbox", { name: /Datenschutz/ }).first().check({ force: true });
  await page.getByRole("button", { name: /^Konto erstellen/ }).last().click();
  check(await waitPath(page, /^\/start\/bestaetigen/), `→ /start/bestaetigen (${page.url()})`);
  check(await vis(page.getByRole("heading", { name: /Schau in dein Postfach/ })), "«Schau in dein Postfach»");
  check((await page.locator("main").innerText().catch(() => "")).includes(email), "confirm page shows the address");
  const su = world.signups.at(-1);
  check(!!su, "signUp called once", world.signups.length);
  const wa = su?.data?.wa_funnel;
  const exp = role === "student" ? { role: "student", firstName: a.firstName, weeklyGoal: a.weeklyGoal, canton: a.canton, birthYear: a.birthYear } : role === "parent" ? { role: "parent", firstName: a.firstName } : { role: "staff" };
  const probs = payloadProblems(wa, exp);
  check(probs.length === 0, "signUp metadata wa_funnel valid (no transient keys, role keys only)", probs.join("; "));
  check(!JSON.stringify(su?.data || {}).includes(a.classCode || "§§"), "class code not sent to the server");
  check(/\/auth\/callback/.test(su?.redirect || ""), "emailRedirectTo = /auth/callback", su?.redirect);
  check(await page.evaluate((k) => sessionStorage.getItem(k) !== null && localStorage.getItem(k) === null, FUNNEL_CONFIRM_KEY), "confirm record in sessionStorage only");
  // confirm in the same browser
  await page.goto(world.confirmLink());
  const landing = role === "student" ? (a.classCode ? /^\/classes\/join\// : /^\/dashboard/) : role === "parent" ? /^\/familie/ : /^\/(schullizenz|teacher)/;
  check(await waitPath(page, landing, 40000), `lands on ${landing} (${page.url()})`);
  const applies = world.calls("funnel_apply");
  check(applies.length >= 1, "funnel_apply called after the session exists");
  const sent = applies[0]?.body?.p_answers;
  if (sent) check(payloadProblems(sent, exp).length === 0, "funnel_apply payload valid", payloadProblems(sent, exp).join("; "));
  const prof = world.profileOf(email);
  check(!!prof?.funnel_completed_at, "profile marked funnel_completed_at");
  if (role === "student") check(prof?.weekly_goal === a.weeklyGoal && prof?.first_name === a.firstName && prof?.canton === a.canton, "profile has name, canton, weekly goal", JSON.stringify(prof).slice(0, 200));
  check((await ls(page, FUNNEL_KEY)) === null, "funnel key deleted after save");
  check(!world.log.some((c) => c.name === "updateUser" && c.body?.wa_funnel !== null && "wa_funnel" in c.body) || world.log.some((c) => c.name === "updateUser" && c.body?.wa_funnel === null), "wa_funnel cleared in metadata");
  await page.waitForTimeout(1500);
  check(!/schritt=rolle|\/auth\/role/.test(page.url()), "role never asked again", page.url());
  if (role === "student" && !a.classCode) {
    check(await vis(page.locator('[data-tour="schueler-weekly-goal"]'), 15000), "dashboard WeeklyGoal anchor visible");
    check(/\b4\b/.test(await page.locator('[data-tour="schueler-weekly-goal"]').first().innerText().catch(() => "")), "dashboard weekly goal shows 4");
  }
  if (role === "staff") check(await vis(page.getByText(/Lizenz|Schullizenz/), 15000) && (await page.locator('[data-testid="trial-banner"]').count()) === 0, "teacher: licence gate, no trial banner");
  await shot(page, `${id}-landing`);
  check(errors.length === 0, "no console/page errors", errors.join(" | "));
  await ctx.close();
});

def("funnel-back-forward-reload", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const a = ANSWERS.student;
  const { ctx, page } = await open(world, dev);
  await page.goto(`${BASE}/start`);
  await walk(page, "student", a, "ort");
  check(slugOf(page) === "ort", "at «ort»");
  await page.goBack(); check(await waitSlug(page, "schule"), "browser back → schule");
  await page.goBack(); check(await waitSlug(page, "jahrgang"), "browser back → jahrgang");
  check(await page.getByRole("radio", { name: String(a.birthYear), exact: true }).isChecked().catch(() => false), "year still selected after back");
  await page.goBack(); check(await waitSlug(page, "name"), "browser back → name");
  check((await page.getByLabel("Vorname").inputValue().catch(() => "")) === a.firstName, "first name kept after back");
  await page.reload(); await page.locator("h1").first().waitFor();
  check(slugOf(page) === "name" && (await page.getByLabel("Vorname").inputValue().catch(() => "")) === a.firstName, "reload mid-funnel keeps step + answer");
  await page.goForward(); check(await waitSlug(page, "jahrgang"), "browser forward → jahrgang");
  // in-app «Zurück»
  await page.getByRole("button", { name: /^Zurück/ }).first().click();
  check(await waitSlug(page, "name"), "«Zurück» button → name");
  // deep link to a step whose required answers are missing → first unanswered required step
  await page.evaluate((k) => localStorage.removeItem(k), FUNNEL_KEY);
  await page.goto(`${BASE}/start?schritt=wochenziel`); await page.locator("h1").first().waitFor();
  check(["weg", "rolle"].includes(slugOf(page)), `deep link without answers → first required step (${slugOf(page)})`);
  await page.goto(`${BASE}/start?schritt=gibtsnicht`); await page.locator("h1").first().waitFor();
  check(slugOf(page) !== "gibtsnicht" && !/404|nicht gefunden/i.test(await h1(page)), "unknown slug → no 404");
  // validation: Weiter without a name shows the error, stays
  await page.goto(`${BASE}/start?schritt=rolle`); await tile(page, ROLE_LABEL.student).click(); await waitSlug(page, "name");
  await page.getByLabel("Vorname").fill("");
  await primary(page).click(); await page.waitForTimeout(500);
  check(slugOf(page) === "name" && await vis(page.getByText("Gib deinen Vornamen ein.")), "empty name → «Gib deinen Vornamen ein.»");
  await ctx.close();
});

def("funnel-resume-and-restart", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const { ctx, page } = await open(world, dev);
  await page.goto(`${BASE}/start`);
  await walk(page, "student", ANSWERS.student, "beruf");
  await page.goto(`${BASE}/`); await page.goto(`${BASE}/start`);
  check(await vis(page.getByText(/Weitermachen, wo du warst/), 15000), "resume card on /start");
  await page.getByRole("button", { name: /^Weitermachen/ }).or(page.getByRole("link", { name: /^Weitermachen/ })).first().click();
  check(await waitSlug(page, "beruf"), `«Weitermachen» → saved step (${slugOf(page)})`);
  await page.goto(`${BASE}/start`);
  await page.getByRole("button", { name: /Neu beginnen/ }).first().click();
  await page.waitForTimeout(600);
  const st = await funnelState(page);
  check(!st || (!st.firstName && !st.role), "«Neu beginnen» deletes the saved answers", JSON.stringify(st)?.slice(0, 120));
  check(slugOf(page) === "weg", "stays on «weg»");
  // TTL: 15-day-old state is ignored
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, startedAt: Date.now() - 16 * 864e5, updatedAt: Date.now() - 15 * 864e5, step: "beruf", next: null, role: "student", firstName: "Alt", birthYear: 2012, schoolLevel: "8. Klasse", classCode: "", canton: "ZH", place: "", professions: [], unsure: false, startYear: null, weeklyGoal: 3, help: [], family: null, parentKid: null, inviteCode: "", staffAccess: null })), FUNNEL_KEY);
  await page.goto(`${BASE}/start`); await page.waitForTimeout(1200);
  check(!(await page.getByText(/Weitermachen, wo du warst/).isVisible().catch(() => false)), "state older than 14 days → no resume card");
  // malformed JSON never crashes
  await page.evaluate((k) => localStorage.setItem(k, "{kaputt"), FUNNEL_KEY);
  await page.goto(`${BASE}/start`);
  check(await vis(page.getByRole("heading", { name: /Dein Weg/ })), "malformed state → normal screen 0");
  await ctx.close();
});

def("confirm-other-browser", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const email = `quer-${Date.now()}@beispiel.ch`;
  const A = await open(world, dev, { tag: "A" });
  await A.page.goto(`${BASE}/start`);
  await walk(A.page, "student", ANSWERS.student);
  await fillKonto(A.page, email);
  await waitPath(A.page, /^\/start\/bestaetigen/);
  check(!!world.signups.at(-1)?.data?.wa_funnel, "wa_funnel stored in sign-up metadata");
  // browser B: no PKCE verifier, no localStorage answers
  const B = await open(world, dev, { tag: "B" });
  await B.page.goto(world.confirmLink());
  check(await vis(B.page.getByText(/E-Mail-Adresse ist bestätigt/), 30000), "other browser: «Deine E-Mail-Adresse ist bestätigt …»");
  await B.page.getByRole("link", { name: /^Anmelden/ }).or(B.page.getByRole("button", { name: /^Anmelden/ })).first().click();
  check(await waitPath(B.page, /^\/login/), "→ /login");
  // in the stub the user is confirmed once the link was opened (GoTrue verifies before the redirect)
  world.userByEmail(email).confirmed = true;
  await B.page.getByLabel(/E-Mail/).first().fill(email);
  await B.page.getByLabel(/^Passwort$/).first().fill(PW);
  await B.page.getByRole("button", { name: /^Anmelden$/ }).last().click();
  check(await waitPath(B.page, /^\/dashboard/, 40000), `login in B → /dashboard (${B.page.url()})`);
  const apply = world.calls("funnel_apply").find((c) => c.ctx === "B");
  check(apply && (apply.body?.p_answers === null || apply.body?.p_answers === undefined), "B calls funnel_apply(null) → server uses its metadata copy", JSON.stringify(apply?.body));
  check(world.profileOf(email)?.weekly_goal === ANSWERS.student.weeklyGoal, "plan applied from metadata (weekly goal saved)");
  check(!/schritt=/.test(B.page.url()), "nothing asked again in B");
  // back on A: log in → already_done, local copy deleted, no duplicate
  await A.page.goto(`${BASE}/login`);
  await A.page.getByLabel(/E-Mail/).first().fill(email); await A.page.getByLabel(/^Passwort$/).first().fill(PW);
  await A.page.getByRole("button", { name: /^Anmelden$/ }).last().click();
  await waitPath(A.page, /^\/dashboard/, 40000);
  await A.page.waitForTimeout(1500);
  check((await ls(A.page, FUNNEL_KEY)) === null, "A: local copy deleted after login (already_done)");
  check(world.profileOf(email)?.first_name === ANSWERS.student.firstName, "A: profile not overwritten");
  await A.ctx.close(); await B.ctx.close();
}, { devices: ["pixel7", "desktop1280"] });

def("confirm-page-resend-change-email", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const email = `tippfehler-${Date.now()}@beispiel.ch`;
  const { ctx, page } = await open(world, dev);
  await page.goto(`${BASE}/start`);
  await walk(page, "student", ANSWERS.student);
  await fillKonto(page, email);
  await waitPath(page, /^\/start\/bestaetigen/);
  const resend = page.getByRole("button", { name: /nochmals senden|Nochmals senden/ }).first();
  check(await resend.isDisabled().catch(() => false), "resend disabled during the 60 s cooldown");
  check(await vis(page.getByText(/Nochmals senden in \d:\d\d/)), "countdown text «Nochmals senden in 0:ss»");
  check(await vis(page.getByText(/Der Link in der E-Mail gilt eine Stunde/)), "«Der Link … gilt eine Stunde.»");
  // fast-forward the cooldown by faking time is app-specific; use clock if available
  if (page.clock) { await page.clock.install().catch(() => {}); }
  await page.getByRole("button", { name: /E-Mail-Adresse ändern/ }).or(page.getByRole("link", { name: /E-Mail-Adresse ändern/ })).first().click();
  check(await waitSlug(page, "konto"), "«E-Mail-Adresse ändern» → konto");
  check((await page.getByLabel(/E-Mail-Adresse/).first().inputValue().catch(() => "")) === email, "e-mail prefilled");
  check((await funnelState(page))?.firstName === ANSWERS.student.firstName, "answers intact");
  // without the session record: generic text, no resend
  await page.evaluate((k) => sessionStorage.removeItem(k), FUNNEL_CONFIRM_KEY);
  await page.goto(`${BASE}/start/bestaetigen`);
  check(await vis(page.getByRole("heading", { name: /Postfach/ })), "generic confirm page without record");
  check(!(await page.getByRole("button", { name: /nochmals senden/i }).isVisible().catch(() => false)), "no resend without the address");
  await ctx.close();
}, { devices: ["pixel7", "desktop1280"] });

def("existing-email-no-enumeration", async (dev) => {
  const old = "bestehend@beispiel.ch";
  const world = createOnbWorld({ base: BASE, existing: [{ email: old, createdDaysAgo: 200, funnelDone: false, profile: { first_name: "Alt" } }] });
  const snap = async (email) => {
    const { ctx, page } = await open(world, dev);
    await page.goto(`${BASE}/start`);
    await walk(page, "student", ANSWERS.student);
    await fillKonto(page, email);
    const ok = await waitPath(page, /^\/start\/bestaetigen/);
    await page.waitForTimeout(800);
    const text = (await page.locator("main").innerText().catch(() => "")).replaceAll(email, "<EMAIL>");
    const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
    await ctx.close();
    return { ok, text, toasts: toasts.join("|").replaceAll(email, "<EMAIL>") };
  };
  const n = await snap(`ganzneu-${Date.now()}@beispiel.ch`);
  const e = await snap(old);
  check(n.ok && e.ok, "both → /start/bestaetigen");
  check(n.text === e.text, "identical confirm screen for new and existing e-mail", `${n.text.slice(0, 80)} ≠ ${e.text.slice(0, 80)}`);
  check(n.toasts === e.toasts, "identical status/alert regions");
  check(!/schon registriert|bereits registriert|existiert bereits/i.test(e.text + e.toasts), "no «already registered» wording");
  check(/Hast du mit dieser Adresse schon ein Konto/.test(e.text), "neutral «schon ein Konto? Anmelden» line present");
  check(world.profileOf(old)?.first_name === "Alt", "existing profile untouched");
}, { devices: ["pixel7", "desktop1280"] });

def("google-funnel-boundary", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const { ctx, page, errors } = await open(world, dev);
  await page.goto(`${BASE}/start`);
  await walk(page, "student", ANSWERS.student);
  // consent gates Google too
  await page.getByRole("button", { name: /Mit Google weiter/ }).first().click();
  await page.waitForTimeout(600);
  check(world.authorize.length === 0 && await vis(page.getByText("Bestätige zuerst die Datenschutzerklärung.")), "Google blocked until consent");
  await page.getByRole("checkbox", { name: /Datenschutz/ }).first().check({ force: true });
  await page.getByRole("button", { name: /Mit Google weiter/ }).first().click();
  check(await waitPath(page, /^\/(dashboard|auth\/callback)/, 40000), `OAuth boundary → callback → app (${page.url()})`);
  check(world.authorize.at(-1)?.provider === "google" && /\/auth\/callback/.test(world.authorize.at(-1)?.redirect || ""), "authorize(provider=google, redirect=/auth/callback)");
  await waitPath(page, /^\/dashboard/, 30000);
  const u = world.current;
  const prof = u && world.profiles.get(u.id);
  check(world.calls("funnel_apply").some((c) => c.body?.p_answers?.role === "student"), "funnel_apply with the local answers after OAuth return");
  check(prof?.weekly_goal === ANSWERS.student.weeklyGoal, "Google user: weekly goal saved");
  check((await ls(page, FUNNEL_KEY)) === null, "local copy deleted");
  check(errors.length === 0, "no console/page errors", errors.join(" | "));
  await ctx.close();
});

def("google-new-user-from-login-nach-google", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const { ctx, page } = await open(world, dev);
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: /Google/ }).first().click();
  check(await waitPath(page, /^\/start\?.*nach=google/, 40000), `new Google user → /start?…nach=google (${page.url()})`);
  check(/schritt=rolle/.test(page.url()), "starts at «rolle»");
  const seen = await walk(page, "student", ANSWERS.student, "konto");
  check(!seen.includes("konto"), "no account screen in nach=google mode", seen.join(">"));
  const save = page.getByRole("button", { name: /Plan speichern/ });
  check(await vis(save, 15000), "last screen = «Plan speichern»");
  await save.first().click();
  check(await waitPath(page, /^\/dashboard/, 40000), "→ /dashboard");
  check(world.calls("funnel_apply").length >= 1 && world.profiles.get(world.current.id)?.funnel_completed_at, "funnel_apply saved the plan");
  // the old role picker redirects into the funnel
  await page.goto(`${BASE}/auth/role`);
  check(await waitPath(page, /^\/(start|dashboard)/, 20000), `/auth/role redirects (${page.url()})`);
  await ctx.close();
}, { devices: ["pixel7", "desktop1280"] });

def("existing-user-google-on-funnel", async (dev) => {
  const old = "alt-google@beispiel.ch";
  const world = createOnbWorld({ base: BASE, existing: [{ email: old, createdDaysAgo: 100, funnelDone: true, profile: { first_name: "Altname", weekly_goal: 2 } }] });
  world.googleAs = old;
  const { ctx, page } = await open(world, dev);
  await page.goto(`${BASE}/start`);
  await walk(page, "student", ANSWERS.student);
  await page.getByRole("checkbox", { name: /Datenschutz/ }).first().check({ force: true });
  await page.getByRole("button", { name: /Mit Google weiter/ }).first().click();
  await waitPath(page, /^\/dashboard/, 40000);
  check(world.profileOf(old).first_name === "Altname" && world.profileOf(old).weekly_goal === 2, "existing profile not overwritten");
  check(await vis(page.getByText(/Du hast schon ein Konto/), 10000), "toast «Du hast schon ein Konto. Wir haben dich angemeldet.»");
  check((await ls(page, FUNNEL_KEY)) === null, "funnel key deleted");
  await ctx.close();
}, { devices: ["desktop1280"] });

def("logged-in-user-opens-start", async (dev) => {
  const world = createOnbWorld({ base: BASE, existing: [{ email: "drin@beispiel.ch", createdDaysAgo: 50, funnelDone: true, profile: { first_name: "Mia" } }] });
  const { ctx, page } = await open(world, dev, { session: world.users[0] });
  await page.goto(`${BASE}/start`);
  check(await waitPath(page, /^\/dashboard/, 30000), `logged-in → landing, no funnel (${page.url()})`);
  await ctx.close();
}, { devices: ["desktop1280"] });

def("login-existing-user-unaffected", async (dev) => {
  const email = "stamm@beispiel.ch";
  const world = createOnbWorld({ base: BASE, existing: [{ email, createdDaysAgo: 300, funnelDone: false, profile: { first_name: "Noah", onboarding_completed_at: new Date().toISOString() }, meta: { student_onboarded: true, onboarding_tour_done: true } }] });
  const { ctx, page, errors } = await open(world, dev);
  await page.goto(`${BASE}/login`);
  check(!(await page.getByText(/Wer bist du|Wie nutzt du WendApply/).isVisible().catch(() => false)), "/login has no role question");
  check(!(await page.getByLabel(/Passwort wiederholen/).isVisible().catch(() => false)), "/login has no signup fields");
  const link = page.getByRole("link", { name: /Konto erstellen/ }).first();
  check((await link.getAttribute("href").catch(() => ""))?.startsWith("/start"), "«Konto erstellen» on /login → /start");
  await page.getByLabel(/E-Mail/).first().fill(email); await page.getByLabel(/^Passwort$/).first().fill(PW);
  await page.getByRole("button", { name: /^Anmelden$/ }).last().click();
  check(await waitPath(page, /^\/dashboard/, 40000), `existing user → /dashboard (${page.url()})`);
  await page.waitForTimeout(2500);
  check((await tourDialog(page).count()) === 0, "pre-release account: no auto tour");
  check(!world.calls("funnel_apply").some((c) => c.body?.p_answers), "no funnel payload sent for an existing user");
  // wrong password message, ?next and mode=signup redirect
  await page.goto(`${BASE}/login?mode=signup&next=%2Fabo`);
  check(await waitPath(page, /^\/start/, 20000) && /next=%2Fabo|next=\/abo/.test(page.url()), `/login?mode=signup → /start keeping next (${page.url()})`);
  check(errors.length === 0, "no console/page errors", errors.join(" | "));
  await ctx.close();
});

// ---------------------------------------------------------------- tour
const tourWorld = (o = {}) => createOnbWorld({ base: BASE, existing: [{ email: "tour@beispiel.ch", createdDaysAgo: 0, funnelDone: true, profile: { first_name: "Lena", weekly_goal: 3, help_wishes: ["lebenslauf"] }, ...o.user }], access: o.access ?? TRIAL() });

def("tour-student-next-back-skip-persist", async (dev) => {
  const world = tourWorld();
  const u = world.users[0];
  const { ctx, page, errors } = await open(world, dev, { session: u });
  await page.goto(`${BASE}/dashboard`);
  check(await vis(tourDialog(page), 20000), "tour auto-starts on /dashboard for a funnel account");
  const c1 = await tourCounter(page);
  check(c1 && c1[0] === 1 && c1[1] >= 5, `step indicator 1/N (${c1})`);
  check(!(await tourDialog(page).getByRole("button", { name: /^Zurück/ }).isVisible().catch(() => false)), "step 1 has no «Zurück»");
  await shot(page, "tour-step1");
  check(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), "focus inside the tour card");
  const target = await page.evaluate(() => { const el = document.querySelector('[data-tour="schueler-next-step"]'); if (!el) return null; const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  check(target !== false, "step-1 anchor scrolled into view");
  await tourDialog(page).getByRole("button", { name: /^Weiter/ }).click();
  check((await tourCounter(page))?.[0] === 2, "«Weiter» → 2/N");
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(400);
  check((await tourCounter(page))?.[0] === 3, "→ arrow → 3/N");
  await shot(page, "tour-step3");
  if (dev.phone) {
    const nav = await page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"]')].pop(); const r = d?.getBoundingClientRect(); return r ? { cardBottom: r.bottom, h: innerHeight } : null; });
    check(nav && nav.cardBottom <= nav.h - 40, "phone nav step: card sits above the bottom nav", JSON.stringify(nav));
  }
  await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(400);
  check((await tourCounter(page))?.[0] === 2, "← arrow → 2/N");
  await tourDialog(page).getByRole("button", { name: /^Zurück/ }).click();
  check((await tourCounter(page))?.[0] === 1, "«Zurück» → 1/N");
  await tourDialog(page).getByRole("button", { name: /überspringen/i }).first().click();
  await page.waitForTimeout(800);
  check((await tourDialog(page).count()) === 0, "«Überspringen» closes the tour");
  check(world.tourOf("tour@beispiel.ch", "schueler")?.status === "skipped", "skipped stored (tour_state_set)", JSON.stringify(world.calls("tour_state_set").map((c) => c.body)));
  await page.reload(); await page.waitForTimeout(3500);
  check((await tourDialog(page).count()) === 0, "reload → tour does not restart");
  // new device (fresh context, same user) → DB state wins
  const B = await open(world, dev, { session: u, tag: "B" });
  await B.page.goto(`${BASE}/dashboard`); await B.page.waitForTimeout(3500);
  check((await tourDialog(B.page).count()) === 0, "other device / login → tour does not restart");
  await B.ctx.close();
  check(errors.length === 0, "no console/page errors", errors.join(" | "));
  await ctx.close();
});

def("tour-esc-finish-replay", async (dev) => {
  const world = tourWorld();
  const { ctx, page } = await open(world, dev, { session: world.users[0] });
  await page.goto(`${BASE}/dashboard`);
  await vis(tourDialog(page), 20000);
  await page.keyboard.press("Escape"); await page.waitForTimeout(800);
  check((await tourDialog(page).count()) === 0 && world.tourOf("tour@beispiel.ch", "schueler")?.status === "skipped", "Esc = skip + stored");
  // Tour wiederholen in settings
  await page.goto(`${BASE}/settings`);
  const replay = page.getByRole("link", { name: /Tour wiederholen/ }).or(page.getByRole("button", { name: /Tour wiederholen/ })).first();
  check(await vis(replay, 15000), "«Tour wiederholen» in Einstellungen");
  await replay.click();
  check(await waitPath(page, /^\/dashboard\?.*tour=1/), `→ /dashboard?tour=1 (${page.url()})`);
  check(await vis(tourDialog(page), 15000), "manual start despite «skipped»");
  // finish: click Weiter until Fertig
  for (let i = 0; i < 12; i++) {
    const fertig = tourDialog(page).getByRole("button", { name: /^Fertig/ });
    if (await fertig.isVisible().catch(() => false)) { await fertig.click(); break; }
    await tourDialog(page).getByRole("button", { name: /^Weiter/ }).click(); await page.waitForTimeout(350);
  }
  await page.waitForTimeout(800);
  check((await tourDialog(page).count()) === 0 && world.tourOf("tour@beispiel.ch", "schueler")?.status === "completed", "«Fertig» stores completed");
  await ctx.close();
}, { devices: ["pixel7", "desktop1280"] });

def("tour-missing-anchor-skipped", async (dev) => {
  const world = tourWorld();
  const base = await open(world, dev, { session: world.users[0] });
  await base.page.goto(`${BASE}/dashboard?tour=1`);
  await vis(tourDialog(base.page), 20000);
  const full = (await tourCounter(base.page))?.[1];
  await base.ctx.close();
  const { ctx, page, errors } = await open(world, dev, { session: world.users[0], tag: "B" });
  await ctx.addInitScript(() => { const st = document.createElement("style"); st.textContent = '[data-tour="schueler-weekly-goal"]{display:none!important}'; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(st)); });
  await page.goto(`${BASE}/dashboard?tour=1`);
  check(await vis(tourDialog(page), 20000), "tour still starts with a hidden anchor");
  const less = (await tourCounter(page))?.[1];
  check(full && less === full - 1, `hidden step skipped and indicator recounted (${full} → ${less})`);
  const titles = [];
  for (let i = 0; i < 12; i++) {
    titles.push(await tourDialog(page).locator("h2, h3, [id]").first().innerText().catch(() => ""));
    const fertig = tourDialog(page).getByRole("button", { name: /^Fertig/ });
    if (await fertig.isVisible().catch(() => false)) break;
    await tourDialog(page).getByRole("button", { name: /^Weiter/ }).click(); await page.waitForTimeout(300);
  }
  check(!titles.some((t) => /Wochenziel/.test(t)), "«Wochenziel» step never shown", titles.join(","));
  check(errors.length === 0, "no errors", errors.join(" | "));
  await ctx.close();
}, { devices: ["pixel7", "desktop1280"] });

def("tour-reduced-motion", async (dev) => {
  const world = tourWorld();
  const { ctx, page } = await open(world, dev, { session: world.users[0], reducedMotion: "reduce" });
  await page.goto(`${BASE}/dashboard?tour=1`);
  check(await vis(tourDialog(page), 20000), "tour starts with reduced motion");
  const dur = await page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"]')].pop(); const all = [d, ...d.querySelectorAll("*"), ...document.querySelectorAll("[data-tour-overlay], [data-tour-spotlight]")]; return Math.max(0, ...all.map((el) => { const cs = getComputedStyle(el); return Math.max(...cs.transitionDuration.split(",").map(parseFloat), ...cs.animationDuration.split(",").map(parseFloat)) * 1000; })); });
  check(dur <= 100, `no transition/animation > 100 ms (${dur} ms)`);
  await ctx.close();
}, { devices: ["pixel7", "desktop1280"] });

def("tour-never-over-paywall", async (dev) => {
  const world = tourWorld({ access: EXPIRED() });
  const { ctx, page } = await open(world, dev, { session: world.users[0] });
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(4500);
  check(await vis(page.locator('[data-testid="paywall"]').or(page.getByText(/Testwoche ist vorbei|abgelaufen/)), 10000), "paywall shown (expired trial)");
  check((await tourDialog(page).count()) === 0, "tour does not start behind the paywall");
  check(world.calls("tour_state_set").length === 0, "nothing stored");
  await ctx.close();
}, { devices: ["pixel7", "desktop1280"] });

def("tour-trial-banner-not-covered", async (dev) => {
  const world = tourWorld();
  const { ctx, page } = await open(world, dev, { session: world.users[0] });
  await page.goto(`${BASE}/dashboard`);
  await vis(tourDialog(page), 20000);
  const overlap = await page.evaluate(() => { const b = document.querySelector('[data-testid="trial-banner"]')?.getBoundingClientRect(); const d = [...document.querySelectorAll('[role="dialog"]')].pop()?.getBoundingClientRect(); if (!b || !d) return null; return !(d.right < b.left || d.left > b.right || d.bottom < b.top || d.top > b.bottom); });
  check(overlap !== true, `tour card does not cover the trial banner (${overlap})`);
  await ctx.close();
});

def("tour-parent-and-teacher", async (dev) => {
  const world = createOnbWorld({ base: BASE, existing: [
    { email: "eltern@beispiel.ch", accountType: "parent", funnelDone: true, profile: { first_name: "Sandra", account_type: "parent" } },
  ], access: TRIAL({ account_type: "parent" }) });
  const { ctx, page } = await open(world, dev, { session: world.users[0] });
  await page.goto(`${BASE}/familie`);
  check(await vis(tourDialog(page), 20000), "parent tour auto-starts on /familie");
  const c = await tourCounter(page);
  check(c && c[1] >= 3 && c[1] <= 5, `parent tour 3–5 steps (${c})`);
  await page.keyboard.press("Escape"); await page.waitForTimeout(600);
  check(world.tourOf("eltern@beispiel.ch", "eltern")?.status === "skipped", "parent skip stored as «eltern»");
  await ctx.close();
}, { devices: ["pixel7", "desktop1280"] });

// ---------------------------------------------------------------- website buttons
def("website-two-buttons", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const { ctx, page } = await open(world, dev);
  for (const path of ["/", "/preise", "/anleitung"]) {
    await page.goto(`${BASE}${path}`);
    const header = page.locator("header").first();
    const login = header.getByRole("link", { name: /^Anmelden$/ });
    const signup = header.getByRole("link", { name: /^Kostenlos testen$/ });
    const loginVis = await vis(login, 10000) || await vis(page.getByRole("link", { name: /^Anmelden$/ }), 3000);
    check(loginVis, `${path}: «Anmelden» visible`);
    check(await vis(signup, 10000), `${path}: header «Kostenlos testen» visible`);
    check((await signup.first().getAttribute("href").catch(() => ""))?.startsWith("/start"), `${path}: «Kostenlos testen» → /start`);
    check((await page.getByRole("link", { name: /^Anmelden$/ }).first().getAttribute("href").catch(() => ""))?.startsWith("/login"), `${path}: «Anmelden» → /login`);
    check(!(await page.getByRole("link", { name: /^Loslegen$|^App öffnen$|^Registrieren$/ }).count()), `${path}: no combined «Loslegen/App öffnen/Registrieren»`);
    check((await overflowX(page)) === 0, `${path}: no horizontal scroll`);
  }
  await page.goto(`${BASE}/`);
  await page.locator("header").first().getByRole("link", { name: /^Kostenlos testen$/ }).click();
  check(await waitPath(page, /^\/start/), "header CTA opens the funnel");
  await ctx.close();
});
def("website-buttons-320", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const { ctx, page } = await open(world, dev, { viewport: { width: 320, height: 700 } });
  await page.goto(`${BASE}/`);
  check(await vis(page.locator("header").first().getByRole("link", { name: /^Kostenlos testen$/ })), "320: «Kostenlos testen» in the bar");
  check(await vis(page.getByRole("link", { name: /^Anmelden$/ })), "320: «Anmelden» still reachable");
  check((await overflowX(page)) === 0, "320: no horizontal scroll");
  await ctx.close();
}, { devices: ["pixel7"] });

// ---------------------------------------------------------------- responsive regression
def("responsive-funnel-320-1280", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const steps = ["weg", "rolle", "name", "jahrgang", "schule", "ort", "beruf", "wochenziel", "hilfe", "dabei", "plan", "konto"];
  const seed = { v: 1, startedAt: Date.now(), updatedAt: Date.now(), step: "plan", next: null, role: "student", firstName: "Lena", birthYear: YEAR - 14, schoolLevel: "8. Klasse", classCode: "", canton: "ZH", place: "", professions: ["Informatiker:in"], unsure: false, startYear: YEAR + 1, weeklyGoal: 3, help: ["lebenslauf"], family: "spaeter", parentKid: null, inviteCode: "", staffAccess: null };
  for (const w of RESPONSIVE_WIDTHS) {
    const { ctx, page } = await open(world, dev, { viewport: { width: w, height: w < 700 ? 760 : 900 } });
    await page.goto(`${BASE}/start`);
    await page.evaluate(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [FUNNEL_KEY, seed]);
    for (const s of steps) {
      await page.goto(`${BASE}/start?schritt=${s}`); await page.locator("h1").first().waitFor({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(250);
      const ox = await overflowX(page);
      check(ox === 0, `${w}px «${s}»: no horizontal scroll`, `${ox}px`);
      if (w <= 768 || s === "konto") { const small = await smallTargets(page); check(small.length === 0, `${w}px «${s}»: targets ≥ 44 px`, small.slice(0, 5).join(", ")); }
    }
    for (const path of ["/start/bestaetigen", "/login", "/"]) {
      await page.goto(`${BASE}${path}`); await page.waitForTimeout(500);
      check((await overflowX(page)) === 0, `${w}px ${path}: no horizontal scroll`);
    }
    // 200 % text on the phone widths
    if (w === 375) {
      await page.addStyleTag({ content: "html{font-size:200%!important}" });
      await page.goto(`${BASE}/start?schritt=wochenziel`); await page.addStyleTag({ content: "html{font-size:200%!important}" }); await page.waitForTimeout(300);
      check((await overflowX(page)) === 0, "375px 200 % text «wochenziel»: no horizontal scroll");
    }
    await ctx.close();
  }
}, { devices: ["pixel7"] });

def("keyboard-funnel-desktop", async (dev) => {
  const world = createOnbWorld({ base: BASE });
  const { ctx, page } = await open(world, dev);
  await page.goto(`${BASE}/start?schritt=rolle`);
  await page.locator("h1").first().waitFor();
  check(await page.evaluate(() => document.activeElement?.tagName === "H1"), "focus on H1 after step change");
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(400);
  check(slugOf(page) === "rolle", "arrow keys never auto-advance");
  await page.keyboard.press("Enter"); await page.waitForTimeout(800);
  check(slugOf(page) !== "rolle", `Enter advances (${slugOf(page)})`);
  await ctx.close();
}, { devices: ["desktop1280"] });

// ------------------------------------------------------------------------------------------------ run
try {
  for (const c of CASES) {
    if (ONLY && !ONLY.test(c.id)) continue;
    for (const dev of DEVICES) {
      if (c.only && !c.only.includes(dev.id)) continue;
      cur = { id: c.id, device: dev.id }; caseFails = [];
      console.log(`\n▶ ${c.id} @ ${dev.id}`);
      const t0 = Date.now();
      let status = "PASS", info = "";
      try { await c.fn(dev); } catch (e) { status = "BLOCKED"; info = String(e.message || e).split("\n")[0].slice(0, 300); console.log("  BLOCKED", info); }
      if (caseFails.length) { status = status === "BLOCKED" ? "BLOCKED" : "FAIL"; info = [info, ...caseFails].filter(Boolean).join(" · "); }
      results.push({ id: c.id, device: dev.id, status, info, ms: Date.now() - t0 });
      writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
    }
  }
} finally {
  for (const b of Object.values(browsers)) await b.close().catch(() => {});
  server.stop();
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT}/results.md`, `# onb-e2e results ${new Date().toISOString()}\nBASE ${BASE}\n\n${resultsTable(results)}\n`);
  console.log(`\n${resultsTable(results).split("\n").pop()}\nResults: ${OUT}/results.md`);
}
process.exit(results.some((r) => r.status !== "PASS") ? 1 : 0);
