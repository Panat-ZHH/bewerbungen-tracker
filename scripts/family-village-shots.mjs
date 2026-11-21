// Screenshots of the parent village flow (demo data only; Supabase = in-memory stub, family_* RPCs mocked).
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3412 node scripts/family-village-shots.mjs
//     (dev server with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy)
// Output: docs/family/parent-village/<scene>-<desktop|mobile>-<light|dark>.png (OUT to override). ONLY=scene1,scene2 to filter.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const BASE = process.env.BASE || "http://localhost:3412";
const OUT = (process.env.OUT || join(dirname(fileURLToPath(import.meta.url)), "../docs/family/parent-village")).replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const SUPA = "http://localhost:54321";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const CHILD = "c1";
const VIEWPORTS = { desktop: { w: 1280, h: 800 }, mobile: { w: 390, h: 844 } };
const problems = [];

const share = (village, applications = true) => ({ progress: true, applications, village, documents: false });
const members = (village, applications) => [
  { user_id: "u1", display_name: "Sandra Meier", role: "parent", status: "active", consent_status: "not_required", share_settings: null },
  { user_id: CHILD, display_name: "Lina Meier", role: "child", status: "active", consent_status: "granted", share_settings: share(village, applications) },
];
const overview = (village, applications = true) => ({
  child: { display_name: "Lina Meier" }, consent_status: "granted", sharing_active: true, shared: share(village, applications),
  progress: { applications_total: 3, status_counts: { applied: 1, interview: 1, offer: 1 }, last_activity: "2026-11-20" },
  ...(village ? { village: { islands: 2, items: 2, points_earned: 120 } } : {}),
  ...(applications ? { applications: [{ company: "Swisscom", position: "Informatikerin EFZ", status: "offer", updated_at: "2026-11-20" }, { company: "UBS", position: "Kauffrau EFZ", status: "interview", updated_at: "2026-11-18" }] } : {}),
});
const items = [{ id: "i1", itemType: "tree", x: 8, z: 12, rotation: 0, createdAt: "2026-10-01" }, { id: "i2", itemType: "fountain", x: 10, z: 12, rotation: 0, createdAt: "2026-10-02" }];
const VILLAGE = { child_id: CHILD, display_name: "Lina Meier", island_count: 2, show_companies: true, layouts: [], items,
  houses: [{ id: "h1", status: "offer", company: "Swisscom" }, { id: "h2", status: "interview", company: "UBS" }, { id: "h3", status: "applied", company: "Migros" }] };
const VILLAGE_NOCO = { ...VILLAGE, show_companies: false, houses: VILLAGE.houses.map((h) => ({ ...h, company: null })) };

async function actor(browser, vp, dark, { role = "parent", village = true, applications = true, villageRpc = VILLAGE } = {}) {
  const ctx = await newCtx(browser, { ...vp, dark });
  await ctx.addInitScript(() => { try { localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); } catch { /* none */ } });
  await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }));
  const me = role === "parent" ? "u1" : CHILD;
  const rpc = {
    class_my_classes: [],
    family_get_my: { family: { id: "f1", name: "Familie Meier" }, my_role: role, members: members(village, applications), plan: { plan_type: "family", status: "active", state: "active", seats_parents: 1, seats_children: 1 }, invites: [] },
    family_child_overview: overview(village, applications),
    family_child_village: villageRpc,
    family_set_share: null,
  };
  await installStub(ctx, { role: "student", rpc });
  const meta = role === "parent" ? { role: "student", account_type: "parent", account_type_synced: true }
    : { role: "student", role_confirmed: true, student_onboarded: true, onboarding_tour_done: true, account_type: "independent_student", birth_year: 2010 };
  const user = { id: me, aud: "authenticated", role: "authenticated", email: role === "parent" ? "eltern@beispiel.ch" : "lina@beispiel.ch", user_metadata: meta, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user });
  await ctx.route(`${SUPA}/auth/v1/user*`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(user) }));
  await ctx.route("**/api/billing/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, plan: "family", status: "active", source: "manual", validUntil: "2027-11-16", studentLimit: null, cancelAtPeriodEnd: false, subscriptionStatus: null }) }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror ${e.message.slice(0, 200)}`));
  return { ctx, page };
}
const ready = (page, sel, timeout = 90000) => page.locator(sel).first().waitFor({ timeout }).then(() => true, () => false);

