#!/usr/bin/env node
// Panat's trigger case as a screenshot-proof run (release QA): /map on iPhone 15 (WebKit, isMobile + hasTouch, dark):
// open «Laden», take an item, the item panel and all five actions (Platzieren/Abbrechen/Drehen/Verschieben/Entfernen) are
// visible above the bottom nav (or the nav is hidden), no empty strip, place by tile tap, move by long-press drag, reload ->
// persists, and «Laden» opens while a placed item is selected (V1). One JPEG per step.
// Helpers (stub Supabase, touch input, layout facts) are copied verbatim from scripts/mobile-village-e2e.mjs (mobile-village
// 68de8ba) so this file runs standalone against a build with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321.
//   BASE=http://localhost:3275 PLAYWRIGHT=… PLAYWRIGHT_WEBKIT=… SHOTS=<dir> DEVICES=iphone-15 THEMES=dark node scripts/mobile-trigger-proof.mjs
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultPw = resolve(here, "../../audit-tools/node_modules/playwright-core/index.mjs");
const pwChromium = await import(pathToFileURL(process.env.PLAYWRIGHT || defaultPw).href);
const pwWebkit = process.env.PLAYWRIGHT_WEBKIT ? await import(pathToFileURL(process.env.PLAYWRIGHT_WEBKIT).href) : pwChromium;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:3231";
const MODE = process.env.MODE || "all";
const ORIENT = process.env.ORIENT || "both";
const SHOTS = (process.env.SHOTS || resolve(here, "../../_mobile/shots/village/after")).replace(/\/$/, "");
mkdirSync(SHOTS, { recursive: true });

// CSS viewport sizes as Playwright's device list has them (browser chrome already subtracted); Galaxy S23 = 360x780.
const DEVICES = [
  { id: "iphone-se", engine: "webkit", w: 375, h: 667 },
  { id: "iphone-15", engine: "webkit", w: 393, h: 659 },
  { id: "iphone-15-pro-max", engine: "webkit", w: 430, h: 739 },
  { id: "ipad", engine: "webkit", w: 810, h: 1080 },
  { id: "pixel-7", engine: "chromium", w: 412, h: 839 },
  { id: "galaxy-s23", engine: "chromium", w: 360, h: 780 },
].filter((d) => !process.env.DEVICES || process.env.DEVICES.split(",").includes(d.id));
const ORIENTS = ORIENT === "both" ? ["portrait", "landscape"] : [ORIENT];
const THEMES = (process.env.THEMES || "light,dark").split(",").map((t) => t === "dark");
const size = (d, o) => (o === "portrait" ? { width: d.w, height: d.h } : { width: d.h, height: d.w });

