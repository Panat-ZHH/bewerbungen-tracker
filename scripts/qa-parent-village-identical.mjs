// Independent QA check (fresh reviewer, 2026-11-22): parent village (/familie/kind/[id]/dorf) must look and move exactly like the
// friend village (/friends/[id]) of the same child, and only an active parent link may open it.
// Real rendering (Chrome + SwiftShader WebGL) against a local `next start` build and the REAL Supabase project, with throwaway
// probe users only (probe-pvqa-<stamp>-*@example.invalid), deleted in `finally` / on SIGINT. Secrets are never printed.
//
//   npm run build && npx next start -p 3437 &
//   BASE=http://localhost:3437 node scripts/qa-parent-village-identical.mjs
//
// Differences to the builder's script: own probe prefix, the child also has a MOVED house (map_layouts) and PLACED shop items
// (map_items) and 2 islands, privacy negatives (unlinked parent, anonymous, removed child link, village switched off) and the
// positive "application list shared" case. Output: _onboarding/parent-village-identical/qa-*.png + qa-report.json.
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
const PW = [join(ROOT, "node_modules/playwright-core/index.mjs"), join(ROOT, "node_modules/playwright/index.mjs"), join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].find(existsSync);
const { chromium, devices } = await import(PW);
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:3437";
const OUT = join(ROOT, "_onboarding/parent-village-identical");
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(readFileSync(join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ref = new URL(SUPA_URL).hostname.split(".")[0];
if (ref !== "bhwreehwirrloxagyypi") { console.error("unexpected project"); process.exit(2); }
let SERVICE = process.env.SERVICE_ROLE_KEY;
if (!SERVICE) {
  const out = spawnSync(join(homedir(), "JARVIS/bin/sb"), ["privat", "projects", "api-keys", "--project-ref", ref, "-o", "json"], { encoding: "utf8" });
  try { SERVICE = JSON.parse(out.stdout).find((k) => k.name === "service_role")?.api_key; } catch { SERVICE = undefined; }
}
if (!SERVICE) { console.error("no service role key"); process.exit(2); }
const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const PREFIX = "probe-pvqa-";
const stamp = Date.now();
const PASSWORD = `Qa-${stamp}-Pw!z`;
const created = [];
const results = [];
let failed = 0;
const check = (ok, name, info = "") => { if (!ok) failed++; const line = `${ok ? "PASS" : "FAIL"} ${name}${info ? " — " + String(info).slice(0, 400) : ""}`; results.push(line); console.log(line); return !!ok; };
const log = (s) => { results.push("INFO " + s); console.log("INFO " + s); };
const must = async (p, what) => { const r = await p; if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

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
let cleaned = false;
async function cleanup() {
  if (cleaned) return; cleaned = true;
  const users = [...created, ...(await probeAccounts().catch(() => []))].filter((u, i, a) => a.findIndex((x) => x.id === u.id) === i);
  const ids = users.map((u) => u.id);
  if (ids.length) {
    const fm = await admin.from("family_members").select("family_id").in("user_id", ids).then((r) => r.data ?? [], () => []);
    const famIds = [...new Set(fm.map((r) => r.family_id))];
    if (famIds.length) { const { error } = await admin.from("families").delete().in("id", famIds); check(!error, `cleanup: ${famIds.length} probe families deleted`, error?.message); }
    for (const u of users) {
      for (const table of ["applications", "map_islands", "map_items", "map_layouts"]) await admin.from(table).delete().eq("user_id", u.id).then(() => undefined, () => undefined);
      const { error } = await admin.auth.admin.deleteUser(u.id);
      check(!error, `cleanup: probe ${u.label} ${u.id.slice(0, 8)}… deleted`, error?.message);
    }
  }
  const left = await probeAccounts().catch(() => null);
  check(left !== null && left.length === 0, "cleanup verified: no probe-pvqa-* account left", `left=${left?.length}`);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await cleanup().catch(() => undefined); process.exit(130); });

async function raw(png, skipTop = 0) {
  const img = sharp(png).removeAlpha();
  if (skipTop) { const { width, height } = await sharp(png).metadata(); img.extract({ left: 0, top: skipTop, width, height: height - skipTop }); }
  return img.raw().toBuffer({ resolveWithObject: true });
}
async function pixelDiff(a, b, diffPath = null, skipTop = 0) {
  const [ra, rb] = await Promise.all([raw(a, skipTop), raw(b, skipTop)]);
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

const HOST = "[aria-label='3D-Bewerbungsdorf']";
const pixel7 = { ...devices["Pixel 7"] }; delete pixel7.defaultBrowserType;
const PROFILES = [
  { tag: "390", ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  { tag: "pixel7", ctx: pixel7 },
  { tag: "pixel7-cpu4", ctx: pixel7, cpu: 4 },
  { tag: "pixel7-still", ctx: { ...pixel7, reducedMotion: "reduce" } },
];

async function open(browser, u, path, profile) {
  const ctx = await browser.newContext({ ...profile.ctx, colorScheme: "light" });
  await ctx.addInitScript(({ key, session }) => {
    try { localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); localStorage.setItem("wendapply-theme", "light"); if (session) localStorage.setItem(key, JSON.stringify(session)); } catch { /* */ }
  }, { key: `sb-${ref}-auth-token`, session: u?.session ?? null });
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage();
  const errors = [], writes = [], editUi = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  page.on("request", (r) => { const url = r.url(); if (!url.startsWith(SUPA_URL)) return; const p = new URL(url).pathname;
    if (p.startsWith("/rest/v1/rpc/") && /save|move|buy|place|unlock|layout|purchase|delete|update|shop_state|spend/.test(p)) writes.push("rpc " + p.split("/").pop());
    else if (p.startsWith("/rest/v1/") && !p.startsWith("/rest/v1/rpc/") && !["GET", "HEAD", "OPTIONS"].includes(r.method())) writes.push(`${r.method()} ${p}`); });
  if (profile.cpu) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu }); }
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  return { ctx, page, errors, writes, editUi };
}

