// Parent village = the child's OWN village, watch only (Panat 2026-11-22 19:06; migration 20261122190000, NOT applied live).
// Real rendering (Chrome + SwiftShader WebGL) against a local `next start` build and the real Supabase project with THROWAWAY
// probe users only (probe-pvfd-<stamp>-*@example.invalid), deleted at the end (also on failure / Ctrl-C); leftovers of an
// earlier crashed run are swept first. Secrets are never printed.
//
// The live DB still runs the friend-like RPC (20261122100000). So the parent's POST /rest/v1/rpc/family_child_village really
// goes to the server (proves the privacy gate passes for the probe parent), and its response body is then replaced at network
// level with the NEW contract shape, built from the probe child's rows exactly like the new SQL does
// (supabase/migrations/20261122190000_family_child_village_full_details.sql; the SQL itself is tested in PGlite).
//
//   npm run build && npx next start -p 3431 &
//   BASE=http://localhost:3431 node scripts/parent-village-full-details-e2e.mjs
//
// Env: BASE, CHROME (Chrome binary), PLAYWRIGHT (playwright-core index.mjs), SERVICE_ROLE_KEY (else via ~/JARVIS/bin/sb privat).
// Output: _onboarding/parent-village-full-details/*.png and e2e-report.json. Exit 1 when a check fails.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");
const PLAYWRIGHT = process.env.PLAYWRIGHT || [join(ROOT, "node_modules/playwright-core/index.mjs"), join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].find(existsSync);
const { chromium } = await import(PLAYWRIGHT);
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:3431";
const OUT = join(ROOT, "_onboarding/parent-village-full-details");
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(readFileSync(join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ref = new URL(SUPA_URL).hostname.split(".")[0];
let SERVICE = process.env.SERVICE_ROLE_KEY;
if (!SERVICE) {
  const out = spawnSync(join(homedir(), "JARVIS/bin/sb"), ["privat", "projects", "api-keys", "--project-ref", ref, "-o", "json"], { encoding: "utf8" });
  try { SERVICE = JSON.parse(out.stdout).find((k) => k.name === "service_role")?.api_key; } catch { SERVICE = undefined; }
}
if (!SERVICE) { console.error("no service role key"); process.exit(2); }
const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const PREFIX = "probe-pvfd-";
const stamp = Date.now();
const PASSWORD = `Pvfd-${stamp}-Pw!x`;
const created = [];
const results = [];
let failed = 0;
const check = (ok, name, info = "") => { if (!ok) failed++; const line = `${ok ? "PASS" : "FAIL"} ${name}${info ? " — " + String(info).slice(0, 500) : ""}`; results.push(line); console.log(line); return !!ok; };
const log = (s) => { results.push("INFO " + s); console.log("INFO " + s); };
const must = async (p, what) => { const r = await p; if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

// ---------- probe users + cleanup (always) ----------
async function mkUser(label, meta) {
  const email = `${PREFIX}${stamp}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { onboarding_tour_done: true, ...meta } });
  if (error) throw error;
  const user = { id: data.user.id, email, label };
  created.push(user);
  return user;
}
async function signIn(u) {
  const c = createClient(SUPA_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: PASSWORD });
  if (error) throw error;
  u.session = data.session; return c;
}
async function probeAccounts() {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all.filter((u) => u.email?.startsWith(PREFIX) && u.email.endsWith("@example.invalid")).map((u) => ({ id: u.id, email: u.email, label: u.email.split("-").pop().split("@")[0] }));
}
async function deleteProbes(users, tag) {
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  const fm = await admin.from("family_members").select("family_id").in("user_id", ids).then((r) => r.data ?? [], () => []);
  const famIds = [...new Set(fm.map((r) => r.family_id))];
  if (famIds.length) { const { error } = await admin.from("families").delete().in("id", famIds); check(!error, `${tag}: ${famIds.length} probe family deleted`, error?.message); }
  for (const u of users) {
    for (const table of ["applications", "map_islands", "map_items", "map_layouts"]) await admin.from(table).delete().eq("user_id", u.id).then(() => undefined, () => undefined);
    const { error } = await admin.auth.admin.deleteUser(u.id);
    check(!error, `${tag}: probe user ${u.label} ${u.id.slice(0, 8)}… deleted`, error?.message);
  }
  const left = await admin.from("applications").select("id", { count: "exact", head: true }).in("user_id", ids);
  check((left.count ?? 0) === 0, `${tag}: 0 probe applications left`, `count=${left.count}`);
}
let cleaned = false;
async function cleanup() {
  if (cleaned) return; cleaned = true;
  await deleteProbes(created, "cleanup");
  const leftover = await probeAccounts().catch(() => null);
  check(leftover !== null && leftover.length === 0, "cleanup verified: no probe-pvfd-* account left in auth.users", `left=${leftover?.length}`);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { console.log(`\n${signal}: cleaning up probe users`); await cleanup().catch((e) => console.error(e.message)); process.exit(130); });

// ---------- the NEW contract, built from the child's rows exactly like 20261122190000 ----------
async function newContract(childId, live) {
  const apps = await must(admin.from("applications").select("id, company, position, location, status, created_at, updated_at, applied_at, deadline").eq("user_id", childId), "apps");
  apps.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const layouts = await must(admin.from("map_layouts").select("object_id, x, z, rotation").eq("user_id", childId), "layouts");
  const items = await must(admin.from("map_items").select("id, item_type, x, z, rotation, created_at").eq("user_id", childId), "items");
  items.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const ids = new Set(apps.map((a) => `house:${a.id}`));
  return {
    child_id: childId, display_name: live.display_name ?? null, island_count: live.island_count ?? 1,
    houses: apps.map((a) => ({ id: a.id, company: a.company, position: a.position, location: a.location?.trim() ? a.location : null, status: a.status,
      createdAt: a.created_at, updatedAt: a.updated_at, appliedAt: a.applied_at, deadline: a.deadline })),
    layouts: layouts.filter((l) => ids.has(l.object_id)).sort((a, b) => a.object_id.localeCompare(b.object_id)).map((l) => ({ id: l.object_id, x: l.x, z: l.z, rotation: l.rotation })),
    items: items.map((i) => ({ id: i.id, itemType: i.item_type, x: i.x, z: i.z, rotation: i.rotation, createdAt: i.created_at })),
  };
}

// ---------- measuring ----------
async function raw(png) { return sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }); }
async function pixelDiff(a, b, diffPath = null) {
  const [ra, rb] = await Promise.all([raw(a), raw(b)]);
  if (ra.info.width !== rb.info.width || ra.info.height !== rb.info.height) return { changed: -1, pct: -1 };
  const n = ra.info.width * ra.info.height; let changed = 0;
  const out = diffPath ? Buffer.alloc(n * 3) : null;
  for (let i = 0; i < n; i++) {
    const o = i * 3; const d = Math.abs(ra.data[o] - rb.data[o]) + Math.abs(ra.data[o + 1] - rb.data[o + 1]) + Math.abs(ra.data[o + 2] - rb.data[o + 2]);
    if (d > 24) { changed++; if (out) { out[o] = 255; out[o + 1] = 0; out[o + 2] = 255; } }
    else if (out) { out[o] = ra.data[o] * 0.35; out[o + 1] = ra.data[o + 1] * 0.35; out[o + 2] = ra.data[o + 2] * 0.35; }
  }
  if (out) await sharp(out, { raw: { width: ra.info.width, height: ra.info.height, channels: 3 } }).png().toFile(diffPath);
  return { changed, pct: Math.round(changed / n * 10000) / 100 };
}
/** Child left, parent right, with a caption strip on top. */
async function sideBySide(left, right, file, caption) {
  const [ml, mr] = await Promise.all([sharp(left).metadata(), sharp(right).metadata()]);
  const gap = 24, top = 56, w = ml.width + mr.width + gap, h = Math.max(ml.height, mr.height) + top;
  const svg = Buffer.from(`<svg width="${w}" height="${top}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#222"/><text x="16" y="36" font-family="Helvetica" font-size="26" fill="#fff">${caption}</text></svg>`);
  await sharp({ create: { width: w, height: h, channels: 3, background: "#222" } })
    .composite([{ input: svg, left: 0, top: 0 }, { input: left, left: 0, top }, { input: right, left: ml.width + gap, top }]).png().toFile(join(OUT, file));
}

const HOST = "[aria-label='3D-Bewerbungsdorf']";
const PROFILES = [
  { tag: "mobile", ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { tag: "desktop", ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
];
const THEMES = ["light", "dark"];
const READ_RPC = "/rest/v1/rpc/family_child_village";
/**
 * The global app shell (components/layout/workspace-shell.tsx) on EVERY logged-in page, also before this change and on the child's
 * /map: my_access (STABLE, paywall), social_my_profile (own role / name), social_list (friend-request badge). They read only the
 * caller's own rows; the one possible write is public._soc_ensure creating the CALLER's own user_roles row if it is missing.
 * Nothing of the child, nothing of the village.
 */
const SHELL_RPCS = ["/rest/v1/rpc/my_access", "/rest/v1/rpc/social_my_profile", "/rest/v1/rpc/social_list"];

async function view(browser, u, path, profile, theme, who, mock, houseIds) {
  const ctx = await browser.newContext({ ...profile.ctx, colorScheme: theme });
  await ctx.addInitScript(({ key, session, theme, ids }) => {
    try {
      localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); localStorage.setItem("wendapply-theme", theme);
      localStorage.setItem(key, JSON.stringify(session));
      for (const id of ids) localStorage.setItem(`wendapply:palace-seen:${id}`, "1"); // the child already celebrated its Zusage
    } catch { /* */ }
  }, { key: `sb-${ref}-auth-token`, session: u.session, theme, ids: houseIds });
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage();
  const errors = []; const requests = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  page.on("request", (r) => { const url = new URL(r.url()); if (url.origin === new URL(SUPA_URL).origin || url.origin === new URL(BASE).origin && url.pathname.startsWith("/api/")) requests.push({ method: r.method(), path: url.pathname, origin: url.origin === new URL(BASE).origin ? "app" : "supabase" }); });
  let rpcStatus = null;
  if (mock) await page.route(`${SUPA_URL}${READ_RPC}*`, async (route) => {
    const response = await route.fetch(); // the real call: the live privacy gate must let this parent through
    rpcStatus = response.status();
    await route.fulfill({ response, body: JSON.stringify(mock), headers: { ...response.headers(), "content-type": "application/json" } });
  });
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((s) => document.querySelector(s)?.__map && document.querySelectorAll("[data-building]").length > 0, HOST, { timeout: 90000 });
  await page.waitForTimeout(3500);
  const host = page.locator(HOST).first();
  const state = () => page.evaluate(({ s, ids }) => { const el = document.querySelector(s);
    return { camera: el.__map.camera(), frames: el.__map.stats.frames, houses: Object.fromEntries(ids.map((id) => [id, el.__map.house(id)])),
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, theme: document.documentElement.getAttribute("data-theme") ?? "light",
      labels: [...document.querySelectorAll("[data-building]")].map((e) => { const b = e.getBoundingClientRect(), h = el.getBoundingClientRect();
        const onScreen = getComputedStyle(e).visibility === "visible" && b.right > h.left && b.left < h.right && b.bottom > h.top && b.top < h.bottom;
        return { id: e.getAttribute("data-building"), text: e.textContent.replace(/\s+/g, " ").trim(), tag: e.tagName, onScreen, x: Math.round(b.left), y: Math.round(b.top) }; }) }; }, { s: HOST, ids: houseIds });
  const s0 = await state();
  const f1 = await host.screenshot(); await page.waitForTimeout(1000); const f2 = await host.screenshot();
  const s1 = await state();
  const name = `${who}-${profile.tag}-${theme}`;
  const diff = await pixelDiff(f1, f2, join(OUT, `${name}-anim-diff.png`));
  const full = await page.screenshot();
  writeFileSync(join(OUT, `${name}.png`), full);
  return { ctx, page, host, name, who, s0, s1, diff, full, errors, requests, rpcStatus };
}

/** Everything a parent must NOT find in the DOM (watch only). */
const controls = (page) => page.evaluate(() => {
  const text = (sel) => [...document.querySelectorAll(sel)].map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim());
  const buttons = text("button, a");
  return {
    shop: buttons.filter((t) => /^Laden$|Kaufen|kaufen/.test(t)),
    add: buttons.filter((t) => /Bewerbung eintragen/.test(t)),
    points: [...document.querySelectorAll("[aria-label^='Punktestand']")].length,
    unlock: buttons.filter((t) => /Insel freischalten|Noch \d+ Punkte/.test(t)),
    statusSelect: document.querySelectorAll("#map-application-status").length,
    edit: buttons.filter((t) => /Status speichern|Haus verschieben|Bewerbung öffnen|Löschen|Bearbeiten|Entfernen|Einlagern|Drehen|Platzieren/.test(t)),
    forms: document.querySelectorAll("form").length,
    palace: document.querySelectorAll("[data-testid='palace-celebration']").length,
    placementTools: document.querySelectorAll("[data-placement-tools], [data-drag-cell]").length,
  };
});

// ---------- run ----------
let browser;
const report = { base: BASE, views: [], sheets: [] };
try {
  const sweep = await probeAccounts();
  if (sweep.length) { log(`sweeping ${sweep.length} leftover probe account(s) from an earlier run`); await deleteProbes(sweep, "sweep"); }

  const P = await mkUser("parent", { role: "student", account_type: "parent", full_name: "PVFD Elternteil", student_onboarded: true });
  const C = await mkUser("child", { role: "student", full_name: "PVFD Kind", student_onboarded: true, role_confirmed: true });
  const p = await signIn(P), c = await signIn(C);
  log(`probe users: ${created.map((u) => `${u.label}=${u.id.slice(0, 8)}…`).join(", ")}`);

  // A realistic Lehrstellen village: real company names, Stellen, places and dates; results incl. Zusage and Absage.
  const seed = [
    ["Probe Bäckerei Sonne AG", "Bäcker-Konditor EFZ", "Winterthur", "interview"], ["Probe Velo Huber GmbH", "Fahrradmechaniker EFZ", "Bern", "rejected"],
    ["Probe Spital Linde", "Fachfrau Gesundheit EFZ", "Basel", "offer"], ["Probe Elektro Keller", "Elektroinstallateur EFZ", null, "applied"],
    ["Probe Gärtnerei Blum", "Gärtner EFZ", "Zug", "preparing"], ["Probe Informatik AG", "Informatiker EFZ", "Zürich", "saved"],
    ["Probe Hotel Alpenblick", "Koch EFZ", "Luzern", "final_interview"], ["Probe Malerei Frei", "Maler EFZ", "Aarau", "withdrawn"],
  ];
  const day = (n) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);
  const rows = seed.map(([company, position, location, status], i) => ({ id: `${C.id}-app-${1700000000000 + i}`, user_id: C.id, company, position, location, status, category: "other", currency: "CHF",
    created_at: day(i * 3), updated_at: day(i * 3 + 2), applied_at: ["saved", "preparing"].includes(status) ? null : day(i * 3 + 1), deadline: i % 3 === 0 ? day(60 + i) : null,
    notes: "PROBE-GEHEIME-NOTIZ", contact_name: "PROBE-KONTAKT", salary_min: 777 }));
  await must(c.from("applications").insert(rows), "child applications");
  // Moved house + placed and stored shop items (service role: probe data only), so layouts/items are part of the comparison.
  await must(admin.from("map_layouts").insert({ user_id: C.id, object_id: `house:${rows[2].id}`, x: 14, z: 2, rotation: 1 }), "layout");
  await must(admin.from("map_items").insert([{ id: crypto.randomUUID(), user_id: C.id, item_type: "tree", price_paid: 40, x: 2, z: 13, rotation: 0 }, { id: crypto.randomUUID(), user_id: C.id, item_type: "fountain", price_paid: 40, x: 8, z: 14, rotation: 0 },
    { id: crypto.randomUUID(), user_id: C.id, item_type: "bench", price_paid: 40, rotation: 0 }]), "items");
  await must(p.rpc("account_set_type", { p_type: "parent" }), "parent type");
  await must(p.rpc("family_create", { p_name: "PVFD Familie" }), "family_create");
  const inv = await must(p.rpc("family_create_invite", { p_direction: "parent_invites_child" }), "invite");
  await must(c.rpc("account_set_type", { p_type: "independent_student", p_birth_year: 2008 }), "child type");
  await must(c.rpc("family_join", { p_code: inv.code ?? inv[0]?.code }), "family_join");
  // Village shared, application list NOT shared: the new contract shows full details anyway (option removed).
  await must(c.rpc("family_set_share", { p_settings: { progress: true, applications: false, village: true, documents: false } }), "family share");

  const live = await must(p.rpc("family_child_village", { p_child_id: C.id }), "family_child_village (live, old contract)");
  log(`live RPC (still 20261122100000) answers the probe parent: ${live.houses.length} houses, ids like ${live.houses[0]?.id}`);
  const mock = await newContract(C.id, live);
  report.mock = mock;
  const text = JSON.stringify(mock);
  check(!/PROBE-GEHEIME-NOTIZ|PROBE-KONTAKT|777/.test(text), "new-contract payload has no notes, contacts or salary");
  const houseIds = rows.map((r) => r.id);

  browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  for (const profile of PROFILES) for (const theme of THEMES) {
    const tag = `${profile.tag}-${theme}`;
    const child = await view(browser, C, "/map", profile, theme, "child", null, houseIds);
    const parent = await view(browser, P, `/familie/kind/${C.id}/dorf`, profile, theme, "parent", mock, houseIds);
    for (const r of [child, parent]) {
      report.views.push({ name: r.name, camera: r.s0.camera, theme: r.s0.theme, reduced: r.s0.reduced, frames: r.s1.frames - r.s0.frames, diff: r.diff, labels: r.s0.labels, errors: r.errors, requests: r.requests, rpcStatus: r.rpcStatus });
      check(r.errors.length === 0, `${r.name}: no console errors`, r.errors.join(" | "));
      check(r.s0.theme === theme, `${r.name}: ${theme} theme active`, r.s0.theme);
      check(r.s1.frames > r.s0.frames && r.diff.changed > 0, `${r.name}: animated (two screenshots 1 s apart differ)`, `frames=${r.s1.frames - r.s0.frames} diff=${r.diff.changed}px (${r.diff.pct}%)`);
    }
    check(parent.rpcStatus === 200, `${tag}: live family_child_village lets the active probe parent through (HTTP ${parent.rpcStatus})`);
    // identical content: labels (company + status), real ids, house positions (incl. the moved house), camera / start framing
    const labels = (r) => r.s0.labels.map((l) => `${l.id}=${l.text}`).sort();
    check(JSON.stringify(labels(child)) === JSON.stringify(labels(parent)), `${tag}: parent house labels = child house labels (real company names + real statuses)`, labels(parent).slice(0, 3).join(" | "));
    // positions after the two animation screenshots (the label overlay follows the render loop)
    const shownLabels = (r) => r.s1.labels.filter((l) => l.onScreen).map((l) => `${l.text}@${l.x},${l.y}`).sort();
    check(JSON.stringify(shownLabels(child)) === JSON.stringify(shownLabels(parent)), `${tag}: the same labels are on screen at the same positions`, `child: ${shownLabels(child).join(" | ")} || parent: ${shownLabels(parent).join(" | ")}`);
    check(seed.every(([company]) => parent.s0.labels.some((l) => l.text.includes(company))), `${tag}: every company name is on a parent house label`);
    check(parent.s0.labels.some((l) => /Absage/.test(l.text)) && parent.s0.labels.some((l) => /Zusage/.test(l.text)), `${tag}: real results visible (Zusage + Absage)`);
    check(!parent.s0.labels.some((l) => /^Haus \d+/.test(l.text)), `${tag}: no anonymous «Haus N» labels`);
    check(JSON.stringify(child.s0.houses) === JSON.stringify(parent.s0.houses), `${tag}: every house at the same map position (real ids, layouts)`, JSON.stringify(parent.s0.houses[rows[2].id]));
    const cam = (a, b) => ["x", "z", "zoom"].every((k) => Math.abs(a[k] - b[k]) < 1e-3);
    check(cam(child.s0.camera, parent.s0.camera), `${tag}: same start camera`, `child=${JSON.stringify(child.s0.camera)} parent=${JSON.stringify(parent.s0.camera)}`);
    const firstFrames = await pixelDiff(await child.host.screenshot(), await parent.host.screenshot());
    log(`${tag}: child vs parent map pixels differ by ${firstFrames.pct}% (animation phase + top bar differ on purpose)`);
    await sideBySide(child.full, parent.full, `side-by-side-${tag}.png`, `${tag}: child /map (left) · parent /familie/kind/…/dorf (right)`);

    // no edit controls in the parent DOM, child has them (sanity)
    const pc = await controls(parent.page), cc = await controls(child.page);
    report.views.at(-1).controls = pc;
    check(pc.shop.length === 0 && pc.add.length === 0 && pc.points === 0 && pc.unlock.length === 0 && pc.statusSelect === 0 && pc.edit.length === 0 && pc.forms === 0 && pc.palace === 0 && pc.placementTools === 0,
      `${tag}: parent DOM has no shop, buy, add, points, unlock, status select, edit/move/delete controls or forms`, JSON.stringify(pc));
    check(cc.shop.length > 0 && cc.add.length > 0 && cc.points > 0, `${tag}: (sanity) the child's own village does show shop, add and points`, JSON.stringify(cc));

    // drag a house in the parent view: nothing may move or be saved
    const target = rows[0].id;
    const before = parent.s0.houses[target];
    const pt = await parent.page.evaluate(({ s, id }) => { const el = document.querySelector(s); const h = el.__map.house(id); return el.__map.project(h.x, h.z); }, { s: HOST, id: target });
    if (profile.tag === "desktop") { await parent.page.mouse.move(pt.x, pt.y); await parent.page.mouse.down(); await parent.page.mouse.move(pt.x + 120, pt.y + 60, { steps: 12 }); await parent.page.mouse.up(); }
    else { const cdp = await parent.ctx.newCDPSession(parent.page); await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pt.x, y: pt.y }] }); await parent.page.waitForTimeout(700);
      for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pt.x + i * 10, y: pt.y + i * 5 }] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
    await parent.page.waitForTimeout(800);
    const after = await parent.page.evaluate(({ s, id }) => document.querySelector(s).__map.house(id), { s: HOST, id: target });
    check(JSON.stringify(before) === JSON.stringify(after), `${tag}: dragging a house in the parent view moves nothing`, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);

    // open a house (the Zusage palace) in both views: same details, parent read-only
    const open = rows[2];
    for (const r of [child, parent]) {
      await r.page.keyboard.press("Escape").catch(() => undefined);
      await r.page.evaluate((id) => document.querySelector(`button[data-building="${CSS.escape(id)}"]`)?.click(), open.id);
      await r.page.waitForSelector("[data-map-panel='application']", { timeout: 15000 });
      await r.page.waitForTimeout(600);
    }
    const sheet = (r) => r.page.evaluate(() => { const el = document.querySelector("[data-map-panel='application']");
      return { text: el.innerText.replace(/\s+/g, " ").trim(), selects: el.querySelectorAll("select").length, forms: el.querySelectorAll("form").length, inputs: el.querySelectorAll("input, textarea").length,
        buttons: [...el.querySelectorAll("button, a")].map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()) }; });
    const cs = await sheet(child), ps = await sheet(parent);
    report.sheets.push({ tag, child: cs, parent: ps });
    const details = [open.company, open.position, open.location, "Zusage"];
    check(details.every((d) => ps.text.includes(d)), `${tag}: parent house sheet shows company, Stelle, location and the real status`, ps.text.slice(0, 200));
    check(["Letzte Änderung", "Erfasst am", "Abgeschickt am"].every((d) => ps.text.includes(d)), `${tag}: parent house sheet shows the dates`, ps.text.slice(0, 260));
    const dates = (t) => (t.match(/\d{1,2}\. \w+ \d{4}/g) ?? []).join(",");
    check(dates(ps.text) === dates(cs.text) && dates(ps.text).length > 0, `${tag}: same dates as in the child's sheet`, `${dates(cs.text)} vs ${dates(ps.text)}`);
    check(ps.selects === 0 && ps.forms === 0 && ps.inputs === 0 && !ps.buttons.some((b) => /speichern|verschieben|öffnen|löschen/i.test(b)) && ps.text.includes("Nur ansehen"), `${tag}: parent house sheet is read-only (no form, select, save, move or open link)`, JSON.stringify(ps.buttons));
    check(!/PROBE-GEHEIME-NOTIZ|PROBE-KONTAKT|Deine Notizen/.test(ps.text), `${tag}: no notes or contacts in the parent sheet`);
    check(cs.selects === 1 && cs.text.includes("PROBE-GEHEIME-NOTIZ"), `${tag}: (sanity) the child's own sheet has the status select and its notes`);
    const [cpng, ppng] = [await child.page.screenshot(), await parent.page.screenshot()];
    writeFileSync(join(OUT, `parent-${tag}-house-open.png`), ppng);
    await sideBySide(cpng, ppng, `side-by-side-${tag}-house-open.png`, `${tag}: house sheet · child (left, editable) · parent (right, read-only)`);

    // network: the parent view only ever calls the read RPC (all requests recorded from page load until now)
    const writes = parent.requests.filter((q) => !["GET", "HEAD", "OPTIONS"].includes(q.method) && !(q.method === "POST" && (q.path === READ_RPC || SHELL_RPCS.includes(q.path))));
    const otherRpc = parent.requests.filter((q) => q.path.startsWith("/rest/v1/rpc/") && q.path !== READ_RPC && !SHELL_RPCS.includes(q.path));
    const shell = parent.requests.filter((q) => SHELL_RPCS.includes(q.path));
    // The shell also reads the CALLER's own onboarding flags (lib/role.ts: GET /rest/v1/profiles?user_id=eq.<self>, RLS = own row).
    const tables = parent.requests.filter((q) => q.path.startsWith("/rest/v1/") && !q.path.startsWith("/rest/v1/rpc/") && !(q.method === "GET" && q.path === "/rest/v1/profiles"));
    const dataWrites = writes.filter((q) => !q.path.startsWith("/auth/v1/"));
    report.views.at(-1).writes = writes; report.views.at(-1).otherRpc = otherRpc; report.views.at(-1).shellRpcs = shell;
    check(parent.requests.filter((q) => q.method === "POST" && q.path === READ_RPC).length >= 1, `${tag}: parent view called POST ${READ_RPC}`);
    check(dataWrites.length === 0, `${tag}: ZERO write requests in the parent view (no PATCH/PUT/DELETE, no POST except ${READ_RPC} + the app-shell reads)`, JSON.stringify(writes));
    check(otherRpc.length === 0, `${tag}: no RPC besides family_child_village and the global app-shell reads (${SHELL_RPCS.map((s) => s.split("/").pop()).join(", ")})`, JSON.stringify(otherRpc));
    check(tables.length === 0, `${tag}: no direct table request (applications, map_*, ...) in the parent view`, JSON.stringify(tables));
    check(SHELL_RPCS.every((s) => child.requests.some((q) => q.path === s)), `${tag}: (context) the same app-shell RPCs run on the child's own /map too`);
    log(`${tag}: app-shell RPCs in the parent view: ${shell.map((q) => q.path.split("/").pop()).join(", ")}`);
    if (writes.length > dataWrites.length) log(`${tag}: auth-only requests: ${JSON.stringify(writes.filter((q) => q.path.startsWith("/auth/v1/")))}`);
    log(`${tag}: parent requests: ${[...new Set(parent.requests.map((q) => `${q.method} ${q.path}`))].join(", ")}`);
    await child.ctx.close(); await parent.ctx.close();
  }
} catch (e) {
  check(false, "run", e.stack ?? e.message);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await cleanup().catch((e) => check(false, "cleanup", e.message));
  writeFileSync(join(OUT, "e2e-report.json"), JSON.stringify({ results, report, failed }, null, 1));
  console.log(failed ? `E2E FAIL (${failed})` : "E2E PASS");
  process.exit(failed ? 1 : 0);
}