const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const statuses = ["applied", "interview", "saved", "preparing", "rejected", "applied"];
const apps = statuses.map((status, i) => ({ id: "a" + i, user_id: "u1", company: "Firma " + i, position: "Lehrstelle " + i, location: "Bern", status, category: "software", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" }));

let failures = 0;
let passes = 0;
const check = (ok, text, info = "") => { console.log(ok ? "PASS" : "FAIL", text, ok ? "" : info); if (ok) passes++; else failures++; return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browsers = {};
const contexts = new Set();
/** Harness hygiene (round 5): a crashed case left its context open, and one browser served 24+ heavy WebGL contexts on a loaded
 *  machine until Chromium died ("browser has been closed") or timed out. Each case now closes its leftovers, and each device gets
 *  a fresh browser. */
async function closeContexts() { for (const c of [...contexts]) { contexts.delete(c); await c.close().catch(() => {}); } }
async function freshBrowser(engine) { await closeContexts(); if (browsers[engine]) { await browsers[engine].close().catch(() => {}); delete browsers[engine]; } }
async function browserFor(engine) {
  if (browsers[engine] && !browsers[engine].isConnected()) delete browsers[engine];
  if (!browsers[engine]) browsers[engine] = engine === "webkit" ? await pwWebkit.webkit.launch() : await pwChromium.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  return browsers[engine];
}

async function waitMap(page) {
  await page.waitForSelector("[data-map-fullscreen] [data-map-renderer]", { timeout: 240000 });
  await page.waitForFunction(() => document.querySelector("[role=region][aria-label='3D-Bewerbungsdorf']")?.__map, null, { timeout: 60000 });
  // dev-only Next.js indicator (bottom-left) must not cover the tab bar / actions in hit tests; re-added after every reload
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await sleep(2000);
}

async function open(device, orient, dark, { extraApps = [], viewport: forced, path = "/map" } = {}) {
  const browser = await browserFor(device.engine);
  const viewport = forced ?? size(device, orient);
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: viewport.width <= 640 ? 2 : 1, colorScheme: dark ? "dark" : "light" });
  contexts.add(ctx); ctx.on("close", () => contexts.delete(ctx));
  // Production build over plain http: the app sends HSTS + CSP upgrade-insecure-requests (lib/security-headers.ts, production only).
  // WebKit applies both to localhost and upgrades every asset to https -> TLS error, the map never renders. Production itself is
  // https, so for WebKit the test loads the app via 127.0.0.1 (HSTS never applies to IP hosts) and strips only the upgrade directive
  // from the HTML document response (the rest of the CSP stays enforced). Only documents are routed: routing every request with
  // route.fetch() made WebKit drop a concurrent Supabase stub call (map_shop_state «Could not connect»).
  const base = device.engine === "webkit" ? BASE.replace("//localhost", "//127.0.0.1") : BASE;
  if (device.engine === "webkit") await ctx.route((url) => url.origin === new URL(base).origin, async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers["strict-transport-security"];
    if (headers["content-security-policy"]) headers["content-security-policy"] = headers["content-security-policy"].replace(/;?\s*upgrade-insecure-requests/g, "");
    await route.fulfill({ response, headers });
  });

  await ctx.addInitScript(([s, theme]) => {
    localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s));
    localStorage.setItem("wendapply-theme", theme);
  }, [session, dark ? "dark" : "light"]);
  // Production CSP (next start) contains `upgrade-insecure-requests`; WebKit, unlike Chromium, also upgrades http://localhost,
  // so every script/CSS request goes to https://localhost and fails (TLS) and the map never mounts. Strip it from documents only
  // (same harness fix as mobile-responsive-e2e.mjs ca5dbec); every other request falls through to the Supabase stub / network.
  if (device.engine === "webkit" && BASE.startsWith("http://")) await ctx.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    try {
      const resp = await route.fetch({ maxRedirects: 0 });
      const headers = resp.headers();
      for (const k of Object.keys(headers)) if (/^content-security-policy/i.test(k)) headers[k] = headers[k].replace(/upgrade-insecure-requests;?\s*/gi, "");
      return route.fulfill({ response: resp, headers });
    } catch { return route.fallback(); }
  });
  const st = { balance: 600, earned: 600, rewardCount: 6, items: [], layouts: [] };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname; const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p.startsWith("/storage/")) return json([]);
    if (p === "/rest/v1/applications") return json([...apps, ...extraApps]);
    if (p === "/rest/v1/map_shop_catalog") return json([]);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop(); let b = {}; try { b = req.postDataJSON() || {}; } catch { /* no body */ }
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
  if (process.env.DEBUG) { page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("CONSOLE", m.type(), m.text().slice(0, 240)); }); page.on("requestfailed", (r) => console.log("REQFAIL", r.url().slice(0, 120), r.failure()?.errorText)); page.on("request", (r) => { if (r.url().includes("/rpc/")) console.log("RPC", r.url().split("/").pop()); }); }
  await page.goto(base + path);
  await waitMap(page);
  // hide the Next.js dev indicator so it does not cover the tab bar in screenshots / hit tests
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  return { ctx, page, st, logs };
}

const host = (page) => page.locator("[role=region][aria-label='3D-Bewerbungsdorf']");
const project = (page, x, z) => host(page).evaluate((h, [a, b]) => h.__map.project(a, b), [x, z]);
async function tap(page, locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not visible: " + locator);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(450);
}
const tools = (page) => page.locator('[aria-label="Gegenstand platzieren"]');
const selectedTools = (page) => page.locator('[aria-label="Ausgewählter Gegenstand"]');
const action = (scope, name) => scope.getByRole("button", { name: new RegExp(`^${name}`) });

