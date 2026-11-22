// Live check: the parent village (/familie/kind/[id]/dorf) must animate exactly like a friend's village (/friends/mock-*).
// Demo data only (Supabase = in-memory stub, family RPCs mocked, friend = built-in mock island). Nothing real is touched.
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3417 node scripts/parent-village-live-e2e.mjs
//     (dev server with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy)
import { readFileSync } from "node:fs";
import { installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const SHOT_DIR = process.env.OUT || "";
const BASE = process.env.BASE || "http://localhost:3417";
const SUPA = "http://localhost:54321";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const CHILD = "c1";
const share = { progress: true, applications: true, village: true, documents: false };
const VILLAGE = {
  child_id: CHILD, display_name: "Lina Meier", island_count: 2, show_companies: true, layouts: [],
  items: [{ id: "i1", itemType: "tree", x: 8, z: 12, rotation: 0, createdAt: "2026-10-01" }, { id: "i2", itemType: "fountain", x: 10, z: 12, rotation: 0, createdAt: "2026-10-02" }],
  houses: [{ id: "h1", status: "offer", company: "Swisscom" }, { id: "h2", status: "interview", company: "UBS" }, { id: "h3", status: "saved", company: "Migros" }],
};

// SHAPE=<json> (optional): anonymous village shape {islands, statuses[], items[{itemType,x,z,rotation}], layouts[{idx,x,z,rotation}]}
// to replay a big real-world village (types and positions only); used for BOTH the friend and the parent view.
const FRIEND = "22222222-2222-2222-2222-222222222222";
let FRIEND_ISLAND = null;
if (process.env.SHAPE) {
  const shape = JSON.parse(readFileSync(process.env.SHAPE, "utf8"));
  // NOCO=1: the child does not share the application list (no company names), like the real-world case.
  const noco = process.env.NOCO === "1";
  const houses = shape.statuses.map((status, index) => ({ id: `h${String(index + 1).padStart(4, "0")}`, status, company: noco ? null : `Firma ${index + 1}` }));
  const items = shape.items.map((item, index) => ({ id: `i${index + 1}`, ...item, createdAt: "2026-10-01" }));
  const layouts = (shape.layouts ?? []).map((l) => ({ id: `house:${houses[l.idx].id}`, x: l.x, z: l.z, rotation: l.rotation }));
  Object.assign(VILLAGE, { island_count: shape.islands, show_companies: !noco, houses, items, layouts });
  FRIEND_ISLAND = { userId: FRIEND, displayName: "Mia Muster", islands: shape.islands, companiesShared: !noco, outcomesShared: true, items, layouts,
    applications: houses.map((h, index) => ({ ...h, createdAt: `2026-10-${String(index + 1).padStart(2, "0")}` })) };
}

async function actor(browser, parent = true, vp = { w: 1280, h: 800 }) {
  const ctx = await newCtx(browser, { ...vp, dark: false });
  await ctx.addInitScript(() => { try { localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); } catch { /* none */ } });
  const rpc = {
    class_my_classes: [],
    family_get_my: { family: { id: "f1", name: "Familie Meier" }, my_role: "parent", plan: { plan_type: "family", status: "active", state: "active", seats_parents: 1, seats_children: 1 }, invites: [],
      members: [{ user_id: "u1", display_name: "Sandra Meier", role: "parent", status: "active", consent_status: "not_required", share_settings: null }, { user_id: CHILD, display_name: "Lina Meier", role: "child", status: "active", consent_status: "granted", share_settings: share }] },
    family_child_overview: { child: { display_name: "Lina Meier" }, consent_status: "granted", sharing_active: true, shared: share,
      progress: { applications_total: 3, status_counts: { applied: 1, interview: 1, offer: 1 }, last_activity: "2026-11-20" }, village: { islands: 2, items: 2, points_earned: 120 }, applications: [] },
    family_child_village: VILLAGE,
    map_friend_island: FRIEND_ISLAND,
  };
  await installStub(ctx, { role: "student", rpc });
  const meta = parent ? { role: "student", account_type: "parent", account_type_synced: true } : { role: "student", role_confirmed: true, student_onboarded: true, onboarding_tour_done: true, account_type: "independent_student", birth_year: 2008 };
  const user = { id: parent ? "u1" : "s1", aud: "authenticated", role: "authenticated", email: parent ? "eltern@beispiel.ch" : "schueler@beispiel.ch", user_metadata: meta, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user });
  await ctx.route(`${SUPA}/auth/v1/user*`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(user) }));
  await ctx.route("**/api/billing/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, plan: "family", status: "active", source: "manual", validUntil: "2027-11-16", studentLimit: null, cancelAtPeriodEnd: false, subscriptionStatus: null }) }));
  return ctx;
}

/** Opens a map page and measures life: render-loop frames and whether two canvas frames 1.5 s apart differ. */
async function measure(ctx, path, link = null) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(BASE + path);
  if (link) { await page.locator(link).first().waitFor({ timeout: 90000 }); await page.locator(link).first().click(); }
  const host = page.locator("[aria-label='3D-Bewerbungsdorf']").first();
  await host.waitFor({ timeout: 90000 });
  await page.waitForFunction(() => document.querySelector("[aria-label='3D-Bewerbungsdorf']")?.__map, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const info = () => page.evaluate(() => {
    const el = document.querySelector("[aria-label='3D-Bewerbungsdorf']");
    const map = el?.__map; const r = el?.getBoundingClientRect();
    return { frames: map?.stats.frames ?? -1, rect: r ? [Math.round(r.width), Math.round(r.height)] : null, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches };
  });
  const before = await info();
  const shotA = await host.screenshot();
  await page.waitForTimeout(1500);
  const shotB = await host.screenshot();
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${path.replace(/\W+/g, "_")}${link ? "_link" : ""}-${page.viewportSize()?.width}.png` });
  const after = await info();
  await page.close();
  return { path: link ? `${path} -> ${link}` : path, viewport: page.viewportSize()?.width, framesPerSec: Math.round((after.frames - before.frames) / 1.7), rect: after.rect, reduced: after.reduced, framesDiffer: !shotA.equals(shotB), errors };
}

const browser = await launch();
let failed = false;
try {
  for (const vp of [{ w: 1280, h: 800 }, { w: 390, h: 844 }]) {
    const student = await actor(browser, false, vp);
    const runs = [await measure(student, FRIEND_ISLAND ? `/friends/${FRIEND}` : "/friends/mock-mia")];
    await student.close();
    const ctx = await actor(browser, true, vp);
    runs.push(await measure(ctx, `/familie/kind/${CHILD}/dorf`));
    runs.push(await measure(ctx, "/familie", "[data-testid=child-village-link]"));
    await ctx.close();
    for (const r of runs) {
      console.log(JSON.stringify(r));
      if (!r.framesDiffer || r.framesPerSec < 5) failed = true;
    }
  }
} finally { await browser.close(); }
console.log(failed ? "FAIL: a village is frozen" : "OK: friend and parent villages are both live");
process.exit(failed ? 1 : 0);