async function measure(browser, u, path, profile, who) {
  const { ctx, page, errors, writes } = await open(browser, u, path, profile);
  await page.waitForFunction((s) => document.querySelector(s)?.__map && document.querySelectorAll("[data-building]").length > 0, HOST, { timeout: 90000 });
  await page.waitForTimeout(profile.cpu ? 6000 : 3500);
  const host = page.locator(HOST).first();
  const state = () => page.evaluate((s) => { const el = document.querySelector(s); const r = el.getBoundingClientRect();
    const buttons = [...document.querySelectorAll("button, a")].map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()).filter(Boolean);
    return { camera: el.__map.camera(), frames: el.__map.stats.frames, host: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }, dpr: devicePixelRatio,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, buttons,
      labels: [...document.querySelectorAll("[data-building]")].map((e) => { const b = e.getBoundingClientRect(); return { text: e.innerText.replace(/\s+/g, " ").trim(), x: Math.round(b.left), y: Math.round(b.top), vis: getComputedStyle(e).visibility }; }) }; }, HOST);
  const s0 = await state(); const t0 = Date.now();
  const frames = [];
  for (let i = 0; i < 3; i++) { if (i) await page.waitForTimeout(1000); frames.push(await host.screenshot()); }
  const s1 = await state(); const sec = (Date.now() - t0) / 1000;
  const name = `qa-${who}-${profile.tag}`;
  frames.forEach((png, i) => writeFileSync(join(OUT, `${name}-f${i + 1}.png`), png));
  const d12 = await pixelDiff(frames[0], frames[1], join(OUT, `${name}-anim-diff12.png`));
  const d23 = await pixelDiff(frames[1], frames[2]);
  // Try a drag on a house label area: read-only must not move anything (camera pan is allowed, layouts must not be written).
  await page.mouse.move(s0.host.w / 2, s0.host.h / 2); await page.mouse.down(); await page.mouse.move(s0.host.w / 2 + 60, s0.host.h / 2 + 40, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(800);
  await ctx.close();
  return { name, who, profile: profile.tag, camera: s0.camera, host: s0.host, dpr: s0.dpr, reduced: s0.reduced, framesRendered: s1.frames - s0.frames, fps: Math.round((s1.frames - s0.frames) / sec * 10) / 10,
    d12, d23, labels: s0.labels, buttons: s0.buttons, first: frames[0], errors, writes };
}

