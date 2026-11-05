// Map interaction check: pan / zoom / pinch / inertia / clamping / drag arbitration with REAL input events (CDP) and frame-time stats.
// Everything runs against a stubbed Supabase (nothing real is touched).
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy next dev --webpack -p 3202
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome binary> BASE=http://localhost:3202 LABEL=after node scripts/map-interaction-e2e.mjs
// Prints PASS/FAIL per check plus frame statistics; writes <OUT>/<LABEL>-stats.json. Exit code 1 when a check fails.
import { writeFileSync, mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3202";
const LABEL = process.env.LABEL || "run";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/v2/map-interaction/`;
mkdirSync(OUT, { recursive: true });
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const sts = ["saved", "preparing", "applied", "interview", "offer", "rejected", "applied", "applied"];
const apps = Array.from({ length: 8 }, (_, i) => ({ id: "a" + i, user_id: "u1", company: "Firma " + i, position: "Job", location: "Bern", status: sts[i], category: "software", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" }));
const results = []; const stats = {};
const check = (name, ok, info = "") => { results.push({ name, ok: !!ok, info }); console.log(ok ? "PASS" : "FAIL", name, info); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const round = (n, d = 2) => Number(n.toFixed(d));
// Island 1 + margin: the camera target must never rest further outside the land than this (grid cells).
const LAND = { x0: -10, x1: 33, z0: -7, z1: 20 }; const MARGIN = 6;
const inLand = (c) => c.x >= LAND.x0 - MARGIN && c.x <= LAND.x1 + MARGIN && c.z >= LAND.z0 - MARGIN && c.z <= LAND.z1 + MARGIN;

async function setup(vp, touch) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("sb-localhost-auth-token")) localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, session);
  const st = { balance: 3500, earned: 3500, rewardCount: 35, items: [{ id: "bench-x", itemType: "bench", x: 22, z: 2, rotation: 0, createdAt: "2026-11-04" }], layouts: [] };
  const db = { unlocked: 1, calls: [] };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method(); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p === "/rest/v1/applications") return json(apps);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop(); let b = {}; try { b = route.request().postDataJSON() || {}; } catch {}
      db.calls.push([rpc, b]);
      if (rpc === "map_shop_state") return json(st);
      if (rpc === "map_shop_buy") { st.items.push({ id: b.p_request_id, itemType: b.p_item_type, x: null, z: null, rotation: 0, createdAt: "2026-11-04" }); return json(st); }
      if (rpc === "map_shop_place") { const it = st.items.find((i) => i.id === b.p_item_id); it.x = b.p_x ?? null; it.z = b.p_z ?? null; return json(st); }
      if (rpc === "map_move_object") { st.layouts = st.layouts.filter((l) => l.id !== b.p_object_id); st.layouts.push({ id: b.p_object_id, x: b.p_x, z: b.p_z, rotation: b.p_rotation }); return json(st); }
      if (rpc === "map_islands_state") return json({ unlocked: db.unlocked });
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage(); const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  await page.goto(BASE + "/map"); await page.waitForSelector("[data-map-renderer]", { timeout: 90000 }); await sleep(3000);
  const cdp = await ctx.newCDPSession(page);
  const host = page.locator("[role=region]").first();
  const api = {
    browser, page, cdp, host, logs, st, db,
    box: () => host.boundingBox(),
    cam: () => host.evaluate((h) => h.__map.camera()),
    ground: (x, y) => host.evaluate((h, [a, b]) => h.__map.ground(a, b), [x, y]),
    project: (x, z) => host.evaluate((h, [a, b]) => h.__map.project(a, b), [x, z]),
    house: (id) => host.evaluate((h, i) => h.__map.house(i), id),
    counters: () => host.evaluate((h) => ({ ...h.__map.stats })),
    scrollY: () => page.evaluate(() => window.scrollY),
    state: () => host.evaluate((h) => ({ drag: h.dataset.dragState ?? null })),
    touch: (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 4, radiusY: 4, force: 1 })) }),
    wheel: (x, y, dy, ctrl = false) => cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy, modifiers: ctrl ? 2 : 0 }),
    async mouseDrag(from, to, steps, stepMs, hold = 0) {
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await sleep(stepMs); }
      if (hold) await sleep(hold);
    },
    async swipe(from, to, steps, stepMs, end = true) {
      await api.touch("touchStart", [from]);
      for (let i = 1; i <= steps; i++) { await api.touch("touchMove", [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }]); await sleep(stepMs); }
      if (end) await api.touch("touchEnd", []);
    },
    async measure(name, fn) {
      await page.evaluate(() => {
        const s = (window.__fs = { d: [], lt: [], last: performance.now(), stop: false });
        try { s.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) s.lt.push(e.duration); }); s.obs.observe({ entryTypes: ["longtask"] }); } catch {}
        const tick = (t) => { s.d.push(t - s.last); s.last = t; if (!s.stop) requestAnimationFrame(tick); };
        requestAnimationFrame((t) => { s.last = t; requestAnimationFrame(tick); });
      });
      const before = await api.counters();
      const out = await fn();
      const raw = await page.evaluate(() => { const s = window.__fs; s.stop = true; s.obs?.disconnect(); return { d: s.d, lt: s.lt }; });
      const after = await api.counters();
      const d = raw.d.slice(1).sort((a, b) => a - b); const sum = d.reduce((a, b) => a + b, 0);
      const q = (p) => d.length ? d[Math.min(d.length - 1, Math.floor(d.length * p))] : 0;
      const s = { frames: d.length, meanMs: round(sum / Math.max(1, d.length), 1), p95Ms: round(q(0.95), 1), maxMs: round(d.at(-1) ?? 0, 1), jankFrames: d.filter((x) => x > 50).length, longTasks: raw.lt.length, longTaskMs: round(raw.lt.reduce((a, b) => a + b, 0), 0), zoomReports: after.zoomChange - before.zoomChange, populate: after.populate - before.populate, setShop: after.setShop - before.setShop, shopRebuild: (after.shopRebuild ?? after.setShop) - (before.shopRebuild ?? before.setShop) };
      stats[name] = s; console.log("STAT", name, JSON.stringify(s));
      return out;
    },
  };
  return api;
}

async function desktop() {
  const t = await setup({ w: 900, h: 640 }, false);
  const { page } = t;
  const b = await t.box(); const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.screenshot({ path: `${OUT}${LABEL}-desktop-0-start.png` });
  const start = await t.cam();
  check("desktop: camera hook available + starts at zoom 1", start && near(start.zoom, 1, 0.01), JSON.stringify(start));

  // --- wheel zoom anchored at the cursor ---
  const cursor = { x: c.x + 260, y: c.y - 90 };
  await page.mouse.move(cursor.x, cursor.y);
  const g0 = await t.ground(cursor.x, cursor.y); const scroll0 = await t.scrollY();
  await t.measure("desktop wheel zoom (12 ticks)", async () => { for (let i = 0; i < 12; i++) { await t.wheel(cursor.x, cursor.y, -100); await sleep(30); } await sleep(900); });
  const z1 = await t.cam(); const g1 = await t.ground(cursor.x, cursor.y);
  check("wheel: zooms in", z1.zoom > start.zoom * 1.5, `zoom ${round(z1.zoom)}`);
  check("wheel: point under the cursor stays put (anchored zoom)", Math.hypot(g1.x - g0.x, g1.z - g0.z) < 0.25, `drift ${round(Math.hypot(g1.x - g0.x, g1.z - g0.z))} cells`);
  check("wheel: page does not scroll", (await t.scrollY()) === scroll0, `scrollY ${await t.scrollY()}`);
  for (let i = 0; i < 40; i++) { await t.wheel(cursor.x, cursor.y, -120); await sleep(10); } await sleep(900);
  const zmax = await t.cam(); check("wheel: zoom clamped to max 2.4", zmax.zoom <= 2.4 + 0.01, `zoom ${round(zmax.zoom, 3)}`);
  for (let i = 0; i < 80; i++) { await t.wheel(cursor.x, cursor.y, 120); await sleep(10); } await sleep(1200);
  const zmin = await t.cam(); check("wheel: zoom clamped to min 0.4", zmin.zoom >= 0.4 - 0.01, `zoom ${round(zmin.zoom, 3)}`);
  check("wheel: zoomed-out camera still over the land", inLand(zmin), JSON.stringify(zmin));
  await page.screenshot({ path: `${OUT}${LABEL}-desktop-1-zoomed-out.png` });

  // --- ctrl+wheel (trackpad pinch) ---
  for (let i = 0; i < 30; i++) { await t.wheel(cursor.x, cursor.y, -60, true); await sleep(10); } await sleep(900); // normalise
  const p0 = await t.ground(cursor.x, cursor.y); const pz0 = await t.cam();
  await t.measure("desktop ctrl+wheel pinch (20 ticks)", async () => { for (let i = 0; i < 20; i++) { await t.wheel(cursor.x, cursor.y, 8 * (i % 2 ? -1 : -1), true); await sleep(16); } await sleep(700); });
  const p1 = await t.ground(cursor.x, cursor.y); const pz1 = await t.cam();
  check("ctrl+wheel: changes zoom without scrolling the page", pz1.zoom !== pz0.zoom && (await t.scrollY()) === scroll0, `zoom ${round(pz0.zoom)} -> ${round(pz1.zoom)}`);
  check("ctrl+wheel: anchored at cursor", Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.25, `drift ${round(Math.hypot(p1.x - p0.x, p1.z - p0.z))}`);

  // --- reset to zoom 1 via toolbar ---
  await page.getByRole("button", { name: "Kamera zentrieren" }).click(); await sleep(2200);
  const reset = await t.cam(); check("toolbar: center button resets zoom to 100 %", near(reset.zoom, 1, 0.03), JSON.stringify(reset));

  // --- mouse pan ---
  await page.mouse.move(c.x, c.y);
  const m0 = await t.ground(c.x - 150, c.y);
  await t.measure("desktop mouse pan (60 moves)", async () => { await t.mouseDrag({ x: c.x - 150, y: c.y }, { x: c.x + 60, y: c.y + 70 }, 60, 16, 250); });
  const mid = await t.ground(c.x + 60, c.y + 70);
  check("mouse pan: grabbed ground point follows the cursor 1:1", Math.hypot(mid.x - m0.x, mid.z - m0.z) < 0.3, `error ${round(Math.hypot(mid.x - m0.x, mid.z - m0.z))} cells`);
  await page.mouse.up(); await sleep(700);

  // --- mouse pan far outside: clamped / rubber-band back ---
  for (let k = 0; k < 6; k++) { await t.mouseDrag({ x: c.x - 380, y: c.y }, { x: c.x + 380, y: c.y }, 8, 8); await page.mouse.up(); await sleep(50); }
  await sleep(2500);
  const far = await t.cam(); check("clamp: camera cannot be dragged off the islands", inLand(far), JSON.stringify(far));
  for (let k = 0; k < 6; k++) { await t.mouseDrag({ x: c.x + 380, y: c.y + 200 }, { x: c.x - 380, y: c.y - 200 }, 8, 8); await page.mouse.up(); await sleep(50); }
  await sleep(2500);
  const far2 = await t.cam(); check("clamp: same in the opposite direction", inLand(far2), JSON.stringify(far2));
  await page.screenshot({ path: `${OUT}${LABEL}-desktop-2-clamped.png` });

  // --- zoom buttons ---
  await page.getByRole("button", { name: "Kamera zentrieren" }).click(); await sleep(1800);
  await page.getByRole("button", { name: "Vergrößern" }).click(); await sleep(1200);
  const zi = await t.cam(); check("toolbar: zoom in button -> ~120 %", near(zi.zoom, 1.2, 0.05), `zoom ${round(zi.zoom, 3)}`);
  await page.getByRole("button", { name: "Verkleinern" }).click(); await sleep(1200);
  const zo = await t.cam(); check("toolbar: zoom out button -> ~100 %", near(zo.zoom, 1, 0.05), `zoom ${round(zo.zoom, 3)}`);
  const label = await page.locator("button[title='Zoom zurücksetzen']").innerText();
  check("toolbar: percentage label in sync with camera", label.includes(String(Math.round(zo.zoom * 100))), label.trim());

  // --- keyboard still focusable, no page error ---
  await t.host.focus(); await page.keyboard.press("ArrowRight");
  const real = t.logs.filter((l) => !/favicon|Failed to load resource.*(404|400)/.test(l));
  check("desktop: no console errors", real.length === 0, JSON.stringify(real.slice(0, 3)));
  await t.browser.close();
}

async function placement() {
  // Hovering/clicking while placing must not rebuild the scene.
  const t = await setup({ w: 900, h: 640 }, false);
  const { page } = t;
  await page.getByRole("button", { name: /Zierbaum kaufen/ }).click(); await sleep(1200);
  const b = await t.box();
  const before = await t.counters();
  await t.measure("desktop placement (8 clicks + 40 hovers)", async () => {
    for (let i = 0; i < 8; i++) { await page.mouse.click(b.x + b.width * (0.35 + 0.04 * i), b.y + b.height * 0.5); await sleep(120); }
    for (let i = 0; i < 40; i++) { await page.mouse.move(b.x + 200 + i * 6, b.y + 300); await sleep(16); }
  });
  const after = await t.counters();
  const rebuilds = (after.shopRebuild ?? after.setShop) - (before.shopRebuild ?? before.setShop);
  check("placement: clicks do not rebuild the whole scene (populate)", after.populate - before.populate === 0, `populate +${after.populate - before.populate}`);
  check("placement: clicks do not rebuild all shop models", rebuilds <= 1, `full shop rebuilds +${rebuilds}, setShop calls +${after.setShop - before.setShop}`);
  await t.browser.close();
}

async function mobile() {
  const t = await setup({ w: 390, h: 844 }, true);
  const { page } = t;
  await page.evaluate(() => window.scrollTo(0, 0));
  const scrollable = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
  await page.locator("[role=region]").first().scrollIntoViewIfNeeded(); await sleep(300);
  const b = await t.box(); const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  check("mobile: page is scrollable (so scroll conflicts are testable)", scrollable > 50, `${scrollable}px`);
  const s0 = await t.scrollY(); const start = await t.cam();
  await page.screenshot({ path: `${OUT}${LABEL}-mobile-0-start.png` });

  // --- one-finger pan ---
  const grab = { x: c.x - 90, y: c.y + 30 }; const target = { x: c.x + 70, y: c.y - 40 };
  const g0 = await t.ground(grab.x, grab.y);
  await t.measure("mobile 1-finger pan (40 moves)", async () => {
    await t.touch("touchStart", [grab]);
    for (let i = 1; i <= 40; i++) { await t.touch("touchMove", [{ x: grab.x + (target.x - grab.x) * i / 40, y: grab.y + (target.y - grab.y) * i / 40 }]); await sleep(16); }
    await sleep(160); // hold still: no inertia afterwards
    const g1 = await t.ground(target.x, target.y);
    check("touch pan: grabbed ground point follows the finger 1:1", Math.hypot(g1.x - g0.x, g1.z - g0.z) < 0.35, `error ${round(Math.hypot(g1.x - g0.x, g1.z - g0.z))} cells`);
    await t.touch("touchEnd", []); await sleep(500);
  });
  check("touch pan: page does not scroll", (await t.scrollY()) === s0, `scrollY ${s0} -> ${await t.scrollY()}`);
  const moved = await t.cam(); check("touch pan: camera moved", Math.hypot(moved.x - start.x, moved.z - start.z) > 1, JSON.stringify(moved));

  // --- vertical swipe over the map must not scroll the page either ---
  await t.swipe({ x: c.x, y: c.y + 100 }, { x: c.x, y: c.y - 100 }, 12, 12); await sleep(600);
  check("touch swipe up over the map: page does not scroll", (await t.scrollY()) === s0, `scrollY ${await t.scrollY()}`);

  // --- inertia: fast flick keeps moving after release, then stops ---
  await page.getByRole("button", { name: "Kamera zentrieren" }).click(); await sleep(1800);
  const f0 = await t.cam();
  await t.swipe({ x: c.x - 120, y: c.y }, { x: c.x + 60, y: c.y }, 6, 12, false);
  const atRelease = await t.cam(); await t.touch("touchEnd", []);
  await sleep(120); const after120 = await t.cam(); await sleep(500); const after620 = await t.cam(); await sleep(2500); const settled = await t.cam(); await sleep(500); const still = await t.cam();
  const travelled = (a, z) => Math.hypot(a.x - z.x, a.z - z.z);
  check("inertia: camera keeps gliding after the finger lifts", travelled(atRelease, after620) > 1, `glide ${round(travelled(atRelease, after620))} cells`);
  check("inertia: comes to rest (no endless drift)", travelled(settled, still) < 0.05, `drift ${round(travelled(settled, still), 3)}`);
  check("inertia: ended inside the land", inLand(settled), JSON.stringify(settled));
  // new touch cancels inertia
  await page.getByRole("button", { name: "Kamera zentrieren" }).click(); await sleep(1800);
  await t.swipe({ x: c.x - 120, y: c.y }, { x: c.x + 60, y: c.y }, 6, 12); await sleep(80);
  const glide1 = await t.cam(); await t.touch("touchStart", [{ x: c.x, y: c.y + 60 }]); await sleep(60); const glide2 = await t.cam(); await sleep(200); const glide3 = await t.cam(); await t.touch("touchEnd", []);
  check("inertia: touching the map stops the glide", travelled(glide2, glide3) < 0.05, `moved after touch ${round(travelled(glide2, glide3), 3)} (before ${round(travelled(glide1, glide2))})`);

  // --- pinch zoom + pan ---
  await page.getByRole("button", { name: "Kamera zentrieren" }).click(); await sleep(1800);
  const mid = { x: c.x + 40, y: c.y - 30 }; const gp0 = await t.ground(mid.x, mid.y); const pz0 = await t.cam();
  await t.measure("mobile pinch (30 moves)", async () => {
    await t.touch("touchStart", [{ x: mid.x - 50, y: mid.y, id: 0 }, { x: mid.x + 50, y: mid.y, id: 1 }]);
    for (let i = 1; i <= 30; i++) { const d = 50 + i * 2.5; await t.touch("touchMove", [{ x: mid.x - d, y: mid.y, id: 0 }, { x: mid.x + d, y: mid.y, id: 1 }]); await sleep(16); }
    await sleep(150);
    const gp1 = await t.ground(mid.x, mid.y); const pz1 = await t.cam();
    check("pinch: zoom follows finger distance (3x spread)", near(pz1.zoom / pz0.zoom, 125 / 50, 0.35) || pz1.zoom >= 2.35, `zoom ${round(pz0.zoom)} -> ${round(pz1.zoom)}`);
    check("pinch: midpoint stays anchored on the same ground point", Math.hypot(gp1.x - gp0.x, gp1.z - gp0.z) < 0.4, `drift ${round(Math.hypot(gp1.x - gp0.x, gp1.z - gp0.z))} cells`);
    // pan with the pinch: move both fingers 80px to the right
    const gq0 = await t.ground(mid.x, mid.y);
    for (let i = 1; i <= 10; i++) { const d = 125; await t.touch("touchMove", [{ x: mid.x - d + i * 8, y: mid.y, id: 0 }, { x: mid.x + d + i * 8, y: mid.y, id: 1 }]); await sleep(16); }
    await sleep(120);
    const gq1 = await t.ground(mid.x + 80, mid.y);
    check("pinch: two-finger pan moves the map with the fingers", Math.hypot(gq1.x - gq0.x, gq1.z - gq0.z) < 0.4, `error ${round(Math.hypot(gq1.x - gq0.x, gq1.z - gq0.z))} cells`);
    await t.touch("touchEnd", []); await sleep(500);
  });
  check("pinch: page does not scroll", (await t.scrollY()) === s0);
  await page.screenshot({ path: `${OUT}${LABEL}-mobile-1-pinched.png` });
  // pinch out hard: zoom clamp
  await t.touch("touchStart", [{ x: c.x - 10, y: c.y, id: 0 }, { x: c.x + 10, y: c.y, id: 1 }]);
  for (let i = 1; i <= 25; i++) { await t.touch("touchMove", [{ x: c.x - 10 - i * 6, y: c.y, id: 0 }, { x: c.x + 10 + i * 6, y: c.y, id: 1 }]); await sleep(12); }
  await t.touch("touchEnd", []); await sleep(1500);
  const zc = await t.cam(); check("pinch: zoom clamped to max 2.4", zc.zoom <= 2.41, `zoom ${round(zc.zoom, 3)}`);
  await page.getByRole("button", { name: "Kamera zentrieren" }).click(); await sleep(1800);

  // --- arbitration: long press on a house starts an item drag, early movement pans ---
  const h = await t.house("a0"); const hp = await t.project(h.x, h.z);
  const hostBox = await t.box();
  const onScreen = hp.y > hostBox.y + 20 && hp.y < hostBox.y + hostBox.height - 20 && hp.x > hostBox.x + 20 && hp.x < hostBox.x + hostBox.width - 20;
  check("arbitration: test house is on screen", onScreen, JSON.stringify(hp));
  const cam0 = await t.cam();
  await t.touch("touchStart", [hp]); await sleep(520);
  const st1 = await t.state(); const cam1 = await t.cam();
  check("long press on a house arms the item drag", st1.drag !== null, JSON.stringify(st1));
  for (let i = 1; i <= 12; i++) { await t.touch("touchMove", [{ x: hp.x + i * 4, y: hp.y + i * 2 }]); await sleep(16); }
  const cam2 = await t.cam();
  check("while dragging an item the camera does not pan", travelled(cam1, cam2) < 0.02 && travelled(cam0, cam1) < 0.02, `camera moved ${round(travelled(cam0, cam2), 3)}`);
  await t.touch("touchEnd", []); await sleep(600);
  // early movement: pan, no drag
  const cam3 = await t.cam();
  await t.touch("touchStart", [hp]); await sleep(40);
  let sawDrag = false;
  for (let i = 1; i <= 25; i++) { await t.touch("touchMove", [{ x: hp.x + i * 5, y: hp.y }]); await sleep(24); if ((await t.state()).drag) sawDrag = true; }
  await sleep(500);
  const cam4 = await t.cam(); await t.touch("touchEnd", []);
  check("moving before 350 ms pans the camera and never starts an item drag", travelled(cam3, cam4) > 1 && !sawDrag, `camera moved ${round(travelled(cam3, cam4))}, drag seen: ${sawDrag}`);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}${LABEL}-mobile-2-after-gestures.png` });

  // --- tab hidden: render loop pauses ---
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await sleep(200); const f1 = (await t.counters()).frames; await sleep(600); const f2 = (await t.counters()).frames;
  check("hidden tab: render loop paused", f2 - f1 <= 1, `frames while hidden: ${f2 - f1}`);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await sleep(400); const f3 = (await t.counters()).frames; await sleep(400); const f4 = (await t.counters()).frames;
  check("visible again: render loop resumes", f4 - f3 > 2, `frames: ${f4 - f3}`);

  const real = t.logs.filter((l) => !/favicon|Failed to load resource.*(404|400)/.test(l));
  check("mobile: no console errors", real.length === 0, JSON.stringify(real.slice(0, 3)));
  await t.browser.close();
}

try {
  if (process.env.ONLY !== "mobile" && process.env.ONLY !== "placement") await desktop();
  if (process.env.ONLY !== "desktop" && process.env.ONLY !== "mobile") await placement();
  if (process.env.ONLY !== "desktop" && process.env.ONLY !== "placement") await mobile();
} catch (e) { check("script error", false, String(e.stack).split("\n").slice(0, 5).join(" | ")); }
writeFileSync(`${OUT}${LABEL}-stats.json`, JSON.stringify({ label: LABEL, stats, results }, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
