// Mobile village / placement e2e: phones + tablet (WebKit for iPhone/iPad, Chromium for Android), isMobile + hasTouch.
// Runs against a STUBBED Supabase (stateful, nothing real is touched; the stub keeps its state across reloads of one context).
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy npx next dev --webpack -p 3231
//   PLAYWRIGHT=<playwright-core/index.mjs> [PLAYWRIGHT_WEBKIT=<playwright-core whose WebKit build is installed, e.g. 1.65>] CHROME=<chrome binary> BASE=http://localhost:3231 node scripts/mobile-village-e2e.mjs
// Env:
//   MODE=test|shots|all (default all)   test = real touch flow, shots = screenshots of shop / placement / selected item per device
//   SHOTS=<dir>                          screenshot folder (default ~/Projects/bewerbungen-tracker-wt/_mobile/shots/after/village)
//   DEVICES=iphone-se,pixel-7,…          subset of devices (ids below)
// Touch flow (per test device): tap «Laden» -> tap «Kaufen» (Sport-Roller Limette) -> tap a tile (ghost moves) -> «Drehen» -> «Platzieren»
// -> reload: item persisted -> move by long-press drag (dispatched touch / pointer events) -> reload: new position persisted
// -> «Verschieben» + tap tile + «Platzieren» -> «Einlagern» (back to inventory) -> reload: in the inventory. Plus pinch zoom + one-finger pan
// without page scroll, and the bottom nav hidden while a sheet / placement is open (all actions >= 44px and inside the viewport).
// Exit code 1 when a check fails.
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_WEBKIT || process.env.PLAYWRIGHT || join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")).href);
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:3231";
const MODE = process.env.MODE || "all";
const SHOTS = (process.env.SHOTS || join(homedir(), "Projects/bewerbungen-tracker-wt/_mobile/shots/after/village")).replace(/\/$/, "");
mkdirSync(SHOTS, { recursive: true });

const DEVICES = [
  { id: "iphone-se", engine: "webkit", w: 375, h: 667 },
  { id: "iphone-15", engine: "webkit", w: 393, h: 852, dark: true, test: true },
  { id: "iphone-15-pro-max", engine: "webkit", w: 430, h: 932 },
  { id: "pixel-7", engine: "chromium", w: 412, h: 915, dark: true, test: true },
  { id: "landscape-844x390", engine: "webkit", w: 844, h: 390, test: true },
  { id: "ipad", engine: "webkit", w: 820, h: 1180 },
].filter((d) => !process.env.DEVICES || process.env.DEVICES.split(",").includes(d.id));

