// Parent sees the child's village read-only (/familie -> «Dorf ansehen» -> /familie/kind/[id]/dorf).
// Nothing real is touched: Supabase is the in-memory stub (scripts/ux-v2-stub.mjs); family_child_village is mocked.
//
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3412 node scripts/family-village-e2e.mjs
//     (dev server with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy)
//   ONLY=shared,unshared,reauth   run only some scenarios
//
// Screenshots: screenshots/family-village/*.png next to the worktrees (OUT to override).
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const BASE = process.env.BASE || "http://localhost:3412";
const OUT = (process.env.OUT || join(homedir(), "Projects/bewerbungen-tracker-wt/screenshots/family-village")).replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const SUPA = "http://localhost:54321";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const CHILD = "c1";
const VIEWPORTS = { desktop: { w: 1280, h: 800 }, mobile: { w: 390, h: 844, dark: true } };

const results = [];
const problems = [];
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, text: `[${scope}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : info); };
const waitSel = (page, sel, timeout = 30000) => page.locator(sel).first().waitFor({ timeout }).then(() => true, () => false);
const shot = (page, name) => page.waitForTimeout(400).then(() => page.screenshot({ path: `${OUT}${name}.png` })).catch((e) => problems.push(`[${scope}] screenshot ${name}: ${e.message.slice(0, 120)}`));

// ---------------------------------------------------------------- fixtures
const share = (village) => ({ progress: true, applications: true, village, documents: false });
const members = (village) => [
  { user_id: "u1", display_name: "Sandra Meier", role: "parent", status: "active", consent_status: "not_required" },
  { user_id: CHILD, display_name: "Lina Meier", role: "child", status: "active", consent_status: "granted", share_settings: share(village) },
];
const overview = (village) => ({
  child: { display_name: "Lina Meier" }, consent_status: "granted", sharing_active: true, shared: share(village),
  progress: { applications_total: 3, status_counts: { applied: 1, interview: 1, offer: 1 }, last_activity: "2026-11-20" },
  ...(village ? { village: { islands: 2, items: 2, points_earned: 120 } } : {}),
  applications: [{ company: "Swisscom", position: "Informatikerin EFZ", status: "offer", updated_at: "2026-11-20" }],
});
const VILLAGE = {
  child_id: CHILD, display_name: "Lina Meier", island_count: 2, show_companies: true,
  houses: [{ id: "h1", status: "offer", company: "Swisscom" }, { id: "h2", status: "interview", company: "UBS" }, { id: "h3", status: "applied", company: null }],
  layouts: [],
  items: [{ id: "i1", itemType: "tree", x: 8, z: 12, rotation: 0, createdAt: "2026-10-01" }, { id: "i2", itemType: "fountain", x: 10, z: 12, rotation: 0, createdAt: "2026-10-02" }],
};

async function actor(browser, { vp = VIEWPORTS.desktop, village = true, villageRpc = VILLAGE } = {}) {
  const ctx = await newCtx(browser, vp);
  await ctx.addInitScript(() => { try { localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); } catch { /* none */ } });
  await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }));
  const rpc = {
    class_my_classes: [],
    family_get_my: { family: { id: "f1", name: "Familie Meier" }, my_role: "parent", members: members(village), plan: { plan_type: "family", status: "active", state: "active", seats_parents: 1, seats_children: 1 }, invites: [] },
    family_child_overview: overview(village),
    family_child_village: villageRpc,
  };
  const state = await installStub(ctx, { role: "student", rpc });
  const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "eltern@beispiel.ch", user_metadata: { role: "student", account_type: "parent", account_type_synced: true }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user });
  await ctx.route(`${SUPA}/auth/v1/user*`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(user) }));
  await ctx.route("**/api/billing/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, plan: "family", status: "active", source: "manual", validUntil: "2027-11-16", studentLimit: null, cancelAtPeriodEnd: false, subscriptionStatus: null }) }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|status of [45]\d\d|React DevTools|Download the React|WebGL|GPU/.test(m.text())) problems.push(`[${scope}] console ${m.text().slice(0, 200)}`); });
  return { ctx, page, state };
}
const writes = (state) => state.calls.filter((c) => c.method || (c.rpc && /^(map_|family_set|family_remove|family_leave|rewards_)/.test(c.rpc)));

// ---------------------------------------------------------------- scenarios
const scenarios = {
  /** Shared village: button on the child card -> read-only village, labels only with a company, no shop / coins / drag. */
  async shared(browser) {
    for (const [key, vp] of Object.entries(VIEWPORTS)) {
      scope = `shared ${key}`;
      const { ctx, page, state } = await actor(browser, { vp });
      await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
      const link = page.locator("[data-testid=child-village-link]").first();
      check(await link.waitFor({ timeout: 90000 }).then(() => true, () => false), "child card shows «Dorf ansehen»");
      check((await link.getAttribute("href")) === `/familie/kind/${CHILD}/dorf`, "button links to /familie/kind/c1/dorf", await link.getAttribute("href"));
      await link.click();
      await page.waitForURL(`**/familie/kind/${CHILD}/dorf`, { timeout: 60000 }).catch(() => {});
      check(page.url().endsWith(`/familie/kind/${CHILD}/dorf`), "navigates to the Dorf page", page.url());
      check(await waitSel(page, "[aria-label='3D-Bewerbungsdorf']", 90000), "3D village is rendered");
      check(await waitSel(page, "[data-village-state=ready]"), "page state ready");
      const call = state.calls.find((c) => c.rpc === "family_child_village");
      check(call && call.body.p_child_id === CHILD, "family_child_village called with p_child_id", JSON.stringify(call?.body));
      check(await page.getByText("Nur ansehen").first().isVisible().catch(() => false) || await page.getByLabel("Nur ansehen").first().isVisible().catch(() => false), "«Nur ansehen» badge");
      await page.waitForTimeout(1500);
      check(await page.locator("[data-building=h1]").count() === 1 && await page.locator("[data-building=h1] strong").innerText() === "Swisscom", "house label with company (Swisscom)");
      check(await page.locator("[data-building=h1] button, button[data-building]").count() === 0, "labels are not buttons (no house details)");
      check(!(await page.locator("[data-building=h3]").isVisible().catch(() => false)), "house without company has no visible label");
      const text = await page.evaluate(() => document.body.innerText);
      check(!/\bShop\b|Münzen|Coins|Kaufen|Platzieren|Bearbeiten/i.test(text), "no shop / coins / edit wording", (text.match(/\bShop\b|Münzen|Coins|Kaufen|Platzieren|Bearbeiten/i) ?? [])[0]);
      check(await page.getByRole("button", { name: /shop|kaufen|bearbeiten|platzieren/i }).count() === 0, "no shop / edit buttons");
      check(!text.includes("Informatikerin EFZ"), "no position / application details on the map");
      // Drag across the canvas: only the camera moves, nothing is written.
      const box = await page.locator("[aria-label='3D-Bewerbungsdorf']").boundingBox();
      if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 }); await page.mouse.up(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); }
      await page.waitForTimeout(800);
      check(writes(state).length === 0, "drag/click causes no writes", JSON.stringify(writes(state)));
      check(!(await page.locator("[role=dialog]").isVisible().catch(() => false)), "no house detail dialog after click");
      const back = page.getByRole("link", { name: "Zurück zur Familie" }).first();
      check((await back.getAttribute("href")) === "/familie", "back link to /familie");
      await shot(page, `shared-${key}`);
      await ctx.close();
    }
  },
  /** Village not shared: no button on the card; a direct visit (RPC raises NOT_SHARED) shows the friendly message + back link. */
  async unshared(browser) {
    for (const [key, vp] of Object.entries(VIEWPORTS)) {
      scope = `unshared ${key}`;
      const { ctx, page, state } = await actor(browser, { vp, village: false, villageRpc: { __error: "NOT_SHARED" } });
      await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
      check(await waitSel(page, "text=Das Dorf ist nicht geteilt.", 90000), "card says the village is not shared");
      check(await page.locator("[data-testid=child-village-link]").count() === 0, "no «Dorf ansehen» button");
      await page.goto(`${BASE}/familie/kind/${CHILD}/dorf`, { waitUntil: "domcontentloaded" });
      check(await waitSel(page, "[data-village-state=not_shared]", 90000), "direct visit: not-shared state");
      check(await page.getByText("teilt das Dorf im Moment nicht mit der Familie").isVisible(), "friendly German message");
      check((await page.getByRole("link", { name: "Zurück zur Familie" }).first().getAttribute("href")) === "/familie", "back link");
      check(await page.locator("[aria-label='3D-Bewerbungsdorf']").count() === 0, "no village rendered");
      check(writes(state).length === 0, "no writes");
      await shot(page, `unshared-${key}`);
      await ctx.close();
    }
  },
  /** REAUTH_REQUIRED from the guard: local sign-out, re-login prompt that comes back to this page. */
  async reauth(browser) {
    scope = "reauth desktop";
    const { ctx, page } = await actor(browser, { villageRpc: { __error: "REAUTH_REQUIRED" } });
    await page.goto(`${BASE}/familie/kind/${CHILD}/dorf`, { waitUntil: "domcontentloaded" });
    const next = `/login?next=${encodeURIComponent(`/familie/kind/${CHILD}/dorf`)}`;
    // After the local sign-out the shell sends the parent to the login (same path as every protected family page); if it
    // is still on the page, the re-login prompt must point to the same URL.
    await page.waitForURL(`**${next}`, { timeout: 15000 }).catch(() => {});
    const ok = page.url().endsWith(next) || await waitSel(page, "[data-village-state=reauth]", 5000);
    check(ok, "reauth: login with ?next= back to the Dorf page (or re-login prompt)", page.url());
    if (!page.url().includes("/login")) {
      check(await page.getByText("Bitte melde dich erneut an").first().isVisible(), "re-login heading");
      const href = await page.getByRole("link", { name: "Neu anmelden" }).getAttribute("href");
      check(href === next, "login link returns to the Dorf page", href);
    }
    const token = await page.evaluate(() => localStorage.getItem("sb-localhost-auth-token"));
    check(!token, "local session removed");
    await shot(page, "reauth-desktop");
    await ctx.close();
  },
};

const browser = await launch();
try {
  for (const [name, run] of Object.entries(scenarios)) {
    if (ONLY && !ONLY.has(name)) continue;
    try { await run(browser); } catch (e) { check(false, `${name} crashed`, e.stack?.slice(0, 400)); }
  }
} finally { await browser.close(); }
const failed = results.filter((r) => !r.ok);
for (const p of problems) console.log("WARN", p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${problems.length ? `, ${problems.length} warnings` : ""}`);
process.exit(failed.length ? 1 : 0);