/** Layout facts of a panel: bottom nav, stage, overflow and every control (visible = inside the viewport, not under the nav, not covered). */
async function layout(page, selector) {
  return page.evaluate((sel) => {
    const nav = document.querySelector('nav[aria-label="Hauptmenü mobil"]');
    const nr = nav?.getBoundingClientRect();
    const ns = nav && getComputedStyle(nav);
    // shell contract: the bar slides out (translateY + visibility:hidden) while html[data-hide-bottom-nav] is set
    const navShown = !!nav && ns.display !== "none" && ns.visibility !== "hidden" && nr.height > 0 && nr.top < innerHeight - 1;
    const stage = document.querySelector("[data-map-fullscreen]").getBoundingClientRect();
    const root = sel ? document.querySelector(sel) : null;
    const rb = root?.getBoundingClientRect();
    const box = (r) => ({ t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) });
    const controls = root ? [...root.querySelectorAll("button")].filter((el) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0).map((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { name: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 28), t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height, covered: !(hit && (hit === el || el.contains(hit))), by: hit && !(hit === el || el.contains(hit)) ? (hit.tagName + "." + String(hit.className?.baseVal ?? hit.className ?? "") + "[" + (hit.getAttribute("aria-label") ?? hit.textContent?.trim().slice(0, 20) ?? "") + "]").slice(0, 90) : undefined, grip: el.getAttribute("aria-expanded") !== null && !el.textContent.trim() };
    }) : [];
    return {
      ih: innerHeight, iw: innerWidth, sw: document.scrollingElement.scrollWidth, sh: document.scrollingElement.scrollHeight, scrollY, scrollX,
      navShown, nav: navShown ? box(nr) : null, hideFlag: document.documentElement.dataset.hideBottomNav ?? null,
      stage: box(stage), root: rb ? box(rb) : null, controls,
    };
  }, selector);
}
const intersects = (a, b) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

function checkPanel(name, m, required) {
  const phone = m.iw < 768;
  check(!!m.root, `${name}: panel rendered`);
  check(!intersects(m.root, m.nav), `${name}: panel does not intersect the bottom nav`, JSON.stringify({ panel: m.root, nav: m.nav }));
  check(m.root && m.root.b <= m.ih + 0.5 && m.root.t >= -0.5, `${name}: panel inside the viewport`, JSON.stringify({ panel: m.root, ih: m.ih }));
  if (phone && m.ih > m.iw) check(!m.navShown && m.hideFlag === "true", `${name}: bottom nav hidden while the panel is open (phone)`, JSON.stringify({ navShown: m.navShown, flag: m.hideFlag }));
  const limit = m.navShown ? Math.min(m.ih, m.nav.t) : m.ih;
  for (const label of required) {
    const c = m.controls.find((x) => x.name.startsWith(label));
    check(!!c && c.t >= -0.5 && c.l >= -0.5 && c.r <= m.iw + 0.5 && c.b <= limit + 0.5 && !c.covered, `${name}: «${label}» visible`, JSON.stringify(c));
    check(!!c && c.w >= 44 && c.h >= 44, `${name}: «${label}» >= 44px`, JSON.stringify(c && { w: c.w, h: c.h }));
  }
  const small = m.controls.filter((c) => !c.grip && (c.w < 44 || c.h < 44));
  check(small.length === 0, `${name}: every button in the panel >= 44px`, JSON.stringify(small));
  check(m.sw <= m.iw + 1, `${name}: no horizontal overflow (${m.sw} <= ${m.iw})`);
  check(m.sh <= m.ih + 1 && m.scrollY === 0, `${name}: no page scroll`, JSON.stringify({ sh: m.sh, ih: m.ih, y: m.scrollY }));
  const floor = m.navShown ? m.nav.t : m.ih;
  check(Math.abs(m.stage.b - floor) <= 2, `${name}: map fills down to the nav / screen edge (no empty strip)`, JSON.stringify({ stageB: m.stage.b, floor }));
}