const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const statuses = ["applied", "interview", "saved", "preparing", "rejected", "applied"];
const apps = statuses.map((status, i) => ({ id: "a" + i, user_id: "u1", company: "Firma " + i, position: "Lehrstelle " + i, location: "Bern", status, category: "software", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" }));

let failures = 0;
const check = (ok, text, info = "") => { console.log(ok ? "PASS" : "FAIL", text, ok ? "" : info); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browsers = {};
async function browserFor(engine) {
  if (!browsers[engine]) browsers[engine] = engine === "webkit" ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  return browsers[engine];
}

async function open(device, dark) {
  const browser = await browserFor(device.engine);
  const ctx = await browser.newContext({ viewport: { width: device.w, height: device.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(([s, theme]) => {
    localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s));
    localStorage.setItem("wendapply-theme", theme);
  }, [session, dark ? "dark" : "light"]);
  const st = { balance: 600, earned: 600, rewardCount: 6, items: [], layouts: [] };
  const calls = [];
  await ctx.route("**://localhost:54321/**", async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname; const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p.startsWith("/storage/")) return json([]);
    if (p === "/rest/v1/applications") return json(apps);
    if (p === "/rest/v1/map_shop_catalog") return json([]);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop(); let b = {}; try { b = req.postDataJSON() || {}; } catch { /* no body */ }
      calls.push([rpc, b]);
      if (rpc === "map_shop_state") return json(st);
      if (rpc === "map_shop_buy") { st.balance -= 120; if (!st.items.some((i) => i.id === b.p_request_id)) st.items.push({ id: b.p_request_id, itemType: b.p_item_type, x: null, z: null, rotation: 0, createdAt: "2026-11-18" }); return json(st); }
      if (rpc === "map_shop_place") { const it = st.items.find((i) => i.id === b.p_item_id); Object.assign(it, { x: b.p_x ?? null, z: b.p_z ?? null, rotation: b.p_rotation ?? 0 }); return json(st); }
      if (rpc === "map_move_object") { st.layouts = st.layouts.filter((l) => l.id !== b.p_object_id); st.layouts.push({ id: b.p_object_id, x: b.p_x, z: b.p_z, rotation: b.p_rotation }); return json(st); }
      if (rpc === "map_islands_state") return json({ unlocked: 1 });
      if (rpc === "my_access") return json({ has_access: true, state: "active", reason: "none", role: "student", enforced: false, blocked: false });
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  const logs = [];
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  await page.goto(BASE + "/map");
  await page.waitForSelector("[data-map-fullscreen] [data-map-renderer]", { timeout: 120000 });
  await sleep(2500);
  return { ctx, page, st, calls, logs };
}

const host = (page) => page.locator("[role=region][aria-label='3D-Bewerbungsdorf']");
const project = (page, x, z) => host(page).evaluate((h, [a, b]) => h.__map.project(a, b), [x, z]);
async function tap(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(400);
}
/** Layout facts: bottom nav state, stage, and every visible control of a container (inside viewport, >= 44px, not under the nav). */
async function layout(page, selector) {
  return page.evaluate((sel) => {
    const nav = document.querySelector('nav[aria-label="Hauptmenü mobil"]');
    const nr = nav?.getBoundingClientRect();
    const navShown = !!nav && getComputedStyle(nav).display !== "none" && nr.height > 0;
    const stage = document.querySelector("[data-map-fullscreen]").getBoundingClientRect();
    const root = sel ? document.querySelector(sel) : null;
    const rb = root?.getBoundingClientRect();
    const controls = root ? [...root.querySelectorAll("button, input")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && !el.closest("[hidden]"); }).map((el) => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 28), tag: el.tagName, t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height }; }) : [];
    return { ih: innerHeight, iw: innerWidth, sh: document.scrollingElement.scrollHeight, navShown, navTop: navShown ? nr.top : innerHeight, hideFlag: document.documentElement.dataset.hideBottomNav ?? null, stage: { t: stage.top, b: stage.bottom, h: stage.height }, root: rb ? { t: rb.top, b: rb.bottom, l: rb.left, r: rb.right } : null, controls };
  }, selector);
}
function checkControls(name, m) {
  const limit = Math.min(m.ih, m.navTop);
  const out = m.controls.filter((c) => c.t < -0.5 || c.l < -0.5 || c.r > m.iw + 0.5 || c.b > limit + 0.5);
  check(m.root && out.length === 0, `${name}: all ${m.controls.length} actions visible above the bottom nav / screen edge`, JSON.stringify(out));
  const small = m.controls.filter((c) => c.tag !== "INPUT" && (c.w < 43.5 || c.h < 43.5));
  check(small.length === 0, `${name}: actions >= 44px`, JSON.stringify(small));
  check(m.sh <= m.ih + 1, `${name}: no page scroll (${m.sh} <= ${m.ih})`);
  check(Math.abs(m.stage.b - (m.navShown ? m.navTop : m.ih)) <= 1.5, `${name}: map fills the viewport down to the nav / screen edge (no empty strip)`, JSON.stringify({ stageB: m.stage.b, navTop: m.navTop, ih: m.ih, navShown: m.navShown }));
}

/** Free 1x1 cell close to the current placement whose screen point is in the upper part of the map (not under the toolbar). */
async function tapFreeTile(page, avoid) {
  const tools = page.locator('[aria-label="Gegenstand platzieren"]');
  const toolsTop = (await tools.boundingBox())?.y ?? (await page.viewportSize()).height;
  const base = await page.evaluate(() => ({ x: Number(document.querySelector('input[aria-label="Position X"]')?.value), z: Number(document.querySelector('input[aria-label="Position Z"]')?.value) }));
  for (const [dx, dz] of [[2, 0], [0, -2], [-2, 0], [2, -2], [-2, -2], [3, 1], [-3, 1], [1, -3], [4, 0], [0, -4], [-4, 0]]) {
    const target = { x: base.x + dx, z: base.z + dz };
    if (avoid && avoid.x === target.x && avoid.z === target.z) continue;
    const p = await project(page, target.x + 0.5, target.z + 0.5);
    const vp = page.viewportSize();
    if (p.y < 80 || p.y > toolsTop - 20 || p.x < 30 || p.x > vp.width - 70) continue;
    await page.touchscreen.tap(p.x, p.y);
    await sleep(500);
    const now = await page.evaluate(() => ({ x: Number(document.querySelector('input[aria-label="Position X"]')?.value), z: Number(document.querySelector('input[aria-label="Position Z"]')?.value) }));
    const ok = await page.getByRole("button", { name: /^Platzieren/ }).isEnabled();
    if (now.x === target.x && now.z === target.z && ok) return target;
  }
  return null;
}

/** Touch gesture with dispatched events: CDP touch events in Chromium (real input pipeline), synthetic PointerEvents in WebKit. */
async function touchGesture(page, engine, tracks, { holdMs = 0, steps = 8, stepMs = 25 } = {}) {
  if (engine === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const at = (i) => tracks.map((t, id) => ({ x: t.from.x + (t.to.x - t.from.x) * i / steps, y: t.from.y + (t.to.y - t.from.y) * i / steps, id, radiusX: 4, radiusY: 4, force: 1 }));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
    if (holdMs) await sleep(holdMs);
    for (let i = 1; i <= steps; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(i) }); await sleep(stepMs); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    return;
  }
  await host(page).evaluate(async (h, [tracks, holdMs, steps, stepMs]) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const fire = (type, t, i, id) => {
      const x = t.from.x + (t.to.x - t.from.x) * i / steps; const y = t.from.y + (t.to.y - t.from.y) * i / steps;
      const target = type === "pointerdown" ? (document.elementFromPoint(x, y) ?? h) : h;
      target.dispatchEvent(new PointerEvent(type, { pointerId: 100 + id, pointerType: "touch", isPrimary: id === 0, clientX: x, clientY: y, button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true, composed: true }));
    };
    tracks.forEach((t, id) => fire("pointerdown", t, 0, id));
    if (holdMs) await wait(holdMs);
    for (let i = 1; i <= steps; i++) { tracks.forEach((t, id) => fire("pointermove", t, i, id)); await wait(stepMs); }
    tracks.forEach((t, id) => fire("pointerup", t, steps, id));
  }, [tracks, holdMs, steps, stepMs]);
}