const scenes = {
  /** Parent /familie: child card with «Dorf ansehen». */
  "familie-card": { opts: {}, async run(page) { await page.goto(`${BASE}/familie`); await ready(page, "[data-testid=child-village-link]"); await page.locator("[data-testid=child-village-link]").first().scrollIntoViewIfNeeded(); return true; }, full: true },
  /** Parent /familie, village not shared: card says so, no button. */
  "familie-card-unshared": { opts: { village: false }, async run(page) { await page.goto(`${BASE}/familie`); return ready(page, "text=Das Dorf ist nicht geteilt."); }, full: true },
  /** Village with company names (child shares the application list). */
  "dorf-companies": { opts: {}, async run(page) { await page.goto(`${BASE}/familie/kind/${CHILD}/dorf`); const ok = await ready(page, "[data-village-state=ready] [aria-label='3D-Bewerbungsdorf']"); await page.waitForTimeout(2500); return ok; } },
  "dorf-companies-info": { opts: {}, async run(page) { await page.goto(`${BASE}/familie/kind/${CHILD}/dorf`); const ok = await ready(page, "[data-village-state=ready] [aria-label='3D-Bewerbungsdorf']"); await page.waitForTimeout(2000); await openInfo(page); return ok; } },
  /** Village without company names. */
  "dorf-no-companies": { opts: { applications: false, villageRpc: VILLAGE_NOCO }, async run(page) { await page.goto(`${BASE}/familie/kind/${CHILD}/dorf`); const ok = await ready(page, "[data-village-state=ready] [aria-label='3D-Bewerbungsdorf']"); await page.waitForTimeout(2500); return ok; } },
  "dorf-no-companies-info": { opts: { applications: false, villageRpc: VILLAGE_NOCO }, async run(page) { await page.goto(`${BASE}/familie/kind/${CHILD}/dorf`); const ok = await ready(page, "[data-village-state=ready] [aria-label='3D-Bewerbungsdorf']"); await page.waitForTimeout(2000); await openInfo(page); return ok; } },
  /** Direct visit while the village is not shared. */
  "dorf-not-shared": { opts: { village: false, villageRpc: { __error: "NOT_SHARED", __hint: "village_off" } }, async run(page) { await page.goto(`${BASE}/familie/kind/${CHILD}/dorf`); return ready(page, "[data-village-state=not_shared]"); } },
  /** Child /familie: «Dorf teilen» switch on and off. */
  "child-share-on": { opts: { role: "child" }, async run(page) { await page.goto(`${BASE}/familie`); const ok = await ready(page, "text=Dorf teilen"); await page.getByText("Dorf teilen").first().scrollIntoViewIfNeeded(); return ok; }, full: true },
  "child-share-off": { opts: { role: "child", village: false }, async run(page) { await page.goto(`${BASE}/familie`); const ok = await ready(page, "text=Dorf teilen"); await page.getByText("Dorf teilen").first().scrollIntoViewIfNeeded(); return ok; }, full: true },
};
async function openInfo(page) {
  await page.locator("[data-map-chip=child-village] button, button[aria-controls*=child-village]").first().click().catch(async () => { await page.getByRole("button", { name: /Lina/ }).first().click().catch(() => problems.push("info chip not found")); });
  await page.waitForTimeout(600);
}

const browser = await launch();
const done = [];
try {
  for (const [name, scene] of Object.entries(scenes)) {
    if (ONLY && !ONLY.has(name)) continue;
    for (const [vpKey, vp] of Object.entries(VIEWPORTS)) for (const theme of ["light", "dark"]) {
      const { ctx, page } = await actor(browser, vp, theme === "dark", scene.opts);
      const file = `${name}-${vpKey}-${theme}.png`;
      try {
        const ok = await scene.run(page);
        // Full page = viewport as tall as the page (fullPage capture would paint the fixed bottom nav mid-page after a scroll).
        if (scene.full) { await page.evaluate(() => window.scrollTo(0, 0)); await page.setViewportSize({ width: vp.w, height: Math.max(vp.h, await page.evaluate(() => document.documentElement.scrollHeight)) }); }
        await page.waitForTimeout(500);
        await page.screenshot({ path: OUT + file });
        done.push(file); if (!ok) problems.push(`${file}: expected element not found`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) problems.push(`${file}: horizontal overflow`);
      } catch (e) { problems.push(`${file}: ${e.message.slice(0, 200)}`); }
      await ctx.close();
    }
  }
} finally { await browser.close(); }
console.log(`${done.length} screenshots in ${OUT}`);
for (const p of problems) console.log("WARN", p);
