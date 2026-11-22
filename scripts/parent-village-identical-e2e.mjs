// Parent village must be IDENTICAL to the friend village (same child, same moment), also on Android phones.
// Real rendering (Chrome + SwiftShader WebGL) against a local `next start` build and the REAL Supabase project, with
// THROWAWAY probe users only (probe-pv-<stamp>-*@example.invalid). They are deleted at the end, also on failure / Ctrl-C,
// and any probe-pv-* account left over from an earlier crashed run is swept first. Secrets are never printed.
//
//   npm run build && npx next start -p 3427 &
//   PHASE=after BASE=http://localhost:3427 node scripts/parent-village-identical-e2e.mjs
//
// Env: PHASE (before|after, prefix of the images), BASE, CHROME (Chrome binary), PLAYWRIGHT (playwright-core index.mjs),
//      SERVICE_ROLE_KEY (else fetched with ~/JARVIS/bin/sb privat ... api-keys).
// Output: _onboarding/parent-village-identical/<phase>-*.png and <phase>-report.json. Exit 1 when a check fails.
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
const { chromium, devices } = await import(PLAYWRIGHT);
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:3427";
const PHASE = process.env.PHASE || "run";
const OUT = join(ROOT, "_onboarding/parent-village-identical");
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

const PREFIX = "probe-pv-";
const stamp = Date.now();
const PASSWORD = `Pv-${stamp}-Pw!x`;
const created = [];
const results = [];
let failed = 0;
const check = (ok, name, info = "") => { if (!ok) failed++; const line = `${ok ? "PASS" : "FAIL"} ${name}${info ? " — " + String(info).slice(0, 400) : ""}`; results.push(line); console.log(line); return !!ok; };
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
  check(leftover !== null && leftover.length === 0, "cleanup verified: no probe-pv-* account left in auth.users", `left=${leftover?.length}`);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { console.log(`\n${signal}: cleaning up probe users`); await cleanup().catch((e) => console.error(e.message)); process.exit(130); });

// ---------- measuring ----------
async function raw(png, skipTop = 0) {
  const img = sharp(png).removeAlpha();
  if (skipTop) { const { width, height } = await sharp(png).metadata(); img.extract({ left: 0, top: skipTop, width, height: height - skipTop }); }
  return img.raw().toBuffer({ resolveWithObject: true });
}
/** Changed pixels (RGB sum difference > 24); optional diff image (changed = magenta on a dimmed copy). */
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
const PROFILES = [
  { tag: "m390", ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  { tag: "pixel7", ctx: { ...devices["Pixel 7"] } },
  { tag: "pixel7-cpu4", ctx: { ...devices["Pixel 7"] }, cpu: 4 },
  { tag: "pixel7-reduced", ctx: { ...devices["Pixel 7"], reducedMotion: "reduce" } },
];
delete PROFILES[1].ctx.defaultBrowserType; delete PROFILES[2].ctx.defaultBrowserType; delete PROFILES[3].ctx.defaultBrowserType;

async function view(browser, u, path, profile, who) {
  const ctx = await browser.newContext({ ...profile.ctx, colorScheme: "light" });
  await ctx.addInitScript(({ key, session }) => {
    try { localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); localStorage.setItem("wendapply-theme", "light"); localStorage.setItem(key, JSON.stringify(session)); } catch { /* */ }
  }, { key: `sb-${ref}-auth-token`, session: u.session });
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage();
  const errors = []; const writes = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  page.on("request", (r) => { const url = r.url(); if (!url.startsWith(SUPA_URL)) return; const p = new URL(url).pathname;
    if (p.startsWith("/rest/v1/rpc/")) { if (/save|move|buy|place|unlock|layout_set|set_layout|purchase|delete|update/.test(p)) writes.push("rpc " + p.split("/").pop()); }
    else if (p.startsWith("/rest/v1/") && !["GET", "HEAD", "OPTIONS"].includes(r.method())) writes.push(`${r.method()} ${p}`); });
  if (profile.cpu) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu }); }
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((s) => document.querySelector(s)?.__map && document.querySelectorAll("[data-building]").length > 0, HOST, { timeout: 90000 });
  await page.waitForTimeout(profile.cpu ? 5000 : 3000);
  const host = page.locator(HOST).first();
  const state = () => page.evaluate((s) => { const el = document.querySelector(s); const r = el.getBoundingClientRect();
    return { camera: el.__map.camera(), frames: el.__map.stats.frames, populate: el.__map.stats.populate, host: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, dpr: devicePixelRatio, ua: navigator.userAgent.slice(0, 60),
      labels: [...document.querySelectorAll("[data-building]")].map((e) => { const b = e.getBoundingClientRect(); return { text: e.innerText.replace(/\s+/g, " ").trim(), visible: getComputedStyle(e).visibility === "visible", x: Math.round(b.left), y: Math.round(b.top) }; }) }; }, HOST);
  const s0 = await state(); const t0 = Date.now();
  const frames = [];
  for (let i = 0; i < 3; i++) { if (i) await page.waitForTimeout(1000); frames.push(await host.screenshot()); }
  const s1 = await state(); const seconds = (Date.now() - t0) / 1000;
  const name = `${PHASE}-${who}-${profile.tag}`;
  frames.forEach((png, i) => writeFileSync(join(OUT, `${name}-frame${i + 1}.png`), png));
  const d12 = await pixelDiff(frames[0], frames[1], join(OUT, `${name}-diff12.png`));
  const d23 = await pixelDiff(frames[1], frames[2]);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  await ctx.close();
  return { name, who, profile: profile.tag, path, camera: s0.camera, cameraAfter: s1.camera, host: s0.host, dpr: s0.dpr, reduced: s0.reduced, ua: s0.ua,
    framesRendered: s1.frames - s0.frames, fps: Math.round((s1.frames - s0.frames) / seconds * 10) / 10, populateCalls: s1.populate,
    diff12: d12, diff23: d23, labels: s0.labels, firstFrame: frames[0], errors, writes };
}

