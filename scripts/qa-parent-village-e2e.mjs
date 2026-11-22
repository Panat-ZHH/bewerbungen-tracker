// QA (independent reviewer, 2026-11-22): child /map vs parent /familie/kind/[id]/dorf, rendered in real Chrome against a local
// `next start` build. Supabase is FULLY MOCKED at network level (page.route on the Supabase host): no request reaches the
// live project, no account is created. The parent's family_child_village answer uses the NEW contract
// (20261122190000_family_child_village_full_details.sql), built from the same demo rows the child's /map gets.
//
//   npm run build && npx next start -p 3471 &
//   BASE=http://localhost:3471 PLAYWRIGHT=/path/to/playwright-core/index.mjs node scripts/qa-parent-village-e2e.mjs
//
// Output: _onboarding/parent-village-full-details/qa-*.png and qa-e2e-report.json. Exit 1 when a check fails.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(ROOT, "package.json"))("sharp");
async function sideBySide(left, right, out) {
  const [a, b] = await Promise.all([sharp(left).metadata(), sharp(right).metadata()]);
  const gap = 24, h = Math.max(a.height, b.height);
  await sharp({ create: { width: a.width + b.width + gap, height: h, channels: 3, background: "#888" } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: a.width + gap, top: 0 }]).png().toFile(out);
}
const { chromium } = await import(process.env.PLAYWRIGHT || join(ROOT, "node_modules/playwright-core/index.mjs"));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:3471";
const OUT = join(ROOT, "_onboarding/parent-village-full-details");
mkdirSync(OUT, { recursive: true });
const envLine = readFileSync(join(ROOT, ".env.local"), "utf8").split("\n").find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_URL="));
const SUPA = new URL(envLine.split("=")[1].trim().replace(/^["']|["']$/g, ""));
const REF = SUPA.hostname.split(".")[0];

const results = [];
let failed = 0;
const check = (ok, name, info = "") => { if (!ok) failed++; const l = `${ok ? "PASS" : "FAIL"} ${name}${info ? " — " + String(info).slice(0, 600) : ""}`; results.push(l); console.log(l); return !!ok; };
const info = (s) => { results.push("INFO " + s); console.log("INFO " + s); };

// ---------- demo data ----------
const CHILD = "00000000-0000-4000-8000-00000000c001";
const PARENT = "00000000-0000-4000-8000-00000000p001".replace("p", "a");
const rows = [
  ["qa-1", "Zuckerbäckerei Probe AG", "Detailhandelsfachfrau EFZ", "Bern", "offer", "2026-09-01", "2026-10-20", "2026-09-03", null],
  ["qa-2", "Demo Informatik GmbH", "Informatikerin EFZ", "Zürich", "interview", "2026-09-05", "2026-11-10", "2026-09-06", "2026-12-15"],
  ["qa-3", "Beispiel Logistik AG", "Logistikerin EFZ", null, "rejected", "2026-09-10", "2026-10-01", "2026-09-11", null],
  ["qa-4", "Testgarten Muster", "Gärtnerin EFZ", "Thun", "applied", "2026-10-01", "2026-10-02", "2026-10-02", null],
  ["qa-5", "Probehotel Alpenblick", "Köchin EFZ", "Interlaken", "preparing", "2026-10-15", "2026-10-16", null, "2026-12-01"],
  ["qa-6", "Muster Mediamatik AG", "Mediamatikerin EFZ", "Biel", "saved", "2026-11-01", "2026-11-01", null, null],
  ["qa-7", "Fantasie Velo GmbH", "Fahrradmechanikerin EFZ", "Bern", "final_interview", "2026-11-05", "2026-11-18", "2026-11-06", null],
];
const appRows = rows.map(([id, company, position, location, status, created_at, updated_at, applied_at, deadline]) => ({
  id, user_id: CHILD, company, position, location, status, created_at, updated_at, applied_at, deadline, category: "other",
  notes: "QA-PRIVATE-NOTE", salary_min: 999, salary_max: 1999, job_url: "https://qa-private.example", source: "QA-SRC", job_description: "QA-DESC",
}));
const layouts = [{ id: "house:qa-2", x: 4, z: 6, rotation: 1 }];
const items = [
  { id: "11111111-1111-4111-8111-111111111111", itemType: "tree", x: 7, z: 2, rotation: 0, createdAt: "2026-10-01T10:00:00Z" },
  { id: "22222222-2222-4222-8222-222222222222", itemType: "bench", x: 2, z: 3, rotation: 1, createdAt: "2026-10-02T10:00:00Z" },
];
const familyVillage = {
  child_id: CHILD, display_name: "Lia", island_count: 2, layouts, items,
  houses: [...appRows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map((a) => ({
    id: a.id, company: a.company, position: a.position, location: a.location, status: a.status, createdAt: a.created_at, updatedAt: a.updated_at, appliedAt: a.applied_at, deadline: a.deadline })),
};
const shopState = { balance: 120, earned: 300, rewardCount: 7, items, layouts };

// ---------- fake session ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function session(userId, email) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 5;
  const user = { id: userId, aud: "authenticated", role: "authenticated", email, email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: { onboarding_tour_done: true, role: "student", role_confirmed: true, student_onboarded: true, account_type: userId === CHILD ? "independent_student" : "parent", tour_done: true }, created_at: "2026-01-01T00:00:00Z" };
  const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, role: "authenticated", aud: "authenticated", exp, email, aal: "aal1", session_id: "qa" })}.qa`;
  return { access_token, refresh_token: "qa-refresh", token_type: "bearer", expires_in: 18000, expires_at: exp, user };
}

// family_child_village = the page's one data request. The other three are the shared WorkspaceShell's read-only SELECT
// functions (same on every app page, also on origin/main): role + display name, access/paywall state, friend-request badge.
const WRITE_RPCS_ALLOWED_PARENT = new Set(["family_child_village"]);
const SHELL_READ_RPCS = new Set(["social_my_profile", "my_access", "social_list"]);
function classify(method, url) {
  const u = new URL(url);
  if (u.host !== SUPA.host) return null;
  const p = u.pathname;
  if (p.startsWith("/auth/v1/token")) return "auth-refresh";
  if (p.startsWith("/auth/v1/")) return method === "GET" ? "auth-read" : "auth-write";
  if (p.startsWith("/rest/v1/rpc/")) return "rpc:" + p.slice("/rest/v1/rpc/".length);
  if (p.startsWith("/rest/v1/")) return method === "GET" || method === "HEAD" ? "read:" + p.slice(9) : "WRITE:" + method + " " + p.slice(9);
  if (p.startsWith("/storage/v1/")) return method === "GET" ? "storage-read" : "STORAGE-WRITE";
  if (p.startsWith("/functions/v1/")) return "function:" + p.slice(14);
  return "other:" + method + " " + p;
}

async function mock(context, who) {
  const log = [];
  await context.route((url) => url.host === SUPA.host, async (route) => {
    const req = route.request();
    const kind = classify(req.method(), req.url());
    log.push({ method: req.method(), path: new URL(req.url()).pathname, kind, body: req.postData()?.slice(0, 200) ?? null });
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const p = new URL(req.url()).pathname;
    if (p === "/auth/v1/user") return json(who.user);
    if (p.startsWith("/auth/v1/token")) return json(who);
    if (p === "/rest/v1/rpc/family_child_village") return json(familyVillage);
    if (p === "/rest/v1/rpc/map_shop_state") return json(shopState);
    if (p === "/rest/v1/rpc/map_islands_state") return json({ unlocked: 2 });
    if (p === "/rest/v1/applications" && req.method() === "GET") return json(who.user.id === CHILD ? appRows : []);
    if (p === "/rest/v1/rpc/social_my_profile") return json([{ role: "student", display_name: who.user.id === CHILD ? "Lia" : "Papa" }]);
    if (p === "/rest/v1/user_roles") return json(req.headers()["accept"]?.includes("vnd.pgrst.object") ? { user_id: who.user.id, role: who.user.id === CHILD ? "student" : "parent", display_name: who.user.id === CHILD ? "Lia" : "Papa" } : [{ user_id: who.user.id, role: who.user.id === CHILD ? "student" : "parent", display_name: who.user.id === CHILD ? "Lia" : "Papa" }]);
    if (p.startsWith("/rest/v1/rpc/")) return json(null);
    if (req.method() === "GET") return json(req.headers()["accept"]?.includes("vnd.pgrst.object") ? null : []);
    return json(null);
  });
  return log;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const VIEWPORTS = { mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, desktop: { width: 1440, height: 900, deviceScaleFactor: 1 } };
const report = { checks: results, runs: [] };

async function open(role, vp, scheme) {
  const who = role === "child" ? session(CHILD, "lia@qa.invalid") : session(PARENT, "papa@qa.invalid");
  const v = VIEWPORTS[vp];
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch, colorScheme: scheme, locale: "de-CH", timezoneId: "Europe/Zurich" });
  await context.addInitScript(([key, value, theme]) => { localStorage.setItem(key, value); localStorage.setItem("wendapply-theme", theme); localStorage.setItem("wendapply-cookie-consent", "necessary"); localStorage.setItem("wendapply:palace-seen:qa-1", "1"); }, [`sb-${REF}-auth-token`, JSON.stringify(who), scheme]);
  const log = await mock(context, who);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const url = role === "child" ? `${BASE}/map` : `${BASE}/familie/kind/${CHILD}/dorf`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-building]", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3500);
  return { context, page, log, errors };
}

const labelsOf = (page) => page.$$eval("[data-building]", (els) => els.map((e) => ({ id: e.getAttribute("data-building"), text: e.textContent.replace(/\s+/g, " ").trim() })).sort((a, b) => a.id.localeCompare(b.id)));
const searchList = async (page) => {
  await page.getByRole("button", { name: /Suche/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  const list = await page.$$eval('[aria-label="Gefundene Bewerbungen"] li', (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim())).catch(() => []);
  await page.keyboard.press("Escape").catch(() => {});
  await page.getByRole("button", { name: /Suche/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  return list.sort();
};

for (const vp of ["mobile", "desktop"]) {
  for (const scheme of ["light", "dark"]) {
    const tag = `${vp}-${scheme}`;
    const child = await open("child", vp, scheme);
    const parent = await open("parent", vp, scheme);
    await child.page.screenshot({ path: join(OUT, `qa-child-${tag}.png`) });
    await parent.page.screenshot({ path: join(OUT, `qa-parent-${tag}.png`) });
    const pos = (page) => page.$$eval("[data-building]", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [e.getAttribute("data-building"), Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; }).sort());
    const cp = await pos(child.page), pp = await pos(parent.page);
    const cl = await labelsOf(child.page), pl = await labelsOf(parent.page);
    check(pl.length === rows.length, `${tag}: parent shows all ${rows.length} house labels`, pl.length);
    check(JSON.stringify(cl) === JSON.stringify(pl), `${tag}: house labels (id + company + status) identical child vs parent`, JSON.stringify({ cl, pl }));
    const cs = await searchList(child.page), ps = await searchList(parent.page);
    check(ps.length === rows.length && JSON.stringify(cs) === JSON.stringify(ps), `${tag}: search list (company, Stelle, status) identical`, JSON.stringify({ cs, ps }));
    for (const r of rows) check(ps.some((t) => t.includes(r[1]) && t.includes(r[2])), `${tag}: parent search shows ${r[1]} / ${r[2]}`);
    // animation: two shots 1 s apart differ (canvas only)
    const canvas = await parent.page.$("canvas");
    check(!!canvas, `${tag}: parent has a WebGL canvas`);
    if (canvas) {
      const a = await canvas.screenshot(); await parent.page.waitForTimeout(1000); const b = await canvas.screenshot();
      check(!a.equals(b), `${tag}: parent village animates (canvas changes within 1 s)`);
      writeFileSync(join(OUT, `qa-parent-${tag}-anim-a.png`), a); writeFileSync(join(OUT, `qa-parent-${tag}-anim-b.png`), b);
    }
    // camera / start framing: compare canvas pixels child vs parent (same data => same start framing). Report only a coarse diff.
    const cc = await child.page.$("canvas");
    if (cc && canvas) {
      const ca = await cc.boundingBox(), pa = await canvas.boundingBox();
      info(`${tag}: canvas child ${JSON.stringify(ca)} parent ${JSON.stringify(pa)}`);
    }
    // label positions = camera framing
    const maxDelta = cp.reduce((m, [id, x, y]) => { const q = pp.find((p) => p[0] === id); return q ? Math.max(m, Math.abs(q[1] - x), Math.abs(q[2] - y)) : 9999; }, 0);
    check(maxDelta <= 40, `${tag}: start framing equal (house label centres within 40 px)`, `max delta ${maxDelta}px`);

    // edit controls absent in parent DOM
    const forbidden = await parent.page.evaluate(() => {
      const t = (s) => [...document.querySelectorAll("button, a, [role=button], select, input")].filter((e) => e.offsetParent !== null || e.getClientRects().length).map((e) => (e.getAttribute("aria-label") || "") + " " + (e.textContent || "")).filter((x) => s.test(x));
      return {
        controls: t(/Laden|Kaufen|kaufen|Löschen|löschen|Bearbeiten|bearbeiten|verschieben|Verschieben|Status speichern|Status ändern|Bewerbung eintragen|Insel freischalten|Drehen|Platzieren|Rückgängig|Bewerbung öffnen/),
        statusSelect: !!document.querySelector("#map-application-status"),
        addLink: !!document.querySelector('a[href="/applications/new"]'),
        appLink: !!document.querySelector('a[href^="/applications/"]'),
        points: !!document.querySelector('[aria-label^="Punktestand"]'),
      };
    });
    check(forbidden.controls.length === 0 && !forbidden.statusSelect && !forbidden.addLink && !forbidden.appLink && !forbidden.points, `${tag}: no edit controls in parent DOM (closed sheet)`, JSON.stringify(forbidden));

    // open a house in both views (via search list button = same as tapping the label)
    const openHouse = async (page, company) => {
      const label = page.locator(`[data-building="qa-2"]`).first();
      if (await label.count() && await label.evaluate((e) => e.tagName === "BUTTON" || !!e.querySelector("button") || e.closest("button") !== null)) { await label.click({ force: true }).catch(() => {}); }
      await page.waitForTimeout(800);
      if (!(await page.getByText(company).count())) { /* fallback via search */ }
      return page.$eval('[role="dialog"], [data-sheet], section[aria-labelledby]', (e) => e.innerText).catch(() => "");
    };
    const childSheet = await openHouse(child.page, "Demo Informatik GmbH");
    const parentSheet = await openHouse(parent.page, "Demo Informatik GmbH");
    await child.page.screenshot({ path: join(OUT, `qa-child-${tag}-house-open.png`) });
    await parent.page.screenshot({ path: join(OUT, `qa-parent-${tag}-house-open.png`) });
    const ptext = await parent.page.evaluate(() => document.body.innerText);
    check(/Informatikerin EFZ/.test(ptext) && /Demo Informatik GmbH/.test(ptext) && /Zürich/.test(ptext), `${tag}: parent house sheet shows Stelle, company, location`, parentSheet.slice(0, 300));
    check(/Bewerbungsfrist/.test(ptext) && /Abgeschickt am/.test(ptext) && /Erfasst am/.test(ptext), `${tag}: parent house sheet shows the dates`);
    check(/Nur ansehen: hier kann nichts verändert werden/.test(ptext), `${tag}: parent house sheet says read-only`);
    const sheetForbidden = await parent.page.evaluate(() => ({ select: !!document.querySelector("#map-application-status"), move: /Haus verschieben/.test(document.body.innerText), save: /Status speichern/.test(document.body.innerText), open: !!document.querySelector('a[href^="/applications/"]'), notes: /QA-PRIVATE|Deine Notizen/.test(document.body.innerText) }));
    check(Object.values(sheetForbidden).every((v) => !v), `${tag}: open house sheet has no status select / move / save / app link / notes`, JSON.stringify(sheetForbidden));
    info(`${tag}: child sheet ${childSheet.slice(0, 200).replace(/\n/g, " | ")}`);
    // keyboard abuse: focus map, arrows / Enter / Delete / ctrl+z, try drag on the house label
    await parent.page.keyboard.press("Escape");
    await parent.page.locator("canvas").first().focus().catch(() => {});
    for (const k of ["ArrowLeft", "ArrowUp", "Enter", "Delete", "Backspace", "Control+z", "Meta+z", "r"]) await parent.page.keyboard.press(k).catch(() => {});
    const box = await parent.page.locator("canvas").first().boundingBox();
    if (box) { await parent.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await parent.page.mouse.down(); await parent.page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 }); await parent.page.mouse.up(); }
    // island switching
    await parent.page.getByRole("button", { name: /Dorf von Lia/ }).first().click().catch(() => {});
    await parent.page.waitForTimeout(500);
    const islandButtons = await parent.page.$$eval('[aria-label="Insel wählen"] button', (els) => els.map((e) => e.textContent.trim()));
    check(islandButtons.length === 2, `${tag}: parent island switcher shows the child's 2 islands`, JSON.stringify(islandButtons));
    const unlockVisible = await parent.page.evaluate(() => /freischalten|Punkte für die nächste Insel/.test(document.body.innerText));
    check(!unlockVisible, `${tag}: no island unlock / points in parent island panel`);
    if (islandButtons.length > 1) { await parent.page.locator('[aria-label="Insel wählen"] button').nth(1).click().catch(() => {}); await parent.page.waitForTimeout(1500); await parent.page.screenshot({ path: join(OUT, `qa-parent-${tag}-island2.png`) }); }
    await parent.page.waitForTimeout(800);

    // network: ZERO writes in parent view
    const kinds = parent.log.map((r) => r.kind);
    const writes = parent.log.filter((r) => /^WRITE|STORAGE-WRITE|auth-write/.test(r.kind) || (r.kind.startsWith("rpc:") && !WRITE_RPCS_ALLOWED_PARENT.has(r.kind.slice(4)) && !SHELL_READ_RPCS.has(r.kind.slice(4))));
    check(writes.length === 0, `${tag}: parent view made ZERO write requests (only rpc/family_child_village, auth refresh and the shell's read-only social_my_profile / my_access / social_list)`, JSON.stringify(writes));
    check(kinds.includes("rpc:family_child_village"), `${tag}: parent called family_child_village`);
    check(!kinds.some((k) => /map_shop|map_island|map_claim|map_move|read:applications/.test(k)), `${tag}: parent never touched applications / shop / islands endpoints`);
    info(`${tag}: parent requests ${JSON.stringify([...new Set(kinds)])}`);
    check(parent.errors.length === 0, `${tag}: no page errors in parent view`, parent.errors.join(" | "));
    report.runs.push({ tag, childLabels: cl, parentLabels: pl, parentRequests: parent.log, childRequests: [...new Set(child.log.map((r) => r.kind))], forbidden, sheetForbidden, islandButtons, maxDelta, pageErrors: { child: child.errors, parent: parent.errors } });
    await sideBySide(join(OUT, `qa-child-${tag}.png`), join(OUT, `qa-parent-${tag}.png`), join(OUT, `qa-side-by-side-${tag}.png`));
    await sideBySide(join(OUT, `qa-child-${tag}-house-open.png`), join(OUT, `qa-parent-${tag}-house-open.png`), join(OUT, `qa-side-by-side-${tag}-house-open.png`));
    await child.context.close(); await parent.context.close();
  }
}
await browser.close();
writeFileSync(join(OUT, "qa-e2e-report.json"), JSON.stringify(report, null, 2));
console.log(failed ? `QA E2E: ${failed} FAILED` : "QA E2E: ALL PASS");
process.exit(failed ? 1 : 0);