/** Free 1x1 cell near the current ghost whose screen point is on the open map (not under a panel / top bar). */
async function tapFreeTile(page, avoid) {
  const panel = await tools(page).boundingBox();
  const vp = page.viewportSize();
  const base = await page.evaluate(() => ({ x: Number(document.querySelector('input[aria-label="Position X"]')?.value), z: Number(document.querySelector('input[aria-label="Position Z"]')?.value) }));
  for (const [dx, dz] of [[2, 0], [0, -2], [-2, 0], [2, -2], [-2, -2], [3, 1], [-3, 1], [1, -3], [4, 0], [0, -4], [-4, 0], [1, 2], [-1, 2]]) {
    const target = { x: base.x + dx, z: base.z + dz };
    if (avoid && avoid.x === target.x && avoid.z === target.z) continue;
    const p = await project(page, target.x + 0.5, target.z + 0.5);
    if (p.y < 70 || p.x < 20 || p.x > vp.width - 70 || p.y > vp.height - 10) continue;
    if (panel && p.x > panel.x - 10 && p.x < panel.x + panel.width + 10 && p.y > panel.y - 10) continue;
    const covered = await page.evaluate(([x, y]) => !document.elementFromPoint(x, y)?.closest("[role=region][aria-label='3D-Bewerbungsdorf']"), [p.x, p.y]);
    if (covered) continue;
    if (process.env.DEBUG) await host(page).evaluate((h) => { window.__tev = []; if (h.__tevOn) return; h.__tevOn = true; for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel", "touchstart", "touchend", "click"]) h.addEventListener(t, (e) => window.__tev.push(`${t} ${e.pointerId ?? ""} ${e.pointerType ?? ""} ${e.isPrimary ?? ""} ${Math.round(e.clientX ?? e.changedTouches?.[0]?.clientX)},${Math.round(e.clientY ?? e.changedTouches?.[0]?.clientY)} btn=${e.button ?? ""}`), true); });
    await page.touchscreen.tap(p.x, p.y);
    if (process.env.DEBUG) { await sleep(800); console.log("DEBUG tile", JSON.stringify({ target, p, base, panel, now: await page.evaluate(() => [document.querySelector('input[aria-label="Position X"]')?.value, document.querySelector('input[aria-label="Position Z"]')?.value]), ev: await page.evaluate(() => window.__tev) })); }
    // poll: under load the software renderer can take a few seconds to handle the tap
    const moved = await page.waitForFunction(([tx, tz]) => Number(document.querySelector('input[aria-label="Position X"]')?.value) === tx && Number(document.querySelector('input[aria-label="Position Z"]')?.value) === tz, [target.x, target.z], { timeout: 4000 }).then(() => true, () => false);
    if (moved && await action(tools(page), "Platzieren").isEnabled()) return target;
  }
  if (process.env.DEBUG) console.log("DEBUG no tile", JSON.stringify({ base, panel, vp, cands: await Promise.all([[2, 0], [0, -2], [-2, 0], [4, 0], [0, -4]].map(async ([dx, dz]) => { const p = await project(page, base.x + dx + 0.5, base.z + dz + 0.5); return [dx, dz, Math.round(p.x), Math.round(p.y), await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + String(e.className?.baseVal ?? e.className).slice(0, 30) : null; }, [p.x, p.y])]; })), stage: await page.evaluate(() => { const r = document.querySelector("[data-map-fullscreen]").getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; }) }));
  return null;
}

/** Touch gesture: CDP touch events in Chromium (real input pipeline), synthetic touch PointerEvents in WebKit. */
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

const onTile = (page, item) => host(page).evaluate((h, [x, z]) => { const p = h.__map.project(x + 0.5, z + 0.5); return h.__map.movableAt(p.x, p.y); }, [item.x, item.z]);