// ---------- run ----------
let browser;
const report = { phase: PHASE, base: BASE, views: [], pairs: [] };
try {
  const sweep = await probeAccounts();
  if (sweep.length) { log(`sweeping ${sweep.length} leftover probe account(s) from an earlier run`); await deleteProbes(sweep, "sweep"); }

  const P = await mkUser("parent", { role: "student", account_type: "parent", full_name: "PV Elternteil", student_onboarded: true });
  const C = await mkUser("child", { role: "student", full_name: "PV Kind", student_onboarded: true, role_confirmed: true });
  const F = await mkUser("friend", { role: "student", full_name: "PV Freundin", student_onboarded: true, role_confirmed: true });
  const p = await signIn(P), c = await signIn(C), f = await signIn(F);
  log(`probe users: ${created.map((u) => `${u.label}=${u.id.slice(0, 8)}…`).join(", ")}`);

  // Like the real village in Panat's photo: 12 houses, half of them rejected (burnt), the rest in progress.
  const statuses = ["interview", "rejected", "rejected", "applied", "rejected", "preparing", "rejected", "applied", "rejected", "saved", "rejected", "interview"];
  const now = Date.now();
  const rows = statuses.map((status, i) => ({ id: crypto.randomUUID(), user_id: C.id, company: `PV Firma ${i + 1}`, position: "Lehrstelle", status, category: "other", currency: "CHF",
    created_at: new Date(now - (40 - i) * 864e5).toISOString(), updated_at: new Date(now - i * 864e5).toISOString() }));
  await must(c.from("applications").insert(rows), "child applications");
  await must(p.rpc("account_set_type", { p_type: "parent" }), "parent type");
  await must(p.rpc("family_create", { p_name: "PV Familie" }), "family_create");
  const inv = await must(p.rpc("family_create_invite", { p_direction: "parent_invites_child" }), "invite");
  await must(c.rpc("account_set_type", { p_type: "independent_student", p_birth_year: 2008 }), "child type");
  await must(c.rpc("family_join", { p_code: inv.code ?? inv[0]?.code }), "family_join");
  // The real case: the village is shared with the family, the application list is not. Friends: app defaults (companies + outcomes off).
  await must(c.rpc("family_set_share", { p_settings: { progress: true, applications: false, village: true, documents: false } }), "family share");
  const prof = await must(c.rpc("social_my_profile"), "profile");
  await must(c.rpc("social_update_profile", { p_display_name: null, p_avatar_seed: null, p_share_with_friends: true }), "share_with_friends");
  await must(f.rpc("social_send_request", { p_code_or_email: prof[0].invite_code }), "friend request");
  const incoming = (await must(c.rpc("social_list"), "social_list")).find((x) => x.state === "incoming");
  await must(c.rpc("social_respond_request", { p_request_id: incoming.id, p_accept: true }), "accept");

  const pv = await must(p.rpc("family_child_village", { p_child_id: C.id }), "family_child_village");
  const fv = await must(f.rpc("map_friend_island", { p_friend_id: C.id }), "map_friend_island");
  const parentStatuses = pv.houses.map((h) => h.status), friendStatuses = fv.applications.map((h) => h.status);
  report.api = { parentStatuses, friendStatuses, parentIds: pv.houses.map((h) => h.id.length > 8 ? "uuid" : h.id), friendIds: fv.applications.map((h) => h.id) };
  log(`RPC statuses parent=${parentStatuses.join(",")}`);
  log(`RPC statuses friend=${friendStatuses.join(",")}`);
  check(!JSON.stringify(pv).includes("PV Firma"), "privacy: no company names in the parent payload (application list not shared)");
  check(!JSON.stringify(fv).includes("PV Firma"), "privacy: no company names in the friend payload (companies not shared with friends)");

  browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  for (const profile of PROFILES) {
    const pair = {};
    for (const [who, u, path] of [["friend", F, `/friends/${C.id}`], ["parent", P, `/familie/kind/${C.id}/dorf`]]) {
      const r = await view(browser, u, path, profile, who);
      pair[who] = r;
      const rest = { ...r }; delete rest.firstFrame; report.views.push(rest);
      console.log(JSON.stringify({ ...rest, labels: rest.labels.length }));
      check(r.errors.length === 0, `${r.name}: no console errors`, r.errors.join(" | "));
      check(r.writes.length === 0, `${r.name}: no write requests`, r.writes.join(", "));
      if (profile.tag === "pixel7-reduced") check(r.reduced, `${r.name}: prefers-reduced-motion is on (animations intentionally still)`, `diff12=${r.diff12.changed}px`);
      else check(r.framesRendered > 0 && r.diff12.changed > 0 && r.diff23.changed > 0, `${r.name}: animated (3 frames 1 s apart differ)`, `frames=${r.framesRendered} fps=${r.fps} diff12=${r.diff12.changed}px (${r.diff12.pct}%) diff23=${r.diff23.changed}px (${r.diff23.pct}%)`);
    }
    const { friend, parent } = pair;
    const cam = (a, b) => Math.abs(a.camera.x - b.camera.x) < 1e-3 && Math.abs(a.camera.z - b.camera.z) < 1e-3 && Math.abs(a.camera.zoom - b.camera.zoom) < 1e-3;
    const labelText = (r) => r.labels.map((l) => l.text).join(" | ");
    const labelPos = (r) => r.labels.map((l) => `${l.x},${l.y},${l.visible}`).join(" ");
    const first = await pixelDiff(friend.firstFrame, parent.firstFrame, join(OUT, `${PHASE}-friend-vs-parent-${profile.tag}-diff.png`));
    // The top bar (back button, owner chip: the friend's avatar vs. a home icon for the child) differs on purpose; the scene
    // below it must not. 80 CSS px = the top bar incl. its shadow.
    const scene = await pixelDiff(friend.firstFrame, parent.firstFrame, null, Math.round(80 * friend.dpr));
    const entry = { sceneDiff: scene, profile: profile.tag, cameraFriend: friend.camera, cameraParent: parent.camera, hostFriend: friend.host, hostParent: parent.host,
      labelsEqual: labelText(friend) === labelText(parent), labelPositionsEqual: labelPos(friend) === labelPos(parent), labelsFriend: labelText(friend), labelsParent: labelText(parent), firstFrameDiff: first };
    report.pairs.push(entry);
    check(cam(friend, parent), `${profile.tag}: parent camera = friend camera (start position / zoom)`, `friend=${JSON.stringify(friend.camera)} parent=${JSON.stringify(parent.camera)}`);
    check(friend.host.w === parent.host.w && friend.host.h === parent.host.h && friend.host.top === parent.host.top, `${profile.tag}: same map size`, `friend=${JSON.stringify(friend.host)} parent=${JSON.stringify(parent.host)}`);
    check(entry.labelsEqual, `${profile.tag}: same house labels`, entry.labelsEqual ? "" : `friend: ${entry.labelsFriend} || parent: ${entry.labelsParent}`);
    check(entry.labelPositionsEqual, `${profile.tag}: labels at the same screen positions`);
    // With reduced motion nothing animates, so identical scenes must give (almost) identical pixels. Animated profiles: info only.
    if (profile.tag === "pixel7-reduced") check(scene.changed === 0, `${profile.tag}: still frame friend vs parent pixel-identical below the top bar`, `scene ${scene.changed}px (${scene.pct}%), whole frame incl. owner chip ${first.changed}px (${first.pct}%)`);
    else log(`${profile.tag}: first frame friend vs parent: scene ${scene.changed}px (${scene.pct}%), whole frame ${first.changed}px (${first.pct}%) — includes animation phase`);
    if (profile.tag === "pixel7") {
      writeFileSync(join(OUT, `${PHASE}-friend.png`), friend.firstFrame);
      writeFileSync(join(OUT, `${PHASE}-parent.png`), parent.firstFrame);
    }
  }
} catch (e) {
  check(false, "run", e.stack ?? e.message);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await cleanup().catch((e) => check(false, "cleanup", e.message));
  writeFileSync(join(OUT, `${PHASE}-report.json`), JSON.stringify({ results, report, failed }, null, 1));
  console.log(failed ? `E2E FAIL (${failed})` : "E2E PASS");
  process.exit(failed ? 1 : 0);
}