async function shots(device, dark) {
  const name = `${device.id}${dark ? "-dark" : ""}`;
  const { ctx, page, logs } = await open(device, dark);
  await page.screenshot({ path: `${SHOTS}/${name}-0-map.png` });
  await tap(page, page.getByRole("button", { name: "Laden", exact: true }));
  await sleep(600);
  await page.screenshot({ path: `${SHOTS}/${name}-1-shop.png` });
  const buy = page.locator('[data-item="scooter_sport_lime"] button');
  await tap(page, buy);
  await page.locator('[aria-label="Gegenstand platzieren"]').waitFor({ timeout: 20000 }).catch(() => {});
  await sleep(1200);
  await page.screenshot({ path: `${SHOTS}/${name}-2-placing.png` });
  const placeButton = page.getByRole("button", { name: /^Platzieren/ });
  if (await placeButton.count()) await tap(page, placeButton);
  await sleep(1200);
  await page.screenshot({ path: `${SHOTS}/${name}-3-selected.png` });
  console.log("SHOT", name, logs.length ? JSON.stringify(logs.slice(0, 2)) : "");
  await ctx.close();
}

async function flow(device) {
  const N = device.id;
  const { ctx, page, st, logs } = await open(device, false);
  const before = await layout(page, null);
  check(before.navShown || before.iw >= 768, `${N}: bottom nav visible on the plain map`);

  // 1. open the shop by touch
  await tap(page, page.getByRole("button", { name: "Laden", exact: true }));
  await page.locator('[data-sheet="shop"]').waitFor();
  await sleep(500);
  const shop = await layout(page, '[data-sheet="shop"]');
  check(shop.iw >= 768 || !shop.navShown, `${N}: bottom nav hidden while the shop sheet is open`, JSON.stringify({ navShown: shop.navShown, flag: shop.hideFlag }));
  check(shop.root && shop.root.b <= Math.min(shop.ih, shop.navTop) + 0.5, `${N}: shop sheet fully above the nav / screen edge`, JSON.stringify(shop.root));

  // 2. buy -> placement mode with ghost
  await tap(page, page.locator('[data-item="scooter_sport_lime"] button'));
  const tools = page.locator('[aria-label="Gegenstand platzieren"]');
  await tools.waitFor({ timeout: 20000 });
  await sleep(1200);
  const placing = await layout(page, '[aria-label="Gegenstand platzieren"]');
  checkControls(`${N} placing`, placing);
  for (const label of [/^Platzieren/, /^Drehen/, /^Abbrechen/]) check(await page.getByRole("button", { name: label }).isVisible(), `${N}: action ${label} visible while placing`);
  const item = st.items.at(-1);
  check(item && item.itemType === "scooter_sport_lime" && item.x === null, `${N}: bought item is in the inventory (not placed yet)`);

  // 3. tap a tile -> ghost moves there; rotate; confirm
  const target = await tapFreeTile(page);
  check(target !== null, `${N}: tap on a free tile moves the ghost there`, JSON.stringify(target));
  await tap(page, page.getByRole("button", { name: /^Drehen/ }));
  await tap(page, page.getByRole("button", { name: /^Platzieren/ }));
  await sleep(800);
  check(target && item.x === target.x && item.z === target.z && item.rotation === 1, `${N}: placed + rotated on the tapped tile (server state)`, JSON.stringify(item));

  // 4. reload -> persisted
  await page.reload();
  await page.waitForSelector("[data-map-fullscreen] [data-map-renderer]", { timeout: 120000 });
  await sleep(2500);
  const persisted = await host(page).evaluate((h, [x, z]) => { const p = h.__map.project(x + 0.5, z + 0.5); return h.__map.movableAt(p.x, p.y); }, [item.x, item.z]);
  check(persisted, `${N}: after reload the item is on its tile`);

  // 5. drag to move (long-press, then drag)
  const from = await project(page, item.x + 0.5, item.z + 0.5);
  const to = await project(page, item.x + 2.5, item.z + 0.5);
  const prev = { x: item.x, z: item.z };
  await touchGesture(page, device.engine, [{ from, to }], { holdMs: 600, steps: 10, stepMs: 30 });
  await sleep(1200);
  check(item.x !== prev.x || item.z !== prev.z, `${N}: long-press drag moved the item`, JSON.stringify({ prev, now: { x: item.x, z: item.z } }));
  await page.reload();
  await page.waitForSelector("[data-map-fullscreen] [data-map-renderer]", { timeout: 120000 });
  await sleep(2500);
  const moved = await host(page).evaluate((h, [x, z]) => { const p = h.__map.project(x + 0.5, z + 0.5); return h.__map.movableAt(p.x, p.y); }, [item.x, item.z]);
  check(moved, `${N}: moved position persisted after reload`);

  // 6. select by tap -> toolbar with Verschieben / Einlagern; Verschieben + tap tile + Platzieren
  const at = await project(page, item.x + 0.5, item.z + 0.5);
  await page.touchscreen.tap(at.x, at.y);
  await sleep(600);
  const selected = page.locator('[aria-label="Ausgewählter Gegenstand"]');
  check(await selected.isVisible(), `${N}: tap on the item selects it`);
  const sel = await layout(page, '[aria-label="Ausgewählter Gegenstand"]');
  checkControls(`${N} selected`, sel);
  await tap(page, selected.getByRole("button", { name: /Verschieben/ }));
  await tools.waitFor();
  await sleep(800);
  const old = { x: item.x, z: item.z };
  const next = await tapFreeTile(page, old);
  await tap(page, page.getByRole("button", { name: /^Platzieren/ }));
  await sleep(800);
  check(next && item.x === next.x && item.z === next.z, `${N}: «Verschieben» + tap + «Platzieren» moves the item`, JSON.stringify({ next, item }));

  // 7. put back (Einlagern) -> inventory, persisted
  const again = await project(page, item.x + 0.5, item.z + 0.5);
  await page.touchscreen.tap(again.x, again.y);
  await sleep(600);
  await tap(page, selected.getByRole("button", { name: /Einlagern/ }));
  await sleep(800);
  check(item.x === null && item.z === null, `${N}: «Einlagern» puts the item back into the inventory`);
  await page.reload();
  await page.waitForSelector("[data-map-fullscreen] [data-map-renderer]", { timeout: 120000 });
  await sleep(2000);
  await tap(page, page.getByRole("button", { name: "Laden", exact: true }));
  check(await page.locator('[data-sheet="shop"]').getByText("Im Inventar").first().isVisible(), `${N}: after reload the item is listed «Im Inventar»`);
  await tap(page, page.getByRole("button", { name: "Laden schliessen" }));
  await sleep(500);
  const closed = await layout(page, null);
  check(closed.iw >= 768 || closed.navShown, `${N}: bottom nav back after closing the sheet`);
  check(closed.hideFlag === null, `${N}: data-hide-bottom-nav removed after closing`);

  // 8. camera gestures: pinch zoom + one-finger pan, no page scroll / browser zoom
  const hb = await host(page).boundingBox();
  const c = { x: hb.x + hb.width / 2, y: hb.y + hb.height * 0.45 };
  const z0 = (await host(page).evaluate((h) => h.__map.camera())).zoom;
  await touchGesture(page, device.engine, [{ from: { x: c.x - 40, y: c.y }, to: { x: c.x - 110, y: c.y } }, { from: { x: c.x + 40, y: c.y }, to: { x: c.x + 110, y: c.y } }], { steps: 10, stepMs: 30 });
  await sleep(900);
  const z1 = (await host(page).evaluate((h) => h.__map.camera())).zoom;
  check(z1 > z0 + 0.05, `${N}: pinch-out zooms the map (${z0.toFixed(2)} -> ${z1.toFixed(2)})`);
  const cam0 = await host(page).evaluate((h) => h.__map.camera());
  await touchGesture(page, device.engine, [{ from: { x: c.x - 60, y: c.y + 40 }, to: { x: c.x + 40, y: c.y - 30 } }], { steps: 10, stepMs: 20 });
  await sleep(900);
  const cam1 = await host(page).evaluate((h) => h.__map.camera());
  check(Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z) > 0.3, `${N}: one-finger pan moves the camera`, JSON.stringify({ cam0, cam1 }));
  const scroll = await page.evaluate(() => ({ y: scrollY, x: scrollX, scale: visualViewport?.scale ?? 1 }));
  check(scroll.y === 0 && scroll.x === 0 && Math.abs(scroll.scale - 1) < 0.01, `${N}: gestures did not scroll or zoom the page`, JSON.stringify(scroll));
  const css = await host(page).evaluate((h) => { const s = getComputedStyle(h); return { ta: s.touchAction, us: s.webkitUserSelect || s.userSelect, ob: getComputedStyle(document.documentElement).overscrollBehaviorY }; });
  check(css.ta === "none" && css.us === "none" && css.ob === "none", `${N}: touch-action none, no text selection, no pull-to-refresh`, JSON.stringify(css));
  check(logs.length === 0, `${N}: no page errors`, JSON.stringify(logs.slice(0, 3)));
  await ctx.close();
}

try {
  if (MODE !== "test") for (const device of DEVICES) { await shots(device, false); if (device.dark) await shots(device, true); }
  if (MODE !== "shots") for (const device of DEVICES.filter((d) => d.test)) await flow(device);
} finally {
  for (const b of Object.values(browsers)) await b.close();
}
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