const report = { base: BASE, views: [], pairs: [], privacy: {} };
let browser;
try {
  const P = await mkUser("parent", { role: "student", account_type: "parent", full_name: "QA Elternteil", student_onboarded: true });
  const C = await mkUser("child", { role: "student", full_name: "QA Kind", student_onboarded: true, role_confirmed: true });
  const F = await mkUser("friend", { role: "student", full_name: "QA Freund", student_onboarded: true, role_confirmed: true });
  const X = await mkUser("stranger", { role: "student", account_type: "parent", full_name: "QA Fremd", student_onboarded: true });
  const p = await signIn(P), c = await signIn(C), f = await signIn(F), x = await signIn(X);
  log(`probes: ${created.map((u) => `${u.label}=${u.id.slice(0, 8)}…`).join(", ")}`);

  const statuses = ["rejected", "interview", "offer", "applied", "rejected", "preparing", "withdrawn", "applied", "rejected", "saved", "final_interview", "rejected", "applied", "interview"];
  const now = Date.now();
  const rows = statuses.map((status, i) => ({ id: crypto.randomUUID(), user_id: C.id, company: `QA Geheimfirma ${i + 1}`, position: "Lehrstelle", status, category: "other", currency: "CHF",
    notes: "QA-SECRET-NOTE", created_at: new Date(now - (50 - i) * 864e5).toISOString(), updated_at: new Date(now - i * 864e5).toISOString() }));
  await must(c.from("applications").insert(rows), "child applications");
  // A moved house and placed shop items, so layouts/items go through both RPCs and both parsers.
  await must(admin.from("map_layouts").insert([{ user_id: C.id, object_id: `house:${rows[1].id}`, x: 6, z: 2, rotation: 1 }]), "layout");
  await must(admin.from("map_items").insert([
    { id: crypto.randomUUID(), user_id: C.id, item_type: "fountain", price_paid: 150, x: 3, z: -4, rotation: 0, created_at: new Date(now - 5e6).toISOString() },
    { id: crypto.randomUUID(), user_id: C.id, item_type: "tree", price_paid: 40, x: -3, z: 5, rotation: 0, created_at: new Date(now - 4e6).toISOString() },
    { id: crypto.randomUUID(), user_id: C.id, item_type: "bench", price_paid: 50, x: null, z: null, rotation: 0, created_at: new Date(now - 3e6).toISOString() },
  ]), "items");

  await must(p.rpc("account_set_type", { p_type: "parent" }), "parent type");
  await must(p.rpc("family_create", { p_name: "QA Familie" }), "family_create");
  const inv = await must(p.rpc("family_create_invite", { p_direction: "parent_invites_child" }), "invite");
  await must(c.rpc("account_set_type", { p_type: "independent_student", p_birth_year: 2008 }), "child type");
  await must(c.rpc("family_join", { p_code: inv.code ?? inv[0]?.code }), "family_join");
  await must(c.rpc("family_set_share", { p_settings: { progress: true, applications: false, village: true, documents: false } }), "family share");
  const prof = await must(c.rpc("social_my_profile"), "profile");
  await must(c.rpc("social_update_profile", { p_display_name: null, p_avatar_seed: null, p_share_with_friends: true }), "share_with_friends");
  await must(f.rpc("social_send_request", { p_code_or_email: prof[0].invite_code }), "friend request");
  const incoming = (await must(c.rpc("social_list"), "social_list")).find((r) => r.state === "incoming");
  await must(c.rpc("social_respond_request", { p_request_id: incoming.id, p_accept: true }), "accept");
  // Stranger parent: has an own family (so app access / PAYWALL is not the reason for the refusal) but no link to the child.
  await x.rpc("account_set_type", { p_type: "parent" }); await x.rpc("family_create", { p_name: "QA Fremdfamilie" });

  // ---------- API level ----------
  const pv = await must(p.rpc("family_child_village", { p_child_id: C.id }), "family_child_village");
  const fv = await must(f.rpc("map_friend_island", { p_friend_id: C.id }), "map_friend_island");
  const pvs = JSON.stringify(pv);
  report.api = { parentStatusesRaw: pv.houses.map((h) => h.status), friendStatuses: fv.applications.map((h) => h.status), parentIdsAreUuids: pv.houses.some((h) => h.id.length > 8), layouts: pv.layouts, items: pv.items.length };
  log(`live RPC parent statuses: ${report.api.parentStatusesRaw.join(",")} (live DB = old RPC unless the migration was applied)`);
  log(`live RPC friend statuses: ${report.api.friendStatuses.join(",")}`);
  check(!pvs.includes("QA Geheimfirma") && !pvs.includes("QA-SECRET-NOTE") && !pvs.includes("Lehrstelle"), "privacy: parent payload has no company/position/notes (list not shared)");
  const { parseFamilyVillage } = await import(join(ROOT, "lib/family-village.ts")).catch(() => ({}));
  if (parseFamilyVillage) {
    const parsed = parseFamilyVillage(pv);
    const { parseFriendIsland } = await import(join(ROOT, "lib/friend-island.ts")).catch(() => ({}));
    const fp = parseFriendIsland ? parseFriendIsland(fv) : null;
    if (fp) {
      check(JSON.stringify(parsed.applications.map((a) => [a.id, a.status, a.company])) === JSON.stringify(fp.applications.map((a) => [a.id, a.status, a.company])), "parsed houses (id, status, label) parent == friend");
      check(JSON.stringify(parsed.layouts) === JSON.stringify(fp.layouts), "parsed layouts parent == friend", JSON.stringify(parsed.layouts));
      check(JSON.stringify(parsed.items) === JSON.stringify(fp.items), "parsed items parent == friend");
    }
  }

  const anon = createClient(SUPA_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const ra = await anon.rpc("family_child_village", { p_child_id: C.id });
  check(!!ra.error && !ra.data, "privacy: anonymous RPC refused", ra.error?.message);
  const rx = await x.rpc("family_child_village", { p_child_id: C.id });
  check(!!rx.error && !rx.data, "privacy: unlinked parent (other family) refused", rx.error?.message);
  const rf = await f.rpc("family_child_village", { p_child_id: C.id });
  check(!!rf.error && !rf.data, "privacy: friend (not a parent) cannot call the parent RPC", rf.error?.message);
  const rc = await c.rpc("family_child_village", { p_child_id: C.id });
  check(!!rc.error && !rc.data, "privacy: child itself cannot call the parent RPC", rc.error?.message);
  report.privacy.api = { anon: ra.error?.message, stranger: rx.error?.message, friend: rf.error?.message, child: rc.error?.message };

  // ---------- rendering ----------
  browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  for (const profile of PROFILES) {
    const pair = {};
    for (const [who, u, path] of [["friend", F, `/friends/${C.id}`], ["parent", P, `/familie/kind/${C.id}/dorf`]]) {
      const r = await measure(browser, u, path, profile, who);
      pair[who] = r;
      const rest = { ...r }; delete rest.first; report.views.push(rest);
      check(r.errors.length === 0, `${r.name}: no console errors`, r.errors.join(" | "));
      check(r.writes.length === 0, `${r.name}: no write requests (also after a drag)`, r.writes.join(", "));
      if (r.reduced) check(r.d12.changed === 0, `${r.name}: reduced motion → still (by design)`, `diff12=${r.d12.changed}`);
      else check(r.framesRendered > 0 && r.d12.changed > 1000 && r.d23.changed > 1000, `${r.name}: animated`, `frames=${r.framesRendered} fps=${r.fps} diff12=${r.d12.changed}px (${r.d12.pct}%) diff23=${r.d23.changed}px (${r.d23.pct}%)`);
    }
    const { friend, parent } = pair;
    const camEq = ["x", "z", "zoom"].every((k) => Math.abs(friend.camera[k] - parent.camera[k]) < 1e-6);
    check(camEq, `${profile.tag}: initial camera equal`, `friend=${JSON.stringify(friend.camera)} parent=${JSON.stringify(parent.camera)}`);
    check(JSON.stringify(friend.host) === JSON.stringify(parent.host), `${profile.tag}: map box equal`, `${JSON.stringify(friend.host)} vs ${JSON.stringify(parent.host)}`);
    const lt = (r) => r.labels.map((l) => l.text).join("|"), lp = (r) => r.labels.map((l) => `${l.x},${l.y},${l.vis}`).join(" ");
    check(lt(friend) === lt(parent), `${profile.tag}: label texts equal`, lt(parent).slice(0, 200));
    check(lp(friend) === lp(parent), `${profile.tag}: label positions equal (initial framing)`);
    check(!/ruin|Absage|Zusage|Zurückgezogen/i.test(lt(parent)), `${profile.tag}: parent shows no result labels (not shared)`, lt(parent).slice(0, 160));
    const editWords = /shop|laden|kaufen|münz|coin|bearbeiten|verschieben|platzieren/i;
    check(!parent.buttons.some((b) => editWords.test(b)), `${profile.tag}: parent has no shop/coins/edit controls`, parent.buttons.filter((b) => editWords.test(b)).join(", "));
    const scene = await pixelDiff(friend.first, parent.first, join(OUT, `qa-friend-vs-parent-${profile.tag}-diff.png`), Math.round(80 * friend.dpr));
    report.pairs.push({ profile: profile.tag, camera: friend.camera, sceneDiff: scene, labelsEqual: lt(friend) === lt(parent) });
    if (friend.reduced) check(scene.changed === 0, `${profile.tag}: still frame friend vs parent pixel-identical below the top bar`, `${scene.changed}px (${scene.pct}%)`);
    else log(`${profile.tag}: animated first frame friend vs parent: ${scene.changed}px (${scene.pct}%) (animation phase)`);
    if (profile.tag === "pixel7") {
      writeFileSync(join(OUT, "qa-friend-pixel7.png"), friend.first); writeFileSync(join(OUT, "qa-parent-pixel7.png"), parent.first);
      const m = await sharp(friend.first).metadata();
      await sharp({ create: { width: m.width * 2 + 24, height: m.height, channels: 3, background: "#ffffff" } })
        .composite([{ input: friend.first, left: 0, top: 0 }, { input: parent.first, left: m.width + 24, top: 0 }]).png().toBuffer()
        .then((buf) => sharp(buf).resize({ width: 1000 }).png().toFile(join(OUT, "qa-side-by-side-friend-left-parent-right.png")));
    }
  }

  // ---------- page-level privacy ----------
  const pageState = async (u, tag) => {
    const { ctx, page } = await open(browser, u, `/familie/kind/${C.id}/dorf`, PROFILES[1]);
    await page.waitForTimeout(7000);
    const st = await page.evaluate(() => ({ url: location.pathname, state: document.querySelector("[data-village-state]")?.getAttribute("data-village-state") ?? null, houses: document.querySelectorAll("[data-building]").length, text: document.body.innerText.slice(0, 200).replace(/\s+/g, " ") }));
    await page.screenshot({ path: join(OUT, `qa-privacy-${tag}.png`) });
    await ctx.close();
    return st;
  };
  const sAnon = await pageState(null, "anonymous");
  check(sAnon.houses === 0, "privacy page: anonymous sees no village", JSON.stringify(sAnon));
  const sX = await pageState(X, "unlinked-parent");
  check(sX.houses === 0 && sX.state !== "ready", "privacy page: unlinked parent sees no village", JSON.stringify(sX));

  // Child switches the village off → parent refused immediately.
  await must(c.rpc("family_set_share", { p_settings: { progress: true, applications: false, village: false, documents: false } }), "village off");
  const roff = await p.rpc("family_child_village", { p_child_id: C.id });
  check(!!roff.error, "privacy: village switched off → refused", roff.error?.message);
  const sOff = await pageState(P, "village-off");
  check(sOff.houses === 0, "privacy page: village off → parent sees no village", JSON.stringify(sOff));

  // Positive: child shares the application list → parent gets company names + real results (intended family setting).
  await must(c.rpc("family_set_share", { p_settings: { progress: true, applications: true, village: true, documents: false } }), "list on");
  const pon = await must(p.rpc("family_child_village", { p_child_id: C.id }), "village list on");
  const { parseFamilyVillage: pf2 } = await import(join(ROOT, "lib/family-village.ts"));
  const parsedOn = pf2(pon);
  check(parsedOn.applications.some((a) => a.company.startsWith("QA Geheimfirma")) && parsedOn.applications.some((a) => a.status === "rejected"), "list shared → parent sees company names and results (intended)");
  check(!JSON.stringify(pon).includes("QA-SECRET-NOTE"), "list shared → still no notes in payload");

  // Inactive link: parent removes the child from the family → refused.
  await must(p.rpc("family_remove_member", { p_user_id: C.id }), "remove child");
  const rrm = await p.rpc("family_child_village", { p_child_id: C.id });
  check(!!rrm.error, "privacy: removed (inactive) child link → refused", rrm.error?.message);
  const sRm = await pageState(P, "removed-link");
  check(sRm.houses === 0, "privacy page: removed link → no village", JSON.stringify(sRm));
  report.privacy.pages = { anonymous: sAnon, unlinked: sX, villageOff: sOff, removed: sRm, villageOffError: roff.error?.message, removedError: rrm.error?.message };
} catch (e) {
  check(false, "run", e.stack ?? e.message);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await cleanup().catch((e) => check(false, "cleanup", e.message));
  writeFileSync(join(OUT, "qa-report.json"), JSON.stringify({ results, report, failed }, null, 1));
  console.log(failed ? `QA E2E FAIL (${failed})` : "QA E2E PASS");
  process.exit(failed ? 1 : 0);
}