async function proof(device, dark) {
  const N = `${device.id} portrait ${dark ? "dark" : "light"}`;
  const pre = `${SHOTS}/trigger-${device.id}-${dark ? "dark" : "light"}`;
  let step = 0;
  const shot = async (page, label) => { const p = `${pre}-${String(step++).padStart(2, "0")}-${label}.jpg`; await page.screenshot({ type: "jpeg", quality: 75, path: p, scale: "css" }); console.log("SHOT", p); };
  const { ctx, page, st, logs } = await open(device, "portrait", dark);
  try {
    const start = await layout(page, null);
    check(start.navShown, `${N}: bottom nav visible on the plain map`);
    if (start.navShown) check(Math.abs(start.stage.b - start.nav.t) <= 2, `${N}: map ends exactly at the nav (no strip)`, JSON.stringify({ stage: start.stage, nav: start.nav }));
    await shot(page, "map");
    await tap(page, page.getByRole("button", { name: "Laden", exact: true }));
    await page.locator('[data-sheet="shop"]').waitFor();
    await sleep(900);
    const shop = await layout(page, '[data-sheet="shop"]');
    check(!intersects(shop.root, shop.nav) && shop.root.b <= shop.ih + 0.5, `${N}: shop sheet above the nav and inside the viewport`, JSON.stringify({ sheet: shop.root, nav: shop.nav }));
    await shot(page, "shop-open");
    const buy = page.locator('[data-item="scooter_sport_lime"] button');
    await buy.scrollIntoViewIfNeeded();
    await tap(page, buy);
    await tools(page).waitFor({ timeout: 20000 });
    await sleep(1200);
    checkPanel(`${N} item panel (new item)`, await layout(page, '[aria-label="Gegenstand platzieren"]'), ["Drehen", "Verschieben", "Entfernen", "Abbrechen", "Platzieren"]);
    await shot(page, "item-panel-5-actions");
    const item = st.items.at(-1);
    const target = await tapFreeTile(page);
    check(target !== null, `${N}: tapping a free tile moves the ghost there`, JSON.stringify(target));
    checkPanel(`${N} item panel (after tile tap)`, await layout(page, '[aria-label="Gegenstand platzieren"]'), ["Drehen", "Verschieben", "Entfernen", "Abbrechen", "Platzieren"]);
    await shot(page, "tile-tapped");
    await tap(page, action(tools(page), "Platzieren"));
    await sleep(1000);
    check(target && item.x === target.x && item.z === target.z, `${N}: «Platzieren» stores the tapped tile`, JSON.stringify(item));
    if (await selectedTools(page).isVisible()) checkPanel(`${N} selected item`, await layout(page, '[aria-label="Ausgewählter Gegenstand"]'), ["Drehen", "Verschieben", "Entfernen", "Abbrechen"]);
    await shot(page, "placed-selected");
    await page.reload(); await waitMap(page);
    check(await onTile(page, item), `${N}: after reload the item stands on its tile`);
    await shot(page, "reload-placed");
    const prev = { x: item.x, z: item.z };
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 2]]) {
      const from = await project(page, item.x + 0.5, item.z + 0.5);
      const to = await project(page, item.x + dx + 0.5, item.z + dz + 0.5);
      const vp = page.viewportSize();
      if (to.x < 20 || to.x > vp.width - 60 || to.y < 70 || to.y > vp.height - 20) continue;
      await touchGesture(page, device.engine, [{ from, to }], { holdMs: 650, steps: 10, stepMs: 30 });
      await sleep(1300);
      if (item.x !== prev.x || item.z !== prev.z) break;
    }
    check(item.x !== prev.x || item.z !== prev.z, `${N}: long-press drag moved the item`, JSON.stringify({ prev, now: { x: item.x, z: item.z } }));
    await shot(page, "dragged");
    await page.reload(); await waitMap(page);
    check(await onTile(page, item), `${N}: dragged position persisted after reload`);
    await shot(page, "reload-dragged");
    // the screenshot case: a placed item selected -> its panel (Verschieben / Entfernen …) above the nav; then «Laden» (V1)
    const at = await project(page, item.x + 0.5, item.z + 0.5);
    await page.touchscreen.tap(at.x, at.y);
    await selectedTools(page).waitFor({ timeout: 8000 }).catch(() => {});
    // the bar slides out with a CSS transition (visibility flips at its end): wait for it like mobile-village-e2e does for the shop
    await page.waitForFunction(() => { const n = document.querySelector('nav[aria-label="Hauptmenü mobil"]'); return !n || getComputedStyle(n).visibility === "hidden" || n.getBoundingClientRect().top >= innerHeight - 1; }, null, { timeout: 3000 }).catch(() => {});
    await sleep(600);
    check(await selectedTools(page).isVisible(), `${N}: tapping the placed item selects it`);
    if (await selectedTools(page).isVisible()) checkPanel(`${N} placed item selected`, await layout(page, '[aria-label="Ausgewählter Gegenstand"]'), ["Drehen", "Verschieben", "Entfernen", "Abbrechen"]);
    await shot(page, "placed-item-panel");
    await tap(page, action(selectedTools(page), "Verschieben"));
    await tools(page).waitFor().catch(() => {});
    await sleep(800);
    checkPanel(`${N} moving placed item`, await layout(page, '[aria-label="Gegenstand platzieren"]'), ["Drehen", "Verschieben", "Entfernen", "Abbrechen", "Platzieren"]);
    await shot(page, "move-panel-5-actions");
    await tap(page, action(tools(page), "Abbrechen"));
    await sleep(800);
    await page.touchscreen.tap(at.x, at.y);
    await selectedTools(page).waitFor({ timeout: 8000 }).catch(() => {});
    await tap(page, page.getByRole("button", { name: "Laden", exact: true }));
    const v1 = await page.locator('[data-sheet="shop"]').waitFor({ timeout: 5000 }).then(() => true, () => false);
    check(v1, `${N}: «Laden» opens the shop while a placed item is selected (V1)`);
    check(item.x !== null, `${N}: the item stays placed after opening the shop`);
    await sleep(700);
    await shot(page, "v1-laden-while-selected");
    check(logs.length === 0, `${N}: no page errors`, JSON.stringify(logs.slice(0, 3)));
  } finally { await ctx.close().catch(() => {}); }
}

try {
  for (const device of DEVICES) { for (const dark of THEMES) await proof(device, dark); await freshBrowser(device.engine); }
} catch (e) { failures++; console.log("FAIL crashed:", String(e.message).split("\n")[0]); }
finally { for (const b of Object.values(browsers)) await b.close().catch(() => {}); }
console.log(`${passes} passed, ${failures} failed`);
console.log(failures ? "SOME FAILED" : "ALL PASSED");
process.exit(failures ? 1 : 0);
