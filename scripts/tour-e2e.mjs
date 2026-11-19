// Local smoke of the spotlight product tour (SPEC-FLOW §6) against the in-memory Supabase stand-in (nothing real is touched).
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3243 node scripts/tour-e2e.mjs
// The dev server needs NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy.
// Phone 390×844 + desktop 1280×860: auto-start (funnel account only), indicator, Weiter/Zurück, arrows, Esc = skip (stored),
// Fertig (stored), no restart after a stored state, ?tour=1 replay, missing element → skipped + recount, paywall → no tour,
// parent tour on /familie, focus in the card, reduced motion. Screenshots: $OUT.
import fs from "node:fs";
import { homedir } from "node:os";
import { installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const BASE = process.env.BASE || "http://localhost:3243";
const SUPA = "http://localhost:54321";
const OUT = (process.env.OUT || `${homedir()}/Projects/bewerbungen-tracker-wt/_onboarding/shots-tour/`).replace(/\/?$/, "/");
fs.mkdirSync(OUT, { recursive: true });
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", headers: { ...cors, "content-range": "0-0/*" }, body: JSON.stringify(body) });
const ACCESS = (o = {}) => ({ has_access: true, state: "trial", reason: "trial", role: "student", account_type: null, trial_ends_at: new Date(Date.now() + 5 * 864e5).toISOString(), trial_days_left: 5, grace_until: null, grant_until: null, subscription: null, school: null, blocked: false, enforced: true, expired_reason: null, family_pending: false, ...o });
const EXPIRED = ACCESS({ has_access: false, state: "expired", trial_days_left: 0, expired_reason: "trial_ended" });

const results = [];
const problems = [];
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, text: `[${scope}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : info); };

async function actor(vp, { funnel = true, helpWishes = ["lebenslauf"], weeklyGoal = 4, tourRow = null, access = ACCESS(), meta = { role: "student" }, reduced = false, rpc = {} } = {}) {
  const ctx = await newCtx(browser, { ...vp, reducedMotion: reduced ? "reduce" : "no-preference" });
  ctx.setDefaultNavigationTimeout(90000);
  const state = await installStub(ctx, { role: "student", social: "empty", rpc: { class_my_classes: [], ...rpc } });
  const db = { tourRow, saves: [] };
  const profile = { id: "profile-u1", user_id: "u1", first_name: "Lena", last_name: "Müller", email: "lena@beispiel.ch", weekly_goal: weeklyGoal, help_wishes: helpWishes, funnel_completed_at: funnel ? "2026-11-19T08:00:00Z" : null };
  const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "lena@beispiel.ch", user_metadata: { ...meta }, app_metadata: {}, created_at: "2026-11-19T08:00:00Z" };
  await ctx.route(`${SUPA}/auth/v1/user*`, (r) => (r.request().method() === "OPTIONS" ? r.fulfill({ status: 204, headers: cors }) : json(r, 200, user)));
  await ctx.route(`${SUPA}/rest/v1/profiles*`, (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    if (r.request().method() !== "GET") return json(r, 201, []);
    return json(r, 200, (r.request().headers()["accept"] || "").includes("vnd.pgrst.object") ? profile : [profile]);
  });
  await ctx.route(`${SUPA}/rest/v1/product_tour_state*`, (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const single = (r.request().headers()["accept"] || "").includes("vnd.pgrst.object");
    if (single && !db.tourRow) return json(r, 406, { code: "PGRST116", message: "0 rows" });
    return json(r, 200, single ? db.tourRow : db.tourRow ? [db.tourRow] : []);
  });
  await ctx.route(`${SUPA}/rest/v1/rpc/tour_state_set`, (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const b = r.request().postDataJSON() || {};
    db.saves.push(b);
    db.tourRow = { status: b.p_status, version: b.p_version };
    return json(r, 200, null);
  });
  await ctx.route(`${SUPA}/rest/v1/rpc/my_access`, (r) => (r.request().method() === "OPTIONS" ? r.fulfill({ status: 204, headers: cors }) : json(r, 200, access)));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|status of 4\d\d|status of 5\d\d|React DevTools|Download the React/.test(m.text())) problems.push(`[${scope}] console ${m.text().slice(0, 200)}`); });
  return { ctx, page, state, db };
}

const card = (page) => page.locator("[data-tour-card]");
const waitTour = (page, timeout = 30000) => card(page).waitFor({ state: "visible", timeout }).then(() => true, () => false);
const noTour = async (page, ms = 6000) => { await page.waitForTimeout(ms); return (await page.locator('[data-testid="tour-overlay"]').count()) === 0; };
const info = (page) => page.evaluate(() => {
  const c = document.querySelector("[data-tour-card]");
  const root = document.querySelector('[data-testid="tour-overlay"]');
  const text = c?.innerText ?? "";
  const m = text.match(/(\d+)\s*\/\s*(\d+)/);
  const cut = document.querySelector('[data-testid="tour-cutout"]')?.getBoundingClientRect();
  const cr = c?.getBoundingClientRect();
  return { step: root?.getAttribute("data-tour-step") ?? null, i: m ? +m[1] : null, n: m ? +m[2] : null, text, focusInCard: !!c && c.contains(document.activeElement),
    role: c?.getAttribute("role"), modal: c?.getAttribute("aria-modal"), labelled: !!c?.getAttribute("aria-labelledby"), described: !!c?.getAttribute("aria-describedby"),
    cut: cut ? { top: cut.top, left: cut.left, w: cut.width, h: cut.height } : null, card: cr ? { top: cr.top, left: cr.left, w: cr.width, h: cr.height, bottom: cr.bottom, right: cr.right } : null,
    vw: window.innerWidth, vh: window.innerHeight, z: root ? getComputedStyle(root).zIndex : null };
});
const btn = (page, name) => card(page).getByRole("button", { name, exact: true });
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` }).catch(() => {});
const settle = (page) => page.waitForTimeout(450);

const browser = await launch();
const VPS = [{ key: "phone", vp: { w: 390, h: 844 } }, { key: "desktop", vp: { w: 1280, h: 860 } }];

for (const { key, vp } of VPS) {
  // ------------------------------------------------ A: auto-start, navigation, keyboard, Fertig, no restart
  scope = `${key} schueler auto`;
  {
    const { ctx, page, db } = await actor(vp);
    await page.goto(`${BASE}/dashboard`);
    check(await waitTour(page), "tour starts by itself on /dashboard (funnel account, no state row)");
    await settle(page);
    let s = await info(page);
    check(s.step === "start" && s.i === 1, "step 1 = Start", JSON.stringify(s));
    check(s.n === 8, "indicator counts the real list (8: Dokumente shown for help wish «lebenslauf»)", `n=${s.n}`);
    check(s.role === "dialog" && s.modal === "true" && s.labelled && s.described, "card: role=dialog, aria-modal, labelledby + describedby");
    check(s.focusInCard, "focus is in the card");
    check(s.z === "130", "overlay z-index 130", s.z);
    check(!!s.cut && s.cut.w > 0, "cut-out around the target");
    check(!!s.card && s.card.left >= 0 && s.card.right <= s.vw + 1 && s.card.top >= 0 && s.card.bottom <= s.vh + 1, "card fully on screen", JSON.stringify(s.card));
    check(!(await btn(page, "Zurück").count()), "step 1 has no «Zurück»");
    check(await card(page).getByRole("button", { name: /Tour überspringen/ }).count() > 0, "step 1 offers «Tour überspringen»");
    await shot(page, `${key}-schueler-1`);
    await btn(page, "Weiter").click(); await settle(page);
    s = await info(page);
    check(s.step === "weekly-goal" && s.i === 2 && /4 Bewerbungen pro Woche/.test(s.text), "Weiter → step 2 Wochenziel with the goal from the plan (4)", JSON.stringify({ step: s.step, i: s.i }));
    await shot(page, `${key}-schueler-2`);
    await btn(page, "Zurück").click(); await settle(page);
    check((await info(page)).i === 1, "Zurück → step 1");
    await page.keyboard.press("ArrowRight"); await settle(page);
    check((await info(page)).i === 2, "→ = next");
    await page.keyboard.press("ArrowLeft"); await settle(page);
    check((await info(page)).i === 1, "← = back");
    for (let k = 1; k < 8; k++) { await page.keyboard.press("ArrowRight"); await settle(page); }
    s = await info(page);
    check(s.step === "more" && s.i === 8, "last step = Mehr (8/8)", JSON.stringify({ step: s.step, i: s.i }));
    if (key === "phone") {
      const navCard = s.card, navCut = s.cut;
      check(!!navCard && !!navCut && navCard.bottom <= navCut.top + 1, "phone: card above the bottom bar item", JSON.stringify({ navCard, navCut }));
    }
    check(await btn(page, "Fertig").count() > 0 && !(await card(page).getByRole("button", { name: /Überspringen/ }).count()), "last step: «Fertig», no «Überspringen»");
    await shot(page, `${key}-schueler-last`);
    await btn(page, "Fertig").click();
    await page.waitForTimeout(800);
    check((await page.locator('[data-testid="tour-overlay"]').count()) === 0, "Fertig closes the tour");
    check(db.saves.length === 1 && db.saves[0].p_tour === "schueler" && db.saves[0].p_status === "completed" && db.saves[0].p_version === 1, "Fertig stores completed (tour_state_set)", JSON.stringify(db.saves));
    // New tab, same account: the stored row prevents a restart.
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}/dashboard`);
    check(await noTour(p2), "no restart after completed (new tab)");
    // Manual replay from the settings link.
    await p2.goto(`${BASE}/settings`);
    const link = p2.getByRole("link", { name: "Tour wiederholen" }).or(p2.getByRole("button", { name: "Tour wiederholen" })).first();
    check(await link.waitFor({ timeout: 30000 }).then(() => true, () => false), "Einstellungen shows «Tour wiederholen»");
    await link.click();
    check(await waitTour(p2), "«Tour wiederholen» → /dashboard?tour=1 starts the tour again");
    check(!/tour=1/.test(p2.url()), "?tour=1 removed from the URL", p2.url());
    await p2.keyboard.press("Escape"); await p2.waitForTimeout(600);
    check(db.saves.length === 1, "skipping a replay stores nothing (completed is not downgraded)", JSON.stringify(db.saves));
    await ctx.close();
  }

  // ------------------------------------------------ B: Esc = skip (stored), no restart after reload
  scope = `${key} schueler esc`;
  {
    const { ctx, page, db } = await actor(vp, { helpWishes: ["bewerbung"], reduced: true });
    await page.goto(`${BASE}/dashboard`);
    check(await waitTour(page), "tour starts (reduced motion)");
    await settle(page);
    const s = await info(page);
    check(s.n === 7, "help wishes without lebenslauf/brief → Dokumente skipped, indicator 7", `n=${s.n}`);
    const cutMorph = await page.locator('[data-testid="tour-cutout"]').evaluate((el) => getComputedStyle(el).transitionDuration);
    check(cutMorph.split(",").every((d) => parseFloat(d) < 0.01), "reduced motion: no cut-out morph", cutMorph);
    await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    check((await page.locator('[data-testid="tour-overlay"]').count()) === 0, "Esc closes the tour");
    check(db.saves.length === 1 && db.saves[0].p_status === "skipped", "Esc stores skipped", JSON.stringify(db.saves));
    await page.reload();
    check(await noTour(page), "no restart after skip (reload)");
    await ctx.close();
  }

  // ------------------------------------------------ C: missing element → skipped + recount
  scope = `${key} schueler missing`;
  {
    const { ctx, page } = await actor(vp);
    await page.goto(`${BASE}/dashboard`);
    check(await waitTour(page), "tour starts");
    await settle(page);
    // The Dorf nav item disappears mid-tour (e.g. a layout change): its step must be skipped silently.
    await page.evaluate(() => document.querySelectorAll('[data-tour="nav-map"]').forEach((el) => el.removeAttribute("data-tour")));
    const seen = [];
    for (let k = 0; k < 8; k++) {
      const s = await info(page);
      if (!s.step) break;
      seen.push(`${s.step}:${s.i}/${s.n}`);
      if (s.step === "more") break;
      await page.keyboard.press("ArrowRight"); await page.waitForTimeout(k >= 3 ? 2200 : 450);
    }
    check(!seen.some((x) => x.startsWith("village")), "Dorf step skipped", seen.join(" "));
    check(/more:7\/7/.test(seen.join(" ")), "indicator recounted to 7, last step 7/7", seen.join(" "));
    await ctx.close();
  }

  // ------------------------------------------------ D: no auto-start for pre-release (non-funnel) accounts
  scope = `${key} old account`;
  {
    const { ctx, page, db } = await actor(vp, { funnel: false });
    await page.goto(`${BASE}/dashboard`);
    check(await noTour(page), "account without funnel: no auto-start");
    await page.goto(`${BASE}/dashboard?tour=1`);
    check(await waitTour(page), "?tour=1 starts it manually");
    await ctx.close();
    check(db.saves.length === 0, "nothing stored without an end");
  }

  // ------------------------------------------------ E: paywall → never a tour, not even with ?tour=1
  scope = `${key} paywall`;
  {
    const { ctx, page } = await actor(vp, { access: EXPIRED });
    await page.goto(`${BASE}/dashboard?tour=1`);
    const pay = await page.locator('[data-testid="paywall"]').first().waitFor({ timeout: 40000 }).then(() => true, () => false);
    check(pay, "paywall shown");
    check(await noTour(page), "no tour over the paywall");
    await ctx.close();
  }

  // ------------------------------------------------ F: parent tour on /familie (manual, no family yet)
  scope = `${key} eltern`;
  {
    const { ctx, page } = await actor(vp, { access: ACCESS({ account_type: "parent" }), meta: { role: "student", account_type: "parent" }, rpc: { family_get_my: null } });
    await page.goto(`${BASE}/familie?tour=1`);
    const ok = await waitTour(page, 40000);
    check(ok, "parent tour starts on /familie");
    if (ok) {
      await settle(page);
      const s = await info(page);
      check(s.step === "family", "step 1 = Familie", JSON.stringify({ step: s.step, n: s.n }));
      const seen = [];
      for (let k = 0; k < 6; k++) { const t = await info(page); if (!t.step) break; seen.push(t.step); if (t.i === t.n) break; await page.keyboard.press("ArrowRight"); await page.waitForTimeout(k ? 2000 : 450); }
      check(!seen.includes("overview") && seen.at(-1) === "more", "no child yet: Übersicht skipped; ends with Mehr", seen.join(","));
      await shot(page, `${key}-eltern`);
    }
    await ctx.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (problems.length) { console.log(`page problems (${problems.length}):`); for (const p of [...new Set(problems)].slice(0, 20)) console.log("  ", p); }
fs.writeFileSync(`${OUT}results.json`, JSON.stringify({ results, problems }, null, 2));
process.exit(failed.length ? 1 : 0);
