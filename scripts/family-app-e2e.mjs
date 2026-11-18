// End-to-end flows for the family app part against an in-memory Supabase stand-in (nothing real is touched):
// signup choice (Schule / Schüler:in privat / Elternteil / Lehrperson), role picker -> parent, parent dashboard (create family,
// invite, consent, child overview, plan card + "Zugang anfragen"), child side (join, consent notice, share toggles, invite a
// parent, leave), "family migration not deployed yet" (friendly "bald verfügbar", no crash) and school students (unchanged nav).
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3292 node scripts/family-app-e2e.mjs
// RPC shapes follow the shared family contract (family_get_my, family_child_overview, ...). Screenshots: $OUT.
import fs from "node:fs";
import { homedir } from "node:os";
import { installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const BASE = process.env.BASE || "http://localhost:3292";
const SUPA = "http://localhost:54321";
const OUT = (process.env.OUT || `${homedir()}/Projects/bewerbungen-tracker-wt/screenshots/fam-app/`).replace(/\/?$/, "/");
fs.mkdirSync(OUT, { recursive: true });
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString();
const results = [];
const problems = [];
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, text: `[${scope}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : info); };
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const FAMILY_RPCS = ["family_get_my", "family_create", "family_create_invite", "family_join", "family_set_consent", "family_set_share", "family_child_overview", "family_remove_member", "family_leave", "family_export_my_data", "account_set_type", "waitlist_join"];

// ---------------------------------------------------------------- stateful family backend
function familyBackend(me) {
  const db = { family: null, waitlist: [], accountType: null };
  const member = (user_id, display_name, role, consent_status = "not_required", status = "active") => ({ user_id, display_name, role, status, consent_status, share_settings: { progress: true, applications: false, village: true, documents: false } });
  const view = () => db.family && { family: { id: db.family.id, name: db.family.name }, my_role: db.family.members.find((m) => m.user_id === me.id)?.role, members: db.family.members.map(({ share_settings, ...m }) => (m.user_id === me.id ? { ...m, share_settings } : m)), plan: db.family.plan };
  const err = (message) => ({ __error: message });
  const rpc = {
    family_get_my: () => view(),
    account_set_type: (b) => { db.accountType = { type: b.p_type, birthYear: b.p_birth_year }; return null; },
    family_create: (b) => { db.family = { id: "f1", name: b.p_name, members: [member(me.id, me.name, "parent")], plan: { plan_type: "family", status: "trial", seats_parents: 1, seats_children: 1, trial_ends_at: inDays(14) } }; return "f1"; },
    family_create_invite: (b) => ({ code: b.p_direction === "parent_invites_child" ? "KIND2345" : "ELTE6789", expires_at: inDays(7) }),
    family_join: (b) => {
      if (b.p_code === "ALT00000") return err("INVITE_EXPIRED");
      if (b.p_code === "VOLL0000") return err("SEATS_FULL");
      if (b.p_code !== "ABCD1234") return err("INVALID_CODE");
      db.family = { id: "f2", name: "Familie Meier", members: [member("p9", "Sandra Meier", "parent"), member(me.id, me.name, "child", "pending")], plan: null };
      return { family_id: "f2", role: "child" };
    },
    family_set_consent: (b) => { const m = db.family.members.find((x) => x.user_id === b.p_child_id); m.consent_status = b.p_granted ? "granted" : "withdrawn"; return null; },
    family_set_share: (b) => { db.family.members.find((x) => x.user_id === me.id).share_settings = b.p_settings; return null; },
    family_child_overview: () => ({ child: { display_name: "Lina Meier" }, consent_status: "granted", progress: { total: 6, status_counts: { applied: 3, interview: 1, offer: 1, saved: 1 }, last_activity: inDays(-1).slice(0, 10) }, village: { islands: 3, items: 7, points_earned: 420 } }),
    family_remove_member: (b) => { db.family.members = db.family.members.filter((m) => m.user_id !== b.p_user_id); return null; },
    family_leave: () => { db.family = null; return null; },
    family_export_my_data: () => ({ families: [{ id: "f1" }], family_members: [{ role: "parent" }], invite_token: "geheim" }),
    waitlist_join: (b) => { db.waitlist.push(b); return null; },
  };
  return { db, rpc, addChild: (consent = "pending") => db.family.members.push(member("c1", "Lina Meier", "child", consent)) };
}

async function actor({ meta = { role: "student" }, rpc = {}, missing = [], vp = { w: 375, h: 812 }, userId = "u1" }) {
  const ctx = await newCtx(browser, vp);
  const state = await installStub(ctx, { role: "student", rpc: { class_my_classes: [], ...rpc } });
  // Own user with custom metadata (account_type ...). PUT /auth/v1/user (updateUser) merges `data` like GoTrue does.
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "familie@beispiel.ch", user_metadata: { ...meta }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
  await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);
  await ctx.route(`${SUPA}/auth/v1/user*`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (req.method() === "PUT") { let b = {}; try { b = req.postDataJSON() || {}; } catch { /* none */ } Object.assign(user.user_metadata, b.data || {}); state.calls.push({ updateUser: b.data }); }
    return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(user) });
  });
  for (const name of missing) await ctx.route(`${SUPA}/rest/v1/rpc/${name}`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 404, contentType: "application/json", headers: cors, body: JSON.stringify({ code: "PGRST202", message: `Could not find the function public.${name} without parameters in the schema cache`, details: null, hint: null }) }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|status of 4\d\d|status of 5\d\d|React DevTools/.test(m.text())) problems.push(`[${scope}] console ${m.text().slice(0, 200)}`); });
  return { ctx, page, state, user };
}
const visible = (page, text, timeout = 30000) => page.getByText(text).locator("visible=true").first().waitFor({ timeout }).then(() => true, () => false);
const noOverflow = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: true }).catch(() => {});
const calls = (state, name) => state.calls.filter((c) => c.rpc === name);

const browser = await launch();
const VIEWPORTS = [{ key: "mobile-light", vp: { w: 375, h: 812 } }, { key: "desktop-dark", vp: { w: 1280, h: 860, dark: true } }];

for (const { key, vp } of VIEWPORTS) {
  // ------------------------------------------------ parent
  scope = `parent ${key}`;
  {
    const be = familyBackend({ id: "u1", name: "Sandra Meier" });
    const { ctx, page, state } = await actor({ meta: { role: "student", role_confirmed: true, account_type: "parent" }, rpc: be.rpc, vp });
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/familie$/, { timeout: 90000 }).catch(() => {});
    check(page.url().endsWith("/familie"), "parents are sent from the job-search pages to /familie", page.url());
    check(await visible(page, "Familie erstellen", 60000), "no family yet: create form + code form");
    check(calls(state, "account_set_type").some((c) => c.body.p_type === "parent" && c.body.p_birth_year === null), "pending account type stored with account_set_type(parent, null)", JSON.stringify(calls(state, "account_set_type")));
    check(state.calls.some((c) => c.updateUser?.account_type_synced === true), "account type marked as synced");
    await page.getByLabel(/Name der Familie/).fill("Familie Meier");
    await page.getByRole("button", { name: "Familie erstellen" }).click();
    check(await visible(page, "Sobald dein Kind verbunden ist"), "family created: empty children list");
    check(await visible(page, "Bezahlung bald verfügbar"), "plan card shows the payment placeholder");
    check(await visible(page, "Testwoche"), "plan card shows the trial status");
    check(await visible(page, /noch 1[34] Tage Testwoche/), "trial days left are shown");
    check(calls(state, "family_create")[0]?.body.p_name === "Familie Meier", "family_create sends the name");
    await page.getByRole("button", { name: /Code für mein Kind erstellen|Einladungscode erstellen/ }).click();
    check(await visible(page, "KIND 2345"), "invite code is shown readable");
    check(await visible(page, "/familie/einladung/KIND2345"), "share link is shown");
    check(await page.getByRole("button", { name: "Code kopieren" }).isVisible() && await page.getByRole("button", { name: "Link kopieren" }).isVisible(), "copy buttons for code and link");
    check(calls(state, "family_create_invite")[0]?.body.p_direction === "parent_invites_child", "invite direction parent_invites_child");
    if (key === "mobile-light") await shot(page, `${key}-parent-invite`);

    be.addChild("pending");
    await page.reload({ waitUntil: "domcontentloaded" });
    check(await visible(page, "Lina Meier", 60000), "child appears in the list after joining");
    check(await visible(page, "Wartet auf deine Zustimmung"), "consent status pending is shown");
    check(await visible(page, "ist unter 16"), "overview stays hidden until consent");
    check(!calls(state, "family_child_overview").length, "no overview request without consent");
    check(!(await page.getByText("In eurer Familie ist schon ein Kind verbunden").count()) || !(await page.getByText("In eurer Familie ist schon ein Kind verbunden").first().isVisible()), "seat note is not shown during consent (eltern-18)");
    await page.getByRole("button", { name: "Zustimmung geben" }).first().click();
    check(await page.getByRole("dialog").getByText(/erziehungsberechtigt und einverstanden/).isVisible(), "consent asks for confirmation in plain language");
    await page.getByRole("dialog").getByRole("button", { name: "Ja, ich stimme zu" }).click();
    check(await visible(page, "Verbunden"), "consent granted");
    check(calls(state, "family_set_consent")[0]?.body.p_child_id === "c1" && calls(state, "family_set_consent")[0]?.body.p_granted === true, "family_set_consent(c1, true)");
    check(await visible(page, "Bewerbungen erfasst"), "child overview: progress");
    check(await visible(page, "Zusage erhalten"), "child overview: placed badge");
    check(await visible(page, /3 Inseln · 7 Häuser · 420 Punkte/), "child overview: village");
    check(!(await page.getByText("Bewerbungsliste").count()), "application list hidden when not shared");
    const text = await page.locator("main").innerText();
    check(!/Rückruf|Notiz|Swisscom/.test(text), "no notes or companies leak into the parent view");
    check(await noOverflow(page), "no horizontal overflow");
    await shot(page, `${key}-parent-dashboard`);

    await page.getByRole("button", { name: "Zugang anfragen" }).first().click();
    const dialog = page.getByRole("dialog");
    check(await dialog.getByLabel("E-Mail-Adresse").inputValue() === "familie@beispiel.ch", "request form is prefilled with the account e-mail");
    await dialog.getByLabel("Nachricht (freiwillig)").fill("Wir haben zwei Kinder.");
    await dialog.getByRole("button", { name: "Anfrage senden" }).click();
    check(await visible(page, "Danke! Wir haben deine Anfrage erhalten"), "waitlist request confirmed");
    check(be.db.waitlist[0]?.p_kind === "family" && be.db.waitlist[0]?.p_message === "Wir haben zwei Kinder.", "waitlist_join(email, family, message)", JSON.stringify(be.db.waitlist));
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Entfernen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Entfernen" }).click();
    check(await visible(page, "Sobald dein Kind verbunden ist"), "child removed");
    const nav = await page.getByRole("navigation", { name: /Hauptmenü/ }).first().innerText().catch(() => "");
    check(!/Bewerbungen|Suchen/.test(nav), "parent menu has no job-search items", nav);
    await ctx.close();
  }

  // ------------------------------------------------ child
  scope = `child ${key}`;
  {
    const be = familyBackend({ id: "u1", name: "Lina Meier" });
    const { ctx, page, state } = await actor({ meta: { role: "student", role_confirmed: true, student_onboarded: true, onboarding_tour_done: true, account_type: "independent_student", birth_year: 2012 }, rpc: be.rpc, vp });
    await page.goto(`${BASE}/familie/einladung/abcd1234`, { waitUntil: "domcontentloaded" });
    check(await visible(page, "Deine Eltern haben dich eingeladen", 90000), "invite link opens the family page (join is primary)");
    check(await page.getByLabel("Code von deinen Eltern").inputValue() === "ABCD 1234", "code from the link is pre-filled");
    check(calls(state, "account_set_type").some((c) => c.body.p_type === "independent_student" && c.body.p_birth_year === 2012), "account_set_type(independent_student, 2012)");
    await page.getByLabel("Code von deinen Eltern").fill("ALT00000");
    await page.getByRole("button", { name: "Familie beitreten" }).click();
    check(await visible(page, "Dieser Code ist abgelaufen"), "expired code: German message");
    await page.getByLabel("Code von deinen Eltern").fill("VOLL0000");
    await page.getByRole("button", { name: "Familie beitreten" }).click();
    check(await visible(page, "schon ein Kind verbunden"), "full family: seat message (contact page, no 'Zugang anfragen')");
    await page.getByLabel("Code von deinen Eltern").fill("abcd-1234");
    await page.getByRole("button", { name: "Familie beitreten" }).click();
    check(await visible(page, "Deine Eltern müssen zuerst zustimmen"), "under 16: plain-language consent notice");
    check(calls(state, "family_join").at(-1)?.body.p_code === "ABCD1234", "join sends the normalised code");
    check(await visible(page, "Eltern in deiner Familie: Sandra Meier"), "child sees who is in the family");
    const sw = page.getByRole("switch", { name: /Bewerbungsliste teilen/ });
    check(!(await sw.isChecked()), "application list is off by default");
    await sw.evaluate((el) => el.click());
    await page.waitForTimeout(400);
    const share = calls(state, "family_set_share").at(-1)?.body.p_settings;
    check(share && share.applications === true && share.progress === true && share.documents === false, "family_set_share keeps other keys", JSON.stringify(share));
    check(await sw.isChecked(), "switch shows the new state");
    check(await noOverflow(page), "no horizontal overflow");
    await shot(page, `${key}-child-family`);
    await page.getByRole("button", { name: "Familie verlassen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Verlassen" }).click();
    check(await visible(page, "Deine Eltern verbinden"), "after leaving: back to the connect card");
    await page.getByRole("button", { name: "Eltern einladen" }).click();
    check(await visible(page, "ELTE 6789"), "child can invite a parent");
    check(calls(state, "family_create_invite").at(-1)?.body.p_direction === "child_invites_parent", "invite direction child_invites_parent");
    if (key === "mobile-light") {
      await page.getByRole("button", { name: "Mehr" }).click();
      check(await page.getByRole("dialog").getByRole("link", { name: "Familie" }).isVisible(), "private student finds 'Familie' under 'Mehr'");
    }
    await ctx.close();
  }
}

// ------------------------------------------------ not deployed
scope = "not-deployed mobile";
{
  const { ctx, page } = await actor({ meta: { role: "student", role_confirmed: true, account_type: "parent" }, missing: FAMILY_RPCS });
  await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
  check(await visible(page, "Familien-Funktion bald verfügbar", 90000), "friendly 'bald verfügbar' state");
  await page.getByRole("button", { name: "Zugang anfragen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Anfrage senden" }).click();
  check(await visible(page, "Die Warteliste ist bald verfügbar"), "waitlist missing: points to the contact form");
  check(await page.getByRole("dialog").getByRole("link", { name: "Zum Kontaktformular" }).isVisible(), "contact link offered");
  await shot(page, "not-deployed-family");
  await ctx.close();
}

// ------------------------------------------------ school student: unchanged
scope = "school student desktop";
{
  const { ctx, page, state } = await actor({ meta: { role: "student", role_confirmed: true, student_onboarded: true, onboarding_tour_done: true }, rpc: { class_my_classes: [{ class_id: "c1", name: "Informatik 4a", school_year: "2026/27", teacher_name: "Herr Keller", share_applications: true, joined_at: inDays(-50) }] }, vp: { w: 1280, h: 860 } });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  check(await visible(page, "Klassen", 90000), "dashboard loads");
  await page.waitForTimeout(1500);
  check(await page.getByRole("link", { name: "Familie" }).count() > 0, "students in a class also get the family item (P9)");
  check(!calls(state, "account_set_type").length, "no account type change for school students");
  check(page.url().endsWith("/dashboard"), "stays on the dashboard");
  await ctx.close();
}

// ------------------------------------------------ signup + role picker
scope = "signup mobile";
{
  const ctx = await newCtx(browser, { w: 375, h: 812 });
  await installStub(ctx, { authed: false });
  const bodies = [];
  await ctx.route(`${SUPA}/auth/v1/signup*`, (route) => { if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors }); try { bodies.push(route.request().postDataJSON()); } catch { /* none */ } return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ id: "new", email: "neu@beispiel.ch", user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" }) }); });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  // Retry until hydrated: a click before React attaches its handlers does nothing.
  for (let i = 0; i < 20 && !(await page.getByText("Ich bin", { exact: true }).count()); i++) { await page.getByRole("button", { name: "Konto erstellen" }).first().click(); await page.waitForTimeout(1000); }
  for (const label of ["Schüler:in mit Klasse", "Schüler:in privat", "Elternteil", "Lehrperson"]) check(await page.getByText(label, { exact: true }).first().isVisible(), `signup offers '${label}'`);
  await page.getByText("Schüler:in privat", { exact: true }).click();
  check(await page.getByLabel("Jahrgang").isVisible(), "private students are asked for the birth year only");
  await page.getByLabel("E-Mail-Adresse").fill("neu@beispiel.ch");
  await page.getByLabel("Passwort", { exact: true }).fill("geheim123!");
  await page.getByLabel("Passwort wiederholen").fill("geheim123!");
  await page.getByRole("button", { name: "Konto erstellen" }).last().click();
  check(await visible(page, "Bitte wähle deinen Jahrgang"), "birth year is required");
  await page.getByLabel("Jahrgang").selectOption(String(new Date().getFullYear() - 14));
  check(await visible(page, "muss ein Elternteil zuerst zustimmen"), "under-16 hint in plain language");
  await shot(page, "signup-private");
  await page.getByRole("button", { name: "Konto erstellen" }).last().click();
  check(await visible(page, "Fast geschafft"), "signup sent");
  const d = bodies.at(-1)?.data;
  check(d && d.role === "student" && d.account_type === "independent_student" && d.birth_year === new Date().getFullYear() - 14, "signup stores role + account type + birth year", JSON.stringify(d));
  await page.getByText("Schüler:in mit Klasse", { exact: true }).click();
  check(!(await page.getByLabel("Jahrgang").count()), "no birth year for school students");
  await ctx.close();
}

scope = "role picker -> parent";
{
  const { ctx, page, state } = await actor({ meta: {}, rpc: { set_my_role: [], ...familyBackend({ id: "u1", name: "Sandra" }).rpc } });
  await page.goto(`${BASE}/auth/role`, { waitUntil: "domcontentloaded" });
  check(await visible(page, "Wie nutzt du", 90000), "picker shown for accounts without a role");
  await page.getByText("Elternteil", { exact: true }).click();
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.waitForURL(/\/familie/, { timeout: 60000 }).catch(() => {});
  check(page.url().endsWith("/familie"), "parent lands on /familie", page.url());
  check(calls(state, "set_my_role")[0]?.body.p_role === "student", "base role stays 'student'");
  check(calls(state, "account_set_type").some((c) => c.body.p_type === "parent"), "account_set_type(parent) called");
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const p of problems) console.log("PROBLEM", p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${problems.length} page problems. Screenshots: ${OUT}`);
fs.writeFileSync(`${OUT}results.json`, JSON.stringify({ results, problems }, null, 2));
process.exit(failed.length || problems.length ? 1 : 0);
